import { promises as fs } from "fs";
import path from "path";

export type SavedPick = {
  id: string;
  createdAt: string;
  sport: "NHL";
  gameId?: string;
  matchup?: string;
  playerName: string;
  team: string;
  opponent: string;
  propType: string;
  line: number;
  overUnder: "Over" | "Under";
  odds: number;
  recommendation: string;
  confidence: number | null;
  reasoning: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const PICKS_PATH = path.join(DATA_DIR, "saved-picks.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PICKS_PATH);
  } catch {
    await fs.writeFile(PICKS_PATH, "[]\n", "utf8");
  }
}

export async function readPicks(): Promise<SavedPick[]> {
  await ensureStore();
  const raw = await fs.readFile(PICKS_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePick(pick: Omit<SavedPick, "id" | "createdAt">): Promise<SavedPick> {
  const picks = await readPicks();
  const saved: SavedPick = {
    ...pick,
    id: `pick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  picks.unshift(saved);
  await fs.writeFile(PICKS_PATH, JSON.stringify(picks, null, 2) + "\n", "utf8");
  return saved;
}
