import { League } from "@/lib/types";

export const leagueMeta: Record<League, { icon: string; subtitle: string; accent: string }> = {
  NHL: { icon: "🏒", subtitle: "Props, trends, goalies, and skating roles", accent: "from-cyan-500/20 to-blue-500/10" },
  NBA: { icon: "🏀", subtitle: "Pace, usage, assists, threes, and props", accent: "from-orange-500/20 to-red-500/10" },
  NFL: { icon: "🏈", subtitle: "Receiving, rushing, alt lines, game scripts", accent: "from-green-500/20 to-lime-500/10" },
  MLB: { icon: "⚾", subtitle: "Pitchers, hitters, strikeouts, total bases", accent: "from-sky-500/20 to-indigo-500/10" },
  "Serie A": { icon: "🇮🇹", subtitle: "Match props, cards, shots, and outcomes", accent: "from-emerald-500/20 to-green-500/10" },
  EPL: { icon: "🏴", subtitle: "Goals, shots, cards, and match edges", accent: "from-purple-500/20 to-fuchsia-500/10" },
  WNBA: { icon: "🏀", subtitle: "Usage, pace, and player prop trends", accent: "from-pink-500/20 to-rose-500/10" },
  NCAAB: { icon: "🎓", subtitle: "College hoops edges and model signals", accent: "from-blue-500/20 to-slate-500/10" },
  NCAAF: { icon: "🎓", subtitle: "College football props and totals", accent: "from-amber-500/20 to-orange-500/10" },
  AFL: { icon: "🏉", subtitle: "Australian football trends and lines", accent: "from-yellow-500/20 to-amber-500/10" },
};

export const featuredLeagues: League[] = ["NHL", "NBA", "NFL", "MLB", "EPL", "Serie A"];
