"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";

interface UFCFighter {
  id: number;
  name: string;
  logo: string | null;
  winner?: boolean;
}

interface UFCFight {
  id: number;
  slug: string;
  is_main: boolean;
  category: string;
  status: { long: string; short: string };
  fighters: { first: UFCFighter; second: UFCFighter };
  odds: Array<{ bookmaker: string; fighter1Odds: number; fighter2Odds: number }>;
  bestFighter1Odds: number | null;
  bestFighter2Odds: number | null;
}

interface UFCPick {
  fightId: number;
  event: string;
  category: string;
  fighter: string;
  opponent: string;
  odds: number;
  impliedProb: number;
  modelProb: number;
  edge: number;
  hitRate: number;
  reasoning: string;
  bookmaker: string;
}

interface CardData {
  card: { date: string; event: string } | null;
  isUpcoming: boolean;
  mainCard: UFCFight[];
  prelims: UFCFight[];
  totalFights: number;
}

interface PicksData {
  picks: UFCPick[];
  card: { date: string; event: string } | null;
  isUpcoming: boolean;
  message: string | null;
}

function formatOdds(odds: number | null): string {
  if (odds === null) return "—";
  return odds >= 0 ? `+${odds}` : `${odds}`;
}

function OddsChip({ odds }: { odds: number | null }) {
  if (odds === null) return <span className="text-gray-500 text-xs">—</span>;
  const isFav = odds < 0;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
      isFav ? "bg-blue-500/20 text-blue-300" : "bg-green-500/20 text-green-300"
    }`}>
      {formatOdds(odds)}
    </span>
  );
}

function FightCard({ fight }: { fight: UFCFight }) {
  const f1 = fight.fighters.first;
  const f2 = fight.fighters.second;
  const finished = fight.status.short === "FT" || fight.status.long === "Finished";

  return (
    <div className={`rounded-2xl border p-4 ${fight.is_main ? "border-accent-blue/40 bg-gradient-to-br from-blue-500/10 to-dark-surface" : "border-dark-border bg-dark-surface"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">{fight.category}</span>
        {fight.is_main && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue border border-accent-blue/30 uppercase tracking-wider font-semibold">Main Card</span>
        )}
        {finished && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 uppercase tracking-wider font-semibold">Final</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* Fighter 1 */}
        <div className={`flex-1 text-center ${finished && f1.winner ? "text-white" : "text-gray-300"}`}>
          <div className="w-12 h-12 rounded-full bg-dark-bg border border-dark-border mx-auto mb-2 flex items-center justify-center text-xl overflow-hidden">
            {f1.logo ? (
              <img src={f1.logo} alt={f1.name} className="w-12 h-12 rounded-full object-cover" onError={(e) => { const t = e.target as HTMLImageElement; t.style.display="none"; t.nextElementSibling?.classList.remove("hidden"); }} />
            ) : null}
            <span className={`text-xs font-bold text-gray-400 ${f1.logo ? "hidden" : ""}`}>{f1.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2)}</span>
          </div>
          <div className="text-sm font-semibold leading-tight">{f1.name}</div>
          {finished && f1.winner && (
            <div className="text-[9px] text-green-400 font-bold uppercase mt-0.5">Winner</div>
          )}
          <div className="mt-1.5"><OddsChip odds={fight.bestFighter1Odds} /></div>
        </div>

        {/* VS */}
        <div className="text-gray-500 text-sm font-bold shrink-0">VS</div>

        {/* Fighter 2 */}
        <div className={`flex-1 text-center ${finished && f2.winner ? "text-white" : "text-gray-300"}`}>
          <div className="w-12 h-12 rounded-full bg-dark-bg border border-dark-border mx-auto mb-2 flex items-center justify-center text-xl overflow-hidden">
            {f2.logo ? (
              <img src={f2.logo} alt={f2.name} className="w-12 h-12 rounded-full object-cover" onError={(e) => { const t = e.target as HTMLImageElement; t.style.display="none"; t.nextElementSibling?.classList.remove("hidden"); }} />
            ) : null}
            <span className={`text-xs font-bold text-gray-400 ${f2.logo ? "hidden" : ""}`}>{f2.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2)}</span>
          </div>
          <div className="text-sm font-semibold leading-tight">{f2.name}</div>
          {finished && f2.winner && (
            <div className="text-[9px] text-green-400 font-bold uppercase mt-0.5">Winner</div>
          )}
          <div className="mt-1.5"><OddsChip odds={fight.bestFighter2Odds} /></div>
        </div>
      </div>

      {/* Book count */}
      {fight.odds.length > 0 && (
        <div className="mt-2 text-[10px] text-gray-500 text-center">
          {fight.odds.length} book{fight.odds.length !== 1 ? "s" : ""} — {fight.odds.map((o) => o.bookmaker).join(", ")}
        </div>
      )}
    </div>
  );
}

function PickCard({ pick }: { pick: UFCPick }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-accent-blue/30 bg-gradient-to-br from-blue-500/10 to-dark-surface p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{pick.category}</div>
          <div className="text-white font-bold text-base">{pick.fighter}</div>
          <div className="text-gray-400 text-sm">vs {pick.opponent}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-bold ${pick.odds >= 0 ? "text-green-400" : "text-blue-300"}`}>
            {formatOdds(pick.odds)}
          </div>
          <div className="text-[10px] text-gray-500">{pick.bookmaker}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2 text-[11px]">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Edge</span>
          <span className="text-green-400 font-bold">+{pick.edge}%</span>
        </div>
        <div className="w-px h-3 bg-dark-border" />
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Hit Rate</span>
          <span className="text-white font-semibold">{pick.hitRate}%</span>
        </div>
        <div className="w-px h-3 bg-dark-border" />
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Model</span>
          <span className="text-white font-semibold">{pick.modelProb}%</span>
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-[11px] text-accent-blue underline-offset-2 hover:underline"
      >
        {expanded ? "Hide reasoning" : "Show reasoning"}
      </button>

      {expanded && (
        <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">{pick.reasoning}</p>
      )}
    </div>
  );
}

export default function UFCPage() {
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [picksData, setPicksData] = useState<PicksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"picks" | "card">("picks");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cardRes, picksRes] = await Promise.all([
        fetch("/api/ufc/card").then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/ufc/picks").then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      setCardData(cardRes);
      setPicksData(picksRes);
      setLoading(false);
    }
    load();
  }, []);

  const card = cardData?.card ?? picksData?.card;
  const eventName = card?.event ?? "UFC Event";
  const eventDate = card?.date ?? "";
  const isUpcoming = cardData?.isUpcoming ?? picksData?.isUpcoming ?? false;

  return (
    <div className="mx-auto max-w-2xl min-h-screen bg-dark-bg pb-24">
      <PageHeader
        title="UFC"
        subtitle={card ? `${isUpcoming ? "Upcoming" : "Recent"}: ${eventName}` : "MMA picks and fight card"}
      />

      {/* Event hero */}
      {card && (
        <div className="mx-4 mt-4 rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-dark-surface p-4">
          <div className="text-[10px] uppercase tracking-widest text-red-400 mb-1">
            {isUpcoming ? "Fight Night" : "Results"}
          </div>
          <div className="text-white font-bold text-lg leading-tight">{eventName}</div>
          <div className="text-gray-400 text-sm mt-0.5">{eventDate}</div>
          {cardData && (
            <div className="text-[11px] text-gray-500 mt-1">{cardData.totalFights} bouts · {cardData.mainCard?.length ?? 0} main card</div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 px-4 mt-4">
        {(["picks", "card"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-accent-blue text-white"
                : "bg-dark-surface border border-dark-border text-gray-400 hover:text-white"
            }`}
          >
            {tab === "picks" ? "🥊 Picks" : "📋 Card"}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading ? (
          <div className="text-center text-gray-500 py-12 text-sm">Loading UFC data...</div>
        ) : !card ? (
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-6 text-center">
            <div className="text-2xl mb-2">🥊</div>
            <div className="text-white font-semibold mb-1">No card in window</div>
            <div className="text-gray-400 text-sm">UFC data is available within a 3-day rolling window. Check back closer to fight night.</div>
          </div>
        ) : activeTab === "picks" ? (
          <>
            {picksData?.message && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 text-sm">
                {picksData.message}
              </div>
            )}
            {picksData?.picks && picksData.picks.length > 0 ? (
              picksData.picks.map((pick) => (
                <PickCard key={`${pick.fightId}-${pick.fighter}`} pick={pick} />
              ))
            ) : !picksData?.message ? (
              <div className="text-center text-gray-500 py-8 text-sm">No value picks found for this card.</div>
            ) : null}
          </>
        ) : (
          <>
            {cardData?.mainCard && cardData.mainCard.length > 0 && (
              <>
                <div className="text-xs uppercase tracking-widest text-gray-500 pt-2">Main Card</div>
                {cardData.mainCard.map((fight) => (
                  <FightCard key={fight.id} fight={fight} />
                ))}
              </>
            )}
            {cardData?.prelims && cardData.prelims.length > 0 && (
              <>
                <div className="text-xs uppercase tracking-widest text-gray-500 pt-4">Prelims</div>
                {cardData.prelims.map((fight) => (
                  <div key={fight.id} className="rounded-xl border border-dark-border bg-dark-surface p-3">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">{fight.category}</div>
                    <div className="text-sm text-gray-300">
                      {fight.fighters.first.name} <span className="text-gray-600 mx-1">vs</span> {fight.fighters.second.name}
                      {(fight.fighters.first.winner || fight.fighters.second.winner) && (
                        <span className="ml-2 text-[10px] text-green-400">
                          W: {fight.fighters.first.winner ? fight.fighters.first.name : fight.fighters.second.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
