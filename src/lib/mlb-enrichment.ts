import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBScheduleRange } from "@/lib/mlb-api";
import { buildMLBBullpenFatigueBoard } from "@/lib/mlb-bullpen";
import { buildMLBF5MarketSnapshot } from "@/lib/mlb-f5";
import { getMLBLineupSnapshot } from "@/lib/mlb-lineups";
import { findMLBOddsForGame, getMLBOdds } from "@/lib/mlb-odds";
import { getMLBParkFactor } from "@/lib/mlb-park-factors";
import { getMLBStadiumForGame } from "@/lib/mlb-stadiums";
import { getMLBWeatherForGame } from "@/lib/mlb-weather";

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
