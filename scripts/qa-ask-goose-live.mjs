#!/usr/bin/env node
const BASE_URL = (process.env.LAUNCH_GATE_BASE_URL || process.env.ASK_GOOSE_QA_BASE_URL || 'https://goosalytics.vercel.app').replace(/\/$/, '');

const cases = [
  {
    league: 'NHL',
    question: 'NHL full-game under 5.5 record and units since 2024',
    requireThinCaveat: true,
  },
  {
    league: 'NBA',
    question: 'How did NBA overs do from 2024 to 2026 for over .500 teams?',
    requireThinCaveat: true,
    requireWarningIncludes: '.500 condition could not be proven',
  },
  {
    league: 'MLB',
    question: 'MLB moneyline underdogs record and ROI since 2024',
    requireDedupedSummaryFields: true,
  },
  {
    league: 'NFL',
    question: 'NFL spread favorites record since 2024',
    requireThinCaveat: true,
    requireWarningIncludes: 'NFL historical coverage is currently limited',
  },
];

function assert(condition, message, evidence = {}) {
  if (!condition) {
    const error = new Error(message);
    error.evidence = evidence;
    throw error;
  }
}

async function checkAskGoose({ league, question, requireThinCaveat, requireWarningIncludes, requireDedupedSummaryFields }) {
  const url = new URL('/api/ask-goose', BASE_URL);
  url.searchParams.set('league', league);
  url.searchParams.set('q', question);
  url.searchParams.set('limit', '10');

  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow' });
  const payload = await res.json().catch(() => null);
  const durationMs = Date.now() - started;

  assert(res.status === 200, `${league} Ask Goose returned HTTP ${res.status}`, { question, status: res.status, payload });
  assert(payload?.ok === true, `${league} Ask Goose payload was not ok`, { question, payload });
  assert(payload?.summary && typeof payload.summary.rows === 'number', `${league} Ask Goose missing numeric summary.rows`, { question, payload });
  assert(typeof payload.summary.gradedRows === 'number', `${league} Ask Goose missing numeric summary.gradedRows`, { question, payload });
  assert(typeof payload.summary.wins === 'number' && typeof payload.summary.losses === 'number' && typeof payload.summary.pushes === 'number', `${league} Ask Goose missing W/L/push fields`, { question, payload });
  assert(typeof payload.summary.totalUnits === 'number' && typeof payload.summary.avgRoi === 'number', `${league} Ask Goose missing units/ROI fields`, { question, payload });
  assert(Array.isArray(payload.answer?.warnings), `${league} Ask Goose missing warnings array`, { question, payload });
  assert(Array.isArray(payload.answer?.trustNotes), `${league} Ask Goose missing trustNotes array`, { question, payload });
  assert(payload.answer.trustNotes.some((note) => String(note).includes('Database-backed only')), `${league} Ask Goose missing database-backed trust note`, { question, payload });

  if (requireThinCaveat) {
    assert(payload.answer.warnings.some((warning) => String(warning).includes('Sample size is thin')), `${league} Ask Goose did not caveat thin sample`, { question, warnings: payload.answer.warnings });
  }
  if (requireWarningIncludes) {
    assert(payload.answer.warnings.some((warning) => String(warning).includes(requireWarningIncludes)), `${league} Ask Goose missing required warning: ${requireWarningIncludes}`, { question, warnings: payload.answer.warnings });
  }
  if (requireDedupedSummaryFields) {
    assert(typeof payload.summary.rawRows === 'number' && typeof payload.summary.dedupedRows === 'number', `${league} Ask Goose missing raw/deduped row fields`, { question, summary: payload.summary });
  }

  return {
    league,
    question,
    ok: true,
    durationMs,
    status: res.status,
    summary: payload.summary,
    warnings: payload.answer.warnings,
    trustNotes: payload.answer.trustNotes,
  };
}

const results = [];
const failures = [];
for (const qaCase of cases) {
  try {
    results.push(await checkAskGoose(qaCase));
  } catch (error) {
    failures.push({
      league: qaCase.league,
      question: qaCase.question,
      error: error instanceof Error ? error.message : String(error),
      evidence: error?.evidence || null,
    });
  }
}

const report = {
  ok: failures.length === 0,
  baseUrl: BASE_URL,
  generatedAt: new Date().toISOString(),
  cases: results.length,
  failures,
  results,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
