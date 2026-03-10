"use client";

import { useEffect, useMemo, useState } from "react";
import { League, PlayerProp } from "@/lib/types";
import { useLeague } from "@/hooks/useLeague";
import PropCard from "@/components/PropCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";
import EmptyStateCard from "@/components/EmptyStateCard";

type PropsMeta = {
  liveOnly?: boolean;
  oddsConnected?: boolean;
};

export default function PropsPage() {
  const [league, setLeague] = useLeague();
  const [propType, setPropType] = useState("all");
  const [overUnder, setOverUnder] = useState("all");
  const [data, setData] = useState<PlayerProp[]>([]);
  const [meta, setMeta] = useState<PropsMeta>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard')
      .then(r => r.json())
      .then((json) => {
        if (Array.isArray(json?.props)) setData(json.props);
        if (json?.meta) setMeta(json.meta);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const propTypes = useMemo(
    () => Array.from(new Set(data.filter((p) => p.league === league).map((p) => p.propType))),
    [data, league]
  );

  const filtered = data.filter((p) => {
    if (p.league !== league) return false;
    if (propType !== "all" && p.propType !== propType) return false;
    if (overUnder !== "all" && p.overUnder !== overUnder) return false;
    return true;
  });

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-white">Live Player Props</h1>
            <p className="text-xs text-gray-500 mt-0.5">Current-slate markets only. No seeded filler.</p>
          </div>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>
        <div className="px-4 pb-3">
          <FilterBar
            filters={[
              {
                label: "Type",
                value: propType,
                onChange: setPropType,
                options: [
                  { label: "All Markets", value: "all" },
                  ...propTypes.map((t) => ({ label: t, value: t })),
                ],
              },
              {
                label: "Over/Under",
                value: overUnder,
                onChange: setOverUnder,
                options: [
                  { label: "Over+Under", value: "all" },
                  { label: "Over", value: "Over" },
                  { label: "Under", value: "Under" },
                ],
              },
            ]}
          />
        </div>
      </header>

      {loading ? (
        <EmptyStateCard
          eyebrow="Loading live slate"
          title="Pulling current NHL prop markets"
          body="Goosalytics is checking the live slate, active books, and player-history context before ranking bets."
        />
      ) : filtered.length === 0 ? (
        <EmptyStateCard
          eyebrow={meta.oddsConnected ? "Live markets thin" : "Live prop markets unavailable"}
          title={meta.oddsConnected ? "No strong live prop edges right now" : "No live NHL player props available from the current feed"}
          body={meta.oddsConnected
            ? "Goosalytics is now intentionally strict: if the current slate doesn’t produce enough real, matched NHL prop markets, it shows nothing rather than fake edges."
            : "The current external feed is not providing usable NHL player prop markets on this slate/tier. The app is intentionally avoiding seeded fake picks and will only show live, matched markets."}
        />
      ) : (
        <div>
          {filtered.map((prop) => <PropCard key={prop.id} prop={prop} />)}
        </div>
      )}
    </div>
  );
}
