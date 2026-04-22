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

export default function AskGoosePage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [question, setQuestion] = useState("");

  const normalizedExamples = useMemo(() => {
    if (sportLeague === "NHL") {
      return EXAMPLE_QUESTIONS.map((q) => q.replace("Q1", "P1"));
    }
    return EXAMPLE_QUESTIONS;
  }, [sportLeague]);

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
              rows={4}
              placeholder="Example: NHL P1 home favorites of -150 or shorter, what is the win rate and ROI?"
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dark-border pt-3">
              <p className="text-xs text-gray-500">
                Product rule: only answer legit betting questions backed by Goosalytics data.
              </p>
              <button
                type="button"
                disabled
                className="tap-button rounded-2xl border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-semibold text-accent-blue opacity-70"
              >
                Ask Goose (backend in progress)
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
                  onClick={() => setQuestion(example)}
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

        <EmptyStateCard
          eyebrow="Backend status"
          title="Ask Goose is being wired to the historical truth layer"
          body="The UI shell is ready for supported betting questions. Next step is finishing the persisted query layer so answers return exact sample size, record, units, ROI, and filter logic from the database."
        />
      </div>
    </div>
  );
}
