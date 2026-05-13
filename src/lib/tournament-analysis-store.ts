import type { TournamentAnalysisData, TournamentAnalysisRecord } from "@/lib/supabase-types";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function postgrest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Supabase request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message || payload.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

function sanitize(raw: any): TournamentAnalysisRecord | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    tournament_id: String(raw.tournament_id ?? ""),
    league: String(raw.league ?? "PGA"),
    tournament_name: String(raw.tournament_name ?? ""),
    analysis: (raw.analysis && typeof raw.analysis === "object" ? raw.analysis : {}) as TournamentAnalysisData,
    created_at: String(raw.created_at ?? new Date(0).toISOString()),
    updated_at: String(raw.updated_at ?? new Date(0).toISOString()),
  };
}

export async function getTournamentAnalysis(
  tournamentId: string,
  league = "PGA",
): Promise<TournamentAnalysisRecord | null> {
  const rows = await postgrest<any[]>(
    `/rest/v1/tournament_analysis?select=*&tournament_id=eq.${encodeURIComponent(tournamentId)}&league=eq.${encodeURIComponent(league)}&limit=1`,
  );
  return rows?.[0] ? sanitize(rows[0]) : null;
}

export async function upsertTournamentAnalysis(
  tournamentId: string,
  tournamentName: string,
  analysis: TournamentAnalysisData,
  league = "PGA",
): Promise<TournamentAnalysisRecord | null> {
  const rows = await postgrest<any[]>(
    "/rest/v1/tournament_analysis?on_conflict=tournament_id,league",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        tournament_id: tournamentId,
        league,
        tournament_name: tournamentName,
        analysis,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return rows?.[0] ? sanitize(rows[0]) : null;
}
