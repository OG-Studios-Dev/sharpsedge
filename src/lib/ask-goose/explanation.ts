import type { AskGooseAnswer } from "./internal-query";

export type AskGooseLlmStatus = {
  status: "used" | "not_configured" | "not_applicable" | "request_failed" | "bad_response";
  model: string | null;
  reason: string;
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

export async function explainAskGooseAnswer(question: string, league: string, answer: AskGooseAnswer): Promise<AskGooseExplanation> {
  const fallback = fallbackExplanation(question, league, answer);
  const model = process.env.ASK_GOOSE_LLM_MODEL || "gpt-4.1-mini";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!answer.intent.looksLikeBettingQuestion) {
    return withLlmStatus(fallback, {
      status: "not_applicable",
      model: null,
      reason: "Question did not look like a betting-analysis request, so Ask Goose used the deterministic database summary.",
    });
  }

  if (!apiKey) {
    return withLlmStatus(fallback, {
      status: "not_configured",
      model,
      reason: "OPENAI_API_KEY is not configured, so Ask Goose returned the deterministic database explanation instead of silently pretending the LLM ran.",
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
        model,
        reason: `OpenAI request failed with HTTP ${response.status}, so Ask Goose returned the deterministic database explanation.`,
      });
    }
    const payload = await response.json() as any;
    const text = payload.output_text || payload.output?.flatMap?.((item: any) => item.content || [])?.map?.((content: any) => content.text || "")?.join?.("\n") || "";
    const parsed = parseJsonObject(String(text));
    if (!parsed || typeof parsed.text !== "string") {
      return withLlmStatus(fallback, {
        status: "bad_response",
        model,
        reason: "OpenAI returned an unusable explanation payload, so Ask Goose returned the deterministic database explanation.",
      });
    }
    return {
      mode: "llm",
      text: parsed.text,
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.filter((v): v is string => typeof v === "string").slice(0, 4) : fallback.bullets,
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats.filter((v): v is string => typeof v === "string").slice(0, 6) : fallback.caveats,
      llmStatus: {
        status: "used",
        model,
        reason: "LLM explanation generated from the computed database facts.",
      },
    };
  } catch {
    return withLlmStatus(fallback, {
      status: "request_failed",
      model,
      reason: "OpenAI request threw an error, so Ask Goose returned the deterministic database explanation.",
    });
  }
}
