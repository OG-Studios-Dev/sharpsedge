import { listPickHistory, updatePickResultsInSupabase } from "../src/lib/pick-history-store";
import { mapPickHistoryRecordToAIPick } from "../src/lib/pick-history-integrity";
import { resolvePick } from "../src/lib/pick-resolver";

async function main() {
  const rows = await listPickHistory(1000);
  const targets = rows.filter((row) => row.date === "2026-04-09" && row.league === "PGA" && row.result === "pending");
  const picks = targets.map(mapPickHistoryRecordToAIPick);
  const resolved = await Promise.all(picks.map(resolvePick));
  const settled = resolved.filter((pick) => pick.result !== "pending");
  if (settled.length) await updatePickResultsInSupabase(settled);
  console.log(JSON.stringify({
    checked: picks.length,
    settled: settled.length,
    results: resolved.map((pick) => ({ pickLabel: pick.pickLabel, result: pick.result, playerName: pick.playerName, opponent: pick.opponent })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
