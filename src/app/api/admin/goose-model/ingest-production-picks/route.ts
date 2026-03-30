/**
 * POST /api/admin/goose-model/ingest-production-picks
 *
 * Reads production-published picks from pick_history and ingests them
 * into goose_model_picks for Signal Lab learning visibility.
 *
 * Source labeling (never blurred):
 *   experiment_tag = "production-pick-v1"
 *   source         = "captured"
 *   game_id        = "ph:{pick_history.id}"
 *
 * Weight contribution:
 *   By default, settled production picks (win/loss) DO contribute to signal
 *   weights immediately — same behavior as system qualifier ingestion.
 *   Set contribute_to_weights=false to ingest for COMPARISON ONLY (weights
 *   are not updated, picks are still visible in the lab).
 *
 * De-duplication:
 *   Each production pick is keyed by game_id = "ph:{pick_history.id}" so
 *   the same pick is never inserted twice regardless of how many times
 *   this endpoint is called.
 *
 * Body: {
 *   days?: number;                   // lookback window, default 30 (max 180)
 *   sport?: string;                  // "NHL" | "NBA" | "MLB" | "PGA" — all if omitted
 *   dry_run?: boolean;               // preview only — returns counts without persisting
 *   contribute_to_weights?: boolean; // default true — false = comparison-only (no weight updates)
 * }
 *
 * Returns: {
 *   ingested: number;
 *   skipped: number;
 *   weight_updates_applied: boolean;
 *   dry_run: boolean;
 *   sports_summary: Record<string, { ingested: number; skipped: number }>;
 *   message: string;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
import { captureGoosePicks, applyGradedPicksToWeights } from "@/lib/goose-model/store";
import { tagSignals } from "@/lib/goose-model/signal-tagger";

export const dynamic = "force-dynamic";

const EXPERIMENT_TAG = "production-pick-v1";

// ── helpers ──────────────────────────────────────────────────

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

function leagueToSport(league: string | null | undefined): string {
  if (!league) return "OTHER";
  const l = league.toUpperCase();
  if (l === "NHL") return "NHL";
  if (l === "NBA") return "NBA";
  if (l === "MLB") return "MLB";
  if (l.startsWith("PGA") || l === "GOLF") return "PGA";
  return l;
}

// Extract signals from production pick reasoning + label.
function signalsFromPick(pickLabel: string, reasoning: string | null): string[] {
  const text = [pickLabel, reasoning].filter(Boolean).join(" ");
  return tagSignals(text);
}

// ── handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      days?: number;
      sport?: string;
      dry_run?: boolean;
      contribute_to_weights?: boolean;
    };

    const daysBack = Math.min(Math.max(Number(body.days ?? 30), 1), 180);
    const sportFilter =
      typeof body.sport === "string" && body.sport !== "ALL"
        ? body.sport.toUpperCase()
        : null;
    const dryRun = Boolean(body.dry_run);
    // Default: contribute to weights (same behavior as system qualifier ingestion)
    const contributeToWeights = body.contribute_to_weights !== false;

    // ── 1. Compute date range ──────────────────────────────
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    // ── 2. Fetch settled production picks from pick_history ─
    const phParams = [
      `result=in.(win,loss,push)`,
      `date=gte.${cutoffDate}`,
      `select=*`,
      `order=date.desc`,
      `limit=2000`,
    ];
    if (sportFilter) {
      phParams.push(`league=ilike.${encodeURIComponent(sportFilter)}`);
    }

    type RawPickHistory = {
      id: string;
      date: string;
      league: string;
      pick_type: string | null;
      player_name: string | null;
      team: string;
      opponent: string | null;
      pick_label: string;
      hit_rate: number | null;
      edge: number | null;
      odds: number | null;
      book: string | null;
      sportsbook: string | null;
      result: "pending" | "win" | "loss" | "push";
      game_id: string | null;
      reasoning: string | null;
      confidence: number | null;
      units: number | null;
      provenance: string | null;
      created_at: string;
    };

    let prodPicks: RawPickHistory[] = [];
    try {
      prodPicks = await postgrest<RawPickHistory[]>(
        `/rest/v1/pick_history?${phParams.join("&")}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("does not exist") ||
        msg.includes("relation") ||
        msg.includes("404")
      ) {
        return NextResponse.json({
          ingested: 0,
          skipped: 0,
          weight_updates_applied: false,
          dry_run: dryRun,
          sports_summary: {},
          message:
            "pick_history table not found — run the Supabase migrations first.",
        });
      }
      throw err;
    }

    if (!prodPicks?.length) {
      return NextResponse.json({
        ingested: 0,
        skipped: 0,
        weight_updates_applied: false,
        dry_run: dryRun,
        sports_summary: {},
        message:
          "No settled production picks found in the requested date range.",
      });
    }

    // ── 3. Fetch already-ingested game_ids to de-dup ───────
    const existingIds = new Set<string>();
    try {
      const existing = await postgrest<{ game_id: string }[]>(
        `/rest/v1/goose_model_picks?experiment_tag=eq.${EXPERIMENT_TAG}&select=game_id&limit=10000`,
      );
      for (const row of existing ?? []) {
        if (row.game_id) existingIds.add(row.game_id);
      }
    } catch {
      // Non-fatal — worst case the DB rejects dupes via unique constraints
    }

    // ── 4. Map production picks → goose_model_picks rows ───
    type Candidate = {
      pick_label: string;
      pick_type: "player" | "team";
      player_name: string | null;
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
      hit_rate_at_capture: number | null;
      edge_at_capture: number | null;
      signals_count: number;
    };

    const sportBuckets = new Map<string, Map<string, Candidate[]>>();
    let totalSkipped = 0;

    for (const pick of prodPicks) {
      const gameId = `ph:${pick.id}`;
      if (existingIds.has(gameId)) {
        totalSkipped++;
        continue;
      }

      const sport = leagueToSport(pick.league);
      const signals = signalsFromPick(pick.pick_label, pick.reasoning);
      const outcome = pick.result as "win" | "loss" | "push";

      const candidate: Candidate = {
        pick_label: pick.pick_label,
        pick_type:
          pick.pick_type === "player" || pick.player_name
            ? "player"
            : "team",
        player_name: pick.player_name,
        team: pick.team,
        opponent: pick.opponent,
        game_id: gameId,
        reasoning: pick.reasoning,
        signals_present: signals,
        odds: pick.odds,
        result: outcome,
        model_version: "production-v1",
        source: "captured",
        pick_snapshot: {
          production_pick_id: pick.id,
          provenance: pick.provenance,
          book: pick.book ?? pick.sportsbook,
          units: pick.units,
          confidence: pick.confidence,
          original_game_id: pick.game_id,
        },
        experiment_tag: EXPERIMENT_TAG,
        odds_at_capture: pick.odds,
        hit_rate_at_capture: pick.hit_rate,
        edge_at_capture: pick.edge,
        signals_count: signals.length,
      };

      if (!sportBuckets.has(sport)) sportBuckets.set(sport, new Map());
      const dateBucket = sportBuckets.get(sport)!;

      const dateKey = pick.date;
      if (!dateBucket.has(dateKey)) dateBucket.set(dateKey, []);
      dateBucket.get(dateKey)!.push(candidate);
    }

    // ── 5. Persist (or dry-run) ────────────────────────────
    const sportsSummary: Record<string, { ingested: number; skipped: number }> =
      {};
    let totalIngested = 0;

    for (const [sport, byDate] of Array.from(sportBuckets.entries())) {
      sportsSummary[sport] = { ingested: 0, skipped: 0 };

      if (dryRun) {
        let count = 0;
        for (const candidates of Array.from(byDate.values())) count += candidates.length;
        sportsSummary[sport].ingested = count;
        totalIngested += count;
        continue;
      }

      for (const [dateKey, candidates] of Array.from(byDate.entries())) {
        if (candidates.length === 0) continue;
        try {
          const inserted = await captureGoosePicks({
            date: dateKey,
            sport,
            picks: candidates,
          });
          sportsSummary[sport].ingested += inserted.length;
          totalIngested += inserted.length;

          // Apply signal weights for settled picks if requested
          if (contributeToWeights) {
            const settled = inserted.filter((p) => p.result !== "pending");
            if (settled.length > 0) {
              await applyGradedPicksToWeights(settled);
            }
          }
        } catch (err) {
          console.error(
            `[ingest-production-picks] failed to ingest ${sport} ${dateKey}:`,
            err,
          );
          // Non-fatal — continue other sports/dates
        }
      }
    }

    if (totalSkipped > 0) {
      sportsSummary["(already ingested)"] = {
        ingested: 0,
        skipped: totalSkipped,
      };
    }

    const weightsNote = contributeToWeights
      ? "Signal weights updated for settled picks."
      : "Comparison-only mode — signal weights were NOT updated.";

    return NextResponse.json({
      ingested: totalIngested,
      skipped: totalSkipped,
      weight_updates_applied: contributeToWeights && !dryRun && totalIngested > 0,
      dry_run: dryRun,
      sports_summary: sportsSummary,
      message: dryRun
        ? `Dry run: would ingest ${totalIngested} production picks (${totalSkipped} already present). ${weightsNote}`
        : `Ingested ${totalIngested} production picks (${totalSkipped} already present). ${weightsNote}`,
    });
  } catch (error) {
    console.error("[ingest-production-picks] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Production pick ingestion failed",
      },
      { status: 500 },
    );
  }
}
