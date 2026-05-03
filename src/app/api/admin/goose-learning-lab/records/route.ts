import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

type PickResult = "pending" | "win" | "loss" | "push" | "void" | string;

type LearningPickRow = {
  id: string;
  lab_slug: string;
  model_version: string | null;
  pick_date: string;
  sport: string;
  league: string | null;
  candidate_id: string | null;
  pick_label: string;
  market_family: string | null;
  market_type: string | null;
  side: string | null;
  line: number | string | null;
  odds: number | string | null;
  sportsbook: string | null;
  team_name: string | null;
  opponent_name: string | null;
  signal_keys: string[] | null;
  model_score: number | string | null;
  confidence_score: number | string | null;
  evidence_snapshot: Record<string, unknown> | null;
  status: string | null;
  result: PickResult;
  profit_units: number | string | null;
  production_pick_id: string | null;
  production_pick_label: string | null;
  comparison_bucket: string | null;
  recorded_at: string | null;
  settled_at: string | null;
};

type SignalCandidateRow = {
  signal_key: string;
  train_sample: number | string | null;
  train_wins: number | string | null;
  train_losses: number | string | null;
  train_pushes: number | string | null;
  train_roi: number | string | null;
  test_sample: number | string | null;
  test_wins: number | string | null;
  test_losses: number | string | null;
  test_pushes: number | string | null;
  test_roi: number | string | null;
  edge_score: number | string | null;
  confidence_score: number | string | null;
  promotion_status: string | null;
  rejection_reason: string | null;
};

type ProductionPickRow = {
  id: string;
  date: string;
  league: string;
  pick_type?: string | null;
  player_name?: string | null;
  team?: string | null;
  opponent?: string | null;
  pick_label: string;
  odds?: number | string | null;
  book?: string | null;
  sportsbook?: string | null;
  result: PickResult;
  units?: number | string | null;
  created_at?: string | null;
};

type RecordSummary = {
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  winRate: number | null;
  roi: number | null;
};

type SignalExplanation = {
  signalKey: string;
  trainSample: number | null;
  trainRecord: string;
  trainWinRate: number | null;
  trainRoi: number | null;
  testSample: number | null;
  testRecord: string;
  testWinRate: number | null;
  testRoi: number | null;
  edgeScore: number | null;
  confidenceScore: number | null;
  promotionStatus: string | null;
  rejectionReason: string | null;
};

type NormalizedPick = {
  id: string;
  source: "learning" | "production";
  date: string;
  league: string;
  pickLabel: string;
  market?: string | null;
  side?: string | null;
  team?: string | null;
  opponent?: string | null;
  odds?: number | null;
  sportsbook?: string | null;
  result: PickResult;
  units: number;
  profitUnits: number;
  status?: string | null;
  modelScore?: number | null;
  confidenceScore?: number | null;
  signalCount?: number;
  signals?: string[];
  signalExplanations?: SignalExplanation[];
  edgeSummary?: string | null;
  evidenceSnapshot?: Record<string, unknown> | null;
  comparisonBucket?: string | null;
  productionPickLabel?: string | null;
  recordedAt?: string | null;
};

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
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function profitFromResult(result: PickResult, odds: unknown, units = 1): number {
  if (result === "loss") return -Math.abs(units || 1);
  if (result === "push" || result === "void") return 0;
  if (result !== "win") return 0;
  const o = num(odds);
  if (!o) return Math.abs(units || 1);
  if (o > 0) return Math.abs(units || 1) * (o / 100);
  return Math.abs(units || 1) * (100 / Math.abs(o));
}

function emptyRecord(): RecordSummary {
  return { total: 0, settled: 0, pending: 0, wins: 0, losses: 0, pushes: 0, units: 0, winRate: null, roi: null };
}

function finalize(record: RecordSummary): RecordSummary {
  const decisions = record.wins + record.losses;
  return {
    ...record,
    units: Number(record.units.toFixed(3)),
    winRate: decisions ? Number(((record.wins / decisions) * 100).toFixed(1)) : null,
    roi: record.settled ? Number(((record.units / record.settled) * 100).toFixed(1)) : null,
  };
}

function addPick(record: RecordSummary, pick: NormalizedPick) {
  record.total += 1;
  if (pick.result === "pending") record.pending += 1;
  else record.settled += 1;
  if (pick.result === "win") record.wins += 1;
  if (pick.result === "loss") record.losses += 1;
  if (pick.result === "push" || pick.result === "void") record.pushes += 1;
  record.units += pick.profitUnits || 0;
}

function summarize(picks: NormalizedPick[]): RecordSummary {
  const record = emptyRecord();
  picks.forEach((pick) => addPick(record, pick));
  return finalize(record);
}

function groupRecords(picks: NormalizedPick[], keyFn: (pick: NormalizedPick) => string, labelFn: (key: string) => string = (key) => key) {
  const map = new Map<string, NormalizedPick[]>();
  for (const pick of picks) {
    const key = keyFn(pick);
    map.set(key, [...(map.get(key) || []), pick]);
  }
  return Array.from(map.entries()).map(([key, group]) => ({
    key,
    label: labelFn(key),
    record: summarize(group),
    picks: group,
  }));
}

function winRate(wins: unknown, losses: unknown): number | null {
  const w = num(wins) || 0;
  const l = num(losses) || 0;
  return w + l ? Number(((w / (w + l)) * 100).toFixed(1)) : null;
}

function explainSignal(row: SignalCandidateRow): SignalExplanation {
  const tw = num(row.train_wins) || 0;
  const tl = num(row.train_losses) || 0;
  const tp = num(row.train_pushes) || 0;
  const ow = num(row.test_wins) || 0;
  const ol = num(row.test_losses) || 0;
  const op = num(row.test_pushes) || 0;
  return {
    signalKey: row.signal_key,
    trainSample: num(row.train_sample),
    trainRecord: `${tw}-${tl}-${tp}`,
    trainWinRate: winRate(row.train_wins, row.train_losses),
    trainRoi: num(row.train_roi),
    testSample: num(row.test_sample),
    testRecord: `${ow}-${ol}-${op}`,
    testWinRate: winRate(row.test_wins, row.test_losses),
    testRoi: num(row.test_roi),
    edgeScore: num(row.edge_score),
    confidenceScore: num(row.confidence_score),
    promotionStatus: row.promotion_status,
    rejectionReason: row.rejection_reason,
  };
}

function normalizeLearning(row: LearningPickRow, signalMap: Map<string, SignalExplanation> = new Map()): NormalizedPick {
  const odds = num(row.odds);
  const suppliedProfit = num(row.profit_units);
  const signals = Array.isArray(row.signal_keys) ? row.signal_keys : [];
  const signalExplanations = signals.map((key) => signalMap.get(key)).filter(Boolean) as SignalExplanation[];
  const primary = signalExplanations[0];
  const edgeSummary = primary
    ? `Primary signal ${primary.signalKey} was ${primary.testRecord} out-of-sample (${primary.testSample ?? "—"} picks), ${primary.testWinRate ?? "—"}% win rate, ROI ${(Number(primary.testRoi || 0) * 100).toFixed(1)}%.`
    : typeof row.evidence_snapshot?.note === "string" ? row.evidence_snapshot.note : null;
  return {
    id: row.id,
    source: "learning",
    date: row.pick_date,
    league: row.league || row.sport || "UNKNOWN",
    pickLabel: row.pick_label,
    market: row.market_family || row.market_type,
    side: row.side,
    team: row.team_name,
    opponent: row.opponent_name,
    odds,
    sportsbook: row.sportsbook,
    result: row.result || "pending",
    units: 1,
    profitUnits: suppliedProfit ?? profitFromResult(row.result, odds, 1),
    status: row.status,
    modelScore: num(row.model_score),
    confidenceScore: num(row.confidence_score),
    signalCount: signals.length,
    signals,
    signalExplanations,
    edgeSummary,
    evidenceSnapshot: row.evidence_snapshot,
    comparisonBucket: row.comparison_bucket,
    productionPickLabel: row.production_pick_label,
    recordedAt: row.recorded_at,
  };
}

function normalizeProduction(row: ProductionPickRow): NormalizedPick {
  const odds = num(row.odds);
  const units = num(row.units) || 1;
  return {
    id: row.id,
    source: "production",
    date: row.date,
    league: row.league || "UNKNOWN",
    pickLabel: row.pick_label,
    market: row.pick_type,
    team: row.team || row.player_name,
    opponent: row.opponent,
    odds,
    sportsbook: row.sportsbook || row.book,
    result: row.result || "pending",
    units,
    profitUnits: profitFromResult(row.result, odds, units),
    recordedAt: row.created_at,
  };
}

function comparisonByDayAndLeague(learning: NormalizedPick[], production: NormalizedPick[]) {
  const keys = new Set<string>();
  for (const pick of learning) keys.add(`${pick.date}|${pick.league}`);
  for (const pick of production) keys.add(`${pick.date}|${pick.league}`);
  return Array.from(keys).sort().reverse().map((key) => {
    const [date, league] = key.split("|");
    const learningRecord = summarize(learning.filter((pick) => pick.date === date && pick.league === league));
    const productionRecord = summarize(production.filter((pick) => pick.date === date && pick.league === league));
    const deltaWinRate = learningRecord.winRate != null && productionRecord.winRate != null
      ? Number((learningRecord.winRate - productionRecord.winRate).toFixed(1))
      : null;
    return { key, date, league, learning: learningRecord, production: productionRecord, deltaWinRate };
  });
}

export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentViewer();
    if (!viewer || viewer.profile?.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const lab = searchParams.get("lab") || "goose-shadow-lab";
    const modelVersion = searchParams.get("modelVersion");
    const league = searchParams.get("league") || "ALL";
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 1000), 5000));

    const learningParams = [
      "select=id,lab_slug,model_version,pick_date,sport,league,candidate_id,pick_label,market_family,market_type,side,line,odds,sportsbook,team_name,opponent_name,signal_keys,model_score,confidence_score,evidence_snapshot,status,result,profit_units,production_pick_id,production_pick_label,comparison_bucket,recorded_at,settled_at",
      `lab_slug=eq.${encodeURIComponent(lab)}`,
      modelVersion ? `model_version=eq.${encodeURIComponent(modelVersion)}` : null,
      league !== "ALL" ? `sport=eq.${encodeURIComponent(league)}` : null,
      "order=pick_date.desc",
      `limit=${limit}`,
    ].filter(Boolean).join("&");

    const learningRows = await postgrest<LearningPickRow[]>(`/rest/v1/goose_learning_shadow_picks?${learningParams}`);
    const signalKeys = Array.from(new Set(learningRows.flatMap((row) => Array.isArray(row.signal_keys) ? row.signal_keys : [])));
    const signalRows = signalKeys.length
      ? await postgrest<SignalCandidateRow[]>(`/rest/v1/goose_signal_candidates_v1?select=signal_key,train_sample,train_wins,train_losses,train_pushes,train_roi,test_sample,test_wins,test_losses,test_pushes,test_roi,edge_score,confidence_score,promotion_status,rejection_reason&model_version=eq.${encodeURIComponent(modelVersion || "shadow-2026-05-03-expanded-oos")}&signal_key=in.(${signalKeys.map((key) => `"${key.replace(/"/g, "\\\"")}"`).join(",")})`).catch(() => [])
      : [];
    const signalMap = new Map(signalRows.map((row) => [row.signal_key, explainSignal(row)]));
    const learningPicks = learningRows.map((row) => normalizeLearning(row, signalMap));
    const earliestDate = learningPicks.length ? learningPicks.map((pick) => pick.date).sort()[0] : "2025-12-01";

    const productionParams = [
      "select=id,date,league,pick_type,player_name,team,opponent,pick_label,odds,book,sportsbook,result,units,created_at",
      `date=gte.${encodeURIComponent(earliestDate)}`,
      league !== "ALL" ? `league=eq.${encodeURIComponent(league)}` : null,
      "order=date.desc",
      `limit=${limit}`,
    ].filter(Boolean).join("&");

    const productionRows = await postgrest<ProductionPickRow[]>(`/rest/v1/pick_history?${productionParams}`).catch(() => []);
    const productionPicks = productionRows.map(normalizeProduction);

    const leagues = Array.from(new Set([...learningPicks.map((pick) => pick.league), ...productionPicks.map((pick) => pick.league)])).sort();

    return NextResponse.json({
      ok: true,
      lab,
      modelVersion: modelVersion || null,
      league,
      generatedAt: new Date().toISOString(),
      leagues,
      learning: {
        overall: summarize(learningPicks),
        byLeague: groupRecords(learningPicks, (pick) => pick.league).sort((a, b) => a.key.localeCompare(b.key)),
        byDay: groupRecords(learningPicks, (pick) => pick.date).sort((a, b) => b.key.localeCompare(a.key)),
        picks: learningPicks,
      },
      production: {
        overall: summarize(productionPicks),
        byLeague: groupRecords(productionPicks, (pick) => pick.league).sort((a, b) => a.key.localeCompare(b.key)),
        byDay: groupRecords(productionPicks, (pick) => pick.date).sort((a, b) => b.key.localeCompare(a.key)),
        picks: productionPicks,
      },
      comparison: {
        byDayLeague: comparisonByDayAndLeague(learningPicks, productionPicks),
      },
    });
  } catch (error) {
    console.error("[goose-learning-lab/records] failed", error);
    return NextResponse.json({ ok: false, error: toErrorMessage(error, "Failed to load Goose Learning records") }, { status: 500 });
  }
}
