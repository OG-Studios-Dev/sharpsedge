import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export async function DELETE(
  _request: Request,
  context: { params: { id: string } },
) {
  const viewer = await getCurrentViewer();
  if (!viewer || viewer.profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  if (id === viewer.user.id) {
    return NextResponse.json({ error: "You cannot delete your own admin account" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    await supabase.profiles.deleteById(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete user",
      },
      { status: 500 },
    );
  }
}
