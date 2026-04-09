#!/usr/bin/env node

const base = 'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1';
const leagueId = process.argv[2] ?? '87637';
const categoryIds = process.argv.slice(3).length
  ? process.argv.slice(3).map((value) => Number(value))
  : [1031, 1028, 1030, 743, 1032, 577, 1140, 1035, 1034, 1033];

for (const categoryId of categoryIds) {
  const url = `${base}/leagues/${leagueId}/categories/${categoryId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        accept: 'application/json,text/plain,*/*',
      },
    });
    if (!res.ok) {
      console.log(JSON.stringify({ categoryId, status: res.status }, null, 2));
      continue;
    }
    const json = await res.json();
    const usedSubcats = [...new Set((json.markets ?? []).map((market) => market.subcategoryId))];
    const subcatNames = (json.subcategories ?? [])
      .filter((subcategory) => usedSubcats.includes(subcategory.id))
      .map((subcategory) => ({ id: subcategory.id, name: subcategory.name }));
    console.log(JSON.stringify({
      categoryId,
      categoryName: (json.categories ?? []).find((category) => Number(category.id) === categoryId)?.name ?? null,
      eventCount: json.events?.length ?? 0,
      marketCount: json.markets?.length ?? 0,
      usedSubcats,
      subcatNames,
      sampleMarketNames: [...new Set((json.markets ?? []).map((market) => market.name))].slice(0, 12),
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ categoryId, error: error.message }, null, 2));
  }
}
