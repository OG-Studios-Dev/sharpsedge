import {
  buildGoose2CandidateId,
  buildGoose2EventId,
  normalizeBook,
  normalizeDisplayText,
  normalizeNullableToken,
  normalizeToken,
  toDateKey,
  toIsoDate,
} from './goose2-standalone.mjs';

function marketTypeForKey(key) {
  if (key === 'h2h') return 'moneyline';
  if (key === 'spreads') return 'spread';
  if (key === 'totals') return 'total';
  return 'unknown';
}

function inferSide(marketKey, outcomeName, homeTeam, awayTeam) {
  const name = String(outcomeName || '').trim();
  if (marketKey === 'totals') {
    const lower = name.toLowerCase();
    if (lower === 'over' || lower === 'under') return lower;
    return normalizeToken(name) || 'unknown';
  }
  if (name === homeTeam) return normalizeToken(homeTeam);
  if (name === awayTeam) return normalizeToken(awayTeam);
  return normalizeToken(name) || 'unknown';
}

function participantForOutcome(marketKey, outcomeName, homeTeam, awayTeam) {
  if (marketKey === 'totals') {
    return { participantId: null, participantName: null };
  }
  const name = normalizeDisplayText(outcomeName);
  if (!name) return { participantId: null, participantName: null };
  if (name === homeTeam) return { participantId: normalizeNullableToken(homeTeam), participantName: homeTeam };
  if (name === awayTeam) return { participantId: normalizeNullableToken(awayTeam), participantName: awayTeam };
  return { participantId: normalizeNullableToken(name), participantName: name };
}

function makeEventId(event, sport, league, commenceTime, homeTeam, awayTeam) {
  const sourceEventId = normalizeToken(event?.id) || null;
  return buildGoose2EventId({
    sport,
    league,
    awayTeam,
    homeTeam,
    commenceTime,
    source: 'the_odds_api_historical',
    sourceEventId,
  });
}

export function mapTheOddsHistoricalToGoose2(payload, sport) {
  const eventRowsById = new Map();
  const candidateRows = [];
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const snapshotTs = toIsoDate(payload?.timestamp ?? null);

  for (const event of data) {
    const league = normalizeDisplayText(event?.sport_title ?? sport) ?? sport;
    const homeTeam = normalizeDisplayText(event?.home_team) ?? 'Unknown Home';
    const awayTeam = normalizeDisplayText(event?.away_team) ?? 'Unknown Away';
    const commenceTime = toIsoDate(event?.commence_time);
    const eventId = makeEventId(event, sport, league, commenceTime, homeTeam, awayTeam);

    if (!eventRowsById.has(eventId)) {
      eventRowsById.set(eventId, {
        event_id: eventId,
        sport,
        league,
        event_date: toDateKey(commenceTime),
        commence_time: commenceTime,
        home_team: homeTeam,
        away_team: awayTeam,
        home_team_id: normalizeNullableToken(homeTeam),
        away_team_id: normalizeNullableToken(awayTeam),
        event_label: `${awayTeam} @ ${homeTeam}`,
        status: 'scheduled',
        source: 'the_odds_api_historical',
        source_event_id: normalizeToken(event?.id) || eventId,
        odds_api_event_id: event?.id ?? null,
        venue: null,
        metadata: {
          raw_sport_key: event?.sport_key ?? null,
          raw_sport_title: event?.sport_title ?? null,
          historical_snapshot_timestamp: payload?.timestamp ?? null,
          historical_previous_timestamp: payload?.previous_timestamp ?? null,
          historical_next_timestamp: payload?.next_timestamp ?? null,
        },
      });
    }

    for (const bookmaker of event?.bookmakers || []) {
      const bookKey = bookmaker?.key ?? bookmaker?.title ?? 'unknown-book';
      const captureTs = toIsoDate(bookmaker?.last_update ?? snapshotTs ?? commenceTime ?? new Date().toISOString()) ?? new Date().toISOString();
      for (const market of bookmaker?.markets || []) {
        const marketType = marketTypeForKey(market?.key);
        if (marketType === 'unknown') continue;
        for (const outcome of market?.outcomes || []) {
          const odds = Number(outcome?.price);
          if (!Number.isFinite(odds)) continue;
          const line = outcome?.point == null ? null : Number(outcome.point);
          const side = inferSide(market?.key, outcome?.name, homeTeam, awayTeam);
          const participant = participantForOutcome(market?.key, outcome?.name, homeTeam, awayTeam);
          candidateRows.push({
            candidate_id: buildGoose2CandidateId({
              eventId,
              marketType,
              participantId: participant.participantId,
              participantName: participant.participantName,
              side,
              line,
              book: bookKey,
              captureTs,
            }),
            event_id: eventId,
            sport,
            league,
            event_date: toDateKey(commenceTime),
            market_type: marketType,
            submarket_type: normalizeDisplayText(market?.key),
            participant_type: marketType === 'total' ? 'field' : 'team',
            participant_id: participant.participantId,
            participant_name: participant.participantName,
            opponent_id: participant.participantName === homeTeam ? normalizeNullableToken(awayTeam) : participant.participantName === awayTeam ? normalizeNullableToken(homeTeam) : null,
            opponent_name: participant.participantName === homeTeam ? awayTeam : participant.participantName === awayTeam ? homeTeam : null,
            side,
            line: Number.isFinite(line) ? line : null,
            odds,
            book: normalizeBook(bookKey),
            capture_ts: captureTs,
            snapshot_id: null,
            event_snapshot_id: null,
            source: 'the_odds_api_historical',
            source_market_id: `${event?.id ?? eventId}:${bookKey}:${market?.key}:${outcome?.name}`,
            is_best_price: false,
            is_opening: false,
            is_closing: true,
            raw_payload: outcome,
            normalized_payload: {
              market_key: market?.key ?? null,
              bookmaker_key: bookmaker?.key ?? null,
              bookmaker_title: bookmaker?.title ?? null,
              event_id: event?.id ?? null,
              event_commence_time: event?.commence_time ?? null,
            },
          });
        }
      }
    }
  }

  return {
    eventRows: [...eventRowsById.values()],
    candidateRows,
    summary: {
      events: eventRowsById.size,
      candidates: candidateRows.length,
      byMarket: candidateRows.reduce((acc, row) => {
        acc[row.market_type] = (acc[row.market_type] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
}
