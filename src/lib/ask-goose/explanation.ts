import type { AskGooseAnswer } from "./internal-query";

export const DEFAULT_ASK_GOOSE_LOCAL_MODEL = "qwen2.5:7b-instruct";
export const ASK_GOOSE_EXPLAINER_PROMPT_VERSION = "ask_goose_explainer_v2_fact_packet_json";

export type AskGooseLlmProvider = "openai" | "ollama";

export type AskGooseLlmStatus = {
  status: "used" | "not_configured" | "not_applicable" | "request_failed" | "bad_response";
  provider: AskGooseLlmProvider | "none";
  model: string | null;
  reason: string;
  promptVersion?: string;
  durationMs?: number;
  cacheStatus?: "hit" | "miss" | "bypass";
};

export type AskGooseExplanation = {
  mode: "llm" | "deterministic";
  text: string;
  bullets: string[];
  caveats: string[];
  llmStatus: AskGooseLlmStatus;
};

function withLlmStatus(explanation: Omit<AskGooseExplanation, "llmStatus">, llmStatus: AskGooseLlmStatus): AskGooseExplanation {
  return { ...explanation, llmStatus };
}

type LocalExplanationCacheEntry = {
  createdAt: number;
  explanation: Omit<AskGooseExplanation, "llmStatus">;
};

const localExplanationCache = new Map<string, LocalExplanationCacheEntry>();

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function localCacheTtlMs() {
  const parsed = Number(process.env.ASK_GOOSE_LOCAL_CACHE_TTL_MS || 300000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, 15 * 60 * 1000);
}

function buildLocalExplanationCacheKey(model: string, prompt: string) {
  return `${ASK_GOOSE_EXPLAINER_PROMPT_VERSION}:${model}:${stableHash(prompt)}`;
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function fallbackExplanation(question: string, league: string, answer: AskGooseAnswer): Omit<AskGooseExplanation, "llmStatus"> {
  if (!answer.intent.looksLikeBettingQuestion || answer.gradedRows === 0) {
    return {
      mode: "deterministic",
      text: answer.summaryText,
      bullets: answer.warnings.length ? answer.warnings : ["No reliable betting sample was available for this exact query."],
      caveats: answer.trustNotes,
    };
  }

  const winPct = answer.wins + answer.losses > 0 ? (answer.wins / (answer.wins + answer.losses)) * 100 : 0;
  const edgeLabel = answer.totalUnits > 0 ? "profitable historically" : answer.totalUnits < 0 ? "negative historically" : "flat historically";
  const sampleLabel = answer.gradedRows >= 50 ? "usable" : answer.gradedRows >= 20 ? "early but useful" : "thin";

  return {
    mode: "deterministic",
    text: `${league} read: this slice is ${edgeLabel}. The database shows ${answer.wins}-${answer.losses}-${answer.pushes} over ${answer.gradedRows} graded decisions (${formatPct(winPct)} win rate), ${answer.totalUnits.toFixed(2)} normalized units, ${formatPct(answer.avgRoi)} ROI per 1u risk.`,
    bullets: [
      `Sample quality: ${sampleLabel} (${answer.gradedRows} graded decisions from ${answer.rawRows} raw rows).`,
      `Pricing: normalized units are used so weird source odds do not inflate the answer.`,
      `Best use: treat this as research context, not an auto-bet, until the current market and injury/lineup context agree.`,
    ],
    caveats: answer.warnings.concat(answer.trustNotes),
  };
}

function buildLlmPrompt(question: string, league: string, answer: AskGooseAnswer) {
  return [
    "You are Ask Goose, a cautious sports betting research analyst.",
    "You must not invent stats, picks, odds, injuries, or causal claims.",
    "Use ONLY the computed facts below. If sample is thin or warnings exist, say so plainly.",
    "If there are zero graded rows, say the database cannot prove this angle yet; do not answer from general sports knowledge.",
    "Never call something a bet, lock, guarantee, or recommendation unless the computed facts prove it. Frame outputs as database research.",
    "Return concise JSON with keys: text (string), bullets (array of 2-4 strings), caveats (array of strings).",
    JSON.stringify({
      question,
      league,
      computed: {
        summaryText: answer.summaryText,
        sampleSize: answer.sampleSize,
        rawRows: answer.rawRows,
        dedupedRows: answer.dedupedRows,
        gradedRows: answer.gradedRows,
        wins: answer.wins,
        losses: answer.losses,
        pushes: answer.pushes,
        normalizedUnits: Number(answer.totalUnits.toFixed(4)),
        normalizedRoiPct: Number(answer.avgRoi.toFixed(4)),
        sourceUnits: Number(answer.sourceUnits.toFixed(4)),
        sourceAvgRoi: Number(answer.sourceAvgRoi.toFixed(4)),
        warnings: answer.warnings,
        trustNotes: answer.trustNotes,
        counterSide: answer.counterSide,
        intent: answer.intent,
      },
      evidenceRows: answer.evidenceRows.slice(0, 6).map((row) => ({
        event_date: row.event_date,
        team_name: row.team_name,
        opponent_name: row.opponent_name,
        market_type: row.market_type,
        submarket_type: row.submarket_type,
        side: row.side,
        line: row.line,
        odds: row.odds,
        result: row.result,
      })),
    }),
  ].join("\n");
}

function parseJsonObject(value: string): { text?: unknown; bullets?: unknown; caveats?: unknown } | null {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

function providerFromEnv(): AskGooseLlmProvider {
  return process.env.ASK_GOOSE_EXPLAINER_PROVIDER === "ollama" ? "ollama" : "openai";
}

function normalizeParsedExplanation(
  parsed: { text?: unknown; bullets?: unknown; caveats?: unknown },
  fallback: Omit<AskGooseExplanation, "llmStatus">,
) {
  if (typeof parsed.text !== "string" || parsed.text.trim().length < 20) return null;
  const parsedBullets = Array.isArray(parsed.bullets) ? parsed.bullets.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 4) : [];
  const parsedCaveats = Array.isArray(parsed.caveats) ? parsed.caveats.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 6) : [];
  const caveats = Array.from(new Set([...parsedCaveats, ...fallback.caveats])).slice(0, 8);
  return {
    mode: "llm" as const,
    text: parsed.text.trim(),
    bullets: parsedBullets.length >= 2 ? parsedBullets : fallback.bullets,
    caveats: caveats.length ? caveats : fallback.caveats,
  };
}

async function explainWithOpenAi(question: string, league: string, answer: AskGooseAnswer, fallback: Omit<AskGooseExplanation, "llmStatus">): Promise<AskGooseExplanation> {
  const startedAt = Date.now();
  const model = process.env.ASK_GOOSE_LLM_MODEL || "gpt-4.1-mini";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return withLlmStatus(fallback, {
      status: "not_configured",
      provider: "openai",
      model,
      reason: "OPENAI_API_KEY is not configured, so Ask Goose returned the deterministic database explanation instead of silently pretending the LLM ran.",
      promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      cacheStatus: "bypass",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: buildLlmPrompt(question, league, answer),
        temperature: 0.2,
        max_output_tokens: 500,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return withLlmStatus(fallback, {
        status: "request_failed",
        provider: "openai",
        model,
        reason: `OpenAI request failed with HTTP ${response.status}, so Ask Goose returned the deterministic database explanation.`,
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: "bypass",
      });
    }
    const payload = await response.json() as any;
    const text = payload.output_text || payload.output?.flatMap?.((item: any) => item.content || [])?.map?.((content: any) => content.text || "")?.join?.("\n") || "";
    const parsed = parseJsonObject(String(text));
    const explanation = parsed ? normalizeParsedExplanation(parsed, fallback) : null;
    if (!explanation) {
      return withLlmStatus(fallback, {
        status: "bad_response",
        provider: "openai",
        model,
        reason: "OpenAI returned an unusable explanation payload, so Ask Goose returned the deterministic database explanation.",
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: "bypass",
      });
    }
    return {
      ...explanation,
      llmStatus: {
        status: "used",
        provider: "openai",
        model,
        reason: "OpenAI explanation generated from the computed database facts.",
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: "bypass",
      },
    };
  } catch {
    return withLlmStatus(fallback, {
      status: "request_failed",
      provider: "openai",
      model,
      reason: "OpenAI request threw an error, so Ask Goose returned the deterministic database explanation.",
      promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      cacheStatus: "bypass",
    });
  }
}

async function explainWithOllama(question: string, league: string, answer: AskGooseAnswer, fallback: Omit<AskGooseExplanation, "llmStatus">): Promise<AskGooseExplanation> {
  const startedAt = Date.now();
  const model = process.env.ASK_GOOSE_LOCAL_MODEL || process.env.ASK_GOOSE_LLM_MODEL || DEFAULT_ASK_GOOSE_LOCAL_MODEL;
  const baseUrl = (process.env.ASK_GOOSE_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const timeoutMs = Number(process.env.ASK_GOOSE_LOCAL_TIMEOUT_MS || 8000);
  const prompt = buildLlmPrompt(question, league, answer);
  const cacheTtlMs = localCacheTtlMs();
  const cacheKey = buildLocalExplanationCacheKey(model, prompt);
  const cached = cacheTtlMs > 0 ? localExplanationCache.get(cacheKey) : null;

  if (cached && Date.now() - cached.createdAt <= cacheTtlMs) {
    return {
      ...cached.explanation,
      llmStatus: {
        status: "used",
        provider: "ollama",
        model,
        reason: "Local Ollama explanation served from the short-lived fact-packet cache.",
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: "hit",
      },
    };
  }

  if (cached) localExplanationCache.delete(cacheKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 500 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return withLlmStatus(fallback, {
        status: "request_failed",
        provider: "ollama",
        model,
        reason: `Ollama request failed with HTTP ${response.status}, so Ask Goose returned the deterministic database explanation.`,
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: cacheTtlMs > 0 ? "miss" : "bypass",
      });
    }
    const payload = await response.json() as { response?: unknown };
    const parsed = parseJsonObject(String(payload.response || ""));
    const explanation = parsed ? normalizeParsedExplanation(parsed, fallback) : null;
    if (!explanation) {
      return withLlmStatus(fallback, {
        status: "bad_response",
        provider: "ollama",
        model,
        reason: "Ollama returned an unusable explanation payload, so Ask Goose returned the deterministic database explanation.",
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: cacheTtlMs > 0 ? "miss" : "bypass",
      });
    }

    if (cacheTtlMs > 0) {
      localExplanationCache.set(cacheKey, { createdAt: Date.now(), explanation });
    }

    return {
      ...explanation,
      llmStatus: {
        status: "used",
        provider: "ollama",
        model,
        reason: "Local Ollama explanation generated from the computed database facts.",
        promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        cacheStatus: cacheTtlMs > 0 ? "miss" : "bypass",
      },
    };
  } catch {
    return withLlmStatus(fallback, {
      status: "request_failed",
      provider: "ollama",
      model,
      reason: "Ollama request threw or timed out, so Ask Goose returned the deterministic database explanation.",
      promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
      durationMs: Date.now() - startedAt,
      cacheStatus: cacheTtlMs > 0 ? "miss" : "bypass",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function explainAskGooseAnswer(question: string, league: string, answer: AskGooseAnswer): Promise<AskGooseExplanation> {
  const fallback = fallbackExplanation(question, league, answer);

  if (!answer.intent.looksLikeBettingQuestion) {
    return withLlmStatus(fallback, {
      status: "not_applicable",
      provider: "none",
      model: null,
      reason: "Question did not look like a betting-analysis request, so Ask Goose used the deterministic database summary.",
      promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
      cacheStatus: "bypass",
    });
  }

  if (answer.gradedRows === 0) {
    return withLlmStatus(fallback, {
      status: "not_applicable",
      provider: "none",
      model: null,
      reason: "No graded database rows matched this query, so Ask Goose skipped the LLM and returned the deterministic no-data explanation.",
      promptVersion: ASK_GOOSE_EXPLAINER_PROMPT_VERSION,
      cacheStatus: "bypass",
    });
  }

  const provider = providerFromEnv();
  return provider === "ollama"
    ? explainWithOllama(question, league, answer, fallback)
    : explainWithOpenAi(question, league, answer, fallback);
}
