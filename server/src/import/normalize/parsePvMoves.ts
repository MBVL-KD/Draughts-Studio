/**
 * Normalizes Scan PV lines to step move strings (PD notation, e.g. "31-26", "25x34x30").
 */
export function parsePvToStepMoves(pv: string[] | undefined | null): string[] {
  if (!Array.isArray(pv)) return [];
  return pv
    .map((m) => String(m).trim())
    .filter((m) => m.length > 0);
}

/** PD capture: square numbers separated by `x` (incl. multi-jump `25x34x30`). */
export function isPdCaptureNotation(move: string): boolean {
  return /x/i.test(String(move).trim());
}

type Side = "white" | "black";

function otherSide(side: Side): Side {
  return side === "white" ? "black" : "white";
}

/**
 * Keeps only the combination part:
 * stop right before the first quiet (non-capturing) move played by the side
 * that did NOT start the puzzle. Also allow early stop at the starter's last
 * capture (to avoid forcing quiet tail-defense lines after the combo).
 */
export function truncatePvBeforeFirstQuietReplyByNonStarter(
  pv: string[] | undefined | null,
  starterSide: Side
): string[] {
  const moves = parsePvToStepMoves(pv);
  if (moves.length === 0) return [];

  const nonStarter = otherSide(starterSide);
  let sideToMove: Side = starterSide;
  let firstNonStarterQuietIndex = -1;
  let lastStarterCaptureIndex = -1;

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    const isCapture = isPdCaptureNotation(move);
    if (sideToMove === nonStarter && !isCapture && firstNonStarterQuietIndex < 0) {
      firstNonStarterQuietIndex = i;
    }
    if (sideToMove === starterSide && isCapture) {
      lastStarterCaptureIndex = i;
    }
    sideToMove = otherSide(sideToMove);
  }

  if (firstNonStarterQuietIndex >= 0 && lastStarterCaptureIndex >= 0) {
    return moves.slice(0, Math.min(firstNonStarterQuietIndex, lastStarterCaptureIndex + 1));
  }
  if (firstNonStarterQuietIndex >= 0) {
    return moves.slice(0, firstNonStarterQuietIndex);
  }
  if (lastStarterCaptureIndex >= 0) {
    return moves.slice(0, lastStarterCaptureIndex + 1);
  }

  return moves;
}

/**
 * Trims a PV to the didactic "combination window":
 * - anchor on the first capture by the starter side (the side we import puzzles for),
 * - start just after the last quiet reply by the non-starter before that capture
 *   (or fallback to the starter's last quiet setup move, else the first capture itself),
 * - stop before the first quiet reply by the non-starter after the capture phase.
 *
 * This keeps tactical core lines and removes long prelude/endgame noise.
 */
export function trimPvToCombinationWindow(
  pv: string[] | undefined | null,
  starterSide: Side
): string[] {
  const moves = parsePvToStepMoves(pv);
  if (moves.length === 0) return [];

  const nonStarter = otherSide(starterSide);
  let sideToMove: Side = starterSide;
  let firstStarterCapture = -1;
  let lastNonStarterQuietBefore = -1;
  let lastStarterQuietBefore = -1;

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;
    const isCapture = isPdCaptureNotation(move);
    if (firstStarterCapture < 0) {
      if (sideToMove === nonStarter && !isCapture) lastNonStarterQuietBefore = i;
      if (sideToMove === starterSide && !isCapture) lastStarterQuietBefore = i;
      if (sideToMove === starterSide && isCapture) firstStarterCapture = i;
    }
    sideToMove = otherSide(sideToMove);
  }

  if (firstStarterCapture < 0) {
    // No tactical hit found for starter; keep old behavior.
    return truncatePvBeforeFirstQuietReplyByNonStarter(moves, starterSide);
  }

  let start = firstStarterCapture;
  if (lastNonStarterQuietBefore >= 0 && lastNonStarterQuietBefore < firstStarterCapture) {
    start = lastNonStarterQuietBefore + 1;
  } else {
    // If there is no quiet move by the non-starter before the combo, keep the full prelude.
    // This avoids over-trimming tactical exchange build-up (e.g. 24-19, ...).
    start = 0;
  }

  sideToMove = starterSide;
  let firstNonStarterQuietAfter = -1;
  let lastStarterCapture = firstStarterCapture;
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i]!;
    const isCapture = isPdCaptureNotation(move);
    if (i >= firstStarterCapture) {
      if (sideToMove === starterSide && isCapture) {
        lastStarterCapture = i;
      }
      if (sideToMove === nonStarter && !isCapture && firstNonStarterQuietAfter < 0) {
        firstNonStarterQuietAfter = i;
      }
    }
    sideToMove = otherSide(sideToMove);
  }

  let endExclusive = moves.length;
  if (firstNonStarterQuietAfter >= 0) {
    // Exclude quiet defensive continuation after the combo.
    endExclusive = Math.min(firstNonStarterQuietAfter, lastStarterCapture + 1);
  } else {
    endExclusive = lastStarterCapture + 1;
  }

  if (endExclusive <= start) {
    return [moves[firstStarterCapture]!];
  }
  return moves.slice(start, endExclusive);
}
