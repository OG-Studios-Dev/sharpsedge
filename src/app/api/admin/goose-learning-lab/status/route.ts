import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

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
      const payload = await response.json() as { message?: string; error?: string; details?: string };
      message = payload.message || payload.error || payload.details || message;
    } catch {
      // ignore malformed payloads
    }
    throw new Error(message);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lab = searchParams.get("lab") || "goose-shadow-lab";
    const rows = await postgrest<any[]>(`/rest/v1/goose_learning_lab_status_v1?lab_slug=eq.${encodeURIComponent(lab)}&select=*&limit=1`);
    const status = rows?.[0] ?? null;

    if (!status) {
      return NextResponse.json({ ok: false, error: "Learning lab not found" }, { status: 404 });
    }

    const blockers = Array.isArray(status.blockers) ? status.blockers : [];
    return NextResponse.json({
      ok: true,
      lab,
      status,
      message: status.ready_to_record
        ? "Learning lab says it has enough context to begin recording shadow picks."
        : `Learning lab is still studying. Blockers: ${blockers.join("; ") || "unknown"}`,
    });
  } catch (error) {
    console.error("[goose-learning-lab/status] failed", error);
    return NextResponse.json({ ok: false, error: toErrorMessage(error, "Failed to load learning lab status") }, { status: 500 });
  }
}
