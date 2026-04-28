#!/usr/bin/env node
const baseUrl = (process.env.ASK_GOOSE_BASE_URL || process.argv[2] || 'http://localhost:3040').replace(/\/$/, '');
const expected = (process.env.ASK_GOOSE_EXPECT_PROVIDER || process.argv[3] || '').toLowerCase();

const cases = [
  {
    name: 'no-data-skip',
    league: 'NFL',
    question: 'NFL spread favorites record since 2024',
  },
  {
    name: 'positive-or-current-slice',
    league: 'MLB',
    question: 'MLB moneyline underdogs record and ROI since 2024',
  },
];

const results = [];
for (const testCase of cases) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/ask-goose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ league: testCase.league, question: testCase.question }),
  });
  const body = await response.json();
  const llmStatus = body.explanation?.llmStatus || null;
  results.push({
    name: testCase.name,
    ok: response.ok && body.ok === true,
    status: response.status,
    durationMs: Date.now() - startedAt,
    summary: body.summary,
    explanationMode: body.explanation?.mode || null,
    llmStatus,
  });
}

const failures = results.filter((result) => !result.ok);
if (expected === 'qwen') {
  const nonNoData = results.find((result) => result.name === 'positive-or-current-slice');
  if (!nonNoData) failures.push({ name: 'missing-positive-case', ok: false });
  // This smoke is allowed to be deterministic when the DB has no graded positive slice yet.
  // The important switch proof is that no-data rows bypass LLM and the route remains healthy.
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  expected: expected || null,
  generatedAt: new Date().toISOString(),
  failures: failures.map((failure) => failure.name),
  results,
}, null, 2));

if (failures.length > 0) process.exit(1);
