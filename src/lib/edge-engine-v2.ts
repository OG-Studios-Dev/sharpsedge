import { PlayerProp } from "@/lib/types";

export type RankedProp = PlayerProp & {
  edgeScore: number;
  edgeTier: "A" | "B" | "C";
  dataQuality: "live-odds" | "model-only";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function scorePropEdge(prop: PlayerProp): RankedProp {
  const hitRate = prop.hitRate ?? 0;
  const impliedProb = prop.impliedProb ?? 0;
  const trendEdge = hitRate - impliedProb;
  const modeledEdge = (prop.edgePct ?? 0) * 100;
  const confidence = prop.confidence ?? 0;
  const recentForm = prop.confidenceBreakdown?.recentForm ?? 0;
  const matchup = prop.confidenceBreakdown?.matchup ?? 0;
  const situational = prop.confidenceBreakdown?.situational ?? 0;
  const lineValueBoost = prop.book ? 4 : 0;
  const liveModelBoost = prop.statsSource === "live-nhl" ? 8 : 0;

  const edgeScore = clamp(
    trendEdge * 0.3 + modeledEdge * 0.3 + confidence * 0.15 + recentForm * 0.08 + matchup * 0.07 + situational * 0.05 + lineValueBoost + liveModelBoost,
    0,
    100
  );

  let edgeTier: RankedProp["edgeTier"] = "C";
  if (edgeScore >= 75) edgeTier = "A";
  else if (edgeScore >= 60) edgeTier = "B";

  return {
    ...prop,
    edgeScore: Math.round(edgeScore),
    edgeTier,
    dataQuality: prop.book ? "live-odds" : "model-only",
    summary:
      prop.summary ||
      `${prop.playerName} grades as a ${edgeTier}-tier edge with ${Math.round(modeledEdge || trendEdge)} points of value over implied odds.`,
  };
}

export function rankProps(props: PlayerProp[]): RankedProp[] {
  return props.map(scorePropEdge).sort((a, b) => b.edgeScore - a.edgeScore);
}
