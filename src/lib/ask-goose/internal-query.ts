type AskGooseRow = {
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
  mentionedFavorite: boolean;
  mentionedUnderdog: boolean;
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
    "ducks", "bruins", "sabres", "flames", "hurricanes", "blackhawks", "avalanche", "blue jackets", "stars", "red wings", "oilers", "panthers", "kings", "wild", "canadiens", "predators", "devils", "islanders", "rangers", "senators", "flyers", "penguins", "sharks", "kraken", "blues", "lightning", "maple leafs", "utah", "canucks", "golden knights", "capitals", "jets",
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

export function parseAskGooseIntent(question: string, league: string, rows: AskGooseRow[]): AskGooseIntent {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim().toLowerCase();
  const looksLikeBettingQuestion = /(win rate|roi|units|profit|record|system|trend|cover|favorite|underdog|over|under|moneyline|spread|ats)/.test(normalizedQuestion);
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

  const matchedRowNames = rowTeamMatches.filter((name) => normalizedQuestion.includes(name.toLowerCase()));

  return {
    normalizedQuestion,
    looksLikeBettingQuestion,
    matchedTeam: matchedRowNames[0] ?? matchedTeams[0] ?? null,
    matchedOpponent: matchedRowNames[1] ?? matchedTeams[1] ?? null,
    marketType,
    side: normalizedQuestion.includes("over") ? "over" : normalizedQuestion.includes("under") ? "under" : null,
    wantsRecentOnly: /last\s+(5|10|25)|recent/.test(normalizedQuestion),
    mentionedFavorite: normalizedQuestion.includes("favorite"),
    mentionedUnderdog: normalizedQuestion.includes("underdog") || normalizedQuestion.includes("dog"),
  };
}

export function answerAskGooseQuestion(question: string, league: string, rows: AskGooseRow[]): AskGooseAnswer {
  const intent = parseAskGooseIntent(question, league, rows);
  const warnings: string[] = [];

  let filtered = [...rows];

  if (!intent.looksLikeBettingQuestion) {
    warnings.push("Question does not look like a database-backed betting query.");
  }

  if (intent.matchedTeam) {
    filtered = filtered.filter((row) => {
      const team = row.team_name?.toLowerCase() ?? "";
      const opp = row.opponent_name?.toLowerCase() ?? "";
      const needle = intent.matchedTeam?.toLowerCase() ?? "";
      return team.includes(needle) || opp.includes(needle);
    });
  }

  if (intent.matchedOpponent) {
    filtered = filtered.filter((row) => {
      const team = row.team_name?.toLowerCase() ?? "";
      const opp = row.opponent_name?.toLowerCase() ?? "";
      const needle = intent.matchedOpponent?.toLowerCase() ?? "";
      return team.includes(needle) || opp.includes(needle);
    });
  }

  if (intent.marketType) {
    filtered = filtered.filter((row) => {
      const parts = [row.market_type, row.submarket_type, row.market_family, row.segment_key]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return parts.includes(intent.marketType!.replace("_", " ")) || parts.includes(intent.marketType!);
    });
  }

  if (intent.side) {
    filtered = filtered.filter((row) => (row.side || "").toLowerCase().includes(intent.side!));
  }

  if (intent.mentionedFavorite) {
    filtered = filtered.filter((row) => row.is_favorite === true);
  }

  if (intent.mentionedUnderdog) {
    filtered = filtered.filter((row) => row.is_underdog === true);
  }

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
