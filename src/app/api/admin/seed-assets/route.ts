/**
 * POST /api/admin/seed-assets
 * Seeds player_assets table from active pick_history player IDs + all team logos.
 * GET  /api/admin/seed-assets — returns current row counts.
 * Safe to call repeatedly — uses upsert.
 * Cron: every Monday 6 AM UTC (vercel.json)
 */

import { NextResponse } from "next/server";
import { upsertAssets, verifyUrl, espnHeadshotUrl, type AssetRow } from "@/lib/asset-cache";
import { getTeamLogoUrl } from "@/lib/visual-identity";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";

const NHL_TEAMS = [
  "ANA","ARI","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL",
  "DET","EDM","FLA","LAK","MIN","MTL","NJD","NSH","NYI","NYR",
  "OTT","PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH",
];
const NBA_TEAMS = [
  "ATL","BOS","BKN","CHA","CHI","CLE","DAL","DEN","DET","GSW",
  "HOU","IND","LAC","LAL","MEM","MIA","MIL","MIN","NOP","NYK",
  "OKC","ORL","PHI","PHX","POR","SAC","SAS","TOR","UTA","WAS",
];
const MLB_TEAMS = [
  "ARI","ATL","BAL","BOS","CHC","CHW","CIN","CLE","COL","DET",
  "HOU","KCR","LAA","LAD","MIA","MIL","MIN","NYM","NYY","OAK",
  "PHI","PIT","SDP","SEA","SFG","STL","TBR","TEX","TOR","WSN",
];

export async function POST() {
  const results = { teams: 0, players: 0, errors: [] as string[] };

  // ─── 1. Team logos ───────────────────────────────────────────────────────
  const teamRows: AssetRow[] = [];
  for (const [sport, teams] of [
    ["NHL", NHL_TEAMS],
    ["NBA", NBA_TEAMS],
    ["MLB", MLB_TEAMS],
  ] as [string, string[]][]) {
    for (const abbrev of teams) {
      const url = getTeamLogoUrl(sport, abbrev);
      if (!url) continue;
      teamRows.push({
        id: `${sport}:team:${abbrev}`,
        sport,
        asset_type: "team",
        team_abbrev: abbrev,
        logo_url: url,
      });
    }
  }
  try {
    results.teams = await upsertAssets(teamRows);
  } catch (e: any) {
    results.errors.push(`teams: ${e.message}`);
  }

  // ─── 2. Player headshots from pick_history ───────────────────────────────
  try {
    const key = getSupabaseServiceRoleKey();
    const url = getSupabaseUrl();
    const r = await fetch(
      `${url}/rest/v1/pick_history?select=league,pick_snapshot&limit=2000`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );
    const picks: any[] = r.ok ? await r.json() : [];

    const seen = new Set<string>();
    const playerRows: AssetRow[] = [];

    for (const row of picks) {
      const snap = row.pick_snapshot as any;
      const league: string = (row.league || snap?.league || "").toUpperCase();
      const playerId = snap?.playerId || snap?.factors?.playerId;
      const name = snap?.playerName || snap?.player_name;

      if (!playerId || !league) continue;
      const assetKey = `${league}:${String(playerId)}`;
      if (seen.has(assetKey)) continue;
      seen.add(assetKey);

      const cdnUrl = espnHeadshotUrl(league, String(playerId));
      if (!cdnUrl) continue;

      // Verify reachability — skip broken CDN URLs
      const ok = await verifyUrl(cdnUrl);
      if (!ok) continue;

      playerRows.push({
        id: assetKey,
        sport: league,
        asset_type: "player",
        player_id: String(playerId),
        name: name || undefined,
        headshot_url: cdnUrl,
      });
    }

    if (playerRows.length) {
      results.players = await upsertAssets(playerRows);
    }
  } catch (e: any) {
    results.errors.push(`players: ${e.message}`);
  }

  return NextResponse.json({ ok: true, ...results });
}

export async function GET() {
  try {
    const key = getSupabaseServiceRoleKey();
    const url = getSupabaseUrl();
    const headers = { apikey: key, Authorization: `Bearer ${key}` };

    const [tr, pr] = await Promise.all([
      fetch(`${url}/rest/v1/player_assets?asset_type=eq.team&select=id`, {
        method: "HEAD",
        headers: { ...headers, Prefer: "count=exact" },
        cache: "no-store",
      }),
      fetch(`${url}/rest/v1/player_assets?asset_type=eq.player&select=id`, {
        method: "HEAD",
        headers: { ...headers, Prefer: "count=exact" },
        cache: "no-store",
      }),
    ]);

    const teamCount = parseInt(tr.headers.get("content-range")?.split("/")[1] ?? "0");
    const playerCount = parseInt(pr.headers.get("content-range")?.split("/")[1] ?? "0");

    return NextResponse.json({ teams: teamCount, players: playerCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
