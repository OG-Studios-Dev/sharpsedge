import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AIPick } from "@/lib/types";

const PRIMARY_PICK_HISTORY_FILE = path.join(process.cwd(), "data", "pick-history.json");
const EPHEMERAL_PICK_HISTORY_FILE = path.join("/tmp", "goosalytics", "pick-history.json");

function getPickHistoryFilePath() {
  return process.env.VERCEL ? EPHEMERAL_PICK_HISTORY_FILE : PRIMARY_PICK_HISTORY_FILE;
}

async function ensureFileExists(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code !== "ENOENT") {
      throw error;
    }

    let initialContents = "[]\n";

    if (filePath === EPHEMERAL_PICK_HISTORY_FILE) {
      try {
        initialContents = await readFile(PRIMARY_PICK_HISTORY_FILE, "utf8");
      } catch {
        initialContents = "[]\n";
      }
    }

    await writeFile(filePath, initialContents, "utf8");
  }
}

function normalizePick(pick: AIPick): AIPick {
  const result = pick.result === "win" || pick.result === "loss" || pick.result === "push" || pick.result === "pending"
    ? pick.result
    : "pending";

  return {
    ...pick,
    league: typeof pick.league === "string" && pick.league ? pick.league : "NHL",
    result,
    units: 1,
  };
}

function getPickKey(pick: AIPick) {
  return [
    pick.date,
    pick.league ?? "NHL",
    pick.id,
    pick.gameId ?? "",
    pick.type,
    pick.playerName ?? "",
    pick.team,
    pick.pickLabel,
  ].join("::");
}

function sortPicks(picks: AIPick[]) {
  return [...picks].sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    if (dateOrder !== 0) {
      return dateOrder;
    }

    const leagueOrder = (a.league ?? "").localeCompare(b.league ?? "");
    if (leagueOrder !== 0) {
      return leagueOrder;
    }

    return a.pickLabel.localeCompare(b.pickLabel);
  });
}

export async function readPickHistory(): Promise<AIPick[]> {
  const filePath = getPickHistoryFilePath();
  await ensureFileExists(filePath);

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("The pick history file is not a valid pick array.");
  }

  return sortPicks(parsed.map((pick) => normalizePick(pick as AIPick)));
}

async function writePickHistory(picks: AIPick[]) {
  const filePath = getPickHistoryFilePath();
  await ensureFileExists(filePath);
  await writeFile(filePath, `${JSON.stringify(sortPicks(picks), null, 2)}\n`, "utf8");
}

export async function upsertPickHistory(picks: AIPick[]) {
  if (!picks.length) {
    return;
  }

  const existing = await readPickHistory();
  const pickMap = new Map(existing.map((pick) => [getPickKey(pick), pick]));

  for (const nextPick of picks.map(normalizePick)) {
    const key = getPickKey(nextPick);
    const currentPick = pickMap.get(key);

    if (!currentPick) {
      pickMap.set(key, nextPick);
      continue;
    }

    pickMap.set(key, {
      ...currentPick,
      ...nextPick,
      result: currentPick.result !== "pending" && nextPick.result === "pending" ? currentPick.result : nextPick.result,
    });
  }

  await writePickHistory(Array.from(pickMap.values()));
}

export async function updatePickHistoryResults(picks: AIPick[]) {
  if (!picks.length) {
    return;
  }

  const existing = await readPickHistory();
  const pickMap = new Map(existing.map((pick) => [getPickKey(pick), pick]));
  let changed = false;

  for (const nextPick of picks.map(normalizePick)) {
    const key = getPickKey(nextPick);
    const currentPick = pickMap.get(key);

    if (!currentPick) {
      continue;
    }

    if (currentPick.result !== nextPick.result) {
      changed = true;
    }

    pickMap.set(key, {
      ...currentPick,
      ...nextPick,
    });
  }

  if (changed) {
    await writePickHistory(Array.from(pickMap.values()));
  }
}
