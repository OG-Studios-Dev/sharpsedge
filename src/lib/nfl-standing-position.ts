export function resolveNFLStandingPosition(providerPosition: unknown, fallbackPosition: number) {
  const parsed = Number(providerPosition);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackPosition;
}

export default { resolveNFLStandingPosition };
