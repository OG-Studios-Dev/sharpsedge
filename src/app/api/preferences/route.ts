import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { UserPreferenceRecord } from "@/lib/supabase-types";

export const dynamic = "force-dynamic";

const VALID_LEAGUES: UserPreferenceRecord["default_league"][] = ["All", "NHL", "NBA", "NFL", "MLB", "PGA"];

function normalizeDefaultLeague(value: unknown): UserPreferenceRecord["default_league"] | null {
  return typeof value === "string" && VALID_LEAGUES.includes(value as UserPreferenceRecord["default_league"])
    ? value as UserPreferenceRecord["default_league"]
    : null;
}

export async function GET() {
  try {
    const supabase = createServerClient();
    const user = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ preferences: null, error: "Unauthorized" }, { status: 401 });

    const preferences = await supabase.preferences.ensureForUser(user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json(
      { preferences: null, error: error instanceof Error ? error.message : "Failed to load preferences" },
      { status: String(error).includes("Unauthorized") ? 401 : 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const defaultLeague = normalizeDefaultLeague(body?.default_league);
    if (!defaultLeague) {
      return NextResponse.json({ preferences: null, error: "Invalid default league" }, { status: 400 });
    }

    const supabase = createServerClient();
    const user = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ preferences: null, error: "Unauthorized" }, { status: 401 });

    const preferences = await supabase.preferences.upsert({
      user_id: user.id,
      default_league: defaultLeague,
    });
    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json(
      { preferences: null, error: error instanceof Error ? error.message : "Failed to save preferences" },
      { status: String(error).includes("Unauthorized") ? 401 : 500 },
    );
  }
}
