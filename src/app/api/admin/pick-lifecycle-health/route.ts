import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type PickRow = {
  id: string;
  date: string;
  league?: string;
  sport?: string;
  pick_label: string;
  result: string;
  updated_at: string;
  game_id: string | null;
};

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service configuration");
  return { url, key };
}

async function pg<T>(pathname: string): Promise<T> {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1${pathname}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function beforeSundayWindow(dateKey: string, now = new Date()) {
  const earliest = addDays(dateKey, 3);
  return earliest ? now.getTime() < earliest.getTime() : true;
}

async function fetchPGAStatusByEventId() {
  const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard", { cache: "no-store" });
  if (!response.ok) return new Map<string, { id: string; name: string; completed: boolean; final: boolean; detail: string; date: string }>();
  const data = await response.json();
  return new Map((data.events ?? []).map((event: any) => {
    const competition = event?.competitions?.[0];
    const status = competition?.status?.type ?? event?.status?.type ?? {};
    const detail = String(status?.detail ?? status?.shortDetail ?? status?.description ?? status?.name ?? "unknown");
    const id = String(event?.id ?? "");
    return [id, {
      id,
      name: event?.name ?? event?.shortName ?? "PGA event",
      completed: status?.completed === true,
      final: status?.completed === true && /final|tournament complete/i.test(detail),
      detail,
      date: String(event?.date ?? "").slice(0, 10),
    }];
  }).filter(([id]: [string]) => id));
}

function summarize(rows: PickRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.result] = (acc[row.result] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET() {
  try {
    const now = new Date();
    const since = new Date(now.getTime());
    since.setUTCDate(since.getUTCDate() - 14);
    const sinceKey = since.toISOString().slice(0, 10);

    const [pickHistory, gooseModel, pgaStatuses] = await Promise.all([
      pg<PickRow[]>(`/pick_history?select=id,date,league,pick_label,result,updated_at,game_id&league=eq.PGA&date=gte.${sinceKey}&order=date.desc,updated_at.desc&limit=500`),
      pg<PickRow[]>(`/goose_model_picks?select=id,date,sport,pick_label,result,updated_at,game_id&sport=eq.PGA&date=gte.${sinceKey}&order=date.desc,updated_at.desc&limit=500`).catch(() => []),
      fetchPGAStatusByEventId(),
    ]);

    const all = [
      ...pickHistory.map((row) => ({ table: "pick_history", ...row })),
      ...gooseModel.map((row) => ({ table: "goose_model_picks", ...row })),
    ];

    const prematureSettlements = all.filter((row) => {
      if (row.result === "pending") return false;
      const eventStatus = row.game_id ? pgaStatuses.get(String(row.game_id)) : null;
      if (eventStatus && (eventStatus as { final?: boolean }).final === false) return true;
      return beforeSundayWindow(row.date, now);
    });

    return NextResponse.json({
      ok: prematureSettlements.length === 0,
      checked_since: sinceKey,
      now: now.toISOString(),
      counts: {
        pick_history: { total: pickHistory.length, by_result: summarize(pickHistory) },
        goose_model_picks: { total: gooseModel.length, by_result: summarize(gooseModel) },
      },
      active_pga_events: Array.from(pgaStatuses.values()),
      premature_settlements: prematureSettlements.map((row) => ({
        table: row.table,
        id: row.id,
        date: row.date,
        pick_label: row.pick_label,
        result: row.result,
        updated_at: row.updated_at,
        game_id: row.game_id,
        event_status: row.game_id ? pgaStatuses.get(String(row.game_id)) ?? null : null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Pick lifecycle health failed" }, { status: 500 });
  }
}
