import { buildGoose2CandidateId, buildGoose2EventId } from './ids.ts';
import { inferGoose2MarketType } from './taxonomy.ts';
import { normalizeBook, normalizeDisplayText, normalizeNullableToken, normalizeToken, toDateKey, toIsoDate } from './normalizers.ts';
import type { Goose2MarketCandidate, Goose2MarketEvent } from './types.ts';

function teamName(teams: Record<string, any> | null | undefined, teamId: string | null | undefined) {
  const team = teamId && teams ? teams[teamId] : null;
  return normalizeDisplayText(team?.names?.medium ?? team?.names?.short ?? team?.name ?? teamId ?? null);
}

function eventStatus(status: any): Goose2MarketEvent['status'] {
  if (status?.cancelled) return 'cancelled';
  if (status?.finalized || status?.completed || status?.ended || status?.displayShort === 'F') return 'final';
  if (status?.started || status?.live) return 'in_progress';
  return 'scheduled';
}

function participantTypeForOdd(odd: any): Goose2MarketCandidate['participant_type'] {
  if (odd?.playerID || odd?.statEntityID?.includes?.('_')) return 'player';
  return 'team';
}

function marketTypeForOdd(sport: string, odd: any): Goose2MarketCandidate['market_type'] {
  if (odd?.betTypeID === 'ml') return odd?.periodID === '1st5' || odd?.periodID === 'first5' ? 'first_five_moneyline' : 'moneyline';
  if (odd?.betTypeID === 'sp') return odd?.periodID === '1q' ? 'first_quarter_spread' : odd?.periodID === '3q' ? 'third_quarter_spread' : 'spread';
  if (odd?.betTypeID === 'ou') {
    const stat = normalizeToken(odd?.statID);
    const period = normalizeToken(odd?.periodID);
    const isTeamTotal = stat === 'points' && odd?.statEntityID && !String(odd.statEntityID).includes('_') && ['home', 'away'].includes(String(odd.statEntityID).toLowerCase());
    if (period === '1st5' || period === 'first5') return 'first_five_total';
    if (isTeamTotal || stat === 'points') return 'total';
    return inferGoose2MarketType({ sport, marketType: odd?.marketName ?? odd?.oddID ?? 'unknown', propType: odd?.marketName ?? odd?.statID ?? undefined });
  }
  return inferGoose2MarketType({ sport, marketType: odd?.marketName ?? odd?.oddID ?? 'unknown', propType: odd?.marketName ?? odd?.statID ?? undefined });
}

function sideForOdd(odd: any, homeName: string | null, awayName: string | null) {
  if (odd?.sideID) return normalizeToken(odd.sideID);
  const entity = String(odd?.statEntityID ?? '').toLowerCase();
  if (entity === 'home') return normalizeToken(homeName);
  if (entity === 'away') return normalizeToken(awayName);
  return 'unknown';
}

function participantForOdd(odd: any, homeName: string | null, awayName: string | null) {
  if (odd?.playerID) return { participantId: String(odd.playerID), participantName: normalizeDisplayText(odd.marketName?.replace(/\s+over\/under$/i, '') ?? odd.playerID) };
  const entity = String(odd?.statEntityID ?? '').toLowerCase();
  if (entity === 'home') return { participantId: normalizeNullableToken(homeName), participantName: homeName };
  if (entity === 'away') return { participantId: normalizeNullableToken(awayName), participantName: awayName };
  return { participantId: normalizeNullableToken(odd?.statEntityID), participantName: normalizeDisplayText(odd?.statEntityID) };
}

function lineForOdd(odd: any) {
  const raw = odd?.bookOverUnder ?? odd?.fairOverUnder ?? odd?.line ?? null;
  const parsed = raw == null ? null : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function oddsValue(odd: any) {
  const raw = odd?.closeBookOdds ?? odd?.bookOdds ?? odd?.openBookOdds ?? odd?.fairOdds ?? null;
  const parsed = raw == null ? null : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapSportsGameOddsToGoose2(payload: any, sport: string) {
  const eventRowsById = new Map<string, Goose2MarketEvent>();
  const candidateRows: Goose2MarketCandidate[] = [];
  const events = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

  for (const event of events) {
    const league = normalizeDisplayText(event?.leagueID ?? sport) ?? sport;
    const homeName = teamName(event?.teams, event?.homeTeamID);
    const awayName = teamName(event?.teams, event?.awayTeamID);
    const commenceTime = toIsoDate(event?.status?.startsAt ?? event?.startsAt ?? null);
    const eventId = buildGoose2EventId({
      sport,
      league,
      awayTeam: awayName,
      homeTeam: homeName,
      commenceTime,
      source: 'sportsgameodds',
      sourceEventId: event?.eventID ?? null,
    });

    if (!eventRowsById.has(eventId)) {
      eventRowsById.set(eventId, {
        event_id: eventId,
        sport,
        league,
        event_date: toDateKey(commenceTime),
        commence_time: commenceTime,
        home_team: homeName,
        away_team: awayName,
        home_team_id: normalizeNullableToken(event?.homeTeamID),
        away_team_id: normalizeNullableToken(event?.awayTeamID),
        event_label: [awayName, homeName].filter(Boolean).join(' @ ') || String(event?.eventID ?? 'Unknown Event'),
        status: eventStatus(event?.status),
        source: 'sportsgameodds',
        source_event_id: String(event?.eventID ?? ''),
        odds_api_event_id: null,
        venue: normalizeDisplayText(event?.venue ?? null),
        metadata: {
          rawLeagueID: event?.leagueID ?? null,
          status: event?.status ?? null,
          teams: event?.teams ?? null,
        },
      });
    }

    const oddsEntries = event?.odds && typeof event.odds === 'object' ? Object.entries(event.odds) : [];
    for (const [oddId, odd] of oddsEntries) {
      const marketType = marketTypeForOdd(sport, odd);
      const odds = oddsValue(odd);
      if (odds == null) continue;
      const participant = participantForOdd(odd, homeName, awayName);
      const bookEntries = odd?.byBookmaker && typeof odd.byBookmaker === 'object'
        ? Object.entries(odd.byBookmaker)
        : [['sportsgameodds', { odds: odd?.bookOdds ?? odd?.closeBookOdds ?? odds, lastUpdatedAt: event?.status?.startsAt ?? null }]];

      for (const [bookKey, bookData] of bookEntries) {
        const captureTs = toIsoDate(bookData?.lastUpdatedAt ?? event?.status?.startsAt ?? new Date().toISOString()) ?? new Date().toISOString();
        const bookOddsRaw = bookData?.odds ?? odd?.bookOdds ?? odd?.closeBookOdds ?? odds;
        const bookOdds = Number(bookOddsRaw);
        if (!Number.isFinite(bookOdds)) continue;
        const side = sideForOdd(odd, homeName, awayName);
        const line = lineForOdd(odd);
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
          submarket_type: normalizeDisplayText(odd?.marketName ?? oddId),
          participant_type: participantTypeForOdd(odd),
          participant_id: participant.participantId,
          participant_name: participant.participantName,
          opponent_id: side === normalizeToken(homeName) ? normalizeNullableToken(awayName) : side === normalizeToken(awayName) ? normalizeNullableToken(homeName) : null,
          opponent_name: side === normalizeToken(homeName) ? awayName : side === normalizeToken(awayName) ? homeName : null,
          side,
          line,
          odds: bookOdds,
          book: normalizeBook(bookKey),
          capture_ts: captureTs,
          snapshot_id: null,
          event_snapshot_id: null,
          source: 'sportsgameodds_historical',
          source_market_id: String(oddId),
          is_best_price: false,
          is_opening: false,
          is_closing: true,
          raw_payload: odd,
          normalized_payload: {
            eventID: event?.eventID ?? null,
            oddID: oddId,
            marketName: odd?.marketName ?? null,
            statID: odd?.statID ?? null,
            periodID: odd?.periodID ?? null,
            betTypeID: odd?.betTypeID ?? null,
            sideID: odd?.sideID ?? null,
            score: odd?.score ?? null,
          },
        });
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
      }, {} as Record<string, number>),
    },
  };
}
