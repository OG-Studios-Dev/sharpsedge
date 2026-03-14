"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteUserById } from "@/lib/users";

export async function deleteUserAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    return;
  }

  await deleteUserById(userId);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
}
