/**
 * scripts/backgrade-mlb.mjs
 *
 * Back-grades all pending MLB picks in goose_model_picks that were stuck due to
 * betType mismatches in resolveMLBTeamPick (fixed in pick-resolver.ts).
 *
 * Root causes fixed:
 *   1. "H2H ML" betType (inferred from "win ml" labels) not in MLB win-ML check
 *   2. "Spread" betType (inferred from run-line labels like "STL -1.5 Run Line") not handled
 *   3. "Team Points O/U" betType (inferred from over/under labels) not handled
 *   4. Schedule API has no team abbreviation → isAway wrong for road picks; now uses boxscore
 *
 * Run: node scripts/backgrade-mlb.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load env ──────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing SUPABASE credentials");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────

function supaHeaders() {
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
  };
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function supaGet(path) {
  const res = await fetch(`${SUPA_URL}${path}`, { headers: supaHeaders() });
  if (!res.ok) throw new Error(`Supabase GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supaPatch(path, body) {
  const res = await fetch(`${SUPA_URL}${path}`, {
    method: "PATCH",
    headers: { ...supaHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`);
}

function normalizeMLBTeam(val) {
  const n = (val || "").trim().toUpperCase();
  return n === "ATH" ? "OAK" : n;
}

function normalizeGameId(val) {
  const n = String(val ?? "").trim();
  if (!n || n === "undefined" || n === "null") return undefined;
  return n;
}

function toNumber(val) {
  const p = Number(val);
  return Number.isFinite(p) ? p : 0;
}

function parseMLBLine(val) {
  if (typeof val !== "number" || !Number.isFinite(val)) return undefined;
  return val;
}

function parseTeamSpreadLine(pick) {
  const betType = String(pick.betType || "").toLowerCase();
  const label = String(pick.pickLabel || "");
  const isSpread =
    betType.includes("spread") ||
    betType.includes("run line") ||
    (betType.includes("line") && !betType.includes("total")) ||
    /\b[+-]\d+(?:\.\d+)?\b/.test(label);
  if (!isSpread) return undefined;
  if (typeof pick.line === "number" && Number.isFinite(pick.line)) return pick.line;
  const match = label.match(/([+-]\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeIncomingBetType(pick) {
  // DB records use snake_case: pick_label, not pickLabel
  const label = pick.pick_label || pick.pickLabel || "";
  const lower = label.toLowerCase();
  // If explicit betType in DB, use it
  const explicit = pick.bet_type || pick.betType;
  if (explicit) return explicit;
  if (lower.includes("win ml") || /\bh2h\b/.test(lower)) return "H2H ML";
  // "run line" text detection is more reliable than the /\b[+-]/ regex
  // (the regex fails because '-' before a digit has no word boundary)
  if (lower.includes("run line")) return "Run Line";
  if (lower.includes("spread") || /(?:^|\s)[+-]\d+(?:\.\d+)?(?:\s|$)/.test(label)) return "Spread";
  if (lower.includes("over") || lower.includes("under")) return "Team Points O/U";
  return undefined;
}

// ── MLB resolver ──────────────────────────────────────────────

async function resolveMLBTeamPick(pick) {
  const gameId = normalizeGameId(pick.game_id);
  if (!gameId) return { result: "pending", reason: "missing_game_id" };

  // Fetch schedule to check if game is final + get scores
  const schedule = await fetchJSON(`${MLB_BASE}/schedule?date=${pick.date}&sportId=1&hydrate=linescore`);
  const game = (schedule?.dates ?? [])
    .flatMap((d) => d?.games ?? [])
    .find((g) => String(g?.gamePk ?? "") === gameId) || null;

  if (!game) return { result: "pending", reason: `game_not_found_in_schedule_date_${pick.date}` };

  const abstractState = String(game?.status?.abstractGameState ?? "").toUpperCase();
  const codedState = String(game?.status?.codedGameState ?? "").toUpperCase();
  const isComplete = abstractState === "FINAL" || ["F", "O"].includes(codedState);
  if (!isComplete) return { result: "pending", reason: `game_not_final:${abstractState}` };

  // Fetch boxscore for team abbreviations (schedule API lacks abbreviation field)
  const boxscore = await fetchJSON(`${MLB_BASE}/game/${gameId}/boxscore`);
  const homeAbbrev = normalizeMLBTeam(
    boxscore?.teams?.home?.team?.abbreviation || game?.teams?.home?.team?.abbreviation
  );
  const awayAbbrev = normalizeMLBTeam(
    boxscore?.teams?.away?.team?.abbreviation || game?.teams?.away?.team?.abbreviation
  );
  const targetTeam = normalizeMLBTeam(pick.team);
  const isAway = targetTeam === awayAbbrev ? true : targetTeam === homeAbbrev ? false : false;
  const homeScore = toNumber(game?.teams?.home?.score);
  const awayScore = toNumber(game?.teams?.away?.score);
  const teamScore = isAway ? awayScore : homeScore;
  const oppScore = isAway ? homeScore : awayScore;
  const margin = teamScore - oppScore;

  const betType = normalizeIncomingBetType(pick);

  // Run Line: "Run Line" explicit, "Spread" fallback, or label contains "run line"
  const isRunLineBet = betType === "Run Line" || betType === "Spread"
    || (pick.pick_label || "").toLowerCase().includes("run line");
  if (isRunLineBet) {
    const label = pick.pick_label || pick.pickLabel || "";
    const lineFromLabel = parseTeamSpreadLine({ betType, pickLabel: label, line: pick.line });
    const line = parseMLBLine(pick.line) ?? lineFromLabel;
    if (line == null) return { result: "pending", reason: "run_line_missing_line" };
    const adjusted = margin + line;
    if (adjusted > 0) return { result: "win", meta: { teamScore, oppScore, line, adjusted, isAway, homeAbbrev, awayAbbrev } };
    if (adjusted < 0) return { result: "loss", meta: { teamScore, oppScore, line, adjusted, isAway, homeAbbrev, awayAbbrev } };
    return { result: "push", meta: { teamScore, oppScore, line, adjusted, isAway } };
  }

  // Total Runs O/U (also "Team Points O/U")
  if (betType === "Total Runs O/U" || betType === "Team Points O/U") {
    const pickLabel = pick.pick_label || pick.pickLabel || "";
    let line = parseMLBLine(pick.line);
    if (line == null) {
      const labelMatch = pickLabel.match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);
      if (labelMatch) line = parseFloat(labelMatch[1]);
    }
    if (line == null) return { result: "pending", reason: "total_missing_line" };
    const totalRuns = homeScore + awayScore;
    const side = pickLabel.toLowerCase().includes("under") ? "Under" : "Over";
    const meta = { totalRuns, line, side, homeScore, awayScore };
    if (side === "Under") {
      if (totalRuns < line) return { result: "win", meta };
      if (totalRuns > line) return { result: "loss", meta };
      return { result: "push", meta };
    }
    if (totalRuns > line) return { result: "win", meta };
    if (totalRuns < line) return { result: "loss", meta };
    return { result: "push", meta };
  }

  // Win ML (includes "H2H ML" which normalizeIncomingPick uses for "win ml" labels)
  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak", "H2H ML"].includes(betType || "")) {
    const meta = { teamScore, oppScore, isAway, homeAbbrev, awayAbbrev, margin };
    if (teamScore > oppScore) return { result: "win", meta };
    if (teamScore < oppScore) return { result: "loss", meta };
    return { result: "push", meta };
  }

  return { result: "pending", reason: `unhandled_bet_type:${betType}` };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== MLB Backgrade Script${DRY_RUN ? " [DRY RUN]" : ""} ===\n`);

  // Fetch all pending MLB picks with no integrity_status
  const rows = await supaGet(
    "/rest/v1/goose_model_picks?sport=eq.MLB&result=eq.pending&integrity_status=is.null&select=*&order=date.asc&limit=500"
  );
  console.log(`Found ${rows.length} pending MLB picks\n`);

  const summary = { graded: 0, win: 0, loss: 0, push: 0, still_pending: 0, errors: 0 };
  const details = [];

  for (const pick of rows) {
    try {
      const { result, reason, meta } = await resolveMLBTeamPick(pick);
      const settled = result !== "pending";
      const line = `[${pick.date}] ${pick.pick_label} (gid=${pick.game_id}) → ${result}${reason ? ` (${reason})` : ""}${meta ? ` score=${JSON.stringify(meta)}` : ""}`;
      console.log(line);
      details.push({ id: pick.id, date: pick.date, pick_label: pick.pick_label, game_id: pick.game_id, result, reason, meta });

      if (settled) {
        summary.graded++;
        summary[result]++;
        if (!DRY_RUN) {
          await supaPatch(`/rest/v1/goose_model_picks?id=eq.${encodeURIComponent(pick.id)}`, {
            result,
            integrity_status: "ok",
            actual_result: meta
              ? `${meta.teamScore ?? meta.totalRuns ?? "?"}–${meta.oppScore ?? "?"} (${result})`
              : result,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        summary.still_pending++;
      }
    } catch (err) {
      summary.errors++;
      console.error(`ERROR for pick ${pick.id} (${pick.pick_label}):`, err.message);
      details.push({ id: pick.id, date: pick.date, pick_label: pick.pick_label, game_id: pick.game_id, result: "error", error: err.message });
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total picks: ${rows.length}`);
  console.log(`Graded: ${summary.graded} (${summary.win}W / ${summary.loss}L / ${summary.push}P)`);
  console.log(`Still pending: ${summary.still_pending} (games not final yet)`);
  console.log(`Errors: ${summary.errors}`);
  if (DRY_RUN) console.log("\n[DRY RUN — no DB writes]");

  return summary;
}

main().then((s) => {
  process.exit(s.errors > 0 ? 1 : 0);
}).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
