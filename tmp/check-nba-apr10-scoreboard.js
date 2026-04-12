async function run(date){
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date.replace(/-/g,'')}`);
  const j = await r.json();
  const games = (j.events || []).map((game) => {
    const competition = game?.competitions?.[0] ?? {};
    const competitors = competition?.competitors ?? [];
    const home = competitors.find((entry) => entry.homeAway === 'home') ?? competitors[0];
    const away = competitors.find((entry) => entry.homeAway === 'away') ?? competitors[1];
    return {
      id: game.id,
      date: game.date,
      away: away?.team?.abbreviation,
      home: home?.team?.abbreviation,
      awayName: away?.team?.displayName,
      homeName: home?.team?.displayName,
    };
  });
  console.log(JSON.stringify(games, null, 2));
}
run('2026-04-10');
