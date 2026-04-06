import { NextResponse } from "next/server";
import { getUpcomingUFCCard, getRecentUFCCard, enrichFightsWithOdds } from "@/lib/ufc-api";
import { generateUFCPicks } from "@/lib/ufc-picks-engine";

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
      return NextResponse.json({ picks: [], card: null, isUpcoming: false, message: "No UFC card in range" });
    }

    const mainCard = card.fights.filter((f) => f.is_main);
    const enriched = await enrichFightsWithOdds(mainCard);
    const picks = generateUFCPicks(enriched, card.event);

    return NextResponse.json({
      picks,
      card: { date: card.date, event: card.event },
      isUpcoming,
      totalMainCardFights: mainCard.length,
      message: picks.length === 0
        ? "No value picks found on this card — waiting for better lines or more edge"
        : null,
    });
  } catch (err) {
    console.error("[ufc/picks]", err);
    return NextResponse.json({ picks: [], error: "Failed to generate UFC picks" }, { status: 500 });
  }
}
