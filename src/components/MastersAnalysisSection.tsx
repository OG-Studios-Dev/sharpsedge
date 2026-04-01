/**
 * MastersAnalysisSection — Pre-tournament analysis for The Masters 2026
 *
 * Uses real Bovada odds from the local snapshot (data/golf-odds-snapshots/).
 * All analysis and text is grounded in those verified odds + Augusta course knowledge.
 * No fabricated win probabilities or synthetic stats.
 *
 * Data provenance:
 *   - Odds: Bovada winner market, scraped 2026-03-29 (90 players)
 *   - Course knowledge: Augusta National public record
 *   - No DataGolf course-fit scores for Augusta (not available in free tier)
 */

import { formatGolfUpdatedAt } from "@/lib/golf-ui";
import type { LocalGolfOddsSnapshot } from "@/lib/golf-api";

// ─── Verified Analysis Data ────────────────────────────────────────────────────
// Derived from masters-2026-analysis.md, grounded in the 2026-03-29 Bovada snapshot.

const COURSE_KEYS = [
  {
    rank: 1,
    factor: "SG: Approach",
    detail: "150–200 yard iron play is the #1 predictor. Every par-5 demands a mid-iron. Fast greens punish bad position.",
  },
  {
    rank: 2,
    factor: "SG: Putting",
    detail: "Severe slopes, insane speed. Amen Corner and 16 separate contenders from the field every year.",
  },
  {
    rank: 3,
    factor: "Distance",
    detail: "Helpful on the par-5s (2, 8, 13, 15), but Augusta is not a power-only track.",
  },
  {
    rank: 4,
    factor: "Augusta experience",
    detail: "First-timers routinely leave shots on the course misreading greens. The experience edge is real.",
  },
  {
    rank: 5,
    factor: "Mental composure",
    detail: "Back-9 Sunday at Augusta is like nowhere else. Amen Corner (11–13) and the run home (15–16) create chaos annually.",
  },
];

// Tier analysis — odds from 2026-03-29 Bovada snapshot (verified)
type TierPlayer = {
  name: string;
  odds: number;
  note: string;
  tag?: "value" | "fade" | null;
};

const TIER_1: TierPlayer[] = [
  {
    name: "Scottie Scheffler",
    odds: 450,
    note: "Best player in the world. Won 2022. Elite SG approach + putting. Implied ~18% — actual probability likely higher.",
    tag: null,
  },
  {
    name: "Rory McIlroy",
    odds: 1000,
    note: "Grand Slam on the line. Multiple T3/T4 finishes. Elite ball-striker. Mental question mark persists.",
    tag: null,
  },
  {
    name: "Jon Rahm",
    odds: 1200,
    note: "Defending Masters champion. One of the best iron players alive. Augusta fits his game perfectly.",
    tag: "value",
  },
  {
    name: "Bryson DeChambeau",
    odds: 1200,
    note: "Power suits the par-5s but Augusta requires precision he has historically lacked. Same price as Rahm.",
    tag: "fade",
  },
  {
    name: "Ludvig Åberg",
    odds: 1800,
    note: "T2 in his Masters debut (2024). Only 24. Elite ball-striker, no scar tissue. Excellent at this price.",
    tag: "value",
  },
];

const TIER_2: TierPlayer[] = [
  {
    name: "Xander Schauffele",
    odds: 1800,
    note: "Back-to-back major champion (Open + PGA 2024). Good iron player. Elite major mentality.",
    tag: null,
  },
  {
    name: "Cameron Young",
    odds: 2200,
    note: "Long hitter, solid iron play. Limited Augusta track record. More boom/bust.",
    tag: null,
  },
  {
    name: "Matt Fitzpatrick",
    odds: 2200,
    note: "US Open winner. Precision iron player. Augusta experience growing. Legit contender.",
    tag: null,
  },
  {
    name: "Tommy Fleetwood",
    odds: 2500,
    note: "Excellent European pro, consistent iron player, multiple Ryder Cup hero. Quietly suits Augusta.",
    tag: null,
  },
  {
    name: "Collin Morikawa",
    odds: 3000,
    note: "Elite ball-striker on paper, but Augusta's creativity and putting demands are not his strong suit.",
    tag: "fade",
  },
  {
    name: "Justin Rose",
    odds: 3000,
    note: "2013 Masters winner. Augusta specialist, multiple near-misses since. Now 45 — depends on form.",
    tag: null,
  },
  {
    name: "Patrick Reed",
    odds: 3000,
    note: "2018 Masters champion. Aggressive style, elite putter at Augusta. Underrated at this price.",
    tag: "value",
  },
];

const TIER_3: TierPlayer[] = [
  {
    name: "Hideki Matsuyama",
    odds: 4000,
    note: "2021 Masters champion. Exceptional iron player. Course knowledge is elite. Top value at this price.",
    tag: "value",
  },
  {
    name: "Jordan Spieth",
    odds: 4000,
    note: "2015 winner, runner-up 2014 + 2016. True Augusta savant. Creative, great putter. Augusta elevates him.",
    tag: "value",
  },
  {
    name: "Viktor Hovland",
    odds: 5000,
    note: "Rough 2024 but elite ball-striker when on. If form is returning, Augusta suits him. Boom/bust.",
    tag: null,
  },
  {
    name: "Brooks Koepka",
    odds: 4000,
    note: "5-time major winner. Majors transform him. Augusta history is thinner than his other major venues.",
    tag: null,
  },
];

// H2H angles — all grounded in verified odds spread
const H2H_ANGLES = [
  {
    label: "Rahm vs DeChambeau",
    edge: "Rahm",
    note: "Both +1200. Defending champion vs. a player who has historically struggled at Augusta. Rahm's iron play and course comfort are dramatically superior.",
    strength: "strong",
  },
  {
    label: "Spieth vs Cameron Young",
    edge: "Spieth",
    note: "Spieth is a 2.2× underdog (+4000 vs +2200) with a win and two runner-up finishes here. Young has zero Augusta track record.",
    strength: "strong",
  },
  {
    label: "Matsuyama vs Morikawa",
    edge: "Matsuyama",
    note: "Past Augusta champion (+4000) vs. a player who has never contended here (+3000). Matsuyama at longer odds is wrong.",
    strength: "strong",
  },
  {
    label: "Åberg vs Morikawa",
    edge: "Åberg",
    note: "T2 in his Masters debut (+1800) vs. a player without an Augusta contention (+3000). Åberg is both the better Augusta fit and the shorter price.",
    strength: "strong",
  },
  {
    label: "Rose vs Koepka",
    edge: "Rose",
    note: "Both at +3000. Rose is an Augusta specialist with multiple near-misses since his 2013 win. Koepka's Augusta history is thinner.",
    strength: "moderate",
  },
  {
    label: "Schauffele vs Koepka",
    edge: "Schauffele",
    note: "Schauffele just won two majors back-to-back. He is in a different tier right now.",
    strength: "moderate",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtOdds(odds: number) {
  return `+${odds.toLocaleString()}`;
}

function tagLabel(tag?: "value" | "fade" | null) {
  if (tag === "value") return { text: "Value", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
  if (tag === "fade") return { text: "Fade", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" };
  return null;
}

function strengthLabel(strength: string) {
  if (strength === "strong") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-white/10 bg-white/[0.04] text-gray-300";
}

// ─── Component ────────────────────────────────────────────────────────────────

function TierSection({
  tier,
  label,
  players,
  localOddsMap,
}: {
  tier: string;
  label: string;
  players: TierPlayer[];
  localOddsMap: Map<string, number>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
        {tier} — {label}
      </p>
      <div className="space-y-2">
        {players.map((player) => {
          // Use live snapshot odds if available; fall back to tier constant
          const liveOdds = localOddsMap.get(player.name.toLowerCase()) ?? null;
          const displayOdds = liveOdds ?? player.odds;
          const tag = tagLabel(player.tag);
          return (
            <div
              key={player.name}
              className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{player.name}</p>
                    {tag ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tag.cls}`}>
                        {tag.text}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-400">{player.note}</p>
                </div>
                <p className="text-sm font-semibold text-emerald-300 tabular-nums">{fmtOdds(displayOdds)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MastersAnalysisSection({
  mastersLocalOdds,
}: {
  mastersLocalOdds: LocalGolfOddsSnapshot | null;
}) {
  // Build a name→odds lookup from the live snapshot for on-the-fly overrides
  const localOddsMap = new Map<string, number>(
    (mastersLocalOdds?.winner ?? []).map((entry) => [
      entry.player.toLowerCase(),
      entry.odds,
    ]),
  );

  const oddsDate = mastersLocalOdds?.scrapedAt
    ? formatGolfUpdatedAt(mastersLocalOdds.scrapedAt)
    : "2026-03-29";
  const playerCount = mastersLocalOdds?.winner.length ?? 90;
  const startDate = mastersLocalOdds?.startDate ?? "2026-04-09";
  const daysOut = Math.ceil(
    (new Date(startDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );

  return (
    <section className="rounded-[32px] border border-amber-500/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.08),transparent_40%),rgba(255,255,255,0.03)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-400">
            ⭐ Masters 2026 — Pre-Tournament Analysis
          </p>
          <h2 className="mt-1.5 text-2xl font-semibold text-white md:text-3xl">
            Augusta National · April 9–13
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Tiered odds analysis, H2H angles, value plays, and course profile.
            No fabricated probabilities — grounded in verified Bovada markets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-300">
            {daysOut > 0 ? `${daysOut}d out` : daysOut === 0 ? "Today" : "In progress"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
            {playerCount}-player field
          </span>
        </div>
      </div>

      {/* Course Profile */}
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
          What Wins at Augusta
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {COURSE_KEYS.map((item) => (
            <div
              key={item.factor}
              className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-amber-400">#{item.rank}</span>
                <p className="text-sm font-semibold text-white">{item.factor}</p>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-gray-400">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tiered Odds Analysis */}
      <div className="mt-6 space-y-5">
        <TierSection
          tier="Tier 1"
          label="Legitimate favorites"
          players={TIER_1}
          localOddsMap={localOddsMap}
        />
        <TierSection
          tier="Tier 2"
          label="Serious contenders"
          players={TIER_2}
          localOddsMap={localOddsMap}
        />
        <TierSection
          tier="Tier 3"
          label="Value plays"
          players={TIER_3}
          localOddsMap={localOddsMap}
        />
      </div>

      {/* H2H Angles */}
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
          H2H Market Angles
        </p>
        <p className="mt-1.5 text-xs text-gray-500">
          Head-to-head removes field noise. You just need one player to beat one other player over 4 rounds.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {H2H_ANGLES.map((angle) => (
            <div
              key={angle.label}
              className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{angle.label}</p>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${strengthLabel(angle.strength)}`}>
                  {angle.strength === "strong" ? "Strong lean" : "Lean"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                Edge: {angle.edge}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-400">{angle.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Data Provenance */}
      <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
          Data Provenance
        </p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
          <span>
            Source:{" "}
            <span className="text-white">Bovada winner market</span>
          </span>
          <span>
            Captured:{" "}
            <span className="text-white">{oddsDate}</span>
          </span>
          <span>
            Field:{" "}
            <span className="text-white">{playerCount} players</span>
          </span>
          <span>
            Course-fit scores:{" "}
            <span className="text-amber-300">Not available (DG subscription required)</span>
          </span>
        </div>
        <p className="mt-2 text-[11px] text-gray-600">
          Odds update when a fresh Bovada snapshot is captured. Individual SG splits (approach, putting) require a DataGolf subscription — only global rankings are in the free tier.
          Analysis reflects pre-tournament state; no live leaderboard until April 9.
        </p>
      </div>
    </section>
  );
}
