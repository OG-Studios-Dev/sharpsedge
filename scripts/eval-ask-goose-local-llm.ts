import { explainAskGooseAnswer } from "../src/lib/ask-goose/explanation";
import type { AskGooseAnswer } from "../src/lib/ask-goose/internal-query";

function positiveAnswer(): AskGooseAnswer {
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
  };
}

function noDataAnswer(): AskGooseAnswer {
  return {
    ...positiveAnswer(),
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
    warnings: [
      "No rows matched the interpreted filters.",
      "NFL historical coverage is currently limited in Ask Goose, so treat NFL answers as coverage diagnostics until more graded rows are loaded.",
    ],
  };
}

async function runCase(name: string, question: string, league: string, answer: AskGooseAnswer) {
  const startedAt = Date.now();
  const explanation = await explainAskGooseAnswer(question, league, answer);
  return {
    name,
    wallMs: Date.now() - startedAt,
    mode: explanation.mode,
    text: explanation.text,
    bullets: explanation.bullets,
    caveats: explanation.caveats,
    llmStatus: explanation.llmStatus,
  };
}

async function main() {
  process.env.ASK_GOOSE_EXPLAINER_PROVIDER = process.env.ASK_GOOSE_EXPLAINER_PROVIDER || "ollama";
  process.env.ASK_GOOSE_LOCAL_MODEL = process.env.ASK_GOOSE_LOCAL_MODEL || "qwen2.5:7b-instruct";
  process.env.ASK_GOOSE_OLLAMA_URL = process.env.ASK_GOOSE_OLLAMA_URL || "http://127.0.0.1:11434";
  process.env.ASK_GOOSE_LOCAL_TIMEOUT_MS = process.env.ASK_GOOSE_LOCAL_TIMEOUT_MS || "60000";

  const results = [];
  results.push(await runCase("positive-qwen", "NBA full-game unders record and units since 2024", "NBA", positiveAnswer()));
  results.push(await runCase("positive-qwen-cache-repeat", "NBA full-game unders record and units since 2024", "NBA", positiveAnswer()));
  results.push(await runCase("no-data-deterministic-skip", "NFL spread favorites record since 2024", "NFL", noDataAnswer()));

  const failed = results.filter((result) => {
    if (result.name === "no-data-deterministic-skip") return result.mode !== "deterministic" || result.llmStatus.provider !== "none";
    return result.mode !== "llm" || result.llmStatus.provider !== "ollama" || result.llmStatus.status !== "used";
  });

  console.log(JSON.stringify({
    ok: failed.length === 0,
    model: process.env.ASK_GOOSE_LOCAL_MODEL,
    generatedAt: new Date().toISOString(),
    failed: failed.map((result) => result.name),
    results,
  }, null, 2));

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
