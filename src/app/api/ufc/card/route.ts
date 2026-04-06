import { NextResponse } from "next/server";
import { getUpcomingUFCCard, getRecentUFCCard, enrichFightsWithOdds } from "@/lib/ufc-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    return NextResponse.json({
      card: { date: card.date, event: card.event },
      isUpcoming,
      mainCard: enrichedMain,
      prelims,
      totalFights: card.fights.length,
    });
  } catch (err) {
    console.error("[ufc/card]", err);
    return NextResponse.json({ card: null, mainCard: [], prelims: [], error: "Failed" }, { status: 500 });
  }
}
