"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppChrome } from "@/components/AppChromeProvider";
import { getFeatureCopy, getFeatureTier, hasTierAccess, type TierFeatureId } from "@/lib/tier-access";

type LockedFeatureProps = {
  feature: TierFeatureId;
  children: ReactNode;
  compact?: boolean;
};

export default function LockedFeature({
  feature,
  children,
  compact = false,
}: LockedFeatureProps) {
  const router = useRouter();
  const { viewer } = useAppChrome();
  const requiredTier = getFeatureTier(feature);
  const allowed = hasTierAccess(viewer.tier, requiredTier);

  if (allowed) {
    return <>{children}</>;
  }

  const copy = getFeatureCopy(feature);

  return (
    <div className="relative overflow-hidden rounded-3xl">
      <div className="pointer-events-none select-none opacity-30 blur-[1.5px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(13,17,24,0.64)_0%,rgba(13,17,24,0.92)_100%)] p-4">
        <div className="max-w-sm rounded-3xl border border-dark-border bg-dark-surface/95 p-4 text-center shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
          <p className="section-heading">{requiredTier} feature</p>
          <h3 className={`mt-2 text-white ${compact ? "text-base font-semibold" : "text-lg font-semibold"}`}>{copy.title}</h3>
          <p className="mt-2 text-sm text-gray-400">{copy.description}</p>
          <button
            type="button"
            onClick={() => router.push(`/upgrade?feature=${feature}`)}
            className="tap-button mt-4 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue"
          >
            Upgrade to {requiredTier === "pro" ? "Pro" : "Sharp"}
          </button>
        </div>
      </div>
    </div>
  );
}
