"use client";

import { useLeague } from "@/hooks/useLeague";
import HomePicksSection from "./HomePicksSection";
import LeagueSwitcher from "./LeagueSwitcher";
import ScheduleBoard from "./ScheduleBoard";
import NBAScheduleBoard from "./NBAScheduleBoard";

export default function HomeContent({ today }: { today: string }) {
  const [league, setLeague] = useLeague();

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Date */}
      <div>
        <h2 className="text-white text-lg font-semibold">Today</h2>
        <p className="text-xs text-gray-500 mt-0.5">{today}</p>
      </div>

      {/* League Switcher */}
      <LeagueSwitcher active={league} onChange={setLeague} />

      {/* Picks — league-aware, shows combined record for All */}
      <HomePicksSection league={league} />

      {/* Schedule — show both if All, otherwise sport-specific */}
      {league === "All" ? (
        <>
          <ScheduleBoard compact />
          <NBAScheduleBoard compact />
        </>
      ) : league === "NBA" ? (
        <NBAScheduleBoard compact />
      ) : (
        <ScheduleBoard compact />
      )}
    </div>
  );
}
