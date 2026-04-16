import type { BoardState } from "../../features/board/boardTypes";
import type { ExpectedMoveSpec } from "../types/authoring/interactionTypes";
import {
  applyCompleteCaptureMove,
  getAllCaptureSequencesForSquare,
  getMaxCaptureCount,
  getPieceSide,
  getTargetsForSquare,
  type CaptureSequence,
} from "../source-editor/sourceBoardEngine";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";

function arraysEqualOrdered(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function captureMultisetEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.every((v, i) => v === bs[i]);
}

/**
 * Backward-compat for older Slagzet imports that were stored as:
 *   path = [from, to, captured1, captured2, ...], captures = []
 * instead of explicit { from, to, captures }.
 */
function salvageLegacySlagzetCaptureSpec(spec: ExpectedMoveSpec): ExpectedMoveSpec[] {
  const path = Array.isArray(spec.path) ? spec.path : [];
  if (path.length < 3) return [];
  if ((spec.captures?.length ?? 0) > 0) return [];
  const from = Number(path[0]);
  const to = Number(path[1]);
  const captures = path.slice(2).map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (!Number.isFinite(from) || !Number.isFinite(to) || captures.length === 0) return [];
  return [
    { ...spec, from, to, captures, path: undefined },
    // Some historical rows encoded captured squares in reverse order.
    { ...spec, from, to, captures: [...captures].reverse(), path: undefined },
  ];
}

/** PDN-ish notation for resolving a spec on the current board (incl. multi-capture paths). */
export function expectedMoveSpecToNotation(spec: ExpectedMoveSpec, board?: BoardState): string {
  if (spec.path && spec.path.length >= 2) {
    if (spec.path.length > 2 || (spec.captures?.length ?? 0) > 0) {
      return spec.path.join("x");
    }
    const from = spec.path[0]!;
    const to = spec.path[1]!;
    const isCap =
      !!board &&
      getTargetsForSquare(board, from).some((t) => t.to === to && t.isCapture);
    return `${from}${isCap ? "x" : "-"}${to}`;
  }
  const isCap =
    (spec.captures?.length ?? 0) > 0 ||
    (!!board &&
      getTargetsForSquare(board, spec.from).some((t) => t.to === spec.to && t.isCapture));
  const sep = isCap ? "x" : "-";
  return `${spec.from}${sep}${spec.to}`;
}

function candidateNotationsForExpectedSpec(board: BoardState, spec: ExpectedMoveSpec): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t) out.push(t);
  };
  push(expectedMoveSpecToNotation(spec, board));
  if (spec.path && spec.path.length >= 2) {
    push(spec.path.join("x"));
    push(spec.path.join("-"));
  }
  if (spec.from && spec.to) {
    push(`${spec.from}x${spec.to}`);
    push(`${spec.from}-${spec.to}`);
  }
  return [...new Set(out)];
}

/** All capture lines that take the maximum number of pieces on this board (forced capture). */
function collectMaximalCaptureSequences(board: BoardState): CaptureSequence[] {
  const maxCap = getMaxCaptureCount(board);
  if (maxCap <= 0) return [];
  const out: CaptureSequence[] = [];
  for (let sq = 1; sq <= 50; sq += 1) {
    const piece = board.squares[sq];
    if (piece === "empty") continue;
    if (getPieceSide(piece) !== board.sideToMove) continue;
    for (const seq of getAllCaptureSequencesForSquare(board, sq)) {
      if (seq.captures.length === maxCap) out.push(seq);
    }
  }
  return out;
}

/**
 * Among maximal captures (keuzeslag), pick the sequence that matches the authored spec.
 * Does not rely on notation parsing alone (imported specs often omit `x` / `captures`).
 */
export function pickMaximalCaptureSequenceMatchingExpectedSpec(
  board: BoardState,
  spec: ExpectedMoveSpec
): CaptureSequence | null {
  const cands = collectMaximalCaptureSequences(board);
  if (!cands.length) return null;
  const variants: ExpectedMoveSpec[] = [spec, ...salvageLegacySlagzetCaptureSpec(spec)];

  for (const variant of variants) {
    const specPath = variant.path;
    if (specPath && specPath.length >= 2) {
      const exact = cands.filter((s) => arraysEqualOrdered(s.path, specPath));
      if (exact.length === 1) return exact[0]!;
      if (exact.length > 1) return null;
    }

    const fromTo = cands.filter((s) => s.from === variant.from && s.to === variant.to);
    if ((variant.captures?.length ?? 0) > 0) {
      const withCap = fromTo.filter((s) => captureMultisetEqual(s.captures, variant.captures!));
      if (withCap.length === 1) return withCap[0]!;
      if (withCap.length > 1) return null;
    } else if (fromTo.length === 1) {
      return fromTo[0]!;
    }

    if (specPath && specPath.length >= 2) {
      const prefix = cands.filter(
        (s) =>
          s.path.length >= specPath.length &&
          specPath.every((sq, i) => sq === s.path[i])
      );
      if (prefix.length === 1) return prefix[0]!;
    }
  }

  return null;
}

/**
 * When several maximal captures exist (keuzeslag), pick the line that matches the authored
 * `askSequence` ply for this board state.
 */
export function tryResolveAuthoringAskSequencePly(
  board: BoardState,
  spec: ExpectedMoveSpec | undefined
): { notation: string } | null {
  if (!spec) return null;
  const maxCap = getMaxCaptureCount(board);
  const side = board.sideToMove;

  if (maxCap > 0) {
    const picked = pickMaximalCaptureSequenceMatchingExpectedSpec(board, spec);
    if (picked) {
      const em = applyCompleteCaptureMove(board, picked.from, picked.path, picked.captures, side);
      return { notation: em.notation };
    }
  }

  for (const notation of candidateNotationsForExpectedSpec(board, spec)) {
    const em = resolveNotationToEngineMove(board, notation);
    if (!em || em.side !== side) continue;
    if (maxCap > 0) {
      if (em.captures.length === 0 || em.captures.length !== maxCap) continue;
    }
    return { notation: em.notation };
  }
  return null;
}
