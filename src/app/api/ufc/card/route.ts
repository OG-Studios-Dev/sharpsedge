import { NextResponse } from "next/server";
import { getUpcomingUFCCard, getRecentUFCCard, enrichFightsWithOdds, type MMAFightWithOdds } from "@/lib/ufc-api";
import { getUFCFighterRecord } from "@/lib/ufcstats-scraper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Enrich all fighters in a fight card with UFCStats records (best-effort, parallel) */
async function enrichWithRecords(fights: MMAFightWithOdds[]): Promise<MMAFightWithOdds[]> {
  // Collect all unique fighter names
  const allNames = fights.flatMap((f) => [f.fighters.first.name, f.fighters.second.name]);
  const uniqueNames = Array.from(new Set(allNames));

  // Fetch all records in parallel (UFCStats has 10-min cache so repeat calls are free)
  const recordMap = new Map<string, string | null>();
  await Promise.all(
    uniqueNames.map(async (name) => {
      try {
        const rec = await getUFCFighterRecord(name);
        recordMap.set(name, rec ? `${rec.wins}-${rec.losses}-${rec.draws}` : null);
      } catch {
        recordMap.set(name, null);
      }
    })
  );

  return fights.map((fight) => ({
    ...fight,
    fighters: {
      first: { ...fight.fighters.first, record: recordMap.get(fight.fighters.first.name) ?? null },
      second: { ...fight.fighters.second, record: recordMap.get(fight.fighters.second.name) ?? null },
    },
  }));
}

export async function GET() {
  try {
    let card = await getUpcomingUFCCard();
    let isUpcoming = true;

    if (!card) {
      card = await getRecentUFCCard();
      isUpcoming = false;
    }

    if (!card) {
      return NextResponse.json({ card: null, mainCard: [], prelims: [], isUpcoming: false });
    }

    const mainCard = card.fights.filter((f) => f.is_main);
    const prelims = card.fights.filter((f) => !f.is_main);

    const enrichedMain = await enrichFightsWithOdds(mainCard);
    const enrichedPrelims = await enrichFightsWithOdds(prelims);

    // Best-effort: add UFCStats W-L-D records to fighters (falls back gracefully if scraper unavailable)
    const [mainWithRecords, prelimsWithRecords] = await Promise.all([
      enrichWithRecords(enrichedMain),
      enrichWithRecords(enrichedPrelims),
    ]);

    return NextResponse.json({
      card: { date: card.date, event: card.event },
      isUpcoming,
      mainCard: mainWithRecords,
      prelims: prelimsWithRecords,
      totalFights: card.fights.length,
    });
  } catch (err) {
    console.error("[ufc/card]", err);
    return NextResponse.json({ card: null, mainCard: [], prelims: [], error: "Failed" }, { status: 500 });
  }
}
