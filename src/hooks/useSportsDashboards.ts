"use client";

import { useEffect, useState } from "react";
import type { NBAGame } from "@/lib/nba-api";
import type { MLBGame } from "@/lib/types";
import { OddsEvent, PlayerProp, TeamTrend, NHLGame } from "@/lib/types";
import { SportsLeague } from "@/lib/insights";

type NHLSchedule = {
  games: NHLGame[];
  date: string;
};

type DashboardState = {
  loading: boolean;
  props: PlayerProp[];
  teamTrends: TeamTrend[];
  nhlSchedule: NHLSchedule;
  nbaSchedule: NBAGame[];
  mlbSchedule: MLBGame[];
  oddsEvents: OddsEvent[];
};

const EMPTY_STATE: DashboardState = {
  loading: true,
  props: [],
  teamTrends: [],
  nhlSchedule: { games: [], date: "" },
  nbaSchedule: [],
  mlbSchedule: [],
  oddsEvents: [],
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function parseNHLSchedule(payload: any): NHLSchedule {
  return {
    games: Array.isArray(payload?.schedule?.games) ? payload.schedule.games : [],
    date: typeof payload?.schedule?.date === "string" ? payload.schedule.date : "",
  };
}

function parseNBASchedule(payload: any): NBAGame[] {
  if (Array.isArray(payload?.schedule)) return payload.schedule;
  if (Array.isArray(payload?.schedule?.games)) return payload.schedule.games;
  return [];
}

function parseMLBSchedule(payload: any): MLBGame[] {
  if (Array.isArray(payload?.schedule)) return payload.schedule;
  if (Array.isArray(payload?.schedule?.games)) return payload.schedule.games;
  return [];
}

export function useSportsDashboards(league: SportsLeague) {
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((current) => ({ ...current, loading: true }));

      const shouldLoadNHL = league === "All" || league === "NHL";
      const shouldLoadNBA = league === "All" || league === "NBA";
      const shouldLoadMLB = false; // MLB not live yet — enable when season starts

      const [nhlPayload, nbaPayload, mlbPayload] = await Promise.all([
        shouldLoadNHL ? fetchJson<any>("/api/dashboard") : Promise.resolve(null),
        shouldLoadNBA ? fetchJson<any>("/api/nba/dashboard") : Promise.resolve(null),
        shouldLoadMLB ? fetchJson<any>("/api/mlb/dashboard") : Promise.resolve(null),
      ]);

      if (cancelled) return;

      setState({
        loading: false,
        props: [
          ...(Array.isArray(nhlPayload?.props) ? nhlPayload.props : []),
          ...(Array.isArray(nbaPayload?.props) ? nbaPayload.props : []),
          ...(Array.isArray(mlbPayload?.props) ? mlbPayload.props : []),
        ],
        teamTrends: [
          ...(Array.isArray(nhlPayload?.teamTrends) ? nhlPayload.teamTrends : []),
          ...(Array.isArray(nbaPayload?.teamTrends) ? nbaPayload.teamTrends : []),
          ...(Array.isArray(mlbPayload?.teamTrends) ? mlbPayload.teamTrends : []),
        ],
        nhlSchedule: shouldLoadNHL ? parseNHLSchedule(nhlPayload) : { games: [], date: "" },
        nbaSchedule: shouldLoadNBA ? parseNBASchedule(nbaPayload) : [],
        mlbSchedule: shouldLoadMLB ? parseMLBSchedule(mlbPayload) : [],
        oddsEvents: Array.isArray(nbaPayload?.odds) ? nbaPayload.odds : [],
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [league]);

  return state;
}
