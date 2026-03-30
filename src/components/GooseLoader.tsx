"use client";

/**
 * GooseLoader — Goosalytics branded loading components.
 *
 * Variants:
 *   fullscreen  — app-level / route-level full-screen overlay
 *   page        — centered in the content area (not full viewport)
 *   section     — compact inline loading state for cards / sections
 *
 * The goose-in-flight SVG uses pure CSS keyframe animation:
 *   - Two wing paths (upper + lower) that counter-rotate around their wing roots
 *   - The whole icon gently glides on a vertical sine (goose-glide keyframe)
 */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Flying goose SVG — brand colours, minimalist silhouette, animates via CSS
// ---------------------------------------------------------------------------
function GooseFlightIcon({
  className = "",
  size = 64,
}: {
  className?: string;
  size?: number;
}) {
  const h = size;
  const w = Math.round(size * (128 / 60));

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 128 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`goose-glide ${className}`}
      aria-hidden="true"
    >
      {/*
        Upper wing — sweeps back-upward from the body.
        Rotates around its root at (54, 28) in the SVG coordinate space.
      */}
      <path
        d="M 54,28 C 48,20 36,10 14,11 C 22,15 40,20 52,26 Z"
        className="goose-wing-upper"
        fill="white"
        style={{ transformOrigin: "54px 28px" }}
      />

      {/*
        Lower wing — sweeps forward-downward (visible below body).
        Rotates counter to the upper wing around (54, 36).
      */}
      <path
        d="M 54,36 C 48,44 36,52 14,51 C 22,49 40,43 52,38 Z"
        className="goose-wing-lower"
        fill="white"
        style={{ transformOrigin: "54px 36px" }}
      />

      {/*
        Body + neck + head (static).
        Tail at left (~12,34), beak at right (~106,15).
        Neck sweeps forward and upward in a single compound path.
      */}
      <path
        d="
          M 12,34
          C 18,44 46,46 68,40
          C 72,38 76,33 79,27
          C 85,19 92,12 97,9
          C 99,7 103,7 105,11
          C 107,13 106,17 103,19
          C 99,21 94,22 89,23
          C 84,25 79,28 75,32
          C 70,35 64,36 60,36
          C 42,37 22,36 12,34
          Z
        "
        fill="white"
      />

      {/* Beak accent — matches the brand orange tone */}
      <path
        d="M 103,19 C 100,21 94,22 89,23 L 105,11 C 107,13 106,17 103,19 Z"
        fill="#d97706"
        opacity="0.9"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Full-screen loader — used for route-level loading.tsx files
// ---------------------------------------------------------------------------
export function GoosePageLoader({
  label = "Loading",
  sublabel,
}: {
  label?: string;
  sublabel?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dark-bg"
      role="status"
      aria-label={label}
    >
      {/* Subtle radial glow behind the goose */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 480px 280px at 50% 50%, rgba(74,158,255,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Goose icon */}
      <div className="relative mb-6">
        <GooseFlightIcon size={76} />
        {/* Soft blue halo under the goose */}
        <div
          className="absolute inset-0 -z-10 blur-2xl"
          style={{
            background:
              "radial-gradient(ellipse 120px 40px at 50% 80%, rgba(74,158,255,0.18) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Brand wordmark */}
      <p
        className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500"
        style={{ letterSpacing: "0.24em" }}
      >
        GOOSALYTICS
      </p>

      {/* Loading label */}
      <p className="text-sm font-semibold text-white">{label}</p>

      {/* Optional sublabel */}
      {sublabel && (
        <p className="mt-1 text-[11px] text-gray-500">{sublabel}</p>
      )}

      {/* Animated data-feed pulse bar */}
      <div className="mt-6 h-px w-40 overflow-hidden rounded-full bg-dark-border">
        <div className="goose-scan-bar h-full rounded-full bg-accent-blue" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section / inline loader — used within page content areas
// ---------------------------------------------------------------------------
export function GooseSectionLoader({
  label = "Loading",
  sublabel,
  minHeight = "min-h-[200px]",
}: {
  label?: string;
  sublabel?: string;
  minHeight?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${minHeight}`}
      role="status"
      aria-label={label}
    >
      <GooseFlightIcon size={44} />
      <div className="text-center">
        <p className="text-sm font-semibold text-white">{label}</p>
        {sublabel && (
          <p className="mt-0.5 text-[11px] text-gray-500">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny inline spinner variant — for buttons / small loading states
// ---------------------------------------------------------------------------
export function GooseInlineLoader({ label = "Loading" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-2"
      role="status"
      aria-label={label}
    >
      <GooseFlightIcon size={20} className="opacity-80" />
      <span className="text-xs text-gray-400">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Default export — full-screen (most common usage in loading.tsx files)
// ---------------------------------------------------------------------------
export default function GooseLoader({
  children,
  loading,
  label,
  sublabel,
  minHeight,
}: {
  children?: ReactNode;
  loading?: boolean;
  label?: string;
  sublabel?: string;
  minHeight?: string;
}) {
  // If children provided, act as a conditional wrapper
  if (children !== undefined) {
    if (loading) {
      return (
        <GooseSectionLoader
          label={label}
          sublabel={sublabel}
          minHeight={minHeight}
        />
      );
    }
    return <>{children}</>;
  }
  // No children — render section loader directly
  return (
    <GooseSectionLoader label={label} sublabel={sublabel} minHeight={minHeight} />
  );
}
