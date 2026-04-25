"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { League } from "@/lib/types";
import { featuredLeagues, leagueMeta } from "@/lib/league-meta";
import { useLeague } from "@/hooks/useLeague";
import { getLeagueLogo } from "@/lib/visual-identity";

const LEAGUE_ROUTES: Partial<Record<League, string>> = {
  NHL: "/schedule",
  NBA: "/schedule",
  MLB: "/schedule",
  NFL: "/schedule",
  EPL: "/schedule",
  "Serie A": "/schedule",
  PGA: "/golf",
  UFC: "/ufc",
};

const LEAGUE_CTA: Partial<Record<League, string>> = {
  NHL: "Open NHL hub",
  NBA: "Open NBA hub",
  MLB: "Open MLB hub",
  NFL: "Open NFL hub",
  EPL: "Open EPL hub",
  "Serie A": "Open Serie A hub",
  PGA: "Open golf hub",
  UFC: "Open UFC card",
};

export default function LeaguesPage() {
  const [league, setLeague] = useLeague();

  return (
    <div>
      <PageHeader title="Leagues" subtitle="Pick the market you want Goosalytics to prioritize." />

      <div className="px-4 py-6 space-y-5 lg:px-0">
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Active league</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-dark-bg text-2xl border border-dark-border overflow-hidden">
              {getLeagueLogo(league) ? (
                <img src={getLeagueLogo(league)!} alt={league} className="h-8 w-8 object-contain" />
              ) : (
                leagueMeta[league].icon
              )}
            </div>
            <div>
              <div className="text-white text-lg font-semibold">{league}</div>
              <div className="text-sm text-gray-400">{leagueMeta[league].subtitle}</div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-white mb-3">Choose your active market</div>
          <div className="grid grid-cols-1 gap-3">
            {featuredLeagues.map((item) => {
              const active = league === item;
              const route = LEAGUE_ROUTES[item];
              const comingSoon = !route;

              const card = (
                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-dark-bg/80 border border-dark-border flex items-center justify-center text-2xl overflow-hidden">
                        {getLeagueLogo(item) ? (
                          <img src={getLeagueLogo(item)!} alt={item} className="h-8 w-8 object-contain" />
                        ) : (
                          leagueMeta[item].icon
                        )}
                      </div>
                      <div>
                        <div className="text-white text-base font-semibold flex items-center gap-2">
                          {item}
                          {comingSoon && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-dark-bg text-gray-500 border border-dark-border uppercase tracking-wider">
                              Coming Soon
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-300 mt-1 max-w-[240px]">
                          {leagueMeta[item].subtitle}
                        </div>
                        <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                          {comingSoon ? "Market not live yet" : LEAGUE_CTA[item] ?? "Open market"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLeague(item); }}
                      className={`mt-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                        active ? "bg-accent-blue text-white" : "bg-dark-bg text-gray-400 border border-dark-border"
                      }`}
                    >
                      {active ? "Active" : "Set Active"}
                    </button>
                  </div>
                </div>
              );

              const cls = `block text-left rounded-2xl border p-4 transition-all bg-gradient-to-br ${leagueMeta[item].accent} ${
                active
                  ? "border-accent-blue shadow-[0_0_0_1px_rgba(96,165,250,0.35)]"
                  : "border-dark-border hover:border-gray-600"
              }`;

              if (route) {
                return (
                  <Link key={item} href={route} onClick={() => setLeague(item)} className={cls}>
                    {card}
                  </Link>
                );
              }

              return (
                <div key={item} className={cls + " cursor-default"}>
                  {card}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
