import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { getMLBDashboardData } from "@/lib/mlb-live-data";

export const dynamic = "force-dynamic";

type PropsPayload = {
  props: unknown[];
  meta: {
    league?: string;
    statsSource?: string;
    gamesCount?: number;
    propsCount?: number;
    [key: string]: unknown;
  };
};

function normalizePayload(payload: unknown, fallbackLeague: string, fallbackSource: string): PropsPayload {
  const data = (payload ?? {}) as Record<string, unknown>;
  const meta = ((data.meta ?? {}) as Record<string, unknown>);

  return {
    props: Array.isArray(data.props) ? data.props : [],
    meta: {
      ...meta,
      league: typeof meta.league === "string" ? meta.league : fallbackLeague,
      statsSource: typeof meta.statsSource === "string" ? meta.statsSource : fallbackSource,
      gamesCount: typeof meta.gamesCount === "number" ? meta.gamesCount : undefined,
      propsCount: typeof meta.propsCount === "number" ? meta.propsCount : undefined,
    },
  };
}

export async function GET() {
  const settledAt = new Date().toISOString();

  const [nhlResult, nbaResult, mlbResult] = await Promise.allSettled([
    getLiveDashboardData(),
    getNBADashboardData(),
    getMLBDashboardData(),
  ]);

  const nhl = normalizePayload(
    nhlResult.status === "fulfilled" ? nhlResult.value : null,
    "NHL",
    "live-nhl",
  );
  const nba = normalizePayload(
    nbaResult.status === "fulfilled" ? nbaResult.value : null,
    "NBA",
    "espn",
  );
  const mlb = normalizePayload(
    mlbResult.status === "fulfilled" ? mlbResult.value : null,
    "MLB",
    "mlb-stats-api",
  );

  const props = [...nhl.props, ...nba.props, ...mlb.props];

  return NextResponse.json({
    props,
    meta: {
      settledAt,
      totalProps: props.length,
      leagues: {
        NHL: {
          ok: nhlResult.status === "fulfilled",
          propsCount: nhl.props.length,
          statsSource: nhl.meta.statsSource,
          gamesCount: nhl.meta.gamesCount,
        },
        NBA: {
          ok: nbaResult.status === "fulfilled",
          propsCount: nba.props.length,
          statsSource: nba.meta.statsSource,
          gamesCount: nba.meta.gamesCount,
        },
        MLB: {
          ok: mlbResult.status === "fulfilled",
          propsCount: mlb.props.length,
          statsSource: mlb.meta.statsSource,
          gamesCount: mlb.meta.gamesCount,
        },
      },
    },
  });
}
