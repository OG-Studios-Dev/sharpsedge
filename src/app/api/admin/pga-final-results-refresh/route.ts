import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SNAPSHOT_PATH = join(process.cwd(), "data/pga/final-results.snapshot.json");

function isAuthorized(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  const scrapeSecret = process.env.SCRAPE_SECRET;
  if (!adminSecret && !scrapeSecret) return true;
  const authHeader = request.headers.get("authorization");
  const xKey = request.headers.get("x-admin-key") || request.headers.get("x-scrape-key");
  if (adminSecret && (authHeader === `Bearer ${adminSecret}` || xKey === adminSecret)) return true;
  if (scrapeSecret && (authHeader === `Bearer ${scrapeSecret}` || xKey === scrapeSecret)) return true;
  return false;
}

function parsePlacementsFromHtml(html: string) {
  const rows: Record<string, number> = {};
  const pattern = /(?:^|>)(T?\d+|CUT)\s*<a[^>]*\/player\/[^>]*>([^<]+)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const rawPos = match[1];
    const name = match[2].replace(/\s+/g, " ").trim();
    if (!name) continue;
    rows[name] = rawPos === "CUT" ? 999 : Number(String(rawPos).replace(/^T/, ""));
  }
  return rows;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { url?: string; eventDate?: string; tournament?: string };
    const url = body.url;
    const eventDate = body.eventDate;
    const tournament = body.tournament;

    if (!url || !eventDate || !tournament) {
      return NextResponse.json({ error: "url, eventDate, and tournament are required" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Goosalytics/1.0; +https://goosalytics.vercel.app)" },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Fetch failed: ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const placements = parsePlacementsFromHtml(html);
    if (Object.keys(placements).length === 0) {
      return NextResponse.json({ error: "No placements parsed from source page" }, { status: 422 });
    }

    let existing: any = { _meta: { kind: "pga-final-results-snapshot", version: "1.0" }, events: {} };
    try {
      existing = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(SNAPSHOT_PATH, "utf8")));
    } catch {}

    existing._meta = {
      ...(existing._meta || {}),
      bundledAt: new Date().toISOString(),
      generatedBy: "POST /api/admin/pga-final-results-refresh",
      sourceStrategy: "Historical PGA tournament final placements bundled for settlement fallback when live ESPN scoreboard has already rolled to the next event.",
    };
    existing.events = existing.events || {};
    existing.events[eventDate] = { tournament, source: url, placements };

    writeFileSync(SNAPSHOT_PATH, JSON.stringify(existing, null, 2), "utf8");

    return NextResponse.json({
      success: true,
      eventDate,
      tournament,
      placements: Object.keys(placements).length,
      path: "data/pga/final-results.snapshot.json",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
