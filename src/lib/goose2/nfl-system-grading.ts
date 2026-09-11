export type NFLSystemFinalResult = {
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number;
  awayScore: number;
  gameDate: string;
};

function finiteScore(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractFinalNFLScoreboardResults(scoreboard: any): NFLSystemFinalResult[] {
  const results: NFLSystemFinalResult[] = [];

  for (const event of scoreboard?.events ?? []) {
    const completed = event?.status?.type?.completed === true
      || String(event?.status?.type?.name ?? "").toUpperCase() === "STATUS_FINAL";
    if (!completed) continue;

    const competition = event?.competitions?.[0];
    const home = competition?.competitors?.find((row: any) => row?.homeAway === "home");
    const away = competition?.competitors?.find((row: any) => row?.homeAway === "away");
    const homeScore = finiteScore(home?.score);
    const awayScore = finiteScore(away?.score);
    const homeAbbrev = String(home?.team?.abbreviation ?? "").trim().toUpperCase();
    const awayAbbrev = String(away?.team?.abbreviation ?? "").trim().toUpperCase();
    const gameDate = String(event?.date ?? "").slice(0, 10);

    if (!homeAbbrev || !awayAbbrev || !gameDate || homeScore == null || awayScore == null) continue;
    results.push({ homeAbbrev, awayAbbrev, homeScore, awayScore, gameDate });
  }

  return results;
}

export default { extractFinalNFLScoreboardResults };
