function normalizeTeam(value) {
  return String(value ?? '').trim().toUpperCase();
}
function toTitleDateHourKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13);
}
function parseSnapshotGameKey(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^NHL:([A-Z]{2,4})@([A-Z]{2,4}):(\d{4}-\d{2}-\d{2})T(\d{2})$/);
  if (!match) return null;
  return { away: match[1], home: match[2], date: match[3], hourKey: `${match[3]}T${match[4]}` };
}
function getAdjacentDateKeys(dateKey) {
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return [dateKey];
  return [-1,0,1].map((offset) => {
    const next = new Date(parsed);
    next.setUTCDate(parsed.getUTCDate() + offset);
    return next.toISOString().slice(0,10);
  });
}
async function fetchBoard(dateKey){
  const r = await fetch(`https://api-web.nhle.com/v1/schedule/${dateKey}`);
  return r.json();
}
async function run(event){
  const boardDate = String(event.event_date || '').trim();
  const snapshotKey = parseSnapshotGameKey(event.metadata?.snapshot_game_id);
  const away = normalizeTeam(snapshotKey?.away || event.away_team_id || event.away_team);
  const home = normalizeTeam(snapshotKey?.home || event.home_team_id || event.home_team);
  const eventHourKey = snapshotKey?.hourKey || toTitleDateHourKey(event.commence_time);
  const dateKeys = getAdjacentDateKeys(snapshotKey?.date || boardDate);
  const boards = await Promise.all(dateKeys.map(fetchBoard));
  const matches = boards.flatMap((board, index) =>
    (board?.gameWeek ?? []).flatMap((day) =>
      (day?.games ?? []).map((game) => ({ game, requestDate: dateKeys[index] }))
    )
  ).filter(({ game }) => {
    const gameDate = String(game?.startTimeUTC || '').slice(0, 10);
    return gameDate === boardDate
      && normalizeTeam(game?.awayTeam?.abbrev) === away
      && normalizeTeam(game?.homeTeam?.abbrev) === home;
  });
  console.log(JSON.stringify({ event, snapshotKey, away, home, eventHourKey, dateKeys, matchCount: matches.length, matches: matches.map(m => ({ id: m.game.id, start: m.game.startTimeUTC, away: m.game.awayTeam?.abbrev, home: m.game.homeTeam?.abbrev, requestDate: m.requestDate, hourKey: toTitleDateHourKey(m.game.startTimeUTC) })) }, null, 2));
}
(async()=>{
  const events = [
    { event_date:'2026-04-11', commence_time:'2026-04-11T21:00:00+00:00', away_team_id:'STL', home_team_id:'CHI', metadata:{ snapshot_game_id:'NHL:STL@CHI:2026-04-11T21' } },
    { event_date:'2026-04-11', commence_time:'2026-04-11T23:00:00+00:00', away_team_id:'FLA', home_team_id:'TOR', metadata:{ snapshot_game_id:'NHL:FLA@TOR:2026-04-11T23' } },
    { event_date:'2026-04-11', commence_time:'2026-04-11T23:00:00+00:00', away_team_id:'CGY', home_team_id:'SEA', metadata:{ snapshot_game_id:'NHL:CGY@SEA:2026-04-11T23' } },
  ];
  for (const event of events) await run(event);
})();
