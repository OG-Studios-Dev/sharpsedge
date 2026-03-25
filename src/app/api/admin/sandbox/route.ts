import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { generateSandboxSlate, type SandboxLeague } from "@/lib/sandbox/generator";
import { createSandboxSlate, listSandboxSlateBundles, listSandboxSlates } from "@/lib/sandbox/store";
import type { SandboxPickRecord, SandboxSlateRecord } from "@/lib/sandbox/types";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function isSandboxLeague(value: string): value is SandboxLeague {
  return value === "NBA" || value === "NHL";
}

function serializeSlate(slate: SandboxSlateRecord | null) {
  if (!slate) return null;
  return {
    ...slate,
    separation: slate.review_snapshot.separation,
    visibility: slate.review_snapshot.visibility,
  };
}

function serializePick(pick: SandboxPickRecord) {
  return {
    ...pick,
    separation: pick.review_snapshot.separation,
    visibility: pick.review_snapshot.visibility,
  };
}

function serializeBundle(bundle: { slate: SandboxSlateRecord | null; picks: SandboxPickRecord[] }) {
  return {
    slate: serializeSlate(bundle.slate),
    picks: bundle.picks.map(serializePick),
  };
}

export async function GET(request: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || viewer.profile?.role !== "admin") return unauthorized();

  const includeBundles = request.nextUrl.searchParams.get("include") === "bundles";
  if (includeBundles) {
    const bundles = await listSandboxSlateBundles();
    return NextResponse.json({ bundles: bundles.map(serializeBundle) });
  }

  const slates = await listSandboxSlates();
  return NextResponse.json({ slates: slates.map(serializeSlate) });
}

export async function POST(request: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || viewer.profile?.role !== "admin") return unauthorized();

  try {
    const body = await request.json();
    const mode = String(body?.mode ?? "create").trim();

    if (mode === "generate") {
      const league = String(body?.league ?? "").trim().toUpperCase();
      if (!isSandboxLeague(league)) {
        return NextResponse.json({ error: "league must be NBA or NHL" }, { status: 400 });
      }

      const generated = await generateSandboxSlate(league, body?.date ? String(body.date) : null);
      const bundle = await createSandboxSlate({
        sandboxKey: generated.sandboxKey,
        date: generated.date,
        league: generated.league,
        experimentTag: generated.experimentTag,
        reviewNotes: generated.reviewNotes,
        picks: generated.picks,
      });

      return NextResponse.json({ ok: true, mode: "generate", bundle: serializeBundle(bundle) });
    }

    const bundle = await createSandboxSlate({
      sandboxKey: String(body?.sandboxKey ?? "").trim(),
      date: String(body?.date ?? "").trim(),
      league: String(body?.league ?? "").trim(),
      experimentTag: body?.experimentTag ? String(body.experimentTag) : null,
      reviewNotes: body?.reviewNotes ? String(body.reviewNotes) : null,
      picks: Array.isArray(body?.picks) ? body.picks : [],
    });

    return NextResponse.json({ ok: true, mode: "create", bundle: serializeBundle(bundle) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}
