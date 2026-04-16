import type { RuntimeStructuredMove } from "./runtimeValidationTypes";

function sameNumberArray(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Path-aware equality for runtime structured moves (Roblox + server).
 * Does NOT compare notation strings alone.
 */
export function movesEqual(expected: RuntimeStructuredMove, actual: RuntimeStructuredMove): boolean {
  return (
    expected.from === actual.from &&
    expected.to === actual.to &&
    sameNumberArray(expected.path, actual.path) &&
    sameNumberArray(expected.captures, actual.captures)
  );
}

export type PlayedMoveLike = {
  from: number;
  to: number;
  path: number[];
  captures: number[];
};

export function playedMoveMatchesStructured(
  expected: RuntimeStructuredMove,
  actual: PlayedMoveLike
): boolean {
  return movesEqual(expected, {
    notation: "",
    from: actual.from,
    to: actual.to,
    path: actual.path,
    captures: actual.captures,
  });
}
