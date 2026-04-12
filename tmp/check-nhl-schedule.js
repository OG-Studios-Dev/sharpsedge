async function run(date){
  const r = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`);
  const j = await r.json();
  const games = (j.gameWeek || []).flatMap(day => day.games || []).map(g => ({
    id: g.id,
    date: g.startTimeUTC,
    away: g.awayTeam?.abbrev,
    home: g.homeTeam?.abbrev,
  }));
  console.log(date, JSON.stringify(games, null, 2));
}

(async()=>{
  await run('2026-04-10');
  await run('2026-04-11');
  await run('2026-04-12');
})();
