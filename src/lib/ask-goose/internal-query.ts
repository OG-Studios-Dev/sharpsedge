export type AskGooseRow = {
  candidate_id: string;
  canonical_game_id?: string | null;
  event_id?: string | null;
  league: string;
  event_date: string;
  home_team?: string | null;
  away_team?: string | null;
  team_role?: string | null;
  team_name: string | null;
  opponent_name: string | null;
  market_type: string | null;
  submarket_type: string | null;
  market_family: string | null;
  market_scope: string | null;
  side: string | null;
  line: number | null;
  odds: number | null;
  sportsbook: string | null;
  result: string | null;
  graded: boolean | null;
  integrity_status?: string | null;
  profit_units: number | null;
  profit_dollars_10: number | null;
  roi_on_10_flat: number | null;
  segment_key: string | null;
  is_home_team_bet: boolean | null;
  is_away_team_bet: boolean | null;
  is_favorite: boolean | null;
  is_underdog: boolean | null;
  team_win_pct_pre_game?: number | null;
  opponent_win_pct_pre_game?: number | null;
  team_above_500_pre_game?: boolean | null;
  opponent_above_500_pre_game?: boolean | null;
};

export type AskGooseIntent = {
  normalizedQuestion: string;
  looksLikeBettingQuestion: boolean;
  refusalReason: string | null;
  matchedTeam: string | null;
  matchedOpponent: string | null;
  marketType: "moneyline" | "spread" | "total" | null;
  side: "over" | "under" | "home" | "away" | null;
  requestedLine: number | null;
  minOdds: number | null;
  maxOdds: number | null;
  scope: "full_game" | "period_1" | "quarter_1" | "first_half" | "first_five" | null;
  wantsRecentOnly: boolean;
  wantsBroaderSample: boolean;
  mentionedFavorite: boolean;
  mentionedUnderdog: boolean;
  mentionedHome: boolean;
  mentionedAway: boolean;
  wantsTeamMarketFocus: boolean;
  wantsHeadToHead: boolean;
  wantsAbove500Teams: boolean;
  requestedSeasonStartYear: number | null;
  requestedSeasonEndYear: number | null;
};

export type AskGooseAnswer = {
  intent: AskGooseIntent;
  summaryText: string;
  sampleSize: number;
  rawRows: number;
  dedupedRows: number;
  gradedRows: number;
  wins: number;
  losses: number;
  pushes: number;
  totalUnits: number;
  avgRoi: number;
  sourceUnits: number;
  sourceAvgRoi: number;
  evidenceRows: AskGooseRow[];
  warnings: string[];
  trustNotes: string[];
  counterSide?: {
    side: "over" | "under" | "home" | "away";
    gradedRows: number;
    wins: number;
    losses: number;
    pushes: number;
    totalUnits: number;
    avgRoi: number;
  } | null;
};

const TEAM_ALIASES: Record<string, string[]> = {
  NHL: [
    "ducks", "anaheim ducks", "bruins", "boston bruins", "sabres", "buffalo sabres", "flames", "calgary flames", "hurricanes", "carolina hurricanes", "blackhawks", "chicago blackhawks", "avalanche", "colorado avalanche", "blue jackets", "columbus blue jackets", "stars", "dallas stars", "red wings", "detroit red wings", "oilers", "edmonton oilers", "panthers", "florida panthers", "kings", "los angeles kings", "wild", "minnesota wild", "canadiens", "montreal canadiens", "habs", "predators", "nashville predators", "devils", "new jersey devils", "islanders", "new york islanders", "rangers", "new york rangers", "senators", "ottawa senators", "flyers", "philadelphia flyers", "penguins", "pittsburgh penguins", "sharks", "san jose sharks", "kraken", "seattle kraken", "blues", "st louis blues", "lightning", "tampa bay lightning", "maple leafs", "toronto maple leafs", "leafs", "utah", "utah hockey club", "canucks", "vancouver canucks", "golden knights", "vegas golden knights", "knights", "capitals", "washington capitals", "jets", "winnipeg jets",
  ],
  NBA: [
    "hawks", "celtics", "nets", "hornets", "bulls", "cavaliers", "mavericks", "nuggets", "pistons", "warriors", "rockets", "pacers", "clippers", "lakers", "grizzlies", "heat", "bucks", "timberwolves", "pelicans", "knicks", "thunder", "magic", "76ers", "suns", "blazers", "kings", "spurs", "raptors", "jazz", "wizards",
  ],
  MLB: [
    "diamondbacks", "braves", "orioles", "red sox", "cubs", "white sox", "reds", "guardians", "rockies", "tigers", "astros", "royals", "angels", "dodgers", "marlins", "brewers", "twins", "mets", "yankees", "athletics", "phillies", "pirates", "padres", "giants", "mariners", "cardinals", "rays", "rangers", "blue jays", "nationals",
  ],
  NFL: [
    "cardinals", "falcons", "ravens", "bills", "panthers", "bears", "bengals", "browns", "cowboys", "broncos", "lions", "packers", "texans", "colts", "jaguars", "chiefs", "raiders", "chargers", "rams", "dolphins", "vikings", "patriots", "saints", "giants", "jets", "eagles", "steelers", "49ers", "seahawks", "buccaneers", "titans", "commanders",
  ],
};

function normalizeName(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowMatchesNeedle(value: string | null | undefined, needle: string | null | undefined) {
  const hay = normalizeName(value);
  const target = normalizeName(needle);
  if (!hay || !target) return false;
  return hay === target || hay.includes(target) || target.includes(hay);
}

function extractRequestedLine(question: string) {
  const q = question.toLowerCase();
  const explicit = q.match(/(?:line|total|under|over|spread|puckline|runline)\s*(?:of|at|=|is)?\s*([+-]?\d+(?:\.\d+)?)/);
  if (explicit) return Number(explicit[1]);
  const anyHalfLine = q.match(/\b([+-]?\d+\.5)\b/);
  return anyHalfLine ? Number(anyHalfLine[1]) : null;
}

function extractOddsRange(question: string) {
  const q = question.toLowerCase();
  const shorter = q.match(/([+-]?\d{2,5})\s*(?:or\s*)?(shorter|better)/);
  const longer = q.match(/([+-]?\d{2,5})\s*(?:or\s*)?(longer|worse)/);
  const between = q.match(/between\s*([+-]?\d{2,5})\s*(?:and|to|-)\s*([+-]?\d{2,5})/);
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[2]);
    return { minOdds: Math.min(a, b), maxOdds: Math.max(a, b) };
  }
  if (shorter) {
    const odds = Number(shorter[1]);
    return odds < 0 ? { minOdds: odds, maxOdds: 100000 } : { minOdds: -100000, maxOdds: odds };
  }
  if (longer) {
    const odds = Number(longer[1]);
    return odds < 0 ? { minOdds: -100000, maxOdds: odds } : { minOdds: odds, maxOdds: 100000 };
  }
  return { minOdds: null, maxOdds: null };
}

function detectScope(question: string): AskGooseIntent["scope"] {
  const q = question.toLowerCase();
  if (/\bp1\b|first period|period 1/.test(q)) return "period_1";
  if (/\bq1\b|first quarter|quarter 1/.test(q)) return "quarter_1";
  if (/\b1h\b|first half/.test(q)) return "first_half";
  if (/\bf5\b|first five|first 5/.test(q)) return "first_five";
  if (/full game|game market|regulation|whole game/.test(q)) return "full_game";
  return null;
}

function marketScopeMatches(row: AskGooseRow, scope: AskGooseIntent["scope"]) {
  if (!scope) return isFullGameRow(row);
  const text = [row.market_type, row.market_family, row.market_scope, row.submarket_type, row.segment_key]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (scope === "full_game") return isFullGameRow(row);
  if (scope === "period_1") return /period[_\s-]?1|first period|\bp1\b/.test(text);
  if (scope === "quarter_1") return /quarter[_\s-]?1|first quarter|\bq1\b/.test(text);
  if (scope === "first_half") return /first half|\b1h\b/.test(text);
  if (scope === "first_five") return /first five|first 5|\bf5\b/.test(text);
  return true;
}

function isFullGameRow(row: AskGooseRow) {
  const submarket = (row.submarket_type || "").toLowerCase().trim();
  const scope = (row.market_scope || "").toLowerCase().trim();
  const segment = (row.segment_key || "").toLowerCase().trim();
  const text = `${submarket} ${scope} ${segment}`;
  if (/(period|quarter|half|inning|\bp1\b|\bq1\b|\b1h\b|first five|first 5|\bf5\b|regulation)/.test(text)) return false;
  return scope === "" || scope === "game" || scope === "full_game" || ["moneyline", "spread", "total"].includes(submarket);
}

export function parseAskGooseIntent(question: string, league: string, rows: AskGooseRow[]): AskGooseIntent {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim().toLowerCase();
  const looksLikeBettingQuestion = /(win rate|roi|unit|profit|record|system|trend|cover|favorite|favou?rite|underdog|dog|over|under|moneyline|\bml\b|spread|ats|perform|performance|lately|recent|against|head to head|total|puckline|runline|odds|price|bet|wager|parlay|pick)/.test(normalizedQuestion);
  const refusalReason = looksLikeBettingQuestion ? null : "Ask Goose only answers database-backed betting research questions. Try asking about a league, market, side, line, odds range, record, units, or ROI.";
  const candidates = TEAM_ALIASES[league] ?? [];
  const matchedTeams = candidates
    .filter((team) => normalizedQuestion.includes(normalizeName(team)))
    .sort((a, b) => b.length - a.length);

  let marketType: AskGooseIntent["marketType"] = null;
  if (/\bmoneyline\b|\bml\b/.test(normalizedQuestion)) marketType = "moneyline";
  else if (/\bspread\b|\bats\b|\bcover\b|puckline|runline/.test(normalizedQuestion)) marketType = "spread";
  else if (/\btotal\b|\bover\b|\bunder\b/.test(normalizedQuestion) && !/underdog|\bdog\b/.test(normalizedQuestion)) marketType = "total";

  const rowTeamMatches = rows
    .flatMap((row) => [row.team_name, row.opponent_name, row.home_team, row.away_team])
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);

  const matchedRowNames = rowTeamMatches.filter((name) => {
    const normalizedName = normalizeName(name);
    if (normalizedName.length < 3) return false;
    return normalizedQuestion.includes(normalizedName) || matchedTeams.some((team) => {
      const normalizedTeam = normalizeName(team);
      return normalizedTeam.length >= 3 && (normalizedName.includes(normalizedTeam) || normalizedTeam.includes(normalizedName));
    });
  });

  const matchedTeam = matchedRowNames[0] ?? matchedTeams[0] ?? null;
  const matchedOpponent = matchedRowNames[1] ?? matchedTeams[1] ?? null;
  const wantsHeadToHead = /\bvs\b|against|head to head/.test(normalizedQuestion) || Boolean(matchedTeam && matchedOpponent);
  const mentionedHome = /\bhome\b|at home/.test(normalizedQuestion);
  const mentionedAway = /\baway\b|\broad\b|on the road/.test(normalizedQuestion);
  const oddsRange = extractOddsRange(normalizedQuestion);
  const requestedLine = extractRequestedLine(normalizedQuestion);
  const side = /\bover\b/.test(normalizedQuestion)
    ? "over"
    : /\bunder\b/.test(normalizedQuestion) && !/underdog(s)?\b/.test(normalizedQuestion)
      ? "under"
      : mentionedHome
        ? "home"
        : mentionedAway
          ? "away"
          : null;
  const wantsTeamMarketFocus = Boolean(matchedTeam) || mentionedHome || mentionedAway || /underdog|\bdog\b|favorite|favou?rite/.test(normalizedQuestion) || marketType === "moneyline" || marketType === "spread";

  const yearMatches = Array.from(normalizedQuestion.matchAll(/\b(20\d{2})\b/g)).map((match) => Number(match[1]));
  const requestedSeasonStartYear = yearMatches.length ? Math.min(...yearMatches) : null;
  const requestedSeasonEndYear = yearMatches.length ? Math.max(...yearMatches) : null;
  const wantsAbove500Teams = /(above|over|greater than|better than)\s*\.?500|\.500\s*(and\s*)?(above|over|plus|\+)/.test(normalizedQuestion);

  return {
    normalizedQuestion,
    looksLikeBettingQuestion,
    refusalReason,
    matchedTeam,
    matchedOpponent,
    marketType,
    side,
    requestedLine,
    minOdds: oddsRange.minOdds,
    maxOdds: oddsRange.maxOdds,
    scope: detectScope(normalizedQuestion),
    wantsRecentOnly: /last\s+(5|10|25)|recent/.test(normalizedQuestion),
    wantsBroaderSample: /lately|recent|performance|perform|record|trend|how have/.test(normalizedQuestion) || matchedTeams.length > 0 || matchedRowNames.length > 0,
    mentionedFavorite: /favorite|favou?rite/.test(normalizedQuestion),
    mentionedUnderdog: /underdog|\bdog\b/.test(normalizedQuestion),
    mentionedHome,
    mentionedAway,
    wantsTeamMarketFocus,
    wantsHeadToHead,
    wantsAbove500Teams,
    requestedSeasonStartYear,
    requestedSeasonEndYear,
  };
}

function isLikelyPlayerProp(row: AskGooseRow) {
  const submarket = (row.submarket_type || "").toLowerCase();
  return submarket.includes("points")
    || submarket.includes("assists")
    || submarket.includes("goals")
    || submarket.includes("shots")
    || submarket.includes("saves")
    || submarket.includes("rebounds")
    || submarket.includes("passing")
    || submarket.includes("rushing")
    || submarket.includes("receiving");
}

function isGameLevelTeamMarketRow(row: AskGooseRow) {
  if (isLikelyPlayerProp(row)) return false;
  return isFullGameRow(row);
}

function marketMatches(row: AskGooseRow, marketType: AskGooseIntent["marketType"]) {
  if (!marketType) return true;
  const parts = [row.market_type, row.submarket_type, row.market_family, row.segment_key]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (marketType === "moneyline") return row.market_type === "moneyline" || row.market_family === "moneyline" || parts.includes("h2h");
  if (marketType === "spread") return row.market_type === "spread" || row.market_family === "spread" || parts.includes("spread") || parts.includes("puckline") || parts.includes("runline");
  if (marketType === "total") return row.market_type === "total" || row.market_family === "total" || parts.includes("total");
  return true;
}

function rowDecisionKey(row: AskGooseRow) {
  const game = row.canonical_game_id || row.event_id || `${row.league}:${row.event_date}:${row.away_team || ""}@${row.home_team || ""}:${row.team_name || ""}:${row.opponent_name || ""}`;
  const scope = marketScopeMatches(row, "full_game") ? "full_game" : (row.market_scope || row.submarket_type || row.segment_key || "scope");
  return [game, row.market_type || row.market_family || "market", scope, row.side || row.team_role || row.team_name || "side", row.line ?? "na"].join("|");
}

function oddsLooksSane(odds: number | null | undefined) {
  return typeof odds === "number" && Number.isFinite(odds) && Math.abs(odds) >= 80 && Math.abs(odds) <= 5000;
}

function fullGameLineHealth(row: AskGooseRow) {
  if (!isFullGameRow(row)) return "non_full_game_scope";
  const sport = String(row.league || "UNKNOWN").toUpperCase();
  const market = row.market_type || row.market_family || "unknown_market";
  const line = Number(row.line);
  if (market === "moneyline") return "no_line_expected";
  if (!Number.isFinite(line)) return "missing_line";
  const abs = Math.abs(line);

  if (market === "total") {
    if (sport === "NBA") return line < 150 ? "implausibly_low_full_game_total" : line > 290 ? "implausibly_high_full_game_total" : "plausible_full_game_total";
    if (sport === "NFL") return line < 25 ? "implausibly_low_full_game_total" : line > 75 ? "implausibly_high_full_game_total" : "plausible_full_game_total";
    if (sport === "MLB") return line < 3 ? "implausibly_low_full_game_total" : line > 20 ? "implausibly_high_full_game_total" : "plausible_full_game_total";
    if (sport === "NHL") return line < 3 ? "implausibly_low_full_game_total" : line > 10 ? "implausibly_high_full_game_total" : "plausible_full_game_total";
  }

  if (market === "spread") {
    if ((sport === "NBA" || sport === "NFL") && abs > 35) return "implausibly_wide_spread";
    if ((sport === "MLB" || sport === "NHL") && abs > 5) return "implausibly_wide_spread";
    return "plausible_spread";
  }

  return "unchecked_line_range";
}

function hasImplausibleFullGameLine(row: AskGooseRow) {
  return fullGameLineHealth(row).startsWith("implausibly_");
}

function normalizedProfitUnits(row: AskGooseRow) {
  const result = String(row.result || "").toLowerCase();
  if (result === "loss") return -1;
  if (result === "push" || result === "void" || result === "cancelled" || result === "dq") return 0;
  if (result !== "win") return 0;
  const odds = row.odds;
  if (!oddsLooksSane(odds)) return 100 / 110;
  return odds! > 0 ? odds! / 100 : 100 / Math.abs(odds!);
}

function inferAbove500Flag(winPct: number | null | undefined) {
  return typeof winPct === "number" && Number.isFinite(winPct) ? winPct > 0.5 : null;
}

function rowTeamAbove500(row: AskGooseRow) {
  return row.team_above_500_pre_game ?? inferAbove500Flag(row.team_win_pct_pre_game);
}

function rowOpponentAbove500(row: AskGooseRow) {
  return row.opponent_above_500_pre_game ?? inferAbove500Flag(row.opponent_win_pct_pre_game);
}

function rowMatchesSeasonWindow(row: AskGooseRow, startYear: number | null, endYear: number | null) {
  if (!startYear && !endYear) return true;
  const year = Number(String(row.event_date || "").slice(0, 4));
  if (!Number.isFinite(year)) return false;
  if (startYear && year < startYear) return false;
  if (endYear && year > endYear) return false;
  return true;
}

function summarizeGraded(rows: AskGooseRow[]) {
  const graded = rows.filter((row) => row.graded === true && ["win", "loss", "push", "void", "cancelled", "dq"].includes(String(row.result || "").toLowerCase()));
  const wins = graded.filter((row) => String(row.result || "").toLowerCase() === "win").length;
  const losses = graded.filter((row) => String(row.result || "").toLowerCase() === "loss").length;
  const pushes = graded.filter((row) => {
    const result = String(row.result || "").toLowerCase();
    return result === "push" || result === "void" || result === "cancelled" || result === "dq";
  }).length;
  const totalUnits = graded.reduce((sum, row) => sum + normalizedProfitUnits(row), 0);
  const avgRoi = graded.length ? (totalUnits / graded.length) * 100 : 0;
  return { graded, wins, losses, pushes, totalUnits, avgRoi };
}

function dedupeRows(rows: AskGooseRow[]) {
  const map = new Map<string, AskGooseRow>();
  for (const row of rows) {
    const key = rowDecisionKey(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const existingOdds = typeof existing.odds === "number" ? existing.odds : -100000;
    const rowOdds = typeof row.odds === "number" ? row.odds : -100000;
    if ((row.graded === true && existing.graded !== true) || rowOdds > existingOdds) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

export function answerAskGooseQuestion(question: string, league: string, rows: AskGooseRow[]): AskGooseAnswer {
  const intent = parseAskGooseIntent(question, league, rows);
  const warnings: string[] = [];
  const trustNotes: string[] = [
    "Database-backed only: answers are computed from ask_goose_query_layer_v1, not guessed.",
    "Samples are de-duped to one betting decision per game/market/side/line before summary.",
    "Units use normalized 1-unit risk at available sane American odds; suspicious odds fall back to -110-style profit for wins.",
  ];

  if (!intent.looksLikeBettingQuestion) {
    return {
      intent,
      summaryText: intent.refusalReason || "Ask Goose only answers database-backed betting research questions.",
      sampleSize: 0,
      rawRows: rows.length,
      dedupedRows: 0,
      gradedRows: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      totalUnits: 0,
      avgRoi: 0,
      sourceUnits: 0,
      sourceAvgRoi: 0,
      evidenceRows: [],
      warnings: ["Rejected: non-betting or unsupported question."],
      trustNotes,
      counterSide: null,
    };
  }

  let filtered = [...rows];

  if (intent.matchedTeam) {
    filtered = filtered.filter((row) => rowMatchesNeedle(row.team_name, intent.matchedTeam) || rowMatchesNeedle(row.opponent_name, intent.matchedTeam) || rowMatchesNeedle(row.home_team, intent.matchedTeam) || rowMatchesNeedle(row.away_team, intent.matchedTeam));
  }

  if (intent.matchedOpponent) {
    filtered = filtered.filter((row) => rowMatchesNeedle(row.team_name, intent.matchedOpponent) || rowMatchesNeedle(row.opponent_name, intent.matchedOpponent) || rowMatchesNeedle(row.home_team, intent.matchedOpponent) || rowMatchesNeedle(row.away_team, intent.matchedOpponent));
  }

  filtered = filtered.filter((row) => marketMatches(row, intent.marketType));

  if (!intent.scope) {
    filtered = filtered.filter((row) => marketScopeMatches(row, null));
  } else {
    filtered = filtered.filter((row) => marketScopeMatches(row, intent.scope));
  }

  if (!intent.scope || intent.scope === "full_game") {
    const beforeLineHealth = filtered.length;
    filtered = filtered.filter((row) => !hasImplausibleFullGameLine(row));
    const excluded = beforeLineHealth - filtered.length;
    if (excluded > 0) warnings.push(`Excluded ${excluded} rows with implausible full-game lines so period/team/alternate markets do not contaminate the answer.`);
  }

  const beforeSideFilter = [...filtered];

  if (intent.marketType === "total" && (intent.side === "over" || intent.side === "under")) {
    filtered = filtered.filter((row) => (row.side || "").toLowerCase().includes(intent.side!));
  }

  if (intent.mentionedHome) filtered = filtered.filter((row) => row.is_home_team_bet === true || String(row.team_role || "").toLowerCase() === "home");
  if (intent.mentionedAway) filtered = filtered.filter((row) => row.is_away_team_bet === true || String(row.team_role || "").toLowerCase() === "away");
  if (intent.mentionedFavorite) filtered = filtered.filter((row) => row.is_favorite === true);
  if (intent.mentionedUnderdog) filtered = filtered.filter((row) => row.is_underdog === true);

  if (typeof intent.requestedLine === "number" && Number.isFinite(intent.requestedLine)) {
    filtered = filtered.filter((row) => typeof row.line === "number" && Math.abs(row.line - intent.requestedLine!) < 0.001);
  }

  if (typeof intent.minOdds === "number") filtered = filtered.filter((row) => typeof row.odds === "number" && row.odds >= intent.minOdds!);
  if (typeof intent.maxOdds === "number") filtered = filtered.filter((row) => typeof row.odds === "number" && row.odds <= intent.maxOdds!);

  if (intent.wantsTeamMarketFocus) {
    filtered = filtered.filter((row) => isGameLevelTeamMarketRow(row));
  }

  if (intent.wantsAbove500Teams) {
    const beforeAbove500 = filtered.length;
    filtered = filtered.filter((row) => rowTeamAbove500(row) === true && rowOpponentAbove500(row) === true);
    if (beforeAbove500 > 0 && filtered.length === 0) warnings.push("The current Ask Goose serving layer has no populated pre-game .500 flags for this slice, so the .500 condition could not be proven from the database yet.");
  }

  if (intent.requestedSeasonStartYear || intent.requestedSeasonEndYear) {
    filtered = filtered.filter((row) => rowMatchesSeasonWindow(row, intent.requestedSeasonStartYear, intent.requestedSeasonEndYear));
  }

  filtered.sort((a, b) => String(b.event_date || "").localeCompare(String(a.event_date || "")));
  const deduped = dedupeRows(filtered);
  const sliced = intent.wantsRecentOnly ? deduped.slice(0, 10) : deduped;
  const { graded, wins, losses, pushes, totalUnits, avgRoi } = summarizeGraded(sliced);
  const sourceUnits = graded.reduce((sum, row) => sum + Number(row.profit_units || 0), 0);
  const sourceAvgRoi = graded.length ? graded.reduce((sum, row) => sum + Number(row.roi_on_10_flat || 0), 0) / graded.length : 0;

  let counterSide: AskGooseAnswer["counterSide"] = null;
  if (intent.marketType === "total" && (intent.side === "over" || intent.side === "under")) {
    const oppositeSide = intent.side === "over" ? "under" : "over";
    let oppositeRows = beforeSideFilter.filter((row) => (row.side || "").toLowerCase().includes(oppositeSide));
    if (typeof intent.requestedLine === "number" && Number.isFinite(intent.requestedLine)) oppositeRows = oppositeRows.filter((row) => typeof row.line === "number" && Math.abs(row.line - intent.requestedLine!) < 0.001);
    if (intent.wantsTeamMarketFocus) oppositeRows = oppositeRows.filter((row) => isGameLevelTeamMarketRow(row));
    if (intent.wantsAbove500Teams) oppositeRows = oppositeRows.filter((row) => rowTeamAbove500(row) === true && rowOpponentAbove500(row) === true);
    if (intent.requestedSeasonStartYear || intent.requestedSeasonEndYear) oppositeRows = oppositeRows.filter((row) => rowMatchesSeasonWindow(row, intent.requestedSeasonStartYear, intent.requestedSeasonEndYear));
    const oppositeDeduped = dedupeRows(oppositeRows);
    const oppositeSliced = intent.wantsRecentOnly ? oppositeDeduped.slice(0, 10) : oppositeDeduped;
    const opposite = summarizeGraded(oppositeSliced);
    if (opposite.graded.length > 0) {
      counterSide = {
        side: oppositeSide,
        gradedRows: opposite.graded.length,
        wins: opposite.wins,
        losses: opposite.losses,
        pushes: opposite.pushes,
        totalUnits: opposite.totalUnits,
        avgRoi: opposite.avgRoi,
      };
    }
  }

  if (filtered.length === 0) warnings.push("No rows matched the interpreted filters.");
  if (filtered.length !== deduped.length) warnings.push(`De-duped ${filtered.length} raw rows into ${deduped.length} betting decisions.`);
  if (graded.length < 10) warnings.push("Sample size is thin; treat this as directional, not a betting edge.");
  if (league === "NFL" && graded.length < 25) warnings.push("NFL historical coverage is currently limited in Ask Goose, so treat NFL answers as coverage diagnostics until more graded rows are loaded.");
  if (graded.some((row) => !oddsLooksSane(row.odds))) warnings.push("Some source odds were suspicious/missing, so normalized units used conservative fallback pricing for those rows.");
  if (counterSide && counterSide.totalUnits > totalUnits) warnings.push(`Opposite side check: ${counterSide.side} performed better in this slice (${counterSide.wins}-${counterSide.losses}-${counterSide.pushes}, ${counterSide.totalUnits.toFixed(2)}u, ${counterSide.avgRoi.toFixed(1)}% ROI).`);

  const subjectBits = [league];
  if (intent.scope && intent.scope !== "full_game") subjectBits.push(intent.scope.replace(/_/g, " "));
  if (intent.mentionedHome) subjectBits.push("home");
  if (intent.mentionedAway) subjectBits.push("away/road");
  if (intent.mentionedFavorite) subjectBits.push("favorites");
  if (intent.mentionedUnderdog) subjectBits.push("underdogs");
  if (intent.marketType) subjectBits.push(intent.marketType);
  if (intent.side === "over" || intent.side === "under") subjectBits.push(intent.side);
  if (intent.requestedLine != null) {
    subjectBits.push(String(intent.requestedLine));
  }
  const subject = intent.matchedTeam || subjectBits.join(" ");
  const winPct = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const summaryText = graded.length > 0
    ? `${subject}: ${wins}-${losses}-${pushes} across ${graded.length} graded betting decisions (${winPct.toFixed(1)}%), ${totalUnits.toFixed(2)} normalized units, ${avgRoi.toFixed(1)}% ROI per 1u risk.`
    : `No proven graded sample found for this ${league} question yet.`;

  return {
    intent,
    summaryText,
    sampleSize: sliced.length,
    rawRows: filtered.length,
    dedupedRows: deduped.length,
    gradedRows: graded.length,
    wins,
    losses,
    pushes,
    totalUnits,
    avgRoi,
    sourceUnits,
    sourceAvgRoi,
    evidenceRows: sliced.slice(0, 12),
    warnings,
    trustNotes,
    counterSide,
  };
}
