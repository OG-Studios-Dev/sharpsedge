import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
import type {
  Goose2DecisionLog,
  Goose2FeatureRow,
  Goose2MarketCandidate,
  Goose2MarketEvent,
  Goose2MarketResult,
} from "@/lib/goose2/types";

function serviceHeaders(prefer?: string) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function postgrestUrl(path: string) {
  return `${getSupabaseUrl()}/rest/v1${path}`;
}

async function goose2Fetch(path: string, init: RequestInit = {}) {
  const response = await fetch(postgrestUrl(path), {
    ...init,
    headers: {
      ...serviceHeaders(init.method === "POST" ? "resolution=merge-duplicates,return=minimal" : undefined),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Goose2 repository error ${response.status}: ${text.slice(0, 300)}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export async function upsertGoose2Events(rows: Goose2MarketEvent[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_market_events?on_conflict=event_id", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2Candidates(rows: Goose2MarketCandidate[]) {
  if (!rows.length) return;
  const sanitizedRows = rows.map(({ sportsbook: _sportsbook, ...row }) => row);
  await goose2Fetch("/goose_market_candidates?on_conflict=candidate_id", {
    method: "POST",
    body: JSON.stringify(sanitizedRows),
  });
}

export async function upsertGoose2Results(rows: Goose2MarketResult[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_market_results?on_conflict=result_id", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2FeatureRows(rows: Goose2FeatureRow[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_feature_rows?on_conflict=feature_row_id", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2DecisionLogs(rows: Goose2DecisionLog[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_decision_log?on_conflict=decision_id", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function listGoose2Candidates(filters: {
  sport?: string;
  eventDate?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    select: "*",
    order: "capture_ts.desc",
    limit: String(Math.min(Math.max(filters.limit ?? 200, 1), 2000)),
  });

  if (filters.sport) params.set("sport", `eq.${filters.sport}`);
  if (filters.eventDate) params.set("event_date", `eq.${filters.eventDate}`);

  const response = await fetch(postgrestUrl(`/goose_market_candidates?${params.toString()}`), {
    headers: serviceHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Goose2 repository error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<Goose2MarketCandidate[]>;
}

export async function listGoose2Events(filters: {
  sport?: string;
  eventDate?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    select: "*",
    order: "event_date.desc,commence_time.desc",
    limit: String(Math.min(Math.max(filters.limit ?? 200, 1), 2000)),
  });

  if (filters.sport) params.set("sport", `eq.${filters.sport}`);
  if (filters.eventDate) params.set("event_date", `eq.${filters.eventDate}`);

  const response = await fetch(postgrestUrl(`/goose_market_events?${params.toString()}`), {
    headers: serviceHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Goose2 repository error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<Goose2MarketEvent[]>;
}
