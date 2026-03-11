"use client";

function computeWinProb(americanOdds: number): number {
  if (americanOdds < 0) return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return 100 / (americanOdds + 100);
}

function toDecimalOdds(americanOdds: number): string {
  if (americanOdds < 0) return (1 + 100 / Math.abs(americanOdds)).toFixed(2);
  return (1 + americanOdds / 100).toFixed(2);
}

interface Props {
  awayOdds: number | null;
  homeOdds: number | null;
  awayAbbrev: string;
  homeAbbrev: string;
  compact?: boolean;
}

export default function WinProbability({ awayOdds, homeOdds, awayAbbrev, homeAbbrev, compact }: Props) {
  if (awayOdds === null && homeOdds === null) return null;

  const awayProb = awayOdds !== null ? computeWinProb(awayOdds) : null;
  const homeProb = homeOdds !== null ? computeWinProb(homeOdds) : null;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-gray-500">
        <span>{awayProb !== null ? `${Math.round(awayProb * 100)}%` : "—"}</span>
        <span className="text-gray-600">/</span>
        <span>{homeProb !== null ? `${Math.round(homeProb * 100)}%` : "—"}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 text-center">
        <div className="text-xs text-gray-500 mb-0.5">{awayAbbrev}</div>
        <div className="text-sm font-bold text-white">
          {awayProb !== null ? `${Math.round(awayProb * 100)}%` : "—"}
        </div>
        {awayOdds !== null && (
          <div className="text-[10px] text-gray-500">{toDecimalOdds(awayOdds)}x</div>
        )}
      </div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider">Win Prob</div>
      <div className="flex-1 text-center">
        <div className="text-xs text-gray-500 mb-0.5">{homeAbbrev}</div>
        <div className="text-sm font-bold text-white">
          {homeProb !== null ? `${Math.round(homeProb * 100)}%` : "—"}
        </div>
        {homeOdds !== null && (
          <div className="text-[10px] text-gray-500">{toDecimalOdds(homeOdds)}x</div>
        )}
      </div>
    </div>
  );
}

export { computeWinProb, toDecimalOdds };
