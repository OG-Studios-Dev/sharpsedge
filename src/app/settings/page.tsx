"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-client";
import PageHeader from "@/components/PageHeader";

type UserProfile = {
  name: string;
  email: string;
  username: string | null;
  role: string;
  tier: string;
  created_at: string;
  last_login_at: string | null;
};

const LEAGUES = ["NHL", "NBA", "MLB", "PGA"];

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [favLeague, setFavLeague] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("goosalytics_fav_league") || "All";
    return "All";
  });

  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserClient();
        const result = await supabase.auth.getSession();
        if (result.data?.profile) {
          setProfile({
            name: result.data.profile.name || "Goosalytics User",
            email: result.data.user?.email || "",
            username: result.data.profile.username || null,
            role: result.data.profile.role || "user",
            tier: result.data.profile.tier || "free",
            created_at: result.data.profile.created_at || "",
            last_login_at: result.data.profile.last_login_at || null,
          });
        }
      } catch {
        // Not logged in
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleFavLeague(league: string) {
    setFavLeague(league);
    localStorage.setItem("goosalytics_fav_league", league);
  }

  async function handleLogout() {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    } catch {}
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <PageHeader title="" subtitle="" />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-dark-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg pb-24">
      <PageHeader title="" subtitle="" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Profile Header */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-accent-blue/20 flex items-center justify-center text-2xl font-bold text-accent-blue">
            {(profile?.name || "G").charAt(0).toUpperCase()}
          </div>
          <h2 className="text-white font-bold text-lg mt-2">{profile?.name || "Goosalytics User"}</h2>
          <p className="text-gray-400 text-xs">{profile?.email || "Not signed in"}</p>
          {profile?.role === "admin" && (
            <span className="inline-block mt-1 text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded-full px-2 py-0.5 font-bold">ADMIN</span>
          )}
        </div>

        {/* Account Info */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-dark-border/50">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Account</p>
          </div>
          <SettingRow label="Name" value={profile?.name || "—"} />
          <SettingRow label="Email" value={profile?.email || "—"} />
          <SettingRow label="Username" value={profile?.username ? `@${profile.username}` : "Not set"} />
          <SettingRow label="Member since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
        </div>

        {/* Subscription */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-dark-border/50">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Subscription</p>
          </div>
          <SettingRow label="Current Plan" value={profile?.tier === "beta" ? "Beta (Free Sharp)" : (profile?.tier || "Free").charAt(0).toUpperCase() + (profile?.tier || "free").slice(1)} />
          <SettingRow label="Billing" value="Not connected" />
          <div className="px-4 py-3 border-b border-dark-border/20">
            <Link href="/upgrade" className="text-sm font-semibold text-accent-blue">
              View Plans & Upgrade →
            </Link>
          </div>
        </div>

        {/* Preferences */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-dark-border/50">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Preferences</p>
          </div>
          <div className="px-4 py-3 border-b border-dark-border/20">
            <p className="text-xs text-gray-400 mb-2">Default League</p>
            <div className="flex gap-2 flex-wrap">
              {["All", ...LEAGUES].map((league) => (
                <button
                  key={league}
                  onClick={() => handleFavLeague(league)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors tap-button ${
                    favLeague === league
                      ? "bg-accent-blue text-white border-accent-blue"
                      : "border-dark-border text-gray-400"
                  }`}
                >
                  {league}
                </button>
              ))}
            </div>
          </div>
          <SettingRow label="Odds Format" value="American (-110)" />
          <SettingRow label="Notifications" value="Coming soon" />
        </div>

        {/* Security */}
        <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-dark-border/50">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Security</p>
          </div>
          <div className="px-4 py-3 border-b border-dark-border/20">
            <button className="text-sm text-gray-400">Change Password</button>
            <p className="text-[10px] text-gray-600 mt-0.5">Coming soon</p>
          </div>
        </div>

        {/* Admin */}
        {profile?.role === "admin" && (
          <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-dark-border/50">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Admin</p>
            </div>
            <div className="px-4 py-3">
              <Link href="/admin" className="text-sm font-semibold text-accent-blue">
                Open Admin Dashboard →
              </Link>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm font-semibold text-red-300 tap-button"
        >
          Sign Out
        </button>

        {/* App Info */}
        <p className="text-center text-[10px] text-gray-600">
          Goosalytics · Pick Smarter · v1.0
        </p>
      </div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border/20">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}
