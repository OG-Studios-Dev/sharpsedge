"use client";

import { useState } from "react";
import { PlayerProp } from "@/lib/types";
import { savePickLocal } from "@/lib/client-picks";

export default function SavePickButton({ prop }: { prop: PlayerProp }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "local" | "error">("idle");

  async function onSave() {
    try {
      setStatus("saving");
      const res = await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: prop.league === "NBA" ? "NBA" : "NHL",
          gameId: prop.gameId || prop.id,
          matchup: prop.matchup,
          playerName: prop.playerName,
          team: prop.team,
          opponent: prop.opponent,
          propType: prop.propType,
          line: prop.line,
          overUnder: prop.overUnder,
          odds: prop.odds,
          book: prop.book,
          hitRate: prop.hitRate ?? prop.fairProbability,
          edge: prop.edge ?? prop.edgePct,
          recommendation: prop.recommendation,
          confidence: prop.confidence,
          reasoning: prop.reasoning,
        }),
      });

      if (!res.ok) throw new Error("save failed");
      setStatus("saved");
    } catch {
      try {
        savePickLocal(prop);
        setStatus("local");
      } catch {
        setStatus("error");
      }
    }
  }

  return (
    <button
      onClick={onSave}
      disabled={status === "saving" || status === "saved" || status === "local"}
      className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold border transition-colors ${
        status === "saved"
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : status === "local"
            ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
            : status === "error"
              ? "bg-red-500/10 text-red-300 border-red-500/30"
              : "bg-dark-surface text-white border-dark-border hover:border-gray-500"
      }`}
    >
      {status === "idle" && "Save Pick"}
      {status === "saving" && "Saving..."}
      {status === "saved" && "Saved"}
      {status === "local" && "Saved on this device"}
      {status === "error" && "Retry Save"}
    </button>
  );
}
