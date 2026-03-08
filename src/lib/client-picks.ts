import { SavedPick } from "@/lib/picks-store";
import { PlayerProp } from "@/lib/types";

const KEY = "goosalytics_saved_picks";

function readLocal(): SavedPick[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(picks: SavedPick[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(picks));
}

export function savePickLocal(prop: PlayerProp): SavedPick {
  const picks = readLocal();
  const saved: SavedPick = {
    id: `local_${Date.now()}`,
    createdAt: new Date().toISOString(),
    sport: "NHL",
    gameId: prop.id,
    matchup: prop.matchup,
    playerName: prop.playerName,
    team: prop.team,
    opponent: prop.opponent,
    propType: prop.propType,
    line: prop.line,
    overUnder: prop.overUnder,
    odds: prop.odds,
    recommendation: prop.recommendation || `${prop.overUnder} ${prop.line} ${prop.propType}`,
    confidence: prop.confidence ?? null,
    reasoning: prop.reasoning || "",
  };
  picks.unshift(saved);
  writeLocal(picks);
  return saved;
}
