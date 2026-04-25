import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function postgrest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
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

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lab = searchParams.get("lab") || "goose-shadow-lab";
    const rows = await postgrest<any[]>(`/rest/v1/goose_learning_lab_status_v1?lab_slug=eq.${encodeURIComponent(lab)}&select=*&limit=1`);
    const status = rows?.[0] ?? null;

    if (!status) {
      return NextResponse.json({ ok: false, error: "Learning lab not found" }, { status: 404 });
    }

    const blockers = Array.isArray(status.blockers) ? status.blockers : [];
    const modelMetrics = status.model_metrics && typeof status.model_metrics === "object" ? status.model_metrics : {};
    const readinessRules = status.readiness_rules && typeof status.readiness_rules === "object" ? status.readiness_rules : {};
    const candidateSignals = Number(status.candidate_signals || 0);
    const sanityRejectedSignals = Number(status.sanity_rejected_signals || 0);
    const sanityRejectedShare = candidateSignals ? sanityRejectedSignals / candidateSignals : 0;
    const maxSanityRejectedShare = Number(readinessRules.max_sanity_rejected_share_for_auto_ready ?? 0.75);
    const diagnosticBlockers = [
      sanityRejectedShare > maxSanityRejectedShare ? `Too many sanity-rejected signals (${(sanityRejectedShare * 100).toFixed(1)}%)` : null,
      Number(modelMetrics.dedupedTrainExamples || 0) > Number(modelMetrics.rawTrainExamples || 0) * 0.2 ? "Training split has heavy event-level duplicates" : null,
      Number(modelMetrics.dedupedTestExamples || 0) > Number(modelMetrics.rawTestExamples || 0) * 0.2 ? "Test split has heavy event-level duplicates" : null,
    ].filter(Boolean) as string[];
    const guardedReadyToRecord = Boolean(status.ready_to_record) && diagnosticBlockers.length === 0;
    const allBlockers = Array.from(new Set([...blockers, ...diagnosticBlockers]));

    return NextResponse.json({
      ok: true,
      lab,
      status: {
        ...status,
        ready_to_record: guardedReadyToRecord,
        blockers: allBlockers,
        diagnostics: {
          raw_ready_to_record: Boolean(status.ready_to_record),
          guarded_ready_to_record: guardedReadyToRecord,
          sanity_rejected_share: Number(sanityRejectedShare.toFixed(6)),
          max_sanity_rejected_share: maxSanityRejectedShare,
          diagnostic_blockers: diagnosticBlockers,
          production_write_protection: "Status endpoint is read-only and does not write production picks.",
        },
      },
      message: guardedReadyToRecord
        ? "Learning lab says it has enough context to begin recording shadow-only picks."
        : `Learning lab is still studying. Blockers: ${allBlockers.join("; ") || "unknown"}`,
    });
  } catch (error) {
    console.error("[goose-learning-lab/status] failed", error);
    return NextResponse.json({ ok: false, error: toErrorMessage(error, "Failed to load learning lab status") }, { status: 500 });
  }
}
