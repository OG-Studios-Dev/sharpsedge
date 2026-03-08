"use client";

import { useState } from "react";
import LeagueSelector from "@/components/LeagueSelector";
import { League } from "@/lib/types";

export default function LeaguesPage() {
  const [league, setLeague] = useState<League>("NHL");
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">Leagues</h1>
      </header>
      <div className="px-4 py-6 flex justify-center">
        <LeagueSelector selected={league} onSelect={setLeague} />
      </div>
    </div>
  );
}
