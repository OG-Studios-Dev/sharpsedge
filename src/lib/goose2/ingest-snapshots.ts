import type { AggregatedOdds } from "@/lib/books/types";
import { buildGoose2CandidateId, buildGoose2EventId } from "@/lib/goose2/ids";
import { inferGoose2MarketType, expandBookOddsToCandidateMarkets } from "@/lib/goose2/taxonomy";
import type { Goose2MarketCandidate, Goose2MarketEvent } from "@/lib/goose2/types";

export function mapAggregatedOddsToGoose2EventsAndCandidates(input: {
  league?: string | null;
  source: string;
  snapshotId?: string | null;
  capturedAt?: string | null;
  events: AggregatedOdds[];
}) {
  const eventRows: Goose2MarketEvent[] = [];
  const candidateRows: Goose2MarketCandidate[] = [];

  for (const event of input.events) {
    const eventId = buildGoose2EventId({
      sport: event.sport,
      league: input.league ?? event.sport,
      awayTeam: event.awayTeam,
      homeTeam: event.homeTeam,
      commenceTime: event.commenceTime,
      source: input.source,
      sourceEventId: event.oddsApiEventId ?? event.gameId,
    });

    eventRows.push({
      event_id: eventId,
      sport: event.sport,
      league: input.league ?? event.sport,
      event_date: (event.commenceTime ?? input.capturedAt ?? new Date().toISOString()).slice(0, 10),
      commence_time: event.commenceTime ?? null,
      home_team: event.homeTeam,
      away_team: event.awayTeam,
      home_team_id: event.homeAbbrev,
      away_team_id: event.awayAbbrev,
      event_label: `${event.awayTeam} @ ${event.homeTeam}`,
      status: "scheduled",
      source: input.source,
      source_event_id: event.gameId,
      odds_api_event_id: event.oddsApiEventId ?? null,
      venue: null,
      metadata: {
        gameId: event.gameId,
        homeAbbrev: event.homeAbbrev,
        awayAbbrev: event.awayAbbrev,
      },
    });

    for (const book of event.books) {
      const marketRows = expandBookOddsToCandidateMarkets(book);
      for (const market of marketRows) {
        const marketType = inferGoose2MarketType({ marketType: market.marketType, sport: event.sport });
        const participantName = market.side === "home" ? event.homeTeam : market.side === "away" ? event.awayTeam : null;
        const opponentName = market.side === "home" ? event.awayTeam : market.side === "away" ? event.homeTeam : null;
        const participantId = market.side === "home" ? event.homeAbbrev : market.side === "away" ? event.awayAbbrev : null;
        const opponentId = market.side === "home" ? event.awayAbbrev : market.side === "away" ? event.homeAbbrev : null;
        const captureTs = input.capturedAt ?? book.lastUpdated ?? new Date().toISOString();

        candidateRows.push({
          candidate_id: buildGoose2CandidateId({
            eventId,
            marketType,
            participantId,
            participantName,
            side: market.side,
            line: market.line,
            book: book.book,
            captureTs,
          }),
          event_id: eventId,
          sport: event.sport,
          league: input.league ?? event.sport,
          event_date: (event.commenceTime ?? captureTs).slice(0, 10),
          market_type: marketType,
          submarket_type: null,
          participant_type: "team",
          participant_id: participantId,
          participant_name: participantName,
          opponent_id: opponentId,
          opponent_name: opponentName,
          side: market.side,
          line: market.line ?? null,
          odds: market.odds as number,
          book: book.book,
          sportsbook: book.book,
          capture_ts: captureTs,
          snapshot_id: input.snapshotId ?? null,
          event_snapshot_id: null,
          source: input.source,
          source_market_id: null,
          is_best_price: false,
          is_opening: false,
          is_closing: false,
          raw_payload: {
            event,
            book,
            market,
          },
          normalized_payload: {
            homeTeam: event.homeTeam,
            awayTeam: event.awayTeam,
            homeAbbrev: event.homeAbbrev,
            awayAbbrev: event.awayAbbrev,
            marketType,
          },
        });
      }
    }
  }

  return {
    eventRows,
    candidateRows,
  };
}
