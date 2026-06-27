import { NextRequest, NextResponse } from "next/server";
import { getGolfTournamentPicks, getTournamentDateKey } from "@/lib/golf-live-data";
import { getPGALeaderboard } from "@/lib/golf-api";
import { getDGCacheSummary } from "@/lib/datagolf-cache";
import { getLatestStoredPickSlate, getStoredPickSlate, storeDailyPickSlate, storeEmptyPickSlate } from "@/lib/pick-history-store";
import { shouldRecoverStoredSlate } from "@/lib/pick-history-integrity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EPHEMERAL_EMPTY_RESPONSE_TTL_MS = 5 * 60 * 1000;
const NO_PUBLISHABLE_PGA_PICKS_NOTE = "no_publishable_pga_picks";

type CachedGolfPicksResponse = {
  body: Record<string, unknown>;
  expiresAt: number;
  status: number;
};

let cachedEmptyResponse: CachedGolfPicksResponse | null = null;

function readCachedEmptyResponse() {
  if (!cachedEmptyResponse) return null;
  if (Date.now() >= cachedEmptyResponse.expiresAt) {
    cachedEmptyResponse = null;
    return null;
  }

  return cachedEmptyResponse;
}

function writeCachedEmptyResponse(body: Record<string, unknown>, status = 200) {
  cachedEmptyResponse = {
    body,
    status,
    expiresAt: Date.now() + EPHEMERAL_EMPTY_RESPONSE_TTL_MS,
  };
}

function buildEphemeralIntegrity(
  date: string,
  pickCount: number,
  message: string,
  priorIntegrity?: Record<string, unknown> | null,
) {
  const previous = (priorIntegrity ?? {}) as Record<string, unknown>;
  const expectedPickCount = typeof previous.expected_pick_count === "number" ? previous.expected_pick_count : pickCount;

  return {
    ...previous,
    date,
    league: "PGA",
    status: pickCount >= expectedPickCount ? "locked" : "incomplete",
    provenance: "original",
    expected_pick_count: expectedPickCount,
    pick_count: pickCount,
    integrity_status: pickCount >= expectedPickCount ? "ok" : "incomplete",
    status_note: message,
  };
}

function shouldReturnIntegrityConflict(req: NextRequest, integrityStatus?: string | null) {
  return integrityStatus === "incomplete" && req.headers.get("x-goose-model-agent") === "1";
}

function integrityWarning(integrity?: { integrity_status?: string | null; status_note?: string | null } | null) {
  return integrity?.integrity_status === "incomplete"
    ? integrity.status_note ?? "Stored authoritative slate is incomplete."
    : undefined;
}

function isPublishablePGAPick(pick: { hitRate?: unknown; edge?: unknown; reasoning?: unknown }) {
  return typeof pick.hitRate === "number"
    && pick.hitRate >= 60
    && typeof pick.edge === "number"
    && pick.edge > 5
    && typeof pick.reasoning === "string"
    && pick.reasoning.trim().length > 0;
}

function getSlateGateWarning(picks: Array<{ hitRate?: unknown; edge?: unknown; reasoning?: unknown }>) {
  if (picks.length === 0) return null;
  const blocked = picks.filter((pick) => !isPublishablePGAPick(pick));
  if (blocked.length === 0) return null;
  return `Blocked ${blocked.length}/${picks.length} PGA picks below published thresholds (hitRate >= 60, edge > 5, reasoning required).`;
}

function isRecentTournamentDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const tournamentTime = new Date(`${date}T12:00:00Z`).getTime();
  const today = new Date();
  const todayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12);
  const ageDays = Math.floor((todayTime - tournamentTime) / 86_400_000);

  return ageDays >= 0 && ageDays <= 6;
}

async function getRecentStoredResponse() {
  const latestStored = await getLatestStoredPickSlate("PGA");
  if (!latestStored.slate) return null;
  if (!isRecentTournamentDate(latestStored.slate.date)) return null;

  const intentionalEmpty = latestStored.slate.provenance_note === NO_PUBLISHABLE_PGA_PICKS_NOTE;
  if (shouldRecoverStoredSlate(latestStored.slate, latestStored.records) && !intentionalEmpty) return null;

  if (intentionalEmpty && latestStored.records.length === 0) {
    return {
      body: {
        picks: [],
        date: latestStored.slate.date,
        source: "no-qualifying",
        reason: latestStored.slate.status_note ?? "No publishable PGA picks met published thresholds.",
        integrity: latestStored.slate,
      },
      status: 200,
    };
  }

  const gateWarning = getSlateGateWarning(latestStored.picks);
  if (gateWarning) {
    return {
      body: {
        picks: [],
        date: latestStored.slate.date,
        source: "no-qualifying",
        reason: gateWarning,
        integrity: {
          ...latestStored.slate,
          status: "incomplete",
          integrity_status: "incomplete",
          status_note: gateWarning,
        },
      },
      status: 200,
    };
  }

  return {
    body: {
      picks: latestStored.picks,
      date: latestStored.slate.date,
      source: "history_locked",
      integrity: latestStored.slate,
      warning: integrityWarning(latestStored.slate),
    },
    status: 200,
  };
}

export async function GET(req: NextRequest) {
  try {
    const cached = readCachedEmptyResponse();
    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { "x-goose-cache": "ephemeral-empty-pga-picks" },
      });
    }

    const recentStored = await getRecentStoredResponse().catch((error) => {
      console.warn("[api/golf/picks] latest stored slate fast path skipped:", error);
      return null;
    });
    if (recentStored) {
      if (Array.isArray(recentStored.body.picks) && recentStored.body.picks.length === 0) {
        writeCachedEmptyResponse(recentStored.body, recentStored.status);
      }
      const integrityStatus = (recentStored.body.integrity as { integrity_status?: string | null } | undefined)?.integrity_status;
      return NextResponse.json(recentStored.body, { status: shouldReturnIntegrityConflict(req, integrityStatus) ? 409 : recentStored.status });
    }

    // Resolve the tournament start date as the canonical date key for PGA picks.
    const leaderboard = await getPGALeaderboard();
    const tournamentDateKey = getTournamentDateKey(leaderboard?.tournament);

    // Check for locked slate first (already generated picks persist)
    const lockedSlate = await getStoredPickSlate(tournamentDateKey, "PGA");
    if (lockedSlate.slate && !shouldRecoverStoredSlate(lockedSlate.slate, lockedSlate.records)) {
      const gateWarning = getSlateGateWarning(lockedSlate.picks);
      if (gateWarning) {
        const body = {
          picks: [],
          date: tournamentDateKey,
          source: "no-qualifying",
          reason: gateWarning,
          integrity: {
            ...lockedSlate.slate,
            status: "incomplete",
            integrity_status: "incomplete",
            status_note: gateWarning,
          },
        };
        writeCachedEmptyResponse(body);
        return NextResponse.json(body);
      }

      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date: tournamentDateKey,
          source: "history_locked",
          integrity: lockedSlate.slate,
          warning: integrityWarning(lockedSlate.slate),
        },
        { status: shouldReturnIntegrityConflict(req, lockedSlate.slate.integrity_status) ? 409 : 200 },
      );
    }

    // Guard: Don't generate PGA picks if DataGolf data isn't ready.
    // Without good DG data, hitRates are garbage (3-11%).
    const dgStatus = await getDGCacheSummary();
    if (!dgStatus.ready) {
      const body = {
        picks: [],
        date: tournamentDateKey,
        source: "dg-not-ready",
        reason: dgStatus.reason,
      };
      writeCachedEmptyResponse(body);
      return NextResponse.json(body);
    }

    const result = await getGolfTournamentPicks(tournamentDateKey);
    const publishablePicks = result.picks.filter(isPublishablePGAPick);

    console.log("[api/golf/picks] generated", {
      date: tournamentDateKey,
      generatedCount: result.picks.length,
      publishableCount: publishablePicks.length,
      generatedPicks: result.picks.map((pick) => ({
        player: pick.playerName,
        market: pick.propType,
        edge: pick.edge,
        confidence: pick.confidence,
        odds: pick.odds,
      })),
    });

    if (publishablePicks.length === 0) {
      const reason = result.picks.length > 0
        ? "Generated PGA picks did not meet published thresholds (hitRate >= 60, edge > 5, reasoning required)."
        : "No publishable PGA picks met published thresholds (hitRate >= 60, edge > 5, reasoning required).";
      const storedEmpty = await storeEmptyPickSlate({
        date: tournamentDateKey,
        league: "PGA",
        expectedPickCount: result.picks.length,
        provenanceNote: NO_PUBLISHABLE_PGA_PICKS_NOTE,
        statusNote: reason,
      }).catch((error) => {
        console.warn("[api/golf/picks] failed to persist empty PGA slate:", error);
        return null;
      });
      const body = {
        picks: [],
        date: tournamentDateKey,
        source: "no-qualifying",
        reason,
        integrity: storedEmpty?.slate ?? undefined,
      };
      writeCachedEmptyResponse(body);
      return NextResponse.json(body);
    }

    const normalizedPicks = publishablePicks.map((pick) => ({ ...pick, league: "PGA" }));

    try {
      const stored = await storeDailyPickSlate(normalizedPicks, {
        date: tournamentDateKey,
        league: "PGA",
        allowRecovery: false,
      });

      console.log("[api/golf/picks] stored", {
        date: tournamentDateKey,
        source: stored.source,
        persistedCount: stored.records.length,
        returnedCount: stored.picks.length,
        slate: stored.slate,
      });

      return NextResponse.json(
        {
          picks: stored.picks,
          date: tournamentDateKey,
          source: stored.source === "existing" ? "history_locked" : stored.source === "repaired" ? "generated_repaired" : "generated_locked",
          integrity: stored.slate,
          warning: integrityWarning(stored.slate),
        },
        { status: shouldReturnIntegrityConflict(req, stored.slate?.integrity_status) ? 409 : 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist authoritative picks";
      console.error("[api/golf/picks] persistence degraded, serving generated picks:", error);
      return NextResponse.json(
        {
          picks: normalizedPicks,
          date: tournamentDateKey,
          source: "generated_unlocked",
          integrity: buildEphemeralIntegrity(tournamentDateKey, normalizedPicks.length, `Serving generated picks without persistence: ${message}`, lockedSlate.slate),
          warning: message,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error("[api/golf/picks] error:", error);
    return NextResponse.json(
      {
        picks: [],
        date: "error",
        source: "integrity_error",
        error: error instanceof Error ? error.message : "Failed to load authoritative picks",
      },
      { status: 503 },
    );
  }
}
