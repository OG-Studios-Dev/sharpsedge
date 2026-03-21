import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBScheduleRange } from "@/lib/mlb-api";
import { getMLBLineupSnapshot } from "@/lib/mlb-lineups";
import { getMLBParkFactor } from "@/lib/mlb-park-factors";
import { getMLBStadiumForGame } from "@/lib/mlb-stadiums";
import { getMLBWeatherForGame } from "@/lib/mlb-weather";

export async function getMLBEnrichmentBoard(date = getDateKey(new Date(), MLB_TIME_ZONE)) {
  const schedule = await getMLBScheduleRange(date, date);

  const games = await Promise.all(schedule.map(async (game) => {
    const [lineups, weather] = await Promise.all([
      getMLBLineupSnapshot(game),
      getMLBWeatherForGame(game),
    ]);

    const parkFactor = getMLBParkFactor(game.homeTeam.abbreviation);
    const mappedVenue = getMLBStadiumForGame(game);

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
        },
        home: {
          abbreviation: game.homeTeam.abbreviation,
          fullName: game.homeTeam.fullName,
          probablePitcher: game.homeTeam.probablePitcher ?? null,
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
      f5: "Not supported in this foundation pass.",
    },
    sources: {
      schedule: "MLB Stats API schedule",
      lineups: "MLB Stats API live feed",
      weather: "Open-Meteo forecast API",
      parkFactor: "Baseball Savant Statcast Park Factors",
    },
    games,
  };
}
