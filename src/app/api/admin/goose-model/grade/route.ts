/**
 * POST /api/admin/goose-model/grade
 * Grade one or more goose_model_picks entries after games settle.
 * Also triggers signal weight update for each graded pick.
 *
 * Body: { grades: Array<{ id: string; result: "win"|"loss"|"push" }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import { gradeGoosePick, updateSignalWeightsForPick } from "@/lib/goose-model/store";
import type { GoosePickResult } from "@/lib/goose-model/types";

export const dynamic = "force-dynamic";

type GradeEntry = { id: string; result: GoosePickResult };

async function fetchPickById(id: string) {
  const key = getSupabaseServiceRoleKey();
  const url = getSupabaseUrl();
  const res = await fetch(
    `${url}/rest/v1/goose_model_picks?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: String(row.id),
    sport: String(row.sport ?? ""),
    signals_present: Array.isArray(row.signals_present) ? (row.signals_present as string[]) : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { grades?: GradeEntry[] };

    if (!Array.isArray(body.grades) || !body.grades.length) {
      return NextResponse.json({ error: "grades[] array required" }, { status: 400 });
    }

    const validResults: GoosePickResult[] = ["win", "loss", "push"];
    const valid = body.grades.filter(
      (g) => g.id && validResults.includes(g.result as GoosePickResult),
    );

    if (!valid.length) {
      return NextResponse.json({ error: "No valid grade entries" }, { status: 400 });
    }

    const results = await Promise.allSettled(
      valid.map(async (g) => {
        // Grade the pick
        await gradeGoosePick(g.id, g.result);

        // Fetch pick to get signals + sport, then update weights
        try {
          const pick = await fetchPickById(g.id);
          if (pick && pick.signals_present.length > 0) {
            await updateSignalWeightsForPick(pick.signals_present, pick.sport, g.result);
          }
        } catch (weightErr) {
          console.warn("[goose-model/grade] weight update failed for", g.id, toErrorMessage(weightErr));
        }

        return { id: g.id, result: g.result };
      }),
    );

    const successes = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<GradeEntry>).value);

    const failures = results
      .filter((r) => r.status === "rejected")
      .map((r, i) => ({
        id: valid[i]?.id,
        error: String((r as PromiseRejectedResult).reason),
      }));

    return NextResponse.json({ graded: successes.length, successes, failures });
  } catch (error) {
    console.error("[goose-model/grade] failed", error);
    return NextResponse.json({ error: "Grade request failed" }, { status: 500 });
  }
}
