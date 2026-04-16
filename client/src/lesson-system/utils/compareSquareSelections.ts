/**
 * Pure helpers for Bundel 12a square-set compare (authoring preview).
 */

function sortedUnique(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
}

/** Exact same set (order ignored). */
export function squareSetsEqualExact(selected: number[], targets: number[]): boolean {
  const a = sortedUnique(selected);
  const b = sortedUnique(targets);
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Every target square appears in selected; extras allowed when `requireExactSet` is false. */
export function squareSetMatchesTargets(
  selected: number[],
  targets: number[],
  requireExactSet: boolean
): boolean {
  if (requireExactSet) {
    return squareSetsEqualExact(selected, targets);
  }
  const sel = new Set(sortedUnique(selected));
  return sortedUnique(targets).every((sq) => sel.has(sq));
}
