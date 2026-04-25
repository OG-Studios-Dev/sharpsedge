"use client";

import { useEffect, useState } from "react";
import type { NBAGame } from "@/lib/nba-api";
import type { NFLDashboardData } from "@/lib/nfl-live-data";
import type { NFLGame, NFLTeamStanding } from "@/lib/nfl-api";
import type { SoccerDashboardData } from "@/lib/soccer-live-data";
import type { SoccerMatch, SoccerTeamStanding } from "@/lib/soccer-api";
import type { GolfDashboardData, MLBGame } from "@/lib/types";
import { OddsEvent, PlayerProp, TeamTrend, NHLGame } from "@/lib/types";
import { SportsLeague } from "@/lib/insights";

type NHLSchedule = {
  games: NHLGame[];
  date: string;
};

type DashboardState = {
  loading: boolean;
  error: string | null;
  failedFeeds: string[];
  props: PlayerProp[];
  teamTrends: TeamTrend[];
  nhlSchedule: NHLSchedule;
  nbaSchedule: NBAGame[];
  mlbSchedule: MLBGame[];
  eplSchedule: SoccerMatch[];
  serieASchedule: SoccerMatch[];
  nflSchedule: NFLGame[];
  eplStandings: SoccerTeamStanding[];
  serieAStandings: SoccerTeamStanding[];
  nflStandings: NFLTeamStanding[];
  oddsEvents: OddsEvent[];
  golfDashboard: GolfDashboardData | null;
  eplDashboard: SoccerDashboardData | null;
  serieADashboard: SoccerDashboardData | null;
  nflDashboard: NFLDashboardData | null;
};

const EMPTY_STATE: DashboardState = {
  loading: true,
  error: null,
  failedFeeds: [],
  props: [],
  teamTrends: [],
  nhlSchedule: { games: [], date: "" },
  nbaSchedule: [],
  mlbSchedule: [],
  eplSchedule: [],
  serieASchedule: [],
  nflSchedule: [],
  eplStandings: [],
  serieAStandings: [],
  nflStandings: [],
  oddsEvents: [],
  golfDashboard: null,
  eplDashboard: null,
  serieADashboard: null,
  nflDashboard: null,
};

type FetchJsonResult<T> = {
  data: T | null;
  error: string | null;
};

async function fetchJson<T>(url: string): Promise<FetchJsonResult<T>> {
  try {
    const response = await fetch(url);
    if (!response.ok) return { data: null, error: `${url} returned ${response.status}` };
    return { data: await response.json() as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : `Unable to fetch ${url}` };
  }
}

function skipped<T>(): Promise<FetchJsonResult<T>> {
  return Promise.resolve({ data: null, error: null });
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

function parseSoccerSchedule(payload: SoccerDashboardData | null): SoccerMatch[] {
  return Array.isArray(payload?.schedule) ? payload.schedule : [];
}

function parseSoccerStandings(payload: SoccerDashboardData | null): SoccerTeamStanding[] {
  return Array.isArray(payload?.standings) ? payload.standings : [];
}

function parseNFLSchedule(payload: NFLDashboardData | null): NFLGame[] {
  return Array.isArray(payload?.schedule) ? payload.schedule : [];
}

function parseNFLStandings(payload: NFLDashboardData | null): NFLTeamStanding[] {
  return Array.isArray(payload?.standings) ? payload.standings : [];
}

export function useSportsDashboards(league: SportsLeague) {
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: null, failedFeeds: [] }));

      const shouldLoadNHL = league === "All" || league === "NHL";
      const shouldLoadNBA = league === "All" || league === "NBA";
      const shouldLoadMLB = league === "All" || league === "MLB";
      const shouldLoadGolf = league === "PGA";
      const shouldLoadEPL = league === "All" || league === "EPL";
      const shouldLoadSerieA = league === "All" || league === "Serie A";
      const shouldLoadNFL = league === "All" || league === "NFL";

      const [nhlResult, nbaResult, mlbResult, golfResult, eplResult, serieAResult, nflResult] = await Promise.all([
        shouldLoadNHL ? fetchJson<any>("/api/dashboard") : skipped<any>(),
        shouldLoadNBA ? fetchJson<any>("/api/nba/dashboard") : skipped<any>(),
        shouldLoadMLB ? fetchJson<any>("/api/mlb/dashboard") : skipped<any>(),
        shouldLoadGolf ? fetchJson<GolfDashboardData>("/api/golf/dashboard") : skipped<GolfDashboardData>(),
        shouldLoadEPL ? fetchJson<SoccerDashboardData>("/api/soccer/dashboard?league=EPL") : skipped<SoccerDashboardData>(),
        shouldLoadSerieA ? fetchJson<SoccerDashboardData>("/api/soccer/dashboard?league=SERIE_A") : skipped<SoccerDashboardData>(),
        shouldLoadNFL ? fetchJson<NFLDashboardData>("/api/nfl/dashboard") : skipped<NFLDashboardData>(),
      ]);

      if (cancelled) return;

      const nhlPayload = nhlResult.data;
      const nbaPayload = nbaResult.data;
      const mlbPayload = mlbResult.data;
      const golfPayload = golfResult.data;
      const eplPayload = eplResult.data;
      const serieAPayload = serieAResult.data;
      const nflPayload = nflResult.data;
      const failedFeeds = [
        shouldLoadNHL && nhlResult.error ? "NHL" : null,
        shouldLoadNBA && nbaResult.error ? "NBA" : null,
        shouldLoadMLB && mlbResult.error ? "MLB" : null,
        shouldLoadGolf && golfResult.error ? "PGA" : null,
        shouldLoadEPL && eplResult.error ? "EPL" : null,
        shouldLoadSerieA && serieAResult.error ? "Serie A" : null,
        shouldLoadNFL && nflResult.error ? "NFL" : null,
      ].filter((feed): feed is string => Boolean(feed));

      setState({
        loading: false,
        failedFeeds,
        error: failedFeeds.length
          ? `${failedFeeds.join(", ")} ${failedFeeds.length === 1 ? "feed is" : "feeds are"} unavailable right now. Showing any cached/healthy sections that loaded.`
          : null,
        props: [
          ...(Array.isArray(nhlPayload?.props) ? nhlPayload.props : []),
          ...(Array.isArray(nbaPayload?.props) ? nbaPayload.props : []),
          ...(Array.isArray(mlbPayload?.props) ? mlbPayload.props : []),
        ],
        teamTrends: [
          ...(Array.isArray(nhlPayload?.teamTrends) ? nhlPayload.teamTrends : []),
          ...(Array.isArray(nbaPayload?.teamTrends) ? nbaPayload.teamTrends : []),
          ...(Array.isArray(mlbPayload?.teamTrends) ? mlbPayload.teamTrends : []),
          ...(Array.isArray(eplPayload?.teamTrends) ? eplPayload.teamTrends : []),
          ...(Array.isArray(serieAPayload?.teamTrends) ? serieAPayload.teamTrends : []),
        ],
        nhlSchedule: shouldLoadNHL ? parseNHLSchedule(nhlPayload) : { games: [], date: "" },
        nbaSchedule: shouldLoadNBA ? parseNBASchedule(nbaPayload) : [],
        mlbSchedule: shouldLoadMLB ? parseMLBSchedule(mlbPayload) : [],
        eplSchedule: shouldLoadEPL ? parseSoccerSchedule(eplPayload) : [],
        serieASchedule: shouldLoadSerieA ? parseSoccerSchedule(serieAPayload) : [],
        nflSchedule: shouldLoadNFL ? parseNFLSchedule(nflPayload) : [],
        eplStandings: shouldLoadEPL ? parseSoccerStandings(eplPayload) : [],
        serieAStandings: shouldLoadSerieA ? parseSoccerStandings(serieAPayload) : [],
        nflStandings: shouldLoadNFL ? parseNFLStandings(nflPayload) : [],
        oddsEvents: Array.isArray(nbaPayload?.odds) ? nbaPayload.odds : [],
        golfDashboard: golfPayload,
        eplDashboard: eplPayload,
        serieADashboard: serieAPayload,
        nflDashboard: nflPayload,
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [league]);

  return state;
}
