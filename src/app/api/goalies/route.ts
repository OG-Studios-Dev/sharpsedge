import { NextResponse } from "next/server";
import { getGameGoalies } from "@/lib/nhl-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
  const data = await getGameGoalies(Number(gameId));
  return NextResponse.json(data);
}
