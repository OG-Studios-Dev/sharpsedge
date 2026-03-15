import type { CSSProperties } from "react";

export function getStaggerStyle(index: number): CSSProperties {
  return { ["--stagger-index" as string]: index };
}
