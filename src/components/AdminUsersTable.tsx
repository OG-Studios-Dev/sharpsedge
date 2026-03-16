"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRecord } from "@/lib/supabase-types";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminUsersTable({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: ProfileRecord[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteUser(userId: string) {
    const confirmed = window.confirm("Delete this user from Supabase Auth and profiles?");
    if (!confirmed) return;

    setBusyId(userId);
    setError(null);

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Delete failed" }));
      setError(typeof payload?.error === "string" ? payload.error : "Delete failed");
      setBusyId(null);
      return;
    }

    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface">
        <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.7fr_0.7fr_0.6fr] gap-3 border-b border-dark-border/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          <span>Name</span>
          <span>Username</span>
          <span>Role</span>
          <span>Joined</span>
          <span>Last Login</span>
          <span className="text-right">Action</span>
        </div>

        {users.map((user) => {
          const isCurrentUser = user.id === currentUserId;
          return (
            <div
              key={user.id}
              className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.7fr_0.7fr_0.6fr] gap-3 border-b border-dark-border/30 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="truncate text-xs text-gray-500">{user.id.slice(0, 8)}</p>
              </div>
              <p className="text-sm text-gray-300">{user.username ? `@${user.username}` : "—"}</p>
              <p className="text-sm text-gray-300">{user.role}</p>
              <p className="text-sm text-gray-400">{formatDate(user.created_at)}</p>
              <p className="text-sm text-gray-400">{user.last_login_at ? formatDate(user.last_login_at) : "Never"}</p>
              <div className="text-right">
                <button
                  type="button"
                  disabled={isCurrentUser || busyId === user.id}
                  onClick={() => deleteUser(user.id)}
                  className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-xs font-semibold text-accent-red disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === user.id ? "Deleting..." : isCurrentUser ? "Current" : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
