"use client";

import { Bet } from "@/lib/data/types";

export default function BankrollChart({ bets }: { bets: Bet[] }) {
  // Build bankroll over time from resolved bets
  const resolved = bets
    .filter((b) => b.status !== "pending")
    .sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());

  if (resolved.length < 2) {
    return <div className="text-center py-8 text-slate-500 text-sm">Not enough data for chart</div>;
  }

  const points: { x: number; y: number; date: string }[] = [{ x: 0, y: 10000, date: "Start" }];
  let balance = 10000;
  resolved.forEach((bet, i) => {
    balance -= bet.amount;
    if (bet.status === "won") balance += bet.potentialPayout;
    points.push({
      x: i + 1,
      y: Math.round(balance * 100) / 100,
      date: new Date(bet.placedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  });

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minY = Math.min(...points.map((p) => p.y)) * 0.98;
  const maxY = Math.max(...points.map((p) => p.y)) * 1.02;
  const maxX = points.length - 1;

  const scaleX = (v: number) => padding.left + (v / maxX) * chartW;
  const scaleY = (v: number) => padding.top + chartH - ((v - minY) / (maxY - minY)) * chartH;

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.x)} ${scaleY(p.y)}`).join(" ");
  const areaD = `${pathD} L ${scaleX(maxX)} ${scaleY(minY)} L ${scaleX(0)} ${scaleY(minY)} Z`;

  const lastPoint = points[points.length - 1];
  const isProfit = lastPoint.y >= 10000;

  const yTicks = 5;
  const yStep = (maxY - minY) / yTicks;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const y = minY + yStep * i;
        return (
          <g key={i}>
            <line
              x1={padding.left} y1={scaleY(y)}
              x2={width - padding.right} y2={scaleY(y)}
              stroke="#334155" strokeWidth={0.5} strokeDasharray="4,4"
            />
            <text
              x={padding.left - 8} y={scaleY(y) + 4}
              textAnchor="end" fill="#64748B" fontSize={10}
            >
              ${Math.round(y / 100) / 10}k
            </text>
          </g>
        );
      })}

      {/* $10k reference line */}
      <line
        x1={padding.left} y1={scaleY(10000)}
        x2={width - padding.right} y2={scaleY(10000)}
        stroke="#F59E0B" strokeWidth={0.5} strokeDasharray="6,3" opacity={0.4}
      />

      {/* Area fill */}
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isProfit ? "#10B981" : "#EF4444"} stopOpacity={0.2} />
          <stop offset="100%" stopColor={isProfit ? "#10B981" : "#EF4444"} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#areaGrad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke={isProfit ? "#10B981" : "#EF4444"} strokeWidth={2} />

      {/* Points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={scaleX(p.x)} cy={scaleY(p.y)}
          r={i === points.length - 1 ? 4 : 2}
          fill={isProfit ? "#10B981" : "#EF4444"}
          stroke="#0F172A" strokeWidth={1}
        />
      ))}

      {/* End label */}
      <text
        x={scaleX(lastPoint.x)} y={scaleY(lastPoint.y) - 10}
        textAnchor="middle" fill={isProfit ? "#10B981" : "#EF4444"}
        fontSize={11} fontWeight="bold"
      >
        ${lastPoint.y.toLocaleString()}
      </text>

      {/* X-axis labels */}
      {points.filter((_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)).map((p) => (
        <text
          key={p.x}
          x={scaleX(p.x)} y={height - 5}
          textAnchor="middle" fill="#64748B" fontSize={10}
        >
          {p.date}
        </text>
      ))}
    </svg>
  );
}
