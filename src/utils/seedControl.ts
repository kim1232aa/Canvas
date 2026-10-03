export function nextSeedAfterGeneration(actualSeed: number | null, mode?: string): number | undefined {
  if (actualSeed === null || !Number.isSafeInteger(actualSeed)) return undefined;
  if (mode === 'increment') return Math.min(Number.MAX_SAFE_INTEGER, actualSeed + 1);
  if (mode === 'decrement') return Math.max(0, actualSeed - 1);
  return actualSeed;
}
