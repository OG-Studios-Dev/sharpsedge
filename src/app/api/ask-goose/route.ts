import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import { answerAskGooseQuestion } from "@/lib/ask-goose/internal-query";

export const dynamic = "force-dynamic";

const ALLOWED_LEAGUES = new Set(["NHL", "NBA", "MLB", "NFL"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizeLeague(raw: string | null) {
  const value = (raw || "").trim().toUpperCase();
  return ALLOWED_LEAGUES.has(value) ? value : "NHL";
}

function normalizeLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function buildQuestionPreview(question: string) {
  const cleaned = question.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 180);
}

async function postgrest<T>(path: string) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: "GET",
    headers: serviceHeaders(),
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

  return await response.json() as T;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league = normalizeLeague(searchParams.get("league"));
    const limit = normalizeLimit(searchParams.get("limit"));
    const question = buildQuestionPreview(searchParams.get("q") || "");

    const query = new URLSearchParams({
      select: [
        "candidate_id",
        "league",
        "event_date",
        "team_name",
        "opponent_name",
        "market_type",
        "submarket_type",
        "market_family",
        "market_scope",
        "side",
        "line",
        "odds",
        "sportsbook",
        "result",
        "graded",
        "profit_units",
        "profit_dollars_10",
        "roi_on_10_flat",
        "segment_key",
        "is_home_team_bet",
        "is_away_team_bet",
        "is_favorite",
        "is_underdog"
      ].join(","),
      league: `eq.${league}`,
      order: "event_date.desc",
      limit: String(limit),
    });

    const rows = await postgrest<any[]>(`/rest/v1/ask_goose_query_layer_v1?${query.toString()}`);

    const answer = answerAskGooseQuestion(question, league, rows);

    return NextResponse.json({
      ok: true,
      question,
      filters: { league, limit },
      summary: {
        rows: answer.sampleSize,
        gradedRows: answer.gradedRows,
        wins: answer.wins,
        losses: answer.losses,
        pushes: answer.pushes,
        totalUnits: answer.totalUnits,
        avgRoi: answer.avgRoi,
      },
      interpretation: answer.intent,
      answer: {
        summaryText: answer.summaryText,
        warnings: answer.warnings,
      },
      rows: answer.evidenceRows,
      empty: answer.sampleSize === 0,
      message: answer.sampleSize === 0
        ? `No persisted Ask Goose rows found for ${league} in the current materialized query layer.`
        : answer.summaryText,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: toErrorMessage(error, "Failed to load Ask Goose data"),
      rows: [],
      summary: {
        rows: 0,
        gradedRows: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        totalUnits: 0,
        avgRoi: 0,
      },
    }, { status: 500 });
  }
}
