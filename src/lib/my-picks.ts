import type { AIPick, PlayerProp, TeamTrend } from "@/lib/types";

export const MY_PICKS_STORAGE_KEY = "goosalytics_my_picks_v1";

export type MyPickResult = "pending" | "win" | "loss" | "push";
export type MyPickKind = "single" | "parlay";
export type MyPickSourceKind = "prop" | "team_trend" | "ai_pick";

export type MyPickDraft = {
  sourceKind: MyPickSourceKind;
  sourceId: string;
  league: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway?: boolean;
  playerName?: string;
  type: "player" | "team";
  summary: string;
  detail: string;
  odds: number;
  book?: string;
  line?: number;
  gameId?: string;
  gameDate?: string;
};

export type MyPickLeg = {
  id: string;
  pickId?: string;
  sourceId: string;
  sourceKind: MyPickSourceKind;
  league: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway?: boolean;
  playerName?: string;
  summary: string;
  detail: string;
  odds: number;
  book?: string;
  line?: number;
  gameId?: string;
  gameDate?: string;
  result: MyPickResult;
};

export type MyPickEntry = {
  id: string;
  kind: MyPickKind;
  createdAt: string;
  updatedAt: string;
  settledAt?: string | null;
  sourceKind: MyPickSourceKind;
  league: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway?: boolean;
  playerName?: string;
  summary: string;
  detail: string;
  odds: number;
  book?: string;
  line?: number;
  gameId?: string;
  gameDate?: string;
  units: number;
  result: MyPickResult;
  legs: MyPickLeg[];
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function asFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function americanToDecimal(odds: number) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(decimal: number) {
  if (!Number.isFinite(decimal) || decimal <= 1) return -100;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return -Math.round(100 / (decimal - 1));
}

export function combineAmericanOdds(odds: number[]) {
  const combinedDecimal = odds.reduce((total, current) => total * americanToDecimal(current), 1);
  return decimalToAmerican(combinedDecimal);
}

export function formatAmericanOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function createDraftFromProp(prop: PlayerProp): MyPickDraft {
  return {
    sourceKind: "prop",
    sourceId: prop.id,
    league: prop.league,
    team: prop.team,
    teamColor: prop.teamColor,
    opponent: prop.opponent,
    isAway: prop.isAway,
    playerName: prop.playerName,
    type: "player",
    summary: `${prop.playerName} ${prop.overUnder} ${prop.line} ${prop.propType}`,
    detail: `${prop.team} ${prop.isAway ? "@" : "vs"} ${prop.opponent} · ${formatAmericanOdds(prop.odds)}${prop.book ? ` · ${prop.book}` : ""}`,
    odds: prop.odds,
    book: prop.book,
    line: prop.line,
    gameId: prop.gameId,
    gameDate: prop.gameDate,
  };
}

export function createDraftFromTrend(trend: TeamTrend): MyPickDraft {
  const lineLabel = typeof trend.line === "string" ? trend.line : String(trend.line ?? "");
  return {
    sourceKind: "team_trend",
    sourceId: trend.id,
    league: trend.league,
    team: trend.team,
    teamColor: trend.teamColor,
    opponent: trend.opponent,
    isAway: trend.isAway,
    type: "team",
    summary: `${trend.team} ${trend.betType}${lineLabel ? ` ${lineLabel}` : ""}`,
    detail: `${trend.team} ${trend.isAway ? "@" : "vs"} ${trend.opponent} · ${formatAmericanOdds(trend.odds)}${trend.book ? ` · ${trend.book}` : ""}`,
    odds: trend.odds,
    book: trend.book,
    gameId: trend.gameId,
    gameDate: trend.gameDate,
  };
}

export function createDraftFromAIPick(pick: AIPick): MyPickDraft {
  return {
    sourceKind: "ai_pick",
    sourceId: pick.id,
    league: pick.league || "NHL",
    team: pick.team,
    teamColor: pick.teamColor,
    opponent: pick.opponent,
    isAway: pick.isAway,
    playerName: pick.playerName,
    type: pick.type,
    summary: pick.pickLabel,
    detail: `${pick.team} ${pick.isAway ? "@" : "vs"} ${pick.opponent} · ${formatAmericanOdds(pick.odds)}${pick.book ? ` · ${pick.book}` : ""}`,
    odds: pick.odds,
    book: pick.book,
    line: pick.line,
    gameId: pick.gameId,
    gameDate: pick.date,
  };
}

export function createPickFromDraft(draft: MyPickDraft, units: number): MyPickEntry {
  const createdAt = nowIso();
  const leg: MyPickLeg = {
    id: createId("leg"),
    sourceId: draft.sourceId,
    sourceKind: draft.sourceKind,
    league: draft.league,
    team: draft.team,
    teamColor: draft.teamColor,
    opponent: draft.opponent,
    isAway: draft.isAway,
    playerName: draft.playerName,
    summary: draft.summary,
    detail: draft.detail,
    odds: draft.odds,
    book: draft.book,
    line: draft.line,
    gameId: draft.gameId,
    gameDate: draft.gameDate,
    result: "pending",
  };

  return {
    id: createId("pick"),
    kind: "single",
    createdAt,
    updatedAt: createdAt,
    settledAt: null,
    sourceKind: draft.sourceKind,
    league: draft.league,
    team: draft.team,
    teamColor: draft.teamColor,
    opponent: draft.opponent,
    isAway: draft.isAway,
    playerName: draft.playerName,
    summary: draft.summary,
    detail: draft.detail,
    odds: draft.odds,
    book: draft.book,
    line: draft.line,
    gameId: draft.gameId,
    gameDate: draft.gameDate,
    units: Math.max(1, Math.min(5, Math.round(units))),
    result: "pending",
    legs: [leg],
  };
}

export function createParlayPick(picks: MyPickEntry[], units = 1): MyPickEntry {
  const singles = picks.filter((pick) => pick.kind === "single").slice(0, 4);
  const createdAt = nowIso();
  const legs = singles.map((pick) => ({
    id: createId("leg"),
    pickId: pick.id,
    sourceId: pick.legs[0]?.sourceId ?? pick.id,
    sourceKind: pick.sourceKind,
    league: pick.league,
    team: pick.team,
    teamColor: pick.teamColor,
    opponent: pick.opponent,
    isAway: pick.isAway,
    playerName: pick.playerName,
    summary: pick.summary,
    detail: pick.detail,
    odds: pick.odds,
    book: pick.book,
    line: pick.line,
    gameId: pick.gameId,
    gameDate: pick.gameDate,
    result: pick.result,
  }));
  const combinedOdds = combineAmericanOdds(legs.map((leg) => leg.odds));
  const leagues = Array.from(new Set(legs.map((leg) => leg.league).filter(Boolean)));
  const summary = `${legs.length}-leg parlay`;
  const detail = legs.map((leg) => leg.summary).join(" + ");

  return {
    id: createId("parlay"),
    kind: "parlay",
    createdAt,
    updatedAt: createdAt,
    settledAt: null,
    sourceKind: "ai_pick",
    league: leagues.length === 1 ? leagues[0] : "Mixed",
    team: "Parlay",
    teamColor: "#4a9eff",
    opponent: "Combined",
    summary,
    detail,
    odds: combinedOdds,
    units: Math.max(1, Math.min(5, Math.round(units))),
    result: "pending",
    legs,
  };
}

export function readMyPicks(): MyPickEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(MY_PICKS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizePickEntry) : [];
  } catch {
    return [];
  }
}

export function writeMyPicks(picks: MyPickEntry[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(MY_PICKS_STORAGE_KEY, JSON.stringify(picks));
  window.dispatchEvent(new StorageEvent("storage", {
    key: MY_PICKS_STORAGE_KEY,
    newValue: JSON.stringify(picks),
  }));
}

export function normalizePickEntry(raw: any): MyPickEntry {
  const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : nowIso();
  const updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : createdAt;
  const legs = Array.isArray(raw?.legs) ? raw.legs.map((leg: any) => ({
    id: typeof leg?.id === "string" ? leg.id : createId("leg"),
    pickId: typeof leg?.pickId === "string" ? leg.pickId : undefined,
    sourceId: typeof leg?.sourceId === "string" ? leg.sourceId : "",
    sourceKind: leg?.sourceKind === "prop" || leg?.sourceKind === "team_trend" ? leg.sourceKind : "ai_pick",
    league: typeof leg?.league === "string" ? leg.league : "",
    team: typeof leg?.team === "string" ? leg.team : "",
    teamColor: typeof leg?.teamColor === "string" ? leg.teamColor : "#4a9eff",
    opponent: typeof leg?.opponent === "string" ? leg.opponent : "",
    isAway: Boolean(leg?.isAway),
    playerName: typeof leg?.playerName === "string" ? leg.playerName : undefined,
    summary: typeof leg?.summary === "string" ? leg.summary : "",
    detail: typeof leg?.detail === "string" ? leg.detail : "",
    odds: asFiniteNumber(leg?.odds, -110),
    book: typeof leg?.book === "string" ? leg.book : undefined,
    line: typeof leg?.line === "number" ? leg.line : undefined,
    gameId: typeof leg?.gameId === "string" ? leg.gameId : undefined,
    gameDate: typeof leg?.gameDate === "string" ? leg.gameDate : undefined,
    result: normalizeResult(leg?.result),
  })) : [];

  return {
    id: typeof raw?.id === "string" ? raw.id : createId("pick"),
    kind: raw?.kind === "parlay" ? "parlay" : "single",
    createdAt,
    updatedAt,
    settledAt: typeof raw?.settledAt === "string" ? raw.settledAt : null,
    sourceKind: raw?.sourceKind === "prop" || raw?.sourceKind === "team_trend" ? raw.sourceKind : "ai_pick",
    league: typeof raw?.league === "string" ? raw.league : "",
    team: typeof raw?.team === "string" ? raw.team : "",
    teamColor: typeof raw?.teamColor === "string" ? raw.teamColor : "#4a9eff",
    opponent: typeof raw?.opponent === "string" ? raw.opponent : "",
    isAway: Boolean(raw?.isAway),
    playerName: typeof raw?.playerName === "string" ? raw.playerName : undefined,
    summary: typeof raw?.summary === "string" ? raw.summary : "",
    detail: typeof raw?.detail === "string" ? raw.detail : "",
    odds: asFiniteNumber(raw?.odds, -110),
    book: typeof raw?.book === "string" ? raw.book : undefined,
    line: typeof raw?.line === "number" ? raw.line : undefined,
    gameId: typeof raw?.gameId === "string" ? raw.gameId : undefined,
    gameDate: typeof raw?.gameDate === "string" ? raw.gameDate : undefined,
    units: Math.max(1, Math.min(5, Math.round(asFiniteNumber(raw?.units, 1)))),
    result: normalizeResult(raw?.result),
    legs,
  };
}

export function normalizeResult(value: unknown): MyPickResult {
  if (value === "win" || value === "loss" || value === "push") return value;
  return "pending";
}

export function syncParlayResults(picks: MyPickEntry[]) {
  const picksById = new Map(picks.map((pick) => [pick.id, pick]));

  return picks.map((pick) => {
    if (pick.kind !== "parlay") return pick;

    const nextLegs = pick.legs.map((leg) => {
      if (!leg.pickId) return leg;
      const sourcePick = picksById.get(leg.pickId);
      if (!sourcePick) return leg;

      return {
        ...leg,
        result: sourcePick.result,
      };
    });

    const settledLegs = nextLegs.filter((leg) => leg.result !== "pending");
    let nextResult: MyPickResult = "pending";
    let nextOdds = pick.odds;

    if (settledLegs.length === nextLegs.length && nextLegs.length > 0) {
      if (nextLegs.some((leg) => leg.result === "loss")) {
        nextResult = "loss";
      } else {
        const winningLegs = nextLegs.filter((leg) => leg.result === "win");
        if (winningLegs.length === 0) {
          nextResult = "push";
        } else {
          nextResult = "win";
          nextOdds = combineAmericanOdds(winningLegs.map((leg) => leg.odds));
        }
      }
    }

    return {
      ...pick,
      odds: nextOdds,
      result: nextResult,
      updatedAt: nowIso(),
      settledAt: nextResult === "pending" ? null : nowIso(),
      legs: nextLegs,
    };
  });
}
