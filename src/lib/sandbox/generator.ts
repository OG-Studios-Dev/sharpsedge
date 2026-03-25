import { getDateKey, APP_TIME_ZONE, NBA_TIME_ZONE } from "@/lib/date-utils";
import { getLiveDashboardData } from "@/lib/live-data";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks, selectTopPicks } from "@/lib/picks-engine";
import type { AIPick } from "@/lib/types";

export type SandboxLeague = "NHL" | "NBA";

export type SandboxGeneratorResult = {
  sandboxKey: string;
  date: string;
  league: SandboxLeague;
  picks: AIPick[];
  experimentTag: string;
  reviewNotes: string;
};

const SANDBOX_PICK_COUNT = 10;
const SANDBOX_EXPERIMENT_TAG = "daily-sandbox-v1";

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizeGameId(value?: string | number | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return undefined;
  return normalized;
}

function isRealNHLGameId(gameId?: string) {
  return Boolean(gameId && /^\d{10}$/.test(gameId));
}

function isRealNBAGameId(gameId?: string | null) {
  return Boolean(gameId && /^\d{8,12}$/.test(gameId));
}

function withSandboxIdentity(picks: AIPick[], league: SandboxLeague, date: string) {
  return picks.map((pick, index) => ({
    ...pick,
    id: `sandbox-${league.toLowerCase()}-${date}-${String(index + 1).padStart(2, "0")}-${pick.id}`,
    date,
    league,
    result: "pending" as const,
    units: typeof pick.units === "number" && Number.isFinite(pick.units) ? pick.units : 1,
  }));
}

function buildReviewNotes(league: SandboxLeague, date: string, count: number) {
  return [
    `${league} sandbox slate for ${date}.`,
    `Requires explicit review of home/away splits, travel/rest, hot runs, injury/news context, and price discipline before any production consideration.`,
    `Auto-generated experimental board with ${count} isolated picks; production pick history remains untouched.`,
  ].join(" ");
}

function buildSandboxKey(league: SandboxLeague, date: string) {
  return `sandbox-${league.toLowerCase()}-${date}`;
}

async function generateNHLSandboxPicks(date: string): Promise<AIPick[]> {
  const data = await getLiveDashboardData();
  const scheduledGames = (data.schedule?.games || []).filter((game) => date === getDateKey(new Date(game.startTimeUTC), APP_TIME_ZONE));
  const scheduledGameIds = new Set(
    scheduledGames
      .map((game) => normalizeGameId(game.id))
      .filter(isRealNHLGameId),
  );

  const props = (data.props || []).filter((prop) => {
    const gameId = normalizeGameId(prop.gameId);
    return prop.statsSource === "live-nhl" && isRealNHLGameId(gameId) && scheduledGameIds.has(gameId!);
  });

  const teamTrends = (data.teamTrends || []).filter((trend) => {
    const gameId = normalizeGameId(trend.gameId);
    return isRealNHLGameId(gameId) && scheduledGameIds.has(gameId!);
  });

  const picks: AIPick[] = [];
  const used = new Set<string>();

  for (let i = 0; i < 8 && picks.length < SANDBOX_PICK_COUNT; i++) {
    const next = selectTopPicks(
      props.filter((prop) => !used.has(prop.id)),
      teamTrends.filter((trend) => !used.has(trend.id)),
      date,
    );

    if (!next.length) break;

    for (const pick of next) {
      if (picks.length >= SANDBOX_PICK_COUNT) break;
      if (picks.some((existing) => existing.id === pick.id)) continue;
      picks.push(pick);
    }

    for (const pick of next) {
      const sourceId = pick.type === "player"
        ? props.find((prop) => prop.playerName === pick.playerName && prop.team === pick.team && prop.propType === pick.propType && prop.line === pick.line)?.id
        : teamTrends.find((trend) => trend.team === pick.team && trend.betType === pick.betType && String(trend.line ?? "") === String(pick.line ?? ""))?.id;
      if (sourceId) used.add(sourceId);
    }
  }

  return withSandboxIdentity(dedupeById(picks).slice(0, SANDBOX_PICK_COUNT), "NHL", date);
}

async function generateNBASandboxPicks(date: string): Promise<AIPick[]> {
  const data = await getNBADashboardData();
  const activeGameIds = new Set(
    (data.schedule || [])
      .filter((game: any) => typeof game.date === "string" && game.date.slice(0, 10) === date && game.status !== "Final")
      .map((game: any) => game.id)
      .filter(isRealNBAGameId),
  );

  const props = (data.props || []).filter((prop: any) => isRealNBAGameId(prop?.gameId) && activeGameIds.has(prop.gameId));
  const teamTrends = (data.teamTrends || []).filter((trend: any) => isRealNBAGameId(trend?.gameId) && activeGameIds.has(trend.gameId));

  const picks: AIPick[] = [];
  const used = new Set<string>();

  for (let i = 0; i < 8 && picks.length < SANDBOX_PICK_COUNT; i++) {
    const next = selectNBATopPicks(
      props.filter((prop: any) => !used.has(prop.id)),
      teamTrends.filter((trend: any) => !used.has(trend.id)),
      date,
    );

    if (!next.length) break;

    for (const pick of next) {
      if (picks.length >= SANDBOX_PICK_COUNT) break;
      if (picks.some((existing) => existing.id === pick.id)) continue;
      picks.push(pick);
    }

    for (const pick of next) {
      const sourceId = pick.type === "player"
        ? props.find((prop: any) => prop.playerName === pick.playerName && prop.team === pick.team && prop.propType === pick.propType && prop.line === pick.line)?.id
        : teamTrends.find((trend: any) => trend.team === pick.team && trend.betType === pick.betType && String(trend.line ?? "") === String(pick.line ?? ""))?.id;
      if (sourceId) used.add(sourceId);
    }
  }

  return withSandboxIdentity(dedupeById(picks).slice(0, SANDBOX_PICK_COUNT), "NBA", date);
}

export async function generateSandboxSlate(league: SandboxLeague, requestedDate?: string | null): Promise<SandboxGeneratorResult> {
  const date = requestedDate?.trim()
    || (league === "NBA" ? getDateKey(new Date(), NBA_TIME_ZONE) : getDateKey(new Date(), APP_TIME_ZONE));

  const picks = league === "NBA"
    ? await generateNBASandboxPicks(date)
    : await generateNHLSandboxPicks(date);

  if (picks.length < SANDBOX_PICK_COUNT) {
    throw new Error(`Only ${picks.length} ${league} sandbox picks were available for ${date}; need ${SANDBOX_PICK_COUNT} to lock the sandbox slate.`);
  }

  return {
    sandboxKey: buildSandboxKey(league, date),
    date,
    league,
    picks,
    experimentTag: SANDBOX_EXPERIMENT_TAG,
    reviewNotes: buildReviewNotes(league, date, picks.length),
  };
}
