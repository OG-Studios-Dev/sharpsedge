"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmptyStateCard from "@/components/EmptyStateCard";
import LeagueDropdown from "@/components/LeagueDropdown";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";

const EXAMPLE_QUESTIONS = [
  "NHL P1 home favorites of -150 or shorter, what is the win rate and ROI?",
  "NBA Q1 away favorites -5 or more, how often do they cover?",
  "NFL prime-time home dogs +7 or more, what is the ATS record?",
  "MLB road teams above .500 vs teams below .500, units won?",
];

const SUPPORTED_TOPICS = [
  "Database-backed betting questions only",
  "Historical trends, systems, and profitability",
  "League, market, side, line, price, and segment filters",
  "Sample size, win rate, units, and ROI outputs",
];

const NOT_SUPPORTED = [
  "Generic sports trivia or debate",
  "Open-ended predictions without database backing",
  "News, rumors, fantasy, or GOAT questions",
  "Anything outside Goosalytics betting data",
];

type AskGooseRow = {
  candidate_id: string;
  league: string;
  event_date: string;
  team_name: string | null;
  opponent_name: string | null;
  market_type: string | null;
  submarket_type: string | null;
  market_family: string | null;
  market_scope: string | null;
  side: string | null;
  line: number | null;
  odds: number | null;
  sportsbook: string | null;
  result: string | null;
  graded: boolean | null;
  profit_units: number | null;
  profit_dollars_10: number | null;
  roi_on_10_flat: number | null;
  segment_key: string | null;
  is_home_team_bet: boolean | null;
  is_away_team_bet: boolean | null;
  is_favorite: boolean | null;
  is_underdog: boolean | null;
};

type AskGooseResponse = {
  ok: boolean;
  question?: string;
  filters?: { league: string; limit: number };
  summary: {
    rows: number;
    gradedRows: number;
    wins: number;
    losses: number;
    pushes: number;
    totalUnits: number;
    avgRoi: number;
    sourceUnits?: number;
    sourceAvgRoi?: number;
    rawRows?: number;
    dedupedRows?: number;
  };
  interpretation?: {
    matchedTeam?: string | null;
    matchedOpponent?: string | null;
    marketType?: string | null;
    side?: string | null;
    requestedLine?: number | null;
    scope?: string | null;
    looksLikeBettingQuestion?: boolean;
  };
  answer?: {
    summaryText?: string;
    warnings?: string[];
    trustNotes?: string[];
  };
  explanation?: {
    mode: "llm" | "deterministic";
    text: string;
    bullets: string[];
    caveats: string[];
  };
  rows: AskGooseRow[];
  empty?: boolean;
  message?: string;
  error?: string;
};

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function formatOdds(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value > 0 ? `+${value}` : `${value}`;
}

export default function AskGoosePage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskGooseResponse | null>(null);

  const normalizedExamples = useMemo(() => {
    if (sportLeague === "NHL") {
      return EXAMPLE_QUESTIONS.map((q) => q.replace("Q1", "P1"));
    }
    return EXAMPLE_QUESTIONS;
  }, [sportLeague]);

  async function askGoose(nextQuestion = question) {
    const cleaned = nextQuestion.trim();
    if (!cleaned || !["NHL", "NBA", "MLB", "NFL"].includes(sportLeague)) {
      setResult(null);
      return;
    }

    setSubmittedQuestion(cleaned);
    setLoading(true);
    try {
      const response = await fetch("/api/ask-goose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league: sportLeague, limit: 50, question: cleaned }),
      });
      const payload = await response.json() as AskGooseResponse;
      setResult(payload);
    } catch {
      setResult({
        ok: false,
        error: "Failed to load Ask Goose data.",
        rows: [],
        summary: { rows: 0, gradedRows: 0, wins: 0, losses: 0, pushes: 0, totalUnits: 0, avgRoi: 0 },
      });
    } finally {
      setLoading(false);
    }
  }

  function chooseExample(example: string) {
    setQuestion(example);
    void askGoose(example);
  }


  return (
    <div className="min-h-screen bg-dark-bg">
      <PageHeader
        title="Ask Goose"
        subtitle="Ask database-backed betting questions only. No generic sports chat."
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      />

      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 lg:px-0">
        <div className="rounded-3xl border border-accent-blue/20 bg-[linear-gradient(180deg,rgba(44,122,255,0.12),rgba(13,17,24,0.92))] p-4 md:p-5">
          <p className="section-heading text-accent-blue">Ask database-backed questions</p>
          <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
            Natural-language betting research, backed by Goosalytics historical data.
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-gray-300 md:text-base">
            Ask about systems, profitability, win rate, units, ROI, and market splits. Ask Goose should only answer what the database can prove.
          </p>

          <div className="mt-4 rounded-2xl border border-dark-border bg-dark-surface/80 p-3">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void askGoose();
                }
              }}
              rows={4}
              placeholder="Example: NHL full-game home underdogs moneyline record and normalized ROI"
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dark-border pt-3">
              <p className="text-xs text-gray-500">
                Product rule: only answer legit betting questions backed by Goosalytics data.
              </p>
              <button
                type="button"
                onClick={() => void askGoose()}
                disabled={loading || !question.trim()}
                className="tap-button rounded-2xl border border-accent-blue/40 bg-accent-blue px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Asking Goose…" : "Ask Goose"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
            <p className="section-heading">Suggested questions</p>
            <div className="mt-3 space-y-3">
              {normalizedExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => chooseExample(example)}
                  className="tap-button block w-full rounded-2xl border border-dark-border bg-dark-bg/70 px-4 py-3 text-left text-sm text-gray-200 transition-colors hover:border-gray-600"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
              <p className="section-heading">What Goose will answer</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {SUPPORTED_TOPICS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-accent-blue">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
              <p className="section-heading">What Goose will reject</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {NOT_SUPPORTED.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-red-400">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-heading">Persisted query layer</p>
              <p className="mt-1 text-sm text-gray-400">
                Live read from <span className="font-semibold text-gray-200">ask_goose_query_layer_v1</span>. De-duped, normalized, and refusal-safe.
              </p>
              {submittedQuestion ? <p className="mt-2 text-xs text-gray-500">Question: “{submittedQuestion}”</p> : null}
            </div>
            {loading && <p className="text-xs text-gray-500">Loading…</p>}
          </div>

          {result?.ok && !result.empty && (
            <>
              <div className="mt-4 rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-accent-blue">Ask Goose answer</p>
                  {result.explanation?.mode ? (
                    <span className="rounded-full border border-accent-blue/25 bg-accent-blue/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-accent-blue">
                      {result.explanation.mode === "llm" ? "LLM explanation" : "Deterministic explanation"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-base font-semibold text-white">{result.explanation?.text || result.answer?.summaryText || result.message}</p>
                {result.explanation?.bullets?.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-gray-200">
                    {result.explanation.bullets.map((bullet) => (
                      <li key={bullet}>• {bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {result.answer?.trustNotes?.length ? (
                  <ul className="mt-3 space-y-1 text-xs text-gray-300">
                    {result.answer.trustNotes.map((note) => (
                      <li key={note}>✓ {note}</li>
                    ))}
                  </ul>
                ) : null}
                {result.answer?.warnings?.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-yellow-200">
                    {result.answer.warnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Decisions</p>
                  <p className="mt-1 text-lg font-semibold text-white">{result.summary.dedupedRows ?? result.summary.rows}</p>
                </div>
                <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Graded</p>
                  <p className="mt-1 text-lg font-semibold text-white">{result.summary.gradedRows}</p>
                </div>
                <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">W-L-P</p>
                  <p className="mt-1 text-lg font-semibold text-white">{result.summary.wins}-{result.summary.losses}-{result.summary.pushes}</p>
                </div>
                <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Norm Units</p>
                  <p className="mt-1 text-lg font-semibold text-white">{formatNumber(result.summary.totalUnits, 2)}</p>
                </div>
                <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Norm ROI</p>
                  <p className="mt-1 text-lg font-semibold text-white">{formatNumber(result.summary.avgRoi, 1)}%</p>
                </div>
                <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Raw Rows</p>
                  <p className="mt-1 text-lg font-semibold text-white">{result.summary.rawRows ?? result.summary.rows}</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-dark-border">
                <div className="grid grid-cols-[100px,1.2fr,1fr,90px,90px,80px] gap-3 bg-dark-bg/80 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  <span>Date</span>
                  <span>Matchup</span>
                  <span>Market</span>
                  <span>Odds</span>
                  <span>Result</span>
                  <span>Units</span>
                </div>
                <div className="divide-y divide-dark-border bg-dark-surface/60">
                  {result.rows.slice(0, 12).map((row) => (
                    <div key={row.candidate_id} className="grid grid-cols-[100px,1.2fr,1fr,90px,90px,80px] gap-3 px-4 py-3 text-sm text-gray-200">
                      <span>{row.event_date}</span>
                      <span>{row.team_name || "-"} vs {row.opponent_name || "-"}</span>
                      <span>{[row.market_type, row.submarket_type, row.side, row.line != null ? String(row.line) : null].filter(Boolean).join(" • ")}</span>
                      <span>{formatOdds(row.odds)}</span>
                      <span className="uppercase">{row.result || "pending"}</span>
                      <span>{row.profit_units != null ? formatNumber(row.profit_units, 2) : "-"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {result && (!result.ok || result.empty) && (
            <EmptyStateCard
              className="mx-0 mt-4"
              eyebrow="Persisted layer status"
              title={result.ok ? "Goose refused or found no proven rows" : "Ask Goose query layer read failed"}
              body={result.error || result.answer?.summaryText || result.message || "The persisted Ask Goose layer is still empty for this filter, so the app is correctly refusing to fake an answer."}
            />
          )}

          {!result && !loading && (
            <EmptyStateCard
              className="mx-0 mt-4"
              eyebrow="League support"
              title="Ask a betting research question to start"
              body="Ask Goose now waits for an explicit question, then answers only from mapped NHL, NBA, MLB, or NFL database rows."
            />
          )}
        </div>
      </div>
    </div>
  );
}
