import { NextRequest, NextResponse } from "next/server";
import { loadSnapshotRowsForBackfill, mapSnapshotRowsToGoose2 } from "@/lib/goose2/snapshot-backfill";
import { mapCandidateToInitialFeatureRow } from "@/lib/goose2/feature-mappers";
import { buildShadowDecision } from "@/lib/goose2/policy";
import {
  upsertGoose2Candidates,
  upsertGoose2DecisionLogs,
  upsertGoose2Events,
  upsertGoose2FeatureRows,
} from "@/lib/goose2/repository";
import { loadSystemQualifiers } from "@/lib/system-qualifiers-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      limit?: number;
      sport?: string;
      dry_run?: boolean;
    };

    const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 2000);
    const sport = typeof body.sport === "string" && body.sport.trim() ? body.sport.trim().toUpperCase() : undefined;
    const dryRun = Boolean(body.dry_run);

    const snapshotRows = await loadSnapshotRowsForBackfill({ limit, sport });
    const mapped = mapSnapshotRowsToGoose2(snapshotRows);
    const qualifierRows = await Promise.all([
      loadSystemQualifiers("mlb-home-majority-handle", 30),
      loadSystemQualifiers("falcons-fight-pummeled-pitchers", 30),
      loadSystemQualifiers("coach-no-rest", 30),
      loadSystemQualifiers("fat-tonys-fade", 30),
      loadSystemQualifiers("nba-goose-system", 30),
    ]);
    const qualifiers = qualifierRows.flat();

    const featureRows = mapped.candidateRows.map((candidate) =>
      mapCandidateToInitialFeatureRow({
        candidate,
        qualifiers: qualifiers ?? [],
      }),
    );

    const decisionRows = mapped.candidateRows.map((candidate, index) =>
      buildShadowDecision({
        candidate,
        featureRow: featureRows[index],
      }),
    );

    if (!dryRun) {
      await upsertGoose2Events(mapped.eventRows);
      await upsertGoose2Candidates(mapped.candidateRows);
      await upsertGoose2FeatureRows(featureRows);
      await upsertGoose2DecisionLogs(decisionRows);
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      sport: sport ?? "ALL",
      counts: {
        snapshot_events: snapshotRows.events.length,
        snapshot_prices: snapshotRows.prices.length,
        goose_events: mapped.eventRows.length,
        goose_candidates: mapped.candidateRows.length,
        goose_feature_rows: featureRows.length,
        goose_decision_logs: decisionRows.length,
      },
      sample: {
        event: mapped.eventRows[0] ?? null,
        candidate: mapped.candidateRows[0] ?? null,
        feature_row: featureRows[0] ?? null,
        decision_log: decisionRows[0] ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
