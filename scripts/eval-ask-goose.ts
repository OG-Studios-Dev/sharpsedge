#!/usr/bin/env node
import assert from 'node:assert/strict';
import { answerAskGooseQuestion, type AskGooseRow } from '../src/lib/ask-goose/internal-query';

function row(overrides: Partial<AskGooseRow> & { candidate_id: string }): AskGooseRow {
  return {
    candidate_id: overrides.candidate_id,
    canonical_game_id: overrides.canonical_game_id || overrides.candidate_id,
    event_id: overrides.event_id || overrides.candidate_id,
    league: 'NHL',
    event_date: overrides.event_date || '2026-01-01',
    home_team: overrides.home_team || 'Home Team',
    away_team: overrides.away_team || 'Away Team',
    team_role: overrides.team_role ?? null,
    team_name: overrides.team_name || overrides.home_team || 'Home Team',
    opponent_name: overrides.opponent_name || overrides.away_team || 'Away Team',
    market_type: overrides.market_type || 'total',
    submarket_type: overrides.submarket_type || 'Over/Under',
    market_family: overrides.market_family || overrides.market_type || 'total',
    market_scope: overrides.market_scope || 'game',
    side: overrides.side ?? null,
    line: overrides.line ?? null,
    odds: overrides.odds ?? -110,
    sportsbook: overrides.sportsbook || 'evalbook',
    result: overrides.result || 'win',
    graded: overrides.graded ?? true,
    integrity_status: overrides.integrity_status || 'ok',
    profit_units: overrides.profit_units ?? (overrides.result === 'loss' ? -1 : 0.91),
    profit_dollars_10: overrides.profit_dollars_10 ?? 9.1,
    roi_on_10_flat: overrides.roi_on_10_flat ?? 0.91,
    segment_key: overrides.segment_key ?? null,
    is_home_team_bet: overrides.is_home_team_bet ?? null,
    is_away_team_bet: overrides.is_away_team_bet ?? null,
    is_favorite: overrides.is_favorite ?? false,
    is_underdog: overrides.is_underdog ?? false,
  };
}

const rows = [
  row({ candidate_id: 'under-55', canonical_game_id: 'g1', side: 'under', line: 5.5, result: 'win' }),
  row({ candidate_id: 'under-45', canonical_game_id: 'g2', side: 'under', line: 4.5, result: 'loss' }),
  row({ candidate_id: 'under-65', canonical_game_id: 'g3', side: 'under', line: 6.5, result: 'win' }),
  row({ candidate_id: 'over-55', canonical_game_id: 'g4', side: 'over', line: 5.5, result: 'win' }),
  row({ candidate_id: 'p1-under', canonical_game_id: 'g5', side: 'under', line: 1.5, submarket_type: '1st Period Over/Under', result: 'win' }),
  row({ candidate_id: 'home-dog', canonical_game_id: 'g6', market_type: 'moneyline', market_family: 'moneyline', submarket_type: 'Moneyline', side: 'home', line: null, odds: 150, home_team: 'Ottawa Senators', away_team: 'Carolina Hurricanes', team_name: 'Ottawa Senators', opponent_name: 'Carolina Hurricanes', team_role: 'home', is_home_team_bet: true, is_away_team_bet: false, is_underdog: true, result: 'win', profit_units: 1.5 }),
  row({ candidate_id: 'away-dog', canonical_game_id: 'g7', market_type: 'moneyline', market_family: 'moneyline', submarket_type: 'Moneyline', side: 'away', line: null, odds: 130, home_team: 'Detroit Red Wings', away_team: 'Philadelphia Flyers', team_name: 'Philadelphia Flyers', opponent_name: 'Detroit Red Wings', team_role: 'away', is_home_team_bet: false, is_away_team_bet: true, is_underdog: true, result: 'loss', profit_units: -1 }),
  row({ candidate_id: 'dup-a', canonical_game_id: 'g8', side: 'under', line: 5.5, result: 'win', odds: -120 }),
  row({ candidate_id: 'dup-b', canonical_game_id: 'g8', side: 'under', line: 5.5, result: 'win', odds: -105 }),
];

const refusal = answerAskGooseQuestion('Who is the best hockey player ever', 'NHL', rows);
assert.equal(refusal.sampleSize, 0, 'non-betting questions must refuse');
assert.equal(refusal.intent.looksLikeBettingQuestion, false);

const under55 = answerAskGooseQuestion('NHL full-game under 5.5 record and units', 'NHL', rows);
assert.deepEqual(under55.evidenceRows.map((r) => r.candidate_id).sort(), ['dup-b', 'under-45', 'under-55'].sort(), 'under 5.5 means line <= 5.5 and full-game only');
assert(!under55.evidenceRows.some((r) => r.candidate_id === 'under-65'), 'under 6.5 must be excluded from under 5.5');
assert(!under55.evidenceRows.some((r) => r.candidate_id === 'p1-under'), 'P1 must be excluded from full-game default');

const over55 = answerAskGooseQuestion('NHL full-game over 5.5 record', 'NHL', rows);
assert(over55.evidenceRows.every((r) => r.side === 'over' && Number(r.line) >= 5.5), 'over 5.5 means line >= 5.5');

const homeDogs = answerAskGooseQuestion('NHL home underdogs moneyline record and ROI', 'NHL', rows);
assert.deepEqual(homeDogs.evidenceRows.map((r) => r.candidate_id), ['home-dog'], 'home underdogs must not include away dogs');

console.log(JSON.stringify({ ok: true, cases: 4, summaries: { refusal: refusal.summaryText, under55: under55.summaryText, homeDogs: homeDogs.summaryText } }, null, 2));
