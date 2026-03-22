import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBScheduleRange } from "@/lib/mlb-api";
import { buildMLBBullpenFatigueBoard } from "@/lib/mlb-bullpen";
import { buildMLBF5MarketSnapshot } from "@/lib/mlb-f5";
import { getMLBLineupSnapshot } from "@/lib/mlb-lineups";
import { findMLBOddsForGame, getMLBOdds } from "@/lib/mlb-odds";
import { getMLBParkFactor } from "@/lib/mlb-park-factors";
import { getMLBStadiumForGame } from "@/lib/mlb-stadiums";
import { getMLBWeatherForGame } from "@/lib/mlb-weather";
import { buildSourceHealthCheck, summarizeSourceHealth } from "@/lib/source-health";

export async function getMLBEnrichmentBoard(date = getDateKey(new Date(), MLB_TIME_ZONE)) {
  const schedule = await getMLBScheduleRange(date, date);
  const [bullpenBoard, odds] = await Promise.all([
    buildMLBBullpenFatigueBoard(schedule),
    getMLBOdds(),
  ]);

  const games = await Promise.all(schedule.map(async (game) => {
    const [lineups, weather] = await Promise.all([
      getMLBLineupSnapshot(game),
      getMLBWeatherForGame(game),
    ]);

    const parkFactor = getMLBParkFactor(game.homeTeam.abbreviation);
    const mappedVenue = getMLBStadiumForGame(game);
    const event = findMLBOddsForGame(odds, game.homeTeam.abbreviation, game.awayTeam.abbreviation) ?? null;
    const f5 = buildMLBF5MarketSnapshot({ ...game, oddsEventId: event?.id ?? game.oddsEventId }, event);

    const probableStarters = {
      away: game.awayTeam.probablePitcher ?? null,
      home: game.homeTeam.probablePitcher ?? null,
    };
    const starterQuality = {
      away: probableStarters.away
        ? {
            pitcherId: probableStarters.away.id ?? null,
            pitcherName: probableStarters.away.name ?? null,
            hand: probableStarters.away.hand ?? null,
            era: probableStarters.away.era ?? null,
            wins: probableStarters.away.wins ?? null,
            losses: probableStarters.away.losses ?? null,
            qualityScore: probableStarters.away.era == null
              ? null
              : Math.max(30, Math.min(80, Math.round(68 - (probableStarters.away.era - 3.5) * 9))),
            summary: probableStarters.away.era == null
              ? `${probableStarters.away.name} listed without current ERA context.`
              : `${probableStarters.away.name} (${probableStarters.away.hand || "—"}) ERA ${probableStarters.away.era.toFixed(2)} • ${probableStarters.away.wins ?? 0}-${probableStarters.away.losses ?? 0}`,
          }
        : null,
      home: probableStarters.home
        ? {
            pitcherId: probableStarters.home.id ?? null,
            pitcherName: probableStarters.home.name ?? null,
            hand: probableStarters.home.hand ?? null,
            era: probableStarters.home.era ?? null,
            wins: probableStarters.home.wins ?? null,
            losses: probableStarters.home.losses ?? null,
            qualityScore: probableStarters.home.era == null
              ? null
              : Math.max(30, Math.min(80, Math.round(68 - (probableStarters.home.era - 3.5) * 9))),
            summary: probableStarters.home.era == null
              ? `${probableStarters.home.name} listed without current ERA context.`
              : `${probableStarters.home.name} (${probableStarters.home.hand || "—"}) ERA ${probableStarters.home.era.toFixed(2)} • ${probableStarters.home.wins ?? 0}-${probableStarters.home.losses ?? 0}`,
          }
        : null,
    };

    const qualitySnapshots = {
      hitters: {
        approximation: "recent-game-log-form",
        scope: "top-of-order expected bats only when MLB live feed exposes lineup slots",
        note: "Best sustainable repo-native approximation until a dedicated daily Statcast snapshot rail is added.",
      },
      pitchers: {
        approximation: "probable-starter-era-form",
        scope: "listed probable starters from MLB Stats API schedule hydrate",
        note: "Use as a conservative daily starter-quality rail, not a Statcast replacement.",
      },
    };

    const sourceHealth = summarizeSourceHealth([
      buildSourceHealthCheck({
        key: "lineups",
        label: "MLB lineups",
        detail: lineups.note || "Official MLB live-feed lineup rail.",
        fetchedAt: lineups.source.fetchedAt,
        staleAfter: lineups.source.staleAfter,
        missingFields: [
          !lineups.away?.players?.length ? `${game.awayTeam.abbreviation} lineup missing hitters` : "",
          !lineups.home?.players?.length ? `${game.homeTeam.abbreviation} lineup missing hitters` : "",
        ],
      }),
      buildSourceHealthCheck({
        key: "weather",
        label: "Weather",
        detail: weather.note || "Open-Meteo forecast rail.",
        fetchedAt: weather.source.fetchedAt,
        staleAfter: weather.source.staleAfter,
        degraded: weather.status !== "available" && weather.status !== "indoor",
      }),
      buildSourceHealthCheck({
        key: "bullpen",
        label: "Bullpen workload",
        detail: "Recent bullpen workload context derived from MLB final boxscores.",
        fetchedAt: bullpenBoard.get(game.homeTeam.abbreviation)?.source.fetchedAt ?? bullpenBoard.get(game.awayTeam.abbreviation)?.source.fetchedAt ?? null,
        staleAfter: bullpenBoard.get(game.homeTeam.abbreviation)?.source.staleAfter ?? bullpenBoard.get(game.awayTeam.abbreviation)?.source.staleAfter ?? null,
      }),
      buildSourceHealthCheck({
        key: "f5-market",
        label: "F5 market availability",
        detail: `Explicit first-five market rail (${f5.completeness}).`,
        fetchedAt: f5.source.fetchedAt,
        staleAfter: f5.source.staleAfter,
        degraded: !f5.available,
      }),
      buildSourceHealthCheck({
        key: "probable-starters",
        label: "Probable starters",
        detail: "MLB Stats API probable starter rail.",
        allowStaleWithoutFetch: true,
        fetchedAt: new Date().toISOString(),
        missingFields: [
          !probableStarters.away?.name ? `${game.awayTeam.abbreviation} probable starter missing` : "",
          !probableStarters.home?.name ? `${game.homeTeam.abbreviation} probable starter missing` : "",
        ],
      }),
    ]);

    return {
      gameId: game.id,
      date: game.date,
      startTimeUTC: game.startTimeUTC,
      status: game.status,
      statusDetail: game.statusDetail,
      matchup: {
        away: {
          abbreviation: game.awayTeam.abbreviation,
          fullName: game.awayTeam.fullName,
          probablePitcher: game.awayTeam.probablePitcher ?? null,
          bullpen: bullpenBoard.get(game.awayTeam.abbreviation) ?? null,
        },
        home: {
          abbreviation: game.homeTeam.abbreviation,
          fullName: game.homeTeam.fullName,
          probablePitcher: game.homeTeam.probablePitcher ?? null,
          bullpen: bullpenBoard.get(game.homeTeam.abbreviation) ?? null,
        },
      },
      venue: {
        scheduleVenue: game.venue ?? null,
        mappedVenue: mappedVenue
          ? {
              teamAbbrev: mappedVenue.teamAbbrev,
              venueName: mappedVenue.venueName,
              city: mappedVenue.city,
              state: mappedVenue.state,
              roofType: mappedVenue.roofType,
              latitude: mappedVenue.latitude,
              longitude: mappedVenue.longitude,
              timeZone: mappedVenue.timeZone,
              notes: mappedVenue.notes,
            }
          : null,
      },
      lineups,
      weather,
      parkFactor,
      probableStarters,
      starterQuality,
      qualitySnapshots,
      sourceHealth,
      markets: {
        f5,
      },
      freshness: {
        lineups: {
          fetchedAt: lineups.source.fetchedAt,
          staleAfter: lineups.source.staleAfter,
        },
        weather: {
          fetchedAt: weather.source.fetchedAt,
          staleAfter: weather.source.staleAfter,
        },
        parkFactor: {
          seededAt: parkFactor.source.seededAt,
          season: parkFactor.source.season,
          window: parkFactor.source.window ?? null,
        },
        bullpen: {
          fetchedAt: bullpenBoard.get(game.homeTeam.abbreviation)?.source.fetchedAt ?? bullpenBoard.get(game.awayTeam.abbreviation)?.source.fetchedAt ?? null,
          staleAfter: bullpenBoard.get(game.homeTeam.abbreviation)?.source.staleAfter ?? bullpenBoard.get(game.awayTeam.abbreviation)?.source.staleAfter ?? null,
        },
        f5: {
          fetchedAt: f5.source.fetchedAt,
          staleAfter: f5.source.staleAfter,
          completeness: f5.completeness,
        },
      },
    };
  }));

  return {
    boardDate: date,
    generatedAt: new Date().toISOString(),
    gamesCount: games.length,
    scope: {
      lineups: "Official only when MLB's live feed exposes a batting order. Otherwise the board stays partial/unconfirmed.",
      weather: "Open-Meteo hourly forecast mapped from stadium coordinates. Retractable-roof parks remain contextual because roof status is not confirmed in this pass.",
      parkFactor: "Seeded in-repo from Baseball Savant park factors to avoid live scraping pressure.",
      bullpen: "Derived from MLB Stats API final-game boxscores across the last three calendar days. This is a workload context rail, not a claimed predictive model.",
      f5: "First-five markets are surfaced only when explicitly present in the odds feeds/books. Full-game prices are never converted into synthetic F5 lines.",
    },
    sources: {
      schedule: "MLB Stats API schedule",
      lineups: "MLB Stats API live feed",
      weather: "Open-Meteo forecast API",
      parkFactor: "Baseball Savant Statcast Park Factors",
      bullpen: "MLB Stats API boxscores",
      f5: "Aggregated sportsbook odds feeds when explicit first-five keys/markets are available",
    },
    games,
  };
}
