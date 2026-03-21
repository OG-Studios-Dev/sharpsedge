import type { League } from "@/lib/types";
import type { ProfileTier, TierFeatureId } from "@/lib/tier-access";

export type AppNavItemId =
  | "home"
  | "schedule"
  | "props"
  | "picks"
  | "trends"
  | "odds"
  | "golf"
  | "parlays"
  | "my-picks"
  | "search"
  | "teams"
  | "systems"
  | "settings"
  | "admin";

export type AppNavGroupId = "research" | "tools" | "account";

export type AppNavItem = {
  id: AppNavItemId;
  href: string;
  label: string;
  shortLabel: string;
  emoji: string;
  group: AppNavGroupId;
  adminOnly?: boolean;
  shortcutEligible?: boolean;
  tierFeature?: TierFeatureId;
  leagueOverride?: League;
  badge?: ProfileTier;
};

export const APP_NAV_GROUPS: Array<{ id: AppNavGroupId; label: string }> = [
  { id: "research", label: "📊 Research" },
  { id: "tools", label: "🛠️ Tools" },
  { id: "account", label: "⚙️ Account" },
];

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    id: "home",
    href: "/",
    label: "Home",
    shortLabel: "Home",
    emoji: "🏠",
    group: "research",
    shortcutEligible: true,
  },
  {
    id: "schedule",
    href: "/schedule",
    label: "Schedule",
    shortLabel: "Schedule",
    emoji: "📅",
    group: "research",
    shortcutEligible: true,
  },
  {
    id: "props",
    href: "/props",
    label: "Props & Analytics",
    shortLabel: "Props",
    emoji: "📈",
    group: "research",
    shortcutEligible: true,
  },
  {
    id: "picks",
    href: "/picks",
    label: "AI Picks",
    shortLabel: "Picks",
    emoji: "🎯",
    group: "research",
    shortcutEligible: true,
  },
  {
    id: "trends",
    href: "/trends",
    label: "Trends",
    shortLabel: "Trends",
    emoji: "📊",
    group: "research",
    shortcutEligible: true,
  },
  {
    id: "odds",
    href: "/odds",
    label: "Lines & Odds",
    shortLabel: "Odds",
    emoji: "💰",
    group: "research",
    shortcutEligible: true,
    tierFeature: "odds_board",
    badge: "pro",
  },
  {
    id: "golf",
    href: "/golf",
    label: "Golf",
    shortLabel: "Golf",
    emoji: "⛳",
    group: "research",
    shortcutEligible: true,
    leagueOverride: "PGA",
  },
  {
    id: "parlays",
    href: "/parlays",
    label: "Parlay Builder",
    shortLabel: "Parlays",
    emoji: "🎰",
    group: "tools",
    shortcutEligible: true,
    tierFeature: "sgp_builder",
    badge: "sharp",
  },
  {
    id: "my-picks",
    href: "/my-picks",
    label: "My Picks",
    shortLabel: "My Picks",
    emoji: "📝",
    group: "tools",
    shortcutEligible: true,
    tierFeature: "my_picks",
    badge: "sharp",
  },
  {
    id: "search",
    href: "/search",
    label: "Search",
    shortLabel: "Search",
    emoji: "🔍",
    group: "tools",
    shortcutEligible: true,
  },
  {
    id: "teams",
    href: "/teams",
    label: "Teams",
    shortLabel: "Teams",
    emoji: "👥",
    group: "tools",
    shortcutEligible: true,
  },
  {
    id: "systems",
    href: "/systems",
    label: "Systems Tracking",
    shortLabel: "Systems",
    emoji: "🪿",
    group: "tools",
    shortcutEligible: true,
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    emoji: "⚙️",
    group: "account",
    shortcutEligible: true,
  },
  {
    id: "admin",
    href: "/admin",
    label: "Admin",
    shortLabel: "Admin",
    emoji: "👑",
    group: "account",
    adminOnly: true,
    shortcutEligible: true,
  },
];

export const BOTTOM_NAV_ITEM_IDS: AppNavItemId[] = ["home", "schedule", "props", "picks", "trends"];

export function getNavItemById(id: AppNavItemId) {
  return APP_NAV_ITEMS.find((item) => item.id === id) ?? null;
}

export function getNavItemsByGroup(group: AppNavGroupId) {
  return APP_NAV_ITEMS.filter((item) => item.group === group);
}
