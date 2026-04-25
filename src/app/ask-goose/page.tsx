"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmptyStateCard from "@/components/EmptyStateCard";
import LeagueDropdown from "@/components/LeagueDropdown";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";

const EXAMPLE_QUESTIONS = [
  "NHL full-game under 5.5 record and units",
  "NHL home underdogs moneyline record and ROI",
  "NBA Q1 away favorites -5 or more, how often do they cover?",
  "MLB road teams above .500 vs teams below .500, units won?",
];

const SUPPORTED_TOPICS = [
  "Records, win rate, units, and ROI",
  "League, market, side, line, price, and segment filters",
  "Full game vs P1/Q1/1H/F5 splits",
  "Database-backed refusals when Goose cannot prove it",
];

const NOT_SUPPORTED = [
  "Generic sports trivia or debate",
  "Open-ended picks without database backing",
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
  loggingWarning?: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "goose";
  question?: string;
  text: string;
  result?: AskGooseResponse;
};

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function formatOdds(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value > 0 ? `+${value}` : `${value}`;
}

function messageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AskGoosePage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskGooseResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const normalizedExamples = useMemo(() => {
    if (sportLeague === "NHL") return EXAMPLE_QUESTIONS.map((q) => q.replace("Q1", "P1"));
    return EXAMPLE_QUESTIONS;
  }, [sportLeague]);

  async function askGoose(nextQuestion = question) {
    const cleaned = nextQuestion.trim();
    if (!cleaned || loading || !["NHL", "NBA", "MLB", "NFL"].includes(sportLeague)) return;

    const userMessage: ChatMessage = { id: messageId(), role: "user", text: cleaned, question: cleaned };
    setMessages((current) => current.concat(userMessage));
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/ask-goose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league: sportLeague, limit: 50, question: cleaned }),
      });
      const payload = await response.json() as AskGooseResponse;
      setResult(payload);
      setMessages((current) => current.concat({
        id: messageId(),
        role: "goose",
        question: cleaned,
        text: payload.explanation?.text || payload.answer?.summaryText || payload.error || payload.message || "Goose could not answer that yet.",
        result: payload,
      }));
    } catch {
      const errorPayload: AskGooseResponse = {
        ok: false,
        error: "Failed to load Ask Goose data.",
        rows: [],
        summary: { rows: 0, gradedRows: 0, wins: 0, losses: 0, pushes: 0, totalUnits: 0, avgRoi: 0 },
      };
      setResult(errorPayload);
      setMessages((current) => current.concat({ id: messageId(), role: "goose", text: errorPayload.error || "Ask Goose failed.", result: errorPayload }));
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function submitQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    void askGoose();
  }

  function chooseExample(example: string) {
    setQuestion(example);
    void askGoose(example);
  }

  const latestResult = result;

  return (
    <div className="min-h-screen bg-dark-bg pb-28 md:pb-8">
      <PageHeader
        title="Ask Goose"
        subtitle="Beta chat for database-backed betting research. Goose answers only what the data can prove."
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      />

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr),340px] lg:px-0">
        <main className="flex min-h-[72vh] flex-col overflow-hidden rounded-3xl border border-accent-blue/20 bg-[linear-gradient(180deg,rgba(44,122,255,0.10),rgba(13,17,24,0.96))] shadow-2xl shadow-black/20">
          <div className="border-b border-dark-border p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-heading text-accent-blue">Ask Goose beta</p>
                <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">Start a betting research chat</h2>
                <p className="mt-1 text-sm text-gray-400">Press Enter or tap Send. Shift+Enter adds a new line.</p>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Beta ready</span>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={message.role === "user" ? "max-w-[85%] rounded-3xl bg-accent-blue px-4 py-3 text-sm font-semibold text-white" : "max-w-[92%] rounded-3xl border border-dark-border bg-dark-surface/80 px-4 py-3 text-sm text-gray-100"}>
                  {message.role === "goose" && message.result?.explanation?.mode ? (
                    <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-accent-blue">{message.result.explanation.mode === "llm" ? "LLM explanation" : "Deterministic explanation"}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>

                  {message.role === "goose" && message.result?.explanation?.bullets?.length ? (
                    <ul className="mt-3 space-y-1 text-sm text-gray-300">
                      {message.result.explanation.bullets.map((bullet) => <li key={bullet}>• {bullet}</li>)}
                    </ul>
                  ) : null}

                  {message.role === "goose" && message.result?.answer?.warnings?.length ? (
                    <ul className="mt-3 space-y-1 text-xs text-yellow-200">
                      {message.result.answer.warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-3xl border border-dark-border bg-dark-surface/80 px-4 py-3 text-sm text-gray-300">Goose is checking the database…</div>
              </div>
            ) : null}
          </div>

          <form onSubmit={submitQuestion} className="sticky bottom-16 z-[90] border-t border-dark-border bg-dark-bg/95 p-3 backdrop-blur md:p-4 lg:bottom-0">
            <div className="flex gap-2 rounded-3xl border border-accent-blue/30 bg-dark-surface/90 p-2 shadow-lg shadow-black/20 focus-within:border-accent-blue/70">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askGoose();
                  }
                }}
                rows={1}
                placeholder="Ask Goose… e.g. NHL under 5.5 record and units"
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void askGoose()}
                disabled={loading || !question.trim()}
                className="tap-button rounded-2xl bg-accent-blue px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent-blue/20 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Send Ask Goose question"
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-gray-500">Send routes the question through Ask Goose, queries the database layer, then returns the LLM-backed answer.</p>
          </form>
        </main>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-3">
            <button
              type="button"
              onClick={() => setGuideOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left"
              aria-expanded={guideOpen}
            >
              <div>
                <p className="section-heading">How to use Goose</p>
                <p className="mt-1 text-xs text-gray-500">What it can and can’t answer</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dark-border bg-dark-bg/70 text-lg font-semibold text-accent-blue">
                {guideOpen ? "−" : "+"}
              </span>
            </button>

            {guideOpen ? (
              <div className="mt-2 space-y-3 border-t border-dark-border px-2 pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-accent-blue">Goose will answer</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
                    {SUPPORTED_TOPICS.map((item) => <li key={item} className="flex gap-2"><span className="text-accent-blue">•</span><span>{item}</span></li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-red-300">Goose will reject</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
                    {NOT_SUPPORTED.map((item) => <li key={item} className="flex gap-2"><span className="text-red-400">•</span><span>{item}</span></li>)}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-3">
            <button
              type="button"
              onClick={() => setExamplesOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left"
              aria-expanded={examplesOpen}
            >
              <div>
                <p className="section-heading">Example Questions</p>
                <p className="mt-1 text-xs text-gray-500">Starter prompts Goose can prove from data</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dark-border bg-dark-bg/70 text-lg font-semibold text-accent-blue">
                {examplesOpen ? "−" : "+"}
              </span>
            </button>

            {examplesOpen ? (
              <div className="mt-2 space-y-2 border-t border-dark-border px-2 pt-3">
                {normalizedExamples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => chooseExample(example)}
                    className="tap-button w-full rounded-2xl border border-dark-border bg-dark-bg/70 px-4 py-3 text-left text-sm text-gray-200 transition-colors hover:border-accent-blue/50 hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {latestResult?.ok && !latestResult.empty ? (
            <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
              <p className="section-heading">Latest proof</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-dark-bg/70 p-3"><p className="text-gray-500">Decisions</p><p className="font-semibold text-white">{latestResult.summary.dedupedRows ?? latestResult.summary.rows}</p></div>
                <div className="rounded-2xl bg-dark-bg/70 p-3"><p className="text-gray-500">Graded</p><p className="font-semibold text-white">{latestResult.summary.gradedRows}</p></div>
                <div className="rounded-2xl bg-dark-bg/70 p-3"><p className="text-gray-500">W-L-P</p><p className="font-semibold text-white">{latestResult.summary.wins}-{latestResult.summary.losses}-{latestResult.summary.pushes}</p></div>
                <div className="rounded-2xl bg-dark-bg/70 p-3"><p className="text-gray-500">Norm ROI</p><p className="font-semibold text-white">{formatNumber(latestResult.summary.avgRoi, 1)}%</p></div>
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-dark-border">
                {latestResult.rows.slice(0, 8).map((row) => (
                  <div key={row.candidate_id} className="border-b border-dark-border px-3 py-2 text-xs text-gray-300 last:border-b-0">
                    <p className="font-semibold text-gray-100">{row.team_name || "-"} vs {row.opponent_name || "-"}</p>
                    <p>{row.event_date} • {[row.market_type, row.side, row.line != null ? String(row.line) : null, formatOdds(row.odds)].filter(Boolean).join(" • ")}</p>
                    <p className="uppercase text-gray-500">{row.result || "pending"} • {row.profit_units != null ? formatNumber(row.profit_units, 2) : "-"}u</p>
                  </div>
                ))}
              </div>
            </div>
          ) : latestResult ? (
            <EmptyStateCard
              className="mx-0"
              eyebrow="Goose status"
              title={latestResult.ok ? "Goose refused or found no proven rows" : "Ask Goose read failed"}
              body={latestResult.error || latestResult.answer?.summaryText || latestResult.message || "Goose correctly refused to fake an answer."}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
