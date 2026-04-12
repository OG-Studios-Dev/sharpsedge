async function run(date){
  const r = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`);
  const j = await r.json();
  const games = (j.gameWeek || []).flatMap(day => day.games || []).map(g => ({
    id: g.id,
    date: g.startTimeUTC,
    away: g.awayTeam?.abbrev,
    home: g.homeTeam?.abbrev,
  }));
  console.log(JSON.stringify(games.filter(g => String(g.date).slice(0,10) === date), null, 2));
}
run('2026-04-09');
