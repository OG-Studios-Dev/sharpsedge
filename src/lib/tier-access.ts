export type ProfileTier = "free" | "pro" | "sharp" | "beta";
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "coming_soon";

export type TierFeatureId =
  | "real_time_picks"
  | "full_trends"
  | "quick_hitters"
  | "odds_board"
  | "line_movement"
  | "sharp_alerts"
  | "sgp_builder"
  | "my_picks"
  | "club_100";

export type TieredProfileLike = {
  created_at?: string | null;
  tier?: string | null;
};

const TIER_ORDER: Record<ProfileTier, number> = {
  free: 0,
  pro: 1,
  sharp: 2,
  beta: 3,
};

export const FEATURE_MIN_TIER: Record<TierFeatureId, ProfileTier> = {
  real_time_picks: "pro",
  full_trends: "pro",
  quick_hitters: "pro",
  odds_board: "pro",
  line_movement: "sharp",
  sharp_alerts: "sharp",
  sgp_builder: "sharp",
  my_picks: "sharp",
  club_100: "sharp",
};

export const TIER_LABELS: Record<ProfileTier, string> = {
  free: "Free",
  pro: "Pro",
  sharp: "Sharp",
  beta: "Beta",
};

export function getLaunchDate() {
  return process.env.NEXT_PUBLIC_GOOSALYTICS_LAUNCH_DATE
    || process.env.GOOSALYTICS_LAUNCH_DATE
    || "";
}

export function isPreLaunchMode() {
  return getLaunchDate().trim().length === 0;
}

export function isBetaEligible(createdAt?: string | null) {
  const launchDate = getLaunchDate().trim();
  if (!launchDate) return true;
  if (!createdAt) return false;

  const createdAtTime = new Date(createdAt).getTime();
  const launchTime = new Date(launchDate).getTime();

  if (!Number.isFinite(createdAtTime) || !Number.isFinite(launchTime)) return false;
  return createdAtTime < launchTime;
}

export function normalizeTier(value?: string | null): ProfileTier {
  if (value === "pro" || value === "sharp" || value === "beta") return value;
  return "free";
}

export function getEffectiveTier(profile?: TieredProfileLike | null): ProfileTier {
  const tier = normalizeTier(profile?.tier);
  if (tier === "beta") return "beta";
  if (isBetaEligible(profile?.created_at)) return "beta";
  return tier;
}

export function hasTierAccess(currentTier: ProfileTier, requiredTier: ProfileTier) {
  if (currentTier === "beta") return true;
  if ((requiredTier as string) === "beta") return (currentTier as string) === "beta";
  return TIER_ORDER[currentTier] >= TIER_ORDER[requiredTier];
}

export function canAccessFeature(
  feature: TierFeatureId,
  profile?: TieredProfileLike | null,
  fallbackTier?: ProfileTier,
) {
  const currentTier = fallbackTier ?? getEffectiveTier(profile);
  return hasTierAccess(currentTier, FEATURE_MIN_TIER[feature]);
}

export function getFeatureTier(feature: TierFeatureId) {
  return FEATURE_MIN_TIER[feature];
}

export function getFeatureCopy(feature: TierFeatureId) {
  switch (feature) {
    case "real_time_picks":
      return {
        title: "Real-time AI picks",
        description: "Free users see delayed picks. Upgrade for the live board as soon as the model posts.",
      };
    case "full_trends":
      return {
        title: "Full trend board",
        description: "Free users only get the top five trend cards. Upgrade to unlock the full ranked slate.",
      };
    case "quick_hitters":
      return {
        title: "Quick Hitters",
        description: "Short-line value props and rapid-fire edges are reserved for Pro and Sharp tiers.",
      };
    case "odds_board":
      return {
        title: "Line shopping",
        description: "Best-price line shopping and book-by-book comparisons are part of Pro and Sharp.",
      };
    case "line_movement":
      return {
        title: "Line movement",
        description: "Sharp users get the movement board once Stripe is live.",
      };
    case "sharp_alerts":
      return {
        title: "Sharp alerts",
        description: "Sharp tier unlocks the sharper-book and alert layer.",
      };
    case "sgp_builder":
      return {
        title: "SGP builder",
        description: "Same-game parlay building is part of Sharp.",
      };
    case "my_picks":
      return {
        title: "My Picks tracking",
        description: "Track your own record, units, and parlays with Sharp access.",
      };
    case "club_100":
      return {
        title: "100% Club",
        description: "Perfect and near-perfect trend boards are reserved for Sharp.",
      };
    default:
      return {
        title: "Premium feature",
        description: "Upgrade to access this section.",
      };
  }
}
