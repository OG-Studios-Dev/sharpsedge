import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const SPLITS_DIR = path.join(process.cwd(), 'data', 'betting-splits');
const chunkSize = Number(process.env.SPLITS_UPSERT_CHUNK_SIZE || 500);

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function leagueForSport(sport) {
  return String(sport || '').toUpperCase();
}

function rowId(game, split) {
  return [
    split.sport || game.sport,
    split.gameDate || game.gameDate,
    game.gameId || split.actionNetworkGameId || 'no-game-id',
    split.source || 'unknown-source',
    split.marketType || 'unknown-market',
    split.side || 'unknown-side',
    split.snapshotAt || game.snapshotAt || 'unknown-snapshot',
  ].join(':').replace(/[^A-Za-z0-9:_-]/g, '-');
}

function normalizeRowsFromFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const board = raw.board ?? raw;
  const rows = [];
  for (const game of board.games ?? []) {
    for (const split of game.splits ?? []) {
      const sport = String(split.sport || game.sport || board.sport || '').toUpperCase();
      if (!sport) continue;
      rows.push({
        id: rowId(game, split),
        sport,
        league: leagueForSport(sport),
        game_date: split.gameDate || game.gameDate || board.gameDate,
        action_network_game_id: split.actionNetworkGameId || game.gameId || null,
        matchup: split.matchup || game.matchup || null,
        home_team_abbrev: split.homeTeam || game.homeTeam || null,
        away_team_abbrev: split.awayTeam || game.awayTeam || null,
        home_team_name: game.homeTeamFull || null,
        away_team_name: game.awayTeamFull || null,
        market_type: split.marketType,
        side: split.side,
        side_label: split.sideLabel || null,
        bets_percent: split.betsPercent,
        handle_percent: split.handlePercent,
        line: split.line,
        source: split.source,
        source_role: split.sourceRole || null,
        is_primary: Boolean(split.isPrimary),
        effective_source: game.effectiveSource || null,
        using_primary: game.usingPrimary ?? null,
        ml_splits_available: game.mlSplitsAvailable ?? null,
        spread_splits_available: game.spreadSplitsAvailable ?? null,
        total_splits_available: game.totalSplitsAvailable ?? null,
        comparison_available: game.comparisonAvailable ?? null,
        covers_supplement: game.coversSupplement ?? null,
        snapshot_at: split.snapshotAt || game.snapshotAt || board.snapshotAt || raw.lastCapturedAt,
      });
    }
  }
  return rows;
}

async function upsertRows(rows) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/public_betting_splits_v1?on_conflict=id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(chunk),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Upsert failed ${response.status}: ${text.slice(0, 500)}`);
    }
    upserted += chunk.length;
  }
  return upserted;
}

async function main() {
  const argFiles = process.argv.slice(2);
  const files = argFiles.length
    ? argFiles
    : fs.existsSync(SPLITS_DIR)
      ? fs.readdirSync(SPLITS_DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(SPLITS_DIR, f)).sort()
      : [];

  if (!files.length) {
    console.log(JSON.stringify({ ok: true, files: 0, rows: 0, note: 'No local betting-splits JSON files found.' }, null, 2));
    return;
  }

  const rows = files.flatMap((file) => normalizeRowsFromFile(file));
  const upserted = rows.length ? await upsertRows(rows) : 0;
  const byLeague = rows.reduce((acc, row) => {
    acc[row.league] = (acc[row.league] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ ok: true, files: files.length, rows: rows.length, upserted, byLeague }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
