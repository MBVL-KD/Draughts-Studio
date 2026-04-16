/**
 * Bundel 12b: square-id lists for authoring targets (1–50).
 */

export function sortUniqueSquares(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n) && n >= 1 && n <= 50))].sort(
    (a, b) => a - b
  );
}

export function parseCommaSquareIds(raw: string): number[] {
  return sortUniqueSquares(
    raw
      .split(/[,;\s]+/)
      .map((p) => Number(p.trim()))
      .filter((n) => Number.isFinite(n))
  );
}

export function stringifySquareIds(nums: number[] | undefined): string {
  return nums?.length ? sortUniqueSquares(nums).join(", ") : "";
}

export function squareSetsEqual(a: number[], b: number[]): boolean {
  const x = sortUniqueSquares(a);
  const y = sortUniqueSquares(b);
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}
