import { NextResponse } from "next/server";
import { buildGoose2TrainingAudit } from "@/lib/goose2/training-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const audit = await buildGoose2TrainingAudit();
    return NextResponse.json({ ok: true, audit });
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
