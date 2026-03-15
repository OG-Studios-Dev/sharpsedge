import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

export async function getCurrentViewer() {
  const supabase = createServerClient();
  const session = await supabase.auth.getSession();
  if (!session) return null;

  const profile = await supabase.profiles.ensureForUser(session.user);
  return {
    session,
    user: session.user,
    profile,
  };
}

export async function requireUser() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireUser();
  if (viewer.profile?.role !== "admin") redirect("/settings");
  return viewer;
}
