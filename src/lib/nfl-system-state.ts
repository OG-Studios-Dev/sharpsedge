export type NFLHandleUnavailableState = {
  snapshot: string;
  automationStatusLabel: string;
  automationStatusDetail: string;
};

export type NFLHandleAudit = {
  gamesScanned: number;
  notAvailable: number;
  notUnderdog: number;
  notMajorityHandle: number;
  qualified: number;
};

export function nflHandleActiveState(audit: NFLHandleAudit): NFLHandleUnavailableState {
  const auditNote = `Scanned ${audit.gamesScanned} NFL games. Not available: ${audit.notAvailable}. Not dog: ${audit.notUnderdog}. Below threshold: ${audit.notMajorityHandle}. Qualified: ${audit.qualified}.`;
  return {
    snapshot: audit.qualified > 0
      ? `🟢 ${audit.qualified} NFL Home Dog pick(s) today | ${auditNote}`
      : `🟡 No NFL picks today | ${auditNote}`,
    automationStatusLabel: "Live NFL handle screen",
    automationStatusDetail: `Daily refresh scans the live NFL moneyline and handle board. ${auditNote}`,
  };
}

export function nflHandleUnavailableState(targetDate: string): NFLHandleUnavailableState {
  const month = Number(targetDate.slice(5, 7));
  const isOffseason = Number.isInteger(month) && month >= 3 && month <= 8;

  if (isOffseason) {
    return {
      snapshot: "🔴 OFF-SEASON | NFL regular season resumes in September. No current slate — zero records stored (honest).",
      automationStatusLabel: "Wired — dormant off-season",
      automationStatusDetail: `getBettingSplits(\"NFL\") returned an empty board for ${targetDate}. The system will activate when a live NFL slate exists.`,
    };
  }

  return {
    snapshot: `🟡 No NFL handle data available for ${targetDate} — zero qualifiers stored.`,
    automationStatusLabel: "Wired — awaiting live handle data",
    automationStatusDetail: `getBettingSplits(\"NFL\") returned an empty board for ${targetDate}. The system remains active and will record qualifiers when live splits arrive.`,
  };
}

export default { nflHandleActiveState, nflHandleUnavailableState };
