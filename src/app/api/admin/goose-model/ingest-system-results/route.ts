/**
 * POST /api/admin/goose-model/ingest-system-results
 *
 * Pulls settled system_qualifiers (win/loss/push) into goose_model_picks
 * so the Signal Lab can learn from ALL games any system reviewed — not
 * just picks the lab generated itself.
 *
 * De-duplication: each ingested qualifier is stored with
 *   game_id = "sq:{qualifier.id}"
 * so the same qualifier is never inserted twice.
 *
 * Body: {
 *   days?: number;          // lookback window, default 30
 *   sport?: string;         // "NHL" | "NBA" | "MLB" | "PGA" — all if omitted
 *   dry_run?: boolean;      // if true, returns what would be ingested but persists nothing
 * }
 *
 * Returns: {
 *   ingested: number;       // newly inserted rows
 *   skipped: number;        // already present (de-dup)
 *   dry_run: boolean;
 *   sports_summary: Record<string, { ingested: number; skipped: number }>;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
import { captureGoosePicks, applyGradedPicksToWeights } from "@/lib/goose-model/store";
import { tagSignals } from "@/lib/goose-model/signal-tagger";
import type { DbSystemQualifier } from "@/lib/system-qualifiers-db";

export const dynamic = "force-dynamic";

// ── helpers ─────────────────────────────────────────────────

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function postgrest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Supabase ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body.message || body.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

function leagueToSport(league: string | null): string {
  if (!league) return "OTHER";
  const l = league.toUpperCase();
  if (l === "NHL") return "NHL";
  if (l === "NBA") return "NBA";
  if (l === "MLB") return "MLB";
  if (l.startsWith("PGA") || l === "GOLF") return "PGA";
  return l;
}

// Extract additional signals from system_qualifier provenance data.
// The provenance is a free-form JSON snapshot — we extract text clues
// and run them through the standard signal tagger.
function signalsFromProvenance(provenance: Record<string, unknown> | null): string[] {
  if (!provenance) return [];

  const textParts: string[] = [];

  // Pull any string values that might contain signal-relevant text
  function walk(obj: unknown, depth = 0): void {
    if (depth > 4 || !obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string" && v.length < 500) {
        textParts.push(`${k}: ${v}`);
      } else if (typeof v === "object" && v !== null) {
        walk(v, depth + 1);
      }
    }
  }
  walk(provenance);

  return tagSignals(textParts.join(" "));
}

const EXPERIMENT_TAG = "system-qualifier-v1";

// ── handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      days?: number;
      sport?: string;
      dry_run?: boolean;
    };

    const daysBack = Math.min(Math.max(Number(body.days ?? 30), 1), 180);
    const sportFilter = typeof body.sport === "string" && body.sport !== "ALL" ? body.sport.toUpperCase() : null;
    const dryRun = Boolean(body.dry_run);

    // ── 1. Compute date range ──────────────────────────────
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    // ── 2. Fetch settled system_qualifiers ────────────────
    const qualifierParams = [
      `settlement_status=eq.settled`,
      `outcome=in.(win,loss,push)`,
      `game_date=gte.${cutoffDate}`,
      `select=*`,
      `order=game_date.desc`,
      `limit=2000`,
    ];
    if (sportFilter) {
      qualifierParams.push(`league=ilike.${encodeURIComponent(sportFilter)}`);
    }

    let qualifiers: DbSystemQualifier[] = [];
    try {
      qualifiers = await postgrest<DbSystemQualifier[]>(
        `/rest/v1/system_qualifiers?${qualifierParams.join("&")}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("404")) {
        return NextResponse.json({
          ingested: 0,
          skipped: 0,
          dry_run: dryRun,
          sports_summary: {},
          message: "system_qualifiers table not found — run migration 20260328000000_system_qualifiers.sql",
        });
      }
      throw err;
    }

    if (!qualifiers?.length) {
      return NextResponse.json({
        ingested: 0,
        skipped: 0,
        dry_run: dryRun,
        sports_summary: {},
        message: "No settled system qualifier results found in the requested date range.",
      });
    }

    // ── 3. Fetch already-ingested game_ids to de-dup ─────
    const existingIds = new Set<string>();
    try {
      const existing = await postgrest<{ game_id: string }[]>(
        `/rest/v1/goose_model_picks?experiment_tag=eq.${EXPERIMENT_TAG}&select=game_id&limit=5000`,
      );
      for (const row of existing ?? []) {
        if (row.game_id) existingIds.add(row.game_id);
      }
    } catch {
      // Non-fatal — worst case we try to insert duplicates and the DB will reject exact dupes by unique constraints
    }

    // ── 4. Map qualifiers → goose_model_picks candidates ──
    const sportBuckets = new Map<string, Array<{
      pick_label: string;
      pick_type: "team";
      team: string | null;
      opponent: string | null;
      game_id: string;
      reasoning: string | null;
      signals_present: string[];
      odds: number | null;
      result: "win" | "loss" | "push";
      model_version: string;
      source: "captured";
      pick_snapshot: Record<string, unknown>;
      experiment_tag: string;
      odds_at_capture: number | null;
      hit_rate_at_capture: null;
      edge_at_capture: null;
      signals_count: number;
    }>>();

    let totalSkipped = 0;

    for (const q of qualifiers) {
      const gameId = `sq:${q.id}`;
      if (existingIds.has(gameId)) {
        totalSkipped++;
        continue;
      }

      const sport = leagueToSport(q.league);
      const label = q.action_label || `${q.qualified_team ?? q.matchup} (${q.market_type ?? "ML"})`;
      const reasoning = [
        q.matchup,
        q.action_label,
        q.notes,
        q.grading_notes,
      ].filter(Boolean).join(". ");

      // Tag signals from label + reasoning + provenance data
      const labelSignals = tagSignals(label, q.action_label);
      const provSignals = signalsFromProvenance(q.provenance);
      const signals = Array.from(new Set([...labelSignals, ...provSignals]));

      const outcome = q.outcome as "win" | "loss" | "push";

      const candidate = {
        pick_label: label,
        pick_type: "team" as const,
        team: q.qualified_team,
        opponent: q.opponent_team,
        game_id: gameId,
        reasoning,
        signals_present: signals,
        odds: q.qualifier_odds,
        result: outcome,
        model_version: `system-${q.system_slug ?? "unknown"}`,
        source: "captured" as const,
        pick_snapshot: {
          system_id: q.system_id,
          system_slug: q.system_slug,
          system_name: q.system_name,
          qualifier_id: q.qualifier_id,
          market_type: q.market_type,
          action_side: q.action_side,
          matchup: q.matchup,
          road_team: q.road_team,
          home_team: q.home_team,
          record_kind: q.record_kind,
          grading_source: q.grading_source,
        },
        experiment_tag: EXPERIMENT_TAG,
        odds_at_capture: q.qualifier_odds,
        hit_rate_at_capture: null,
        edge_at_capture: null,
        signals_count: signals.length,
      };

      if (!sportBuckets.has(sport)) sportBuckets.set(sport, []);
      sportBuckets.get(sport)!.push(candidate);
    }

    // ── 5. Persist (or dry-run) ───────────────────────────
    const sportsSummary: Record<string, { ingested: number; skipped: number }> = {};
    let totalIngested = 0;

    for (const [sport, candidates] of Array.from(sportBuckets.entries())) {
      sportsSummary[sport] = { ingested: 0, skipped: 0 };

      if (dryRun) {
        sportsSummary[sport].ingested = candidates.length;
        totalIngested += candidates.length;
        continue;
      }

      if (candidates.length === 0) continue;

      // Capture in one batch per sport (respects captureGoosePicks signature)
      // Note: captureGoosePicks takes a date — for system qualifier ingestion
      // we need per-date batching. Group by date within sport.
      const byDate = new Map<string, typeof candidates>();
      for (const c of candidates) {
        // Find the game date from the original qualifier
        const q = qualifiers.find((q) => `sq:${q.id}` === c.game_id);
        const dateKey = q?.game_date ?? new Date().toISOString().slice(0, 10);
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(c);
      }

      for (const [dateKey, dateCandidates] of Array.from(byDate.entries())) {
        try {
          const inserted = await captureGoosePicks({
            date: dateKey,
            sport,
            picks: dateCandidates,
          });
          sportsSummary[sport].ingested += inserted.length;
          totalIngested += inserted.length;

          // Immediately apply signal weights for settled picks
          // (they arrive pre-graded, so we skip the manual grade step)
          const settled = inserted.filter((p) => p.result !== "pending");
          if (settled.length > 0) {
            await applyGradedPicksToWeights(settled);
          }
        } catch (err) {
          console.error(`[ingest-system-results] failed to ingest ${sport} ${dateKey}:`, err);
          // Non-fatal — continue other sports/dates
        }
      }
    }

    // Add skipped count to sports_summary (they were all de-duped before bucketing)
    if (totalSkipped > 0) {
      sportsSummary["(already ingested)"] = { ingested: 0, skipped: totalSkipped };
    }

    return NextResponse.json({
      ingested: totalIngested,
      skipped: totalSkipped,
      dry_run: dryRun,
      sports_summary: sportsSummary,
      message: dryRun
        ? `Dry run: would ingest ${totalIngested} system qualifier results (${totalSkipped} already present).`
        : `Ingested ${totalIngested} system qualifier results (${totalSkipped} already present).`,
    });
  } catch (error) {
    console.error("[ingest-system-results] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
