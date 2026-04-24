export type AskGooseRow = {
  candidate_id: string;
  league: string;
  event_date: string;
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
  profit_units: number | null;
  profit_dollars_10: number | null;
  roi_on_10_flat: number | null;
  segment_key: string | null;
  is_home_team_bet: boolean | null;
  is_away_team_bet: boolean | null;
  is_favorite: boolean | null;
  is_underdog: boolean | null;
};

export type AskGooseIntent = {
  normalizedQuestion: string;
  looksLikeBettingQuestion: boolean;
  matchedTeam: string | null;
  matchedOpponent: string | null;
  marketType: string | null;
  side: string | null;
  wantsRecentOnly: boolean;
  wantsBroaderSample: boolean;
  mentionedFavorite: boolean;
  mentionedUnderdog: boolean;
  wantsTeamMarketFocus: boolean;
  wantsHeadToHead: boolean;
};

export type AskGooseAnswer = {
  intent: AskGooseIntent;
  summaryText: string;
  sampleSize: number;
  gradedRows: number;
  wins: number;
  losses: number;
  pushes: number;
  totalUnits: number;
  avgRoi: number;
  evidenceRows: AskGooseRow[];
  warnings: string[];
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

const MARKET_KEYWORDS: Array<{ match: RegExp; value: string }> = [
  { match: /\bmoneyline\b|\bml\b/, value: "moneyline" },
  { match: /\bspread\b|\bats\b|\bcover\b/, value: "spread" },
  { match: /\btotal\b|\bover\b|\bunder\b/, value: "total" },
  { match: /\bp1\b|\bperiod 1\b|\bfirst period\b/, value: "period_1" },
  { match: /\bq1\b|\bfirst quarter\b/, value: "quarter_1" },
  { match: /\b1h\b|\bfirst half\b/, value: "first_half" },
];

function normalizeName(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowMatchesNeedle(value: string | null | undefined, needle: string | null | undefined) {
  const hay = normalizeName(value);
  const target = normalizeName(needle);
  if (!hay || !target) return false;
  return hay === target || hay.includes(target) || target.includes(hay);
}

export function parseAskGooseIntent(question: string, league: string, rows: AskGooseRow[]): AskGooseIntent {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim().toLowerCase();
  const looksLikeBettingQuestion = /(win rate|roi|units|profit|record|system|trend|cover|favorite|underdog|over|under|moneyline|spread|ats|perform|performance|lately|recent|against|head to head|total)/.test(normalizedQuestion);
  const candidates = TEAM_ALIASES[league] ?? [];
  const matchedTeams = candidates.filter((team) => normalizedQuestion.includes(team));

  let marketType: string | null = null;
  for (const keyword of MARKET_KEYWORDS) {
    if (keyword.match.test(normalizedQuestion)) {
      marketType = keyword.value;
      break;
    }
  }

  const rowTeamMatches = rows
    .flatMap((row) => [row.team_name, row.opponent_name])
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);

  const matchedRowNames = rowTeamMatches.filter((name) => {
    const normalizedName = normalizeName(name);
    return normalizedQuestion.includes(normalizedName) || matchedTeams.some((team) => normalizedName.includes(normalizeName(team)) || normalizeName(team).includes(normalizedName));
  });

  const matchedTeam = matchedRowNames[0] ?? matchedTeams[0] ?? null;
  const matchedOpponent = matchedRowNames[1] ?? matchedTeams[1] ?? null;
  const wantsHeadToHead = /\bvs\b|against|head to head/.test(normalizedQuestion) || Boolean(matchedTeam && matchedOpponent);
  if (marketType === "total" && (normalizedQuestion.includes("underdog") || normalizedQuestion.includes("dog") || normalizedQuestion.includes("favorite"))) {
    marketType = null;
  }
  const wantsTeamMarketFocus = Boolean(matchedTeam) && (marketType === "moneyline" || marketType === "spread" || marketType === "total" || wantsHeadToHead || normalizedQuestion.includes("underdog") || normalizedQuestion.includes("dog") || normalizedQuestion.includes("favorite"));

  return {
    normalizedQuestion,
    looksLikeBettingQuestion,
    matchedTeam,
    matchedOpponent,
    marketType,
    side: /\bover\b/.test(normalizedQuestion)
      ? "over"
      : /\bunder\b/.test(normalizedQuestion) && !/\bunderdog(s)?\b/.test(normalizedQuestion)
        ? "under"
        : null,
    wantsRecentOnly: /last\s+(5|10|25)|recent/.test(normalizedQuestion),
    wantsBroaderSample: /lately|recent|performance|perform|record|trend|how have/.test(normalizedQuestion) || matchedTeams.length > 0 || matchedRowNames.length > 0,
    mentionedFavorite: normalizedQuestion.includes("favorite"),
    mentionedUnderdog: normalizedQuestion.includes("underdog") || normalizedQuestion.includes("dog"),
    wantsTeamMarketFocus,
    wantsHeadToHead,
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
  const submarket = (row.submarket_type || "").toLowerCase().trim();
  const scope = (row.market_scope || "").toLowerCase().trim();
  if (isLikelyPlayerProp(row)) return false;
  if (!submarket) return true;
  if (scope === "game" && !/(period|quarter|half|inning)/.test(submarket)) return true;
  return submarket === "spread" || submarket === "moneyline" || submarket === "total";
}

export function answerAskGooseQuestion(question: string, league: string, rows: AskGooseRow[]): AskGooseAnswer {
  const intent = parseAskGooseIntent(question, league, rows);
  const warnings: string[] = [];

  let filtered = [...rows];

  if (!intent.looksLikeBettingQuestion) {
    warnings.push("Question does not look like a database-backed betting query.");
  }

  if (intent.matchedTeam) {
    filtered = filtered.filter((row) => rowMatchesNeedle(row.team_name, intent.matchedTeam) || rowMatchesNeedle(row.opponent_name, intent.matchedTeam));
  }

  if (intent.matchedOpponent) {
    filtered = filtered.filter((row) => rowMatchesNeedle(row.team_name, intent.matchedOpponent) || rowMatchesNeedle(row.opponent_name, intent.matchedOpponent));
  }

  if (intent.marketType) {
    filtered = filtered.filter((row) => {
      const parts = [row.market_type, row.submarket_type, row.market_family, row.segment_key]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const marketNeedle = intent.marketType!;
      const marketMatch = parts.includes(marketNeedle.replace("_", " "))
        || parts.includes(marketNeedle)
        || (marketNeedle === "moneyline" && parts.includes("h2h"));
      if (!marketMatch) return false;
      if (!intent.wantsTeamMarketFocus) return true;
      if (marketNeedle === "total") {
        return row.market_type === "total" && (row.submarket_type == null || row.submarket_type.trim() === "");
      }
      return row.market_type === marketNeedle || (marketNeedle === "moneyline" && row.market_family === "moneyline");
    });
  }

  if (intent.side) {
    filtered = filtered.filter((row) => (row.side || "").toLowerCase().includes(intent.side!));
  }

  if (intent.wantsTeamMarketFocus) {
    filtered = filtered.filter((row) => isGameLevelTeamMarketRow(row));
  }

  if (intent.mentionedFavorite) {
    filtered = filtered.filter((row) => row.is_favorite === true);
  }

  if (intent.mentionedUnderdog) {
    filtered = filtered.filter((row) => row.is_underdog === true);
  }

  filtered.sort((a, b) => {
    const score = (row: AskGooseRow) => {
      let value = 0;
      if (row.graded === true) value += 100;
      if (intent.marketType && row.market_type === intent.marketType) value += 50;
      if (intent.matchedTeam) {
        if (rowMatchesNeedle(row.team_name, intent.matchedTeam)) value += 40;
        else if (rowMatchesNeedle(row.opponent_name, intent.matchedTeam)) value += 20;
      }
      if (intent.matchedOpponent) {
        if (rowMatchesNeedle(row.opponent_name, intent.matchedOpponent)) value += 30;
        else if (rowMatchesNeedle(row.team_name, intent.matchedOpponent)) value += 10;
      }
      if (intent.wantsHeadToHead && intent.matchedTeam && intent.matchedOpponent) {
        const teamMatchesPrimary = rowMatchesNeedle(row.team_name, intent.matchedTeam) && rowMatchesNeedle(row.opponent_name, intent.matchedOpponent);
        const teamMatchesReverse = rowMatchesNeedle(row.team_name, intent.matchedOpponent) && rowMatchesNeedle(row.opponent_name, intent.matchedTeam);
        if (teamMatchesPrimary || teamMatchesReverse) value += 60;
      }
      return value;
    };
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    return String(b.event_date || "").localeCompare(String(a.event_date || ""));
  });

  if (intent.wantsRecentOnly) {
    filtered = filtered.slice(0, 10);
  }

  const graded = filtered.filter((row) => row.graded === true);
  const wins = graded.filter((row) => String(row.result || "").toLowerCase() === "win").length;
  const losses = graded.filter((row) => String(row.result || "").toLowerCase() === "loss").length;
  const pushes = graded.filter((row) => {
    const result = String(row.result || "").toLowerCase();
    return result === "push" || result === "dq";
  }).length;
  const totalUnits = graded.reduce((sum, row) => sum + Number(row.profit_units || 0), 0);
  const avgRoi = graded.length
    ? graded.reduce((sum, row) => sum + Number(row.roi_on_10_flat || 0), 0) / graded.length
    : 0;

  if (filtered.length === 0) {
    warnings.push("No rows matched the interpreted filters.");
  }

  if (graded.length < 5) {
    warnings.push("Sample size is thin, do not overtrust this slice yet.");
  }

  const subject = intent.matchedTeam || league;
  const summaryText = graded.length > 0
    ? `${subject}: ${wins}-${losses}-${pushes} across ${graded.length} graded rows, ${totalUnits.toFixed(2)} units, ${avgRoi.toFixed(2)}% avg ROI.`
    : `No proven graded sample found for this ${league} question yet.`;

  return {
    intent,
    summaryText,
    sampleSize: filtered.length,
    gradedRows: graded.length,
    wins,
    losses,
    pushes,
    totalUnits,
    avgRoi,
    evidenceRows: filtered.slice(0, 12),
    warnings,
  };
}
