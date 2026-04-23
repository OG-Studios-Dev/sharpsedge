import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

const ALLOWED_LEAGUES = new Set(["NHL", "NBA", "MLB", "NFL"]);

type RpcResponse = {
  message?: string;
  error?: string;
  details?: string;
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizeLeague(raw: string | null) {
  const value = (raw || "NHL").trim().toUpperCase();
  return ALLOWED_LEAGUES.has(value) ? value : null;
}

async function fetchCount(path: string) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: "GET",
    headers: serviceHeaders({ Prefer: "count=exact", Range: "0-0" }),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Supabase count read failed (${response.status})`;
    try {
      const payload = await response.json() as RpcResponse;
      message = payload.message || payload.error || payload.details || message;
    } catch {
      // ignore malformed payloads
    }
    throw new Error(message);
  }

  const contentRange = response.headers.get("content-range") || "";
  const total = Number(contentRange.split("/")[1] || 0);
  return Number.isFinite(total) ? total : 0;
}

async function fetchCountSafe(path: string) {
  try {
    return { ok: true as const, count: await fetchCount(path), error: null };
  } catch (error) {
    return { ok: false as const, count: null, error: toErrorMessage(error, `Failed count for ${path}`) };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league = normalizeLeague(searchParams.get("league"));

    if (!league) {
      return NextResponse.json({ ok: false, error: "league must be one of NHL, NBA, MLB, NFL" }, { status: 400 });
    }

    const [queryLayer, loaderSource, gradedQuery, gradedGold, nhlCache] = await Promise.all([
      fetchCountSafe(`/rest/v1/ask_goose_query_layer_v1?league=eq.${league}&select=candidate_id`),
      fetchCountSafe(`/rest/v1/historical_trends_loader_source_v1?league=eq.${league}&select=candidate_id`),
      fetchCountSafe(`/rest/v1/historical_betting_markets_query_graded_v1?league=eq.${league}&select=candidate_id`),
      fetchCountSafe(`/rest/v1/historical_betting_markets_gold_graded_v1?league=eq.${league}&select=candidate_id`),
      league === "NHL"
        ? fetchCountSafe(`/rest/v1/ask_goose_nhl_source_cache_v1?select=candidate_id`)
        : Promise.resolve({ ok: true as const, count: null, error: null }),
    ]);

    const warnings = [
      queryLayer.ok && queryLayer.count === 0 ? "Ask Goose query layer is empty for this league." : null,
      loaderSource.ok && gradedQuery.ok && loaderSource.count !== gradedQuery.count
        ? "Loader source count differs from graded query count."
        : null,
      !loaderSource.ok ? `Loader source count failed: ${loaderSource.error}` : null,
      !gradedQuery.ok ? `Graded query count failed: ${gradedQuery.error}` : null,
      !gradedGold.ok ? `Gold graded count failed: ${gradedGold.error}` : null,
      league === "NHL" && !nhlCache.ok ? `NHL cache count failed: ${nhlCache.error}` : null,
    ].filter(Boolean);

    return NextResponse.json({
      ok: true,
      league,
      counts: {
        askGooseQueryLayer: queryLayer.count,
        historicalTrendsLoaderSource: loaderSource.count,
        historicalBettingMarketsQueryGraded: gradedQuery.count,
        historicalBettingMarketsGoldGraded: gradedGold.count,
        askGooseNhlSourceCache: nhlCache.count,
      },
      parity: {
        queryLayerVsLoaderSourceDelta:
          queryLayer.count !== null && loaderSource.count !== null ? queryLayer.count - loaderSource.count : null,
        loaderSourceVsQueryGradedDelta:
          loaderSource.count !== null && gradedQuery.count !== null ? loaderSource.count - gradedQuery.count : null,
        queryGradedVsGoldGradedDelta:
          gradedQuery.count !== null && gradedGold.count !== null ? gradedQuery.count - gradedGold.count : null,
        nhlCacheVsQueryLayerDelta:
          nhlCache.count !== null && queryLayer.count !== null ? nhlCache.count - queryLayer.count : null,
      },
      warnings,
      sources: {
        queryLayer,
        loaderSource,
        gradedQuery,
        gradedGold,
        nhlCache,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: toErrorMessage(error, "Ask Goose parity check failed"),
    }, { status: 500 });
  }
}
