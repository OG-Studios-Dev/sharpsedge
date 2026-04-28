import assert from "node:assert/strict";
import { explainAskGooseAnswer } from "../src/lib/ask-goose/explanation";
import type { AskGooseAnswer } from "../src/lib/ask-goose/internal-query";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function baseAnswer(overrides: Partial<AskGooseAnswer> = {}): AskGooseAnswer {
  return {
    intent: { looksLikeBettingQuestion: true } as AskGooseAnswer["intent"],
    summaryText: "NBA full-game unders since 2024 are 58-46-2 for +7.8 units after de-duping one betting decision per game/market/side/line.",
    sampleSize: 106,
    rawRows: 340,
    dedupedRows: 106,
    gradedRows: 106,
    wins: 58,
    losses: 46,
    pushes: 2,
    totalUnits: 7.8,
    avgRoi: 0.074,
    sourceUnits: 7.8,
    sourceAvgRoi: 0.074,
    evidenceRows: [],
    warnings: ["Sample is usable but not huge; treat as directional, not an auto-bet."],
    trustNotes: [
      "Database-backed only: answers are computed from ask_goose_query_layer_v1, not guessed.",
      "Samples are de-duped to one betting decision per game/market/side/line before summary.",
    ],
    counterSide: null,
    ...overrides,
  };
}

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.ASK_GOOSE_EXPLAINER_PROVIDER;
  delete process.env.ASK_GOOSE_LOCAL_MODEL;
  delete process.env.ASK_GOOSE_LLM_MODEL;
  delete process.env.ASK_GOOSE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as unknown as typeof fetch;
}

async function run() {
  const results: Array<{ name: string; ok: boolean }> = [];

  resetEnv();
  mockFetch(async () => {
    throw new Error("fetch should not run when default OpenAI provider has no API key");
  });
  {
    const explanation = await explainAskGooseAnswer("NBA full-game unders record and units since 2024", "NBA", baseAnswer());
    assert.equal(explanation.mode, "deterministic");
    assert.equal(explanation.llmStatus.provider, "openai");
    assert.equal(explanation.llmStatus.status, "not_configured");
    results.push({ name: "default provider remains OpenAI-style deterministic fallback when unconfigured", ok: true });
  }

  resetEnv();
  process.env.ASK_GOOSE_EXPLAINER_PROVIDER = "ollama";
  let fetchCalls = 0;
  mockFetch(async () => {
    fetchCalls += 1;
    throw new Error("fetch should not run for zero graded rows");
  });
  {
    const explanation = await explainAskGooseAnswer("NFL spread favorites record since 2024", "NFL", baseAnswer({
      summaryText: "No proven graded sample found for this NFL question yet.",
      sampleSize: 0,
      rawRows: 0,
      dedupedRows: 0,
      gradedRows: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      totalUnits: 0,
      avgRoi: 0,
      sourceUnits: 0,
      sourceAvgRoi: 0,
      warnings: ["No rows matched the interpreted filters."],
      trustNotes: ["Database-backed only: answers are computed from ask_goose_query_layer_v1, not guessed."],
    }));
    assert.equal(fetchCalls, 0);
    assert.equal(explanation.mode, "deterministic");
    assert.equal(explanation.llmStatus.provider, "none");
    assert.equal(explanation.llmStatus.status, "not_applicable");
    results.push({ name: "zero graded rows skip local LLM entirely", ok: true });
  }

  resetEnv();
  process.env.ASK_GOOSE_EXPLAINER_PROVIDER = "ollama";
  mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.model, "qwen2.5:7b-instruct");
    assert.equal(body.stream, false);
    assert.equal(body.format, "json");
    return new Response(JSON.stringify({
      response: JSON.stringify({
        text: "NBA unders have been profitable in this database slice.",
        bullets: ["58-46-2 record", "+7.8 normalized units", "106 graded decisions"],
        caveats: ["Treat as research context, not an auto-bet."],
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  {
    const explanation = await explainAskGooseAnswer("NBA full-game unders record and units since 2024", "NBA", baseAnswer());
    assert.equal(explanation.mode, "llm");
    assert.equal(explanation.llmStatus.provider, "ollama");
    assert.equal(explanation.llmStatus.status, "used");
    assert.equal(explanation.llmStatus.model, "qwen2.5:7b-instruct");
    assert.ok(explanation.bullets.some((bullet) => bullet.includes("58-46-2")));
    assert.ok(explanation.caveats.some((caveat) => caveat.includes("Database-backed only")));
    results.push({ name: "Qwen is the default Ollama model and preserves trust caveats", ok: true });
  }

  resetEnv();
  process.env.ASK_GOOSE_EXPLAINER_PROVIDER = "ollama";
  process.env.ASK_GOOSE_LOCAL_MODEL = "custom-local-model";
  mockFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.model, "custom-local-model");
    return new Response(JSON.stringify({ response: "not json" }), { status: 200 });
  });
  {
    const explanation = await explainAskGooseAnswer("NBA full-game unders record and units since 2024", "NBA", baseAnswer());
    assert.equal(explanation.mode, "deterministic");
    assert.equal(explanation.llmStatus.provider, "ollama");
    assert.equal(explanation.llmStatus.status, "bad_response");
    assert.equal(explanation.llmStatus.model, "custom-local-model");
    results.push({ name: "bad Ollama JSON falls back deterministically and honors model override", ok: true });
  }

  console.log(JSON.stringify({ ok: true, cases: results.length, results }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });
