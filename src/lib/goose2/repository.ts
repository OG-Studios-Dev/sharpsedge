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
      ...serviceHeaders("resolution=merge-duplicates,return=minimal"),
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
  await goose2Fetch("/goose_market_events", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2Candidates(rows: Goose2MarketCandidate[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_market_candidates", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2Results(rows: Goose2MarketResult[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_market_results", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2FeatureRows(rows: Goose2FeatureRow[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_feature_rows", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

export async function upsertGoose2DecisionLogs(rows: Goose2DecisionLog[]) {
  if (!rows.length) return;
  await goose2Fetch("/goose_decision_log", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}
