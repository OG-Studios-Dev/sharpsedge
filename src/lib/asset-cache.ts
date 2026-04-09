/**
 * asset-cache.ts
 * Resolves player headshots and team logos — DB first, ESPN CDN fallback.
 * DB is populated by /api/admin/seed-assets (runs as cron + on-demand).
 */

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./supabase-shared";
import { getTeamLogoUrl } from "./visual-identity";

// ─── REST helpers ─────────────────────────────────────────────────────────────

function serviceHeaders(): HeadersInit {
  return {
    "apikey": getSupabaseServiceRoleKey(),
    "Authorization": `Bearer ${getSupabaseServiceRoleKey()}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

async function pgGet<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${getSupabaseUrl()}${path}`, {
      headers: serviceHeaders(),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const data = await r.json();
    return Array.isArray(data) ? (data[0] ?? null) : data;
  } catch {
    return null;
  }
}

async function pgUpsert(rows: object[]): Promise<number> {
  if (!rows.length) return 0;
  const r = await fetch(`${getSupabaseUrl()}/rest/v1/player_assets`, {
    method: "POST",
    headers: {
      ...serviceHeaders() as Record<string, string>,
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase upsert failed: ${r.status} — ${text}`);
  }
  return rows.length;
}

// ─── In-memory per-deploy cache ───────────────────────────────────────────────
const _memCache = new Map<string, string | null>();

export async function getPlayerHeadshotCached(
  sport: string,
  playerId: string | number,
  cdnFallback: string | null
): Promise<string | null> {
  const key = `${sport.toUpperCase()}:${playerId}`;
  if (_memCache.has(key)) return _memCache.get(key)!;

  const row = await pgGet<{ headshot_url?: string }>(
    `/rest/v1/player_assets?id=eq.${encodeURIComponent(key)}&select=headshot_url&limit=1`
  );
  const url = row?.headshot_url || cdnFallback;
  _memCache.set(key, url ?? null);
  return url ?? null;
}

export async function getTeamLogoCached(
  sport: string,
  teamAbbrev: string
): Promise<string | null> {
  const key = `${sport.toUpperCase()}:team:${teamAbbrev.toUpperCase()}`;
  if (_memCache.has(key)) return _memCache.get(key)!;

  const row = await pgGet<{ logo_url?: string }>(
    `/rest/v1/player_assets?id=eq.${encodeURIComponent(key)}&select=logo_url&limit=1`
  );
  const url = row?.logo_url || getTeamLogoUrl(sport, teamAbbrev);
  _memCache.set(key, url ?? null);
  return url ?? null;
}

// ─── Seeding helpers ──────────────────────────────────────────────────────────

export type AssetRow = {
  id: string;
  sport: string;
  asset_type: string;
  player_id?: string;
  team_abbrev?: string;
  name?: string;
  headshot_url?: string;
  logo_url?: string;
  updated_at?: string;
};

export async function upsertAssets(rows: AssetRow[]): Promise<number> {
  const withTs = rows.map(r => ({ ...r, updated_at: new Date().toISOString() }));
  return pgUpsert(withTs);
}

/** Verify a URL is reachable (HEAD request, 200 only) */
export async function verifyUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Build CDN headshot URL for a given sport + player ID */
export function espnHeadshotUrl(sport: string, id: string): string | null {
  const s = sport.toUpperCase();
  if (s === "NHL") return `https://assets.nhle.com/mugs/nhl/latest/${id}.png`;
  if (s === "NBA") return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
  if (s === "MLB") return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`;
  if (s === "PGA") return `https://pga-tour-res.cloudinary.com/image/upload/c_thumb,g_face,w_280,h_350,z_0.7/headshots_${id}.jpg`;
  if (s === "NFL") return `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
  return null;
}
