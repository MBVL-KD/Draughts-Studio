import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import { flushSync } from "react-dom";
import {
  createEmptyBoardState,
  type BoardState,
  type PieceCode,
} from "../../features/board/boardTypes";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import { loadScanModule } from "../../engine/loadScanModule";
import BoardEditor from "../../features/board/BoardEditor";
import BoardOverlayLayer from "./BoardOverlayLayer";
import AuthoringRuntimePreviewStrip from "./AuthoringRuntimePreviewStrip";
import {
  useSolutionRecorder,
  type RecordedMove,
} from "../../features/recorder/useSolutionRecorder";
import type { LessonStep } from "../types/stepTypes";
import type { HighlightSpec } from "../types/presentationTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText } from "../utils/i18nHelpers";
import {
  getPlayableSquareCountFromBoard,
  inferBoardSizeFromPlayableSquares,
} from "../utils/boardOverlayGeometry";
import {
  applyCompleteCaptureMove,
  applyEngineMove,
  applyPartialCaptureStep,
  getContinuationCaptureTargets,
  getMaxCaptureCount,
  getSoleMaximalCaptureOpening,
  getTargetsForSquare,
  isSelectableSourceSquare,
} from "../source-editor/sourceBoardEngine";
import type { GoalValidation } from "../types/validationTypes";
import { resolveNotationToEngineMove } from "../utils/resolveNotationToEngineMove";
import { tryResolveAuthoringAskSequencePly } from "../utils/expectedMoveSpecNotation";
import {
  captureGhostsFromMove,
  getReplayMoveNotation,
  pieceVisualForReplay,
  squareToBoardPercentCenter,
} from "../utils/previewReplayAnimation";
import NotationMoveAnimationOverlay from "./NotationMoveAnimationOverlay";
import {
  computeNotationAnimFrame,
  prepareNotationAnimFromEngineMove,
  prepareNotationAnimFromNotation,
  readStudioMoveAnimationSeconds,
  runNotationMoveAnimation,
  type NotationAnimMetadata,
} from "../utils/notationMoveAnimation";
import type { AuthoringPreviewResolved } from "../utils/resolveAuthoringPreviewState";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { PlacePiecesExpectedSlot } from "../types/authoring/interactionTypes";
import { evaluateAskMoveAttempt } from "../utils/evaluateAskMoveAttempt";
import { evaluateAskSequenceAttempt } from "../utils/evaluateAskSequenceAttempt";
import { evaluateAskCountAttempt } from "../utils/evaluateAskCountAttempt";
import { evaluateAskSelectSquaresAttempt } from "../utils/evaluateAskSelectSquaresAttempt";
import { evaluateAskSelectPiecesAttempt } from "../utils/evaluateAskSelectPiecesAttempt";
import { evaluateMultipleChoiceAttempt } from "../utils/evaluateMultipleChoiceAttempt";
import { evaluatePlacePiecesAttempt } from "../utils/evaluatePlacePiecesAttempt";
import {
  expectedPlacementToBoard,
  normalizeExpectedPlacement,
} from "../utils/placementHelpers";

type Props = {
  step: LessonStep | null;
  language: LanguageCode;
  variantId?: string;
  onPreviousStep?: () => void;
  onNextStep?: () => void;
  hasPreviousStep?: boolean;
  hasNextStep?: boolean;
  /** 0 = instant replay step; >0 = seconds per hop (multi-capture total duration scales with hop count). */
  replayMoveSecondsPerStep?: number;
  /** When set (e.g. authoring moment preview), overrides start FEN and optionally presentation overlays. */
  authoringPreview?: AuthoringPreviewResolved | null;
  /**
   * When this moment is `askMove` or `askSequence` and `authoringPreview` is set, preview enables moment-bound try mode only.
   */
  authoringInteractiveMoment?: StepMoment | null;
  /** Bundel 12b: studio target-pick mode (mutually exclusive with learner askSelect try in preview). */
  authoringBoardTargetPickMode?: boolean;
  authoringStudioSquareSelection?: number[];
  authoringTargetPickPiecesOnly?: boolean;
  onAuthoringTargetSquareToggle?: (square: number) => void;
  onAuthoringAskCountPreviewDraft?: (draft: string) => void;
  /** Bundel 14b: load authoring target into the empty placement preview board. */
  placePiecesPreviewLoadRequest?: { key: number; slots: PlacePiecesExpectedSlot[] } | null;
  /** Bundel 14b: parent reads live preview placement board for “use preview as target”. */
  placePiecesPreviewBoardGetterRef?: MutableRefObject<(() => BoardState | null) | null>;
};

const PREVIEW_OPPONENT_SCAN_DEPTH = 12;

function mapVariantToScanVariant(variantId: string): string {
  switch (variantId) {
    case "international":
      return "normal";
    case "frisian":
      return "frisian";
    case "killer":
      return "killer";
    case "breakthrough":
      return "bt";
    case "losing":
      return "losing";
    default:
      return "normal";
  }
}

function cloneBoard(board: BoardState): BoardState {
  return {
    sideToMove: board.sideToMove,
    squares: { ...board.squares },
  };
}

function getPieceSide(piece: PieceCode): "W" | "B" | null {
  if (piece === "wm" || piece === "wk") return "W";
  if (piece === "bm" || piece === "bk") return "B";
  return null;
}

function isMan(piece: PieceCode) {
  return piece === "wm" || piece === "bm";
}

function isKing(piece: PieceCode) {
  return piece === "wk" || piece === "bk";
}

function squareToCoord(square: number) {
  const row = Math.floor((square - 1) / 5);
  const posInRow = (square - 1) % 5;
  const col = row % 2 === 0 ? posInRow * 2 + 1 : posInRow * 2;
  return { row, col };
}

function coordToSquare(row: number, col: number): number | null {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  if ((row + col) % 2 === 0) return null;
  const posInRow = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  if (!Number.isInteger(posInRow) || posInRow < 0 || posInRow > 4) return null;
  return row * 5 + posInRow + 1;
}

function getSquaresBetween(from: number, to: number): number[] {
  const a = squareToCoord(from);
  const b = squareToCoord(to);
  const rowDiff = b.row - a.row;
  const colDiff = b.col - a.col;
  const rowStep = Math.sign(rowDiff);
  const colStep = Math.sign(colDiff);
  if (Math.abs(rowDiff) !== Math.abs(colDiff) || rowStep === 0 || colStep === 0) {
    return [];
  }
  const result: number[] = [];
  let row = a.row + rowStep;
  let col = a.col + colStep;
  while (row !== b.row && col !== b.col) {
    const sq = coordToSquare(row, col);
    if (sq != null) result.push(sq);
    row += rowStep;
    col += colStep;
  }
  return result;
}

function findCapturedSquareForSegment(
  board: BoardState,
  from: number,
  to: number,
  movingPiece: PieceCode
): number | null {
  const pieceSide = getPieceSide(movingPiece);
  if (!pieceSide) return null;
  const between = getSquaresBetween(from, to);
  if (isMan(movingPiece)) {
    if (between.length !== 1) return null;
    const mid = between[0];
    const midPiece = board.squares[mid];
    const midSide = getPieceSide(midPiece);
    if (midPiece !== "empty" && midSide && midSide !== pieceSide) return mid;
    return null;
  }
  if (isKing(movingPiece)) {
    for (const sq of between) {
      const piece = board.squares[sq];
      const side = getPieceSide(piece);
      if (piece !== "empty" && side && side !== pieceSide) return sq;
    }
  }
  return null;
}

function shouldPromote(square: number, piece: PieceCode): boolean {
  if (!isMan(piece)) return false;
  const { row } = squareToCoord(square);
  if (piece === "wm" && row === 0) return true;
  if (piece === "bm" && row === 9) return true;
  return false;
}

function promotePiece(piece: PieceCode): PieceCode {
  if (piece === "wm") return "wk";
  if (piece === "bm") return "bk";
  return piece;
}

function applyNotationMoveFallback(board: BoardState, notation: string, path: number[]): BoardState {
  const next = cloneBoard(board);
  const from = path[0];
  let movingPiece = next.squares[from];
  if (movingPiece === "empty") return cloneBoard(board);
  const isCapture = notation.includes("x");
  next.squares[from] = "empty";
  for (let i = 1; i < path.length; i += 1) {
    if (!isCapture) continue;
    const captured = findCapturedSquareForSegment(next, path[i - 1], path[i], movingPiece);
    if (captured != null) next.squares[captured] = "empty";
  }
  const finalTo = path[path.length - 1];
  if (shouldPromote(finalTo, movingPiece)) movingPiece = promotePiece(movingPiece);
  next.squares[finalTo] = movingPiece;
  next.sideToMove = next.sideToMove === "W" ? "B" : "W";
  return next;
}

function parseNotationPath(notation: string): number[] | null {
  const cleaned = notation.trim();
  if (!cleaned) return null;
  const path = cleaned
    .split(/[-x]/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  if (path.length < 2) return null;
  return path;
}

function applyNotationMoveWithEngine(board: BoardState, notation: string): BoardState {
  const resolved = resolveNotationToEngineMove(board, notation);
  if (resolved?.fenAfter) {
    try {
      return fenToBoardState(resolved.fenAfter);
    } catch {
      // fall back to local resolver below
    }
  }
  const path = parseNotationPath(notation);
  if (!path) return cloneBoard(board);

  const from = path[0];
  const side = board.sideToMove;
  const travelled: number[] = [from];
  const captures: number[] = [];
  let current = from;
  let workingBoard = cloneBoard(board);

  for (let index = 1; index < path.length; index += 1) {
    const to = path[index];
    if (typeof to !== "number") return cloneBoard(board);
    const targets =
      captures.length === 0
        ? getTargetsForSquare(workingBoard, current)
        : getContinuationCaptureTargets(workingBoard, current, travelled, captures);
    const target = targets.find((candidate) => candidate.to === to);
    if (!target) {
      return applyNotationMoveFallback(board, notation, path);
    }

    travelled.push(to);
    const isLast = index === path.length - 1;
    const isCapture = !!target.isCapture && typeof target.captured === "number";

    if (isCapture) {
      const capSq = target.captured;
      if (typeof capSq !== "number") return cloneBoard(board);
      captures.push(capSq);
      if (!isLast) {
        workingBoard = applyPartialCaptureStep(workingBoard, current, to, capSq);
      }
    } else if (!isLast) {
      return cloneBoard(board);
    }

    current = to;
  }

  const engineMove =
    captures.length > 0
      ? applyCompleteCaptureMove(board, from, travelled, captures, side)
      : applyEngineMove(board, {
          from,
          to: travelled[travelled.length - 1],
          path: travelled,
          captures: [],
          side,
        });

  return fenToBoardState(engineMove.fenAfter);
}

function applyRecordedMoveToBoard(board: BoardState, move: RecordedMove): BoardState {
  const next = cloneBoard(board);
  const piece = next.squares[move.from];
  if (piece === "empty") return cloneBoard(board);
  next.squares[move.from] = "empty";
  for (const cap of move.captures) {
    if (typeof cap === "number" && cap >= 1 && cap <= 50) {
      next.squares[cap] = "empty";
    }
  }
  let finalPiece: PieceCode = piece;
  if (shouldPromote(move.to, piece)) {
    finalPiece = promotePiece(piece);
  }
  next.squares[move.to] = finalPiece;
  next.sideToMove = next.sideToMove === "W" ? "B" : "W";
  return next;
}

function boardAfterRecordedMovesSlice(start: BoardState, slice: RecordedMove[]): BoardState {
  let b = cloneBoard(start);
  for (const m of slice) {
    b = applyRecordedMoveToBoard(b, m);
  }
  return b;
}

function computeOrderedSequenceIndexFromRecordedMoves(
  startBoard: BoardState,
  playedMoves: RecordedMove[],
  expectedSequence:
    | Array<{ from?: number; to?: number; path?: number[]; captures?: number[] }>
    | undefined
): number {
  const seq = Array.isArray(expectedSequence) ? expectedSequence : [];
  if (seq.length === 0 || playedMoves.length === 0) return 0;
  let board = cloneBoard(startBoard);
  let idx = 0;
  for (const mv of playedMoves) {
    if (idx < seq.length) {
      const expected = seq[idx];
      const expectedNotation =
        expected &&
        Number.isFinite(expected.from as number) &&
        Number.isFinite(expected.to as number)
          ? tryResolveAuthoringAskSequencePly(board, expected as { from: number; to: number; path?: number[]; captures?: number[] })?.notation
          : null;
      const playedResolved = resolveNotationToEngineMove(board, mv.notation);
      if (expectedNotation && playedResolved && playedResolved.notation === expectedNotation) {
        idx += 1;
      }
    }
    board = applyRecordedMoveToBoard(board, mv);
  }
  return Math.min(idx, seq.length);
}

function getAutoplayMoves(step: LessonStep): string[] {
  return step.presentation?.autoplay?.moves ?? [];
}

function getAutoplayDuration(step: LessonStep): number {
  return step.presentation?.autoplay?.moveDurationMs ?? 900;
}

function getAutoplayDelay(step: LessonStep): number {
  return step.presentation?.autoplay?.startDelayMs ?? 300;
}

function buildBoardsFromStep(
  step: LessonStep,
  startBoardOverride?: BoardState | null
): BoardState[] {
  let startBoard: BoardState;

  if (startBoardOverride) {
    startBoard = cloneBoard(startBoardOverride);
  } else {
    try {
      startBoard = step.initialState?.fen?.trim()
        ? fenToBoardState(step.initialState.fen)
        : createEmptyBoardState();
    } catch {
      startBoard = createEmptyBoardState();
    }
  }

  const timelineWithFen = (step.sourceRef?.nodeTimeline ?? []).filter(
    (node): node is typeof node & { fenAfter: string } =>
      typeof node.fenAfter === "string" && node.fenAfter.trim().length > 0
  );

  if (timelineWithFen.length > 0) {
    const boards: BoardState[] = [cloneBoard(startBoard)];
    for (const snapshot of timelineWithFen) {
      try {
        boards.push(fenToBoardState(snapshot.fenAfter));
      } catch {
        // keep replay resilient if one timeline FEN is malformed
      }
    }
    if (boards.length > 1) return boards;
  }

  const autoplayMoves = getAutoplayMoves(step);

  const boards: BoardState[] = [cloneBoard(startBoard)];
  let current = cloneBoard(startBoard);

  for (const move of autoplayMoves) {
    current = applyNotationMoveWithEngine(current, move);
    boards.push(cloneBoard(current));
  }

  return boards;
}

function arraysEqualAsSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.every((value, index) => value === bs[index]);
}

function arraysEqualOrdered<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function boardsEqual(a: BoardState, b: BoardState): boolean {
  if (a.sideToMove !== b.sideToMove) return false;
  for (let sq = 1; sq <= 50; sq += 1) {
    if ((a.squares[sq] ?? "empty") !== (b.squares[sq] ?? "empty")) return false;
  }
  return true;
}

function normalizeNotationMove(move: string): string {
  return String(move ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/×/g, "x")
    .toLowerCase();
}

function equalNotationSequence(recorded: string[], expected: string[]): boolean {
  const r = recorded.map(normalizeNotationMove);
  const e = expected.map(normalizeNotationMove);
  return arraysEqualOrdered(r, e);
}

function equalByBoardEvolution(
  startBoard: BoardState,
  recorded: string[],
  expected: string[]
): boolean {
  if (recorded.length !== expected.length) return false;
  let boardRecorded = cloneBoard(startBoard);
  let boardExpected = cloneBoard(startBoard);
  for (let i = 0; i < recorded.length; i += 1) {
    boardRecorded = applyNotationMoveWithEngine(boardRecorded, recorded[i] ?? "");
    boardExpected = applyNotationMoveWithEngine(boardExpected, expected[i] ?? "");
    if (!boardsEqual(boardRecorded, boardExpected)) return false;
  }
  return true;
}

function extractMoveNumbers(move: string): number[] {
  const nums = String(move ?? "").match(/\d+/g) ?? [];
  return nums
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
}

function isCaptureNotation(move: string): boolean {
  return /x|×/i.test(String(move ?? ""));
}

/**
 * Some scan lines encode long captures with intermediate captured squares,
 * while recorder notation keeps landing-route squares. Accept as equivalent
 * when both plies are captures from the same source square.
 */
function equalByCaptureSourcePattern(recorded: string[], expected: string[]): boolean {
  if (recorded.length !== expected.length) return false;
  for (let i = 0; i < recorded.length; i += 1) {
    const r = recorded[i] ?? "";
    const e = expected[i] ?? "";
    const rCapture = isCaptureNotation(r);
    const eCapture = isCaptureNotation(e);
    if (rCapture !== eCapture) return false;
    if (!rCapture && normalizeNotationMove(r) !== normalizeNotationMove(e)) return false;
    if (rCapture) {
      const rNums = extractMoveNumbers(r);
      const eNums = extractMoveNumbers(e);
      if (rNums.length < 2 || eNums.length < 2) return false;
      if (rNums[0] !== eNums[0]) return false;
    }
  }
  return true;
}

type PreviewSide = "W" | "B";

function opponentOfPreview(side: PreviewSide): PreviewSide {
  return side === "W" ? "B" : "W";
}

function sideHasAnyLegalMoveForGoal(board: BoardState, side: PreviewSide): boolean {
  const probe: BoardState = { ...board, sideToMove: side };
  for (let sq = 1; sq <= 50; sq += 1) {
    if (isSelectableSourceSquare(probe, sq)) return true;
  }
  return false;
}

function materialValueForGoal(piece: PieceCode): number {
  if (piece === "wm" || piece === "bm") return 1;
  if (piece === "wk" || piece === "bk") return 3;
  return 0;
}

function materialSumForGoal(board: BoardState, side: PreviewSide): number {
  let sum = 0;
  for (let sq = 1; sq <= 50; sq += 1) {
    const p = board.squares[sq];
    if (getPieceSide(p) === side) sum += materialValueForGoal(p);
  }
  return sum;
}

function goalReachSquareMet(
  board: BoardState,
  humanSide: PreviewSide,
  targetSquare?: number
): boolean {
  if (targetSquare == null || targetSquare < 1 || targetSquare > 50) return false;
  return getPieceSide(board.squares[targetSquare]) === humanSide;
}

function goalNoLegalMovesMet(board: BoardState, humanSide: PreviewSide): boolean {
  const opp = opponentOfPreview(humanSide);
  if (board.sideToMove !== opp) return false;
  return !sideHasAnyLegalMoveForGoal(board, opp);
}

function goalForceCaptureMet(board: BoardState, humanSide: PreviewSide): boolean {
  const opp = opponentOfPreview(humanSide);
  if (board.sideToMove !== opp) return false;
  return getMaxCaptureCount(board) > 0;
}

function goalPromoteInOneMet(
  startBoard: BoardState,
  moves: Array<{ side: PreviewSide; from: number; to: number }>,
  humanSide: PreviewSide
): boolean {
  const humanMoves = moves.filter((m) => m.side === humanSide);
  if (humanMoves.length !== 1) return false;
  const m = humanMoves[0];
  const fromPiece = startBoard.squares[m.from];
  if (fromPiece !== "wm" && fromPiece !== "bm") return false;
  const { row: toRow } = squareToCoord(m.to);
  if (fromPiece === "wm" && toRow !== 0) return false;
  if (fromPiece === "bm" && toRow !== 9) return false;
  return true;
}

function goalWinMaterialMet(board: BoardState, humanSide: PreviewSide): boolean {
  return materialSumForGoal(board, humanSide) > materialSumForGoal(board, opponentOfPreview(humanSide));
}

function evaluateGoalBoardPreview(
  validation: GoalValidation,
  humanSide: PreviewSide,
  initialBoard: BoardState,
  board: BoardState,
  moves: Array<{ side: PreviewSide; from: number; to: number }>
): boolean {
  switch (validation.goalType) {
    case "reach_square":
      return goalReachSquareMet(board, humanSide, validation.targetSquare);
    case "no_legal_moves":
      return goalNoLegalMovesMet(board, humanSide);
    case "force_capture":
      return goalForceCaptureMet(board, humanSide);
    case "promote_in_one":
      return goalPromoteInOneMet(initialBoard, moves, humanSide);
    case "win_material":
      return goalWinMaterialMet(board, humanSide);
    default:
      return false;
  }
}

/** Same success rules as "Check" for move / sequence / goal — used to stop opponent Scan and auto-show success. */
function isPreviewBoardStepSatisfied(
  step: LessonStep,
  initialBoard: BoardState,
  recordedNotation: string[],
  board: BoardState,
  plyMoves: Array<{ side: PreviewSide; from: number; to: number }>,
  humanSide: PreviewSide
): boolean {
  const v = step.validation;
  switch (v.type) {
    case "move": {
      const correctMoves = v.correctMoves ?? [];
      return recordedNotation.length === 1 && correctMoves.includes(recordedNotation[0]);
    }
    case "sequence": {
      const expected = v.moves ?? [];
      return (
        equalNotationSequence(recordedNotation, expected) ||
        equalByBoardEvolution(initialBoard, recordedNotation, expected) ||
        equalByCaptureSourcePattern(recordedNotation, expected)
      );
    }
    case "goal":
      return evaluateGoalBoardPreview(v, humanSide, initialBoard, board, plyMoves);
    default:
      return false;
  }
}

function getInitialBoard(step: LessonStep): BoardState {
  try {
    return step.initialState?.fen?.trim()
      ? fenToBoardState(step.initialState.fen)
      : createEmptyBoardState();
  } catch {
    return createEmptyBoardState();
  }
}

export default function StepPreviewPanel({
  step,
  language,
  variantId = "international",
  onPreviousStep,
  onNextStep,
  hasPreviousStep = false,
  hasNextStep = false,
  replayMoveSecondsPerStep = 0,
  authoringPreview = null,
  authoringInteractiveMoment = null,
  authoringBoardTargetPickMode = false,
  authoringStudioSquareSelection = [],
  authoringTargetPickPiecesOnly = false,
  onAuthoringTargetSquareToggle,
  onAuthoringAskCountPreviewDraft,
  placePiecesPreviewLoadRequest = null,
  placePiecesPreviewBoardGetterRef,
}: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [positionIndex, setPositionIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSquares, setSelectedSquares] = useState<number[]>([]);
  const [selectedPieces, setSelectedPieces] = useState<number[]>([]);
  const [markedPath, setMarkedPath] = useState<number[]>([]);
  const [chosenOptionIds, setChosenOptionIds] = useState<string[]>([]);
  /** Bundel 13a: authoring multiple_choice selection (separate from legacy step multiple_choice). */
  const [authoringMultipleChoiceSelectedIds, setAuthoringMultipleChoiceSelectedIds] = useState<string[]>([]);
  /** Bundel 14a: empty-board placement try (preview only). */
  const [authoringPlacePiecesBoard, setAuthoringPlacePiecesBoard] = useState<BoardState>(() =>
    createEmptyBoardState()
  );
  const authoringPlacePiecesWorkBoardRef = useRef<BoardState>(createEmptyBoardState());
  const [authoringPlacePiecesBrush, setAuthoringPlacePiecesBrush] = useState<PieceCode>("wm");
  const [countAnswer, setCountAnswer] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<
    "idle" | "correct" | "incorrect" | "illegal"
  >("idle");
  const [askMoveFeedbackHighlights, setAskMoveFeedbackHighlights] = useState<HighlightSpec[]>([]);
  const [askMoveCoachCaption, setAskMoveCoachCaption] = useState("");
  /** Bundel 12a: authoring askSelect* selection (preview only). */
  const [authoringPickSquares, setAuthoringPickSquares] = useState<number[]>([]);
  const [authoringCountDraft, setAuthoringCountDraft] = useState("");
  useEffect(() => {
    if (!onAuthoringAskCountPreviewDraft) return;
    if (
      authoringInteractiveMoment?.type === "askCount" &&
      authoringInteractiveMoment.interaction?.kind === "askCount"
    ) {
      onAuthoringAskCountPreviewDraft(authoringCountDraft);
    }
  }, [authoringCountDraft, authoringInteractiveMoment, onAuthoringAskCountPreviewDraft]);
  const [askSequenceProgress, setAskSequenceProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  /** Preview-only: failed try count vs maxAttempts for askMove / askSequence. */
  const [authoringAttemptsPill, setAuthoringAttemptsPill] = useState<{
    failed: number;
    max: number;
  } | null>(null);
  const [interactivePreviewMode, setInteractivePreviewMode] = useState<"input" | "replay">("input");
  /** During puzzle input: index into `recorder.state.moves` to scrub the attempt (live tail when equal to length). */
  const [inputScrubPly, setInputScrubPly] = useState(0);
  const prevRecordedMovesLenRef = useRef(0);
  const authoringInteractiveFailCountRef = useRef(0);
  const askSequenceOrderedIndexRef = useRef(0);
  const askSequencePoolRef = useRef<number[] | null>(null);

  const playTimerRef = useRef<number | null>(null);
  const replayRafRef = useRef<number | null>(null);
  const replayAnimRef = useRef<{
    fromBoard: BoardState;
    toBoard: BoardState;
    path: number[];
    captures: number[];
    movingPiece: PieceCode;
    captureGhosts: ReturnType<typeof captureGhostsFromMove>;
    durationMs: number;
    startedAt: number;
    currentT: number;
  } | null>(null);
  const [replayAnimVersion, setReplayAnimVersion] = useState(0);
  const opponentScanRequestRef = useRef(0);
  const opponentPlayAnimCancelRef = useRef<(() => void) | null>(null);
  const opponentPlayAnimRef = useRef<{ meta: NotationAnimMetadata; currentT: number } | null>(null);
  const [opponentPlayAnimVersion, setOpponentPlayAnimVersion] = useState(0);
  /** When true, success feedback came from auto-detect; clear it if the line is no longer satisfied. */
  const previewAutoCorrectActiveRef = useRef(false);

  const authoringStartBoard = useMemo((): BoardState | null => {
    if (!authoringPreview?.fen?.trim()) return null;
    try {
      return fenToBoardState(authoringPreview.fen);
    } catch {
      return null;
    }
  }, [authoringPreview?.fen]);

  const boards = useMemo(() => {
    if (!step) return [];
    return buildBoardsFromStep(step, authoringStartBoard);
  }, [step, authoringStartBoard]);

  const autoplayMoves = useMemo(() => {
    if (!step) return [];
    return getAutoplayMoves(step);
  }, [step]);

  const initialBoard = useMemo(() => {
    if (!step) return createEmptyBoardState();
    if (boards.length > 0) return boards[0]!;
    return getInitialBoard(step);
  }, [step, boards]);

  const authoringPreviewEffectKey =
    authoringPreview == null
      ? ""
      : `${authoringPreview.fen}|${authoringPreview.preferStubPresentationForOverlays}|${authoringPreview.highlights.length}|${authoringPreview.arrows.length}|${authoringPreview.routes.length}|${authoringPreview.squareGlyphs?.length ?? 0}|${authoringPreview.coachPreviewLines?.join("|") ?? ""}|${authoringPreview.uiHintPreview ?? ""}|${authoringPreview.uiBannerPreview?.text ?? ""}|${authoringPreview.timingSummary ?? ""}|${authoringPreview.runtimeDevLabels?.join("|") ?? ""}`;

  const interactiveMoveStep =
    step?.validation.type === "move" ||
    step?.validation.type === "sequence" ||
    step?.validation.type === "goal";

  const authoringInteractiveRecorder =
    authoringPreview != null &&
    authoringInteractiveMoment != null &&
    ((authoringInteractiveMoment.type === "askMove" &&
      authoringInteractiveMoment.interaction?.kind === "askMove") ||
      (authoringInteractiveMoment.type === "askSequence" &&
        authoringInteractiveMoment.interaction?.kind === "askSequence"));

  const authoringInteractiveAuthoringExtra =
    authoringPreview != null &&
    authoringInteractiveMoment != null &&
    ((authoringInteractiveMoment.type === "askCount" &&
      authoringInteractiveMoment.interaction?.kind === "askCount") ||
      (authoringInteractiveMoment.type === "askSelectSquares" &&
        authoringInteractiveMoment.interaction?.kind === "askSelectSquares") ||
      (authoringInteractiveMoment.type === "askSelectPieces" &&
        authoringInteractiveMoment.interaction?.kind === "askSelectPieces") ||
      (authoringInteractiveMoment.type === "multipleChoice" &&
        authoringInteractiveMoment.interaction?.kind === "multipleChoice") ||
      (authoringInteractiveMoment.type === "placePieces" &&
        authoringInteractiveMoment.interaction?.kind === "placePieces"));

  const authoringPlacePiecesActive =
    authoringPreview != null &&
    authoringInteractiveMoment?.type === "placePieces" &&
    authoringInteractiveMoment.interaction?.kind === "placePieces";

  const authoringInteractiveSelect =
    !!authoringInteractiveAuthoringExtra &&
    (authoringInteractiveMoment?.type === "askSelectSquares" ||
      authoringInteractiveMoment?.type === "askSelectPieces");

  const authoringInteractivePromptMoment =
    authoringInteractiveRecorder || authoringInteractiveAuthoringExtra;

  /** askMove / askSequence only (board uses recorder). */
  const authoringInteractiveAsk = authoringInteractiveRecorder;

  const legacyInteractiveMoveStep =
    interactiveMoveStep && !authoringInteractiveAsk;

  /** Authoring count/select uses plain board clicks, not the move recorder (even if legacy step is move/sequence). */
  const boardClickUsesRecorder =
    authoringInteractiveRecorder ||
    (legacyInteractiveMoveStep && !authoringInteractiveAuthoringExtra);

  const authoringInteractiveConfigKey = useMemo(() => {
    if (!authoringInteractiveMoment) return "";
    const ix = authoringInteractiveMoment.interaction;
    if (ix?.kind === "askSequence") {
      return `seq|${authoringInteractiveMoment.id}|${ix.requireExactOrder !== false}|${
        ix.maxAttempts ?? 5
      }|${ix.allowRetry !== false}|${JSON.stringify(ix.expectedSequence ?? [])}|${JSON.stringify(
        ix.sequenceHintMessage ?? null
      )}`;
    }
    if (ix?.kind === "askMove") {
      return `move|${authoringInteractiveMoment.id}|${JSON.stringify(ix.expectedMoves ?? [])}|${
        ix.maxAttempts ?? 5
      }|${ix.allowRetry !== false}`;
    }
    if (ix?.kind === "askCount") {
      return `count|${authoringInteractiveMoment.id}|${JSON.stringify(readLocalizedText(ix.prompt, language))}|${
        ix.correctValue
      }|${JSON.stringify(ix.acceptedValues ?? [])}|${ix.allowRetry !== false}|${
        ix.maxAttempts ?? 5
      }|${JSON.stringify(readLocalizedText(ix.wrongMessage, language))}`;
    }
    if (ix?.kind === "askSelectSquares" || ix?.kind === "askSelectPieces") {
      return `${ix.kind}|${authoringInteractiveMoment.id}|${JSON.stringify(ix.targetSquares ?? [])}|${
        ix.requireExactSet !== false
      }|${ix.allowRetry !== false}|${ix.maxAttempts ?? 5}|${JSON.stringify(
        readLocalizedText(ix.prompt, language)
      )}|${JSON.stringify(readLocalizedText(ix.wrongMessage, language))}|${JSON.stringify(
        ix.hintSquares ?? []
      )}`;
    }
    if (ix?.kind === "multipleChoice") {
      const optKey = (ix.options ?? []).map((o) => ({
        id: o.id,
        lab: readLocalizedText(o.label, language),
        cor: o.isCorrect,
        exp: readLocalizedText(o.explanation, language),
      }));
      return `mc|${authoringInteractiveMoment.id}|${!!ix.allowMultiple}|${
        ix.allowRetry !== false
      }|${ix.maxAttempts ?? 5}|${JSON.stringify(readLocalizedText(ix.prompt, language))}|${JSON.stringify(
        optKey
      )}|${JSON.stringify(readLocalizedText(ix.wrongMessage, language))}|${JSON.stringify(
        readLocalizedText(ix.hintMessage, language)
      )}|${JSON.stringify(readLocalizedText(ix.successCoachCaption, language))}|${JSON.stringify(
        readLocalizedText(ix.wrongCoachCaption, language)
      )}`;
    }
    if (ix?.kind === "placePieces") {
      const slots = normalizeExpectedPlacement(ix.expectedPlacement ?? []);
      return `pp|${authoringInteractiveMoment.id}|${JSON.stringify(slots)}|${
        ix.allowRetry !== false
      }|${ix.maxAttempts ?? 5}|${JSON.stringify(readLocalizedText(ix.prompt, language))}|${JSON.stringify(
        readLocalizedText(ix.wrongMessage, language)
      )}|${JSON.stringify(readLocalizedText(ix.hintMessage, language))}|${JSON.stringify(
        readLocalizedText(ix.successCoachCaption, language)
      )}|${JSON.stringify(readLocalizedText(ix.wrongCoachCaption, language))}`;
    }
    return authoringInteractiveMoment.id;
  }, [authoringInteractiveMoment, language]);

  const askSequenceInteractionSpec = useMemo(() => {
    if (
      authoringInteractiveMoment?.type === "askSequence" &&
      authoringInteractiveMoment.interaction?.kind === "askSequence"
    ) {
      return authoringInteractiveMoment.interaction;
    }
    return null;
  }, [authoringInteractiveMoment]);

  const authoringInteractiveMaxAttempts = useMemo(() => {
    const ix = authoringInteractiveMoment?.interaction;
    if (
      ix?.kind === "askMove" ||
      ix?.kind === "askSequence" ||
      ix?.kind === "askCount" ||
      ix?.kind === "askSelectSquares" ||
      ix?.kind === "askSelectPieces" ||
      ix?.kind === "multipleChoice" ||
      ix?.kind === "placePieces"
    ) {
      return Math.max(1, ix.maxAttempts ?? 5);
    }
    return 5;
  }, [authoringInteractiveMoment]);

  const placePiecesStartBoard = useMemo(() => {
    if (
      authoringInteractiveMoment?.type === "placePieces" &&
      authoringInteractiveMoment.interaction?.kind === "placePieces" &&
      authoringInteractiveMoment.positionRef?.type === "fen"
    ) {
      try {
        return fenToBoardState(authoringInteractiveMoment.positionRef.fen);
      } catch {
        return createEmptyBoardState();
      }
    }
    return createEmptyBoardState();
  }, [authoringInteractiveMoment]);

  const placePiecesBaseBoard = useMemo(() => {
    if (
      authoringInteractiveMoment?.type === "placePieces" &&
      authoringInteractiveMoment.interaction?.kind === "placePieces" &&
      authoringInteractiveMoment.interaction.previewStartsEmpty
    ) {
      return createEmptyBoardState();
    }
    return placePiecesStartBoard;
  }, [authoringInteractiveMoment, placePiecesStartBoard]);

  useEffect(() => {
    const ref = placePiecesPreviewBoardGetterRef;
    if (!ref) return;
    if (authoringPlacePiecesActive) {
      ref.current = () => authoringPlacePiecesBoard;
    } else {
      ref.current = null;
    }
    return () => {
      ref.current = null;
    };
  }, [authoringPlacePiecesActive, authoringPlacePiecesBoard, placePiecesPreviewBoardGetterRef]);

  useEffect(() => {
    if (!placePiecesPreviewLoadRequest || !authoringPlacePiecesActive) return;
    const b = expectedPlacementToBoard(
      normalizeExpectedPlacement(placePiecesPreviewLoadRequest.slots),
      placePiecesBaseBoard
    );
    setAuthoringPlacePiecesBoard(b);
    authoringPlacePiecesWorkBoardRef.current = cloneBoard(b);
    setAskMoveFeedbackHighlights([]);
    setAskMoveCoachCaption("");
  }, [placePiecesPreviewLoadRequest, authoringPlacePiecesActive, placePiecesBaseBoard]);

  const humanSide: "W" | "B" =
    step?.initialState?.sideToMove === "black" ? "B" : "W";

  const recorderHumanSide: "W" | "B" = authoringInteractiveAsk
    ? initialBoard.sideToMove
    : humanSide;

  const recorder = useSolutionRecorder(initialBoard);

  useEffect(() => {
    const len = recorder.state.moves.length;
    const prev = prevRecordedMovesLenRef.current;
    if (len > prev) {
      setInputScrubPly(len);
    } else if (len < prev) {
      setInputScrubPly((p) => Math.min(p, len));
    }
    prevRecordedMovesLenRef.current = len;
  }, [recorder.state.moves.length]);

  const showReplayBoard = authoringInteractiveRecorder
    ? false
    : !legacyInteractiveMoveStep || interactivePreviewMode === "replay";
  const autoFlipBoard =
    authoringPreview != null
      ? authoringPreview.sideToMove === "black"
      : step?.initialState?.sideToMove === "black";

  const cancelReplayAnim = useCallback(() => {
    if (replayRafRef.current != null) {
      cancelAnimationFrame(replayRafRef.current);
      replayRafRef.current = null;
    }
    replayAnimRef.current = null;
    setReplayAnimVersion((n) => n + 1);
    opponentPlayAnimCancelRef.current?.();
    opponentPlayAnimCancelRef.current = null;
    opponentPlayAnimRef.current = null;
    setOpponentPlayAnimVersion((n) => n + 1);
  }, []);

  /**
   * Run before paint so we never flash the previous step's opponent/human move animation
   * or replay tween after the user selects another step.
   */
  useLayoutEffect(() => {
    opponentScanRequestRef.current += 1;
    previewAutoCorrectActiveRef.current = false;
    cancelReplayAnim();
    setPositionIndex(0);
    setIsPlaying(false);
    setSelectedSquares([]);
    setSelectedPieces([]);
    setMarkedPath([]);
    setChosenOptionIds([]);
    setAuthoringMultipleChoiceSelectedIds([]);
    const resetBoard = cloneBoard(placePiecesBaseBoard);
    setAuthoringPlacePiecesBoard(resetBoard);
    authoringPlacePiecesWorkBoardRef.current = cloneBoard(resetBoard);
    setAuthoringPlacePiecesBrush("wm");
    setCountAnswer("");
    setFeedbackMessage("");
    setFeedbackType("idle");
    setAskMoveFeedbackHighlights([]);
    setAskMoveCoachCaption("");
    setAuthoringPickSquares([]);
    setAuthoringCountDraft("");
    setInteractivePreviewMode("input");
    setInputScrubPly(0);
    prevRecordedMovesLenRef.current = 0;
    authoringInteractiveFailCountRef.current = 0;
    askSequenceOrderedIndexRef.current = 0;
    askSequencePoolRef.current = null;

    if (
      authoringInteractiveMoment?.type === "askSequence" &&
      authoringInteractiveMoment.interaction?.kind === "askSequence"
    ) {
      const total = authoringInteractiveMoment.interaction.expectedSequence?.length ?? 0;
      setAskSequenceProgress(total > 0 ? { completed: 0, total } : null);
    } else {
      setAskSequenceProgress(null);
    }

    if (authoringInteractiveRecorder || authoringInteractiveAuthoringExtra) {
      setAuthoringAttemptsPill({
        failed: 0,
        max: authoringInteractiveMaxAttempts,
      });
    } else {
      setAuthoringAttemptsPill(null);
    }

    recorder.resetToStartPosition(initialBoard);
    if (step && boardClickUsesRecorder) {
      recorder.startRecording(initialBoard);
    }
  }, [
    step?.id,
    authoringPreviewEffectKey,
    authoringInteractiveMoment?.id,
    authoringInteractiveConfigKey,
    authoringInteractiveRecorder,
    authoringInteractiveAuthoringExtra,
    authoringInteractiveMaxAttempts,
    cancelReplayAnim,
    placePiecesBaseBoard,
  ]); // eslint-disable-line react-hooks/exhaustive-deps -- sync full step reset; board/recorder match step?.id

  useEffect(() => {
    if (
      authoringInteractiveMoment?.type !== "askSequence" ||
      authoringInteractiveMoment.interaction?.kind !== "askSequence"
    ) {
      return;
    }
    const seq = authoringInteractiveMoment.interaction.expectedSequence ?? [];
    const total = seq.length;
    if (total <= 0) {
      setAskSequenceProgress(null);
      return;
    }
    const completed = computeOrderedSequenceIndexFromRecordedMoves(
      recorder.state.startBoard,
      recorder.state.moves,
      seq
    );
    askSequenceOrderedIndexRef.current = completed;
    setAskSequenceProgress({ completed, total });
    if (completed >= total) {
      setFeedbackType("correct");
      setFeedbackMessage(
        readLocalizedText(authoringInteractiveMoment.caption, language).trim() ||
          (language === "nl" ? "Hele volgorde goed!" : "Full sequence correct!")
      );
      if (recorder.state.isRecording) {
        recorder.stopRecording();
      }
    }
  }, [
    authoringInteractiveMoment?.id,
    language,
    recorder.state.startBoard,
    recorder.state.isRecording,
    recorder.state.moves,
  ]);

  const boardForEditor = useMemo(() => {
    void replayAnimVersion;
    void opponentPlayAnimVersion;
    void inputScrubPly;
    if (authoringPlacePiecesActive) {
      return authoringPlacePiecesBoard;
    }
    if (!showReplayBoard) {
      const oa = opponentPlayAnimRef.current;
      if (oa) {
        return computeNotationAnimFrame(oa.meta, oa.currentT, autoFlipBoard).displayBoard;
      }
      const recLen = recorder.state.moves.length;
      if (
        boardClickUsesRecorder &&
        interactivePreviewMode === "input" &&
        recLen > 0 &&
        inputScrubPly < recLen
      ) {
        return boardAfterRecordedMovesSlice(
          recorder.state.startBoard,
          recorder.state.moves.slice(0, inputScrubPly)
        );
      }
      return recorder.state.board;
    }
    const anim = replayAnimRef.current;
    if (!anim) return boards[positionIndex] ?? initialBoard;
    const meta: NotationAnimMetadata = {
      fromBoard: anim.fromBoard,
      toBoard: anim.toBoard,
      path: anim.path,
      captures: anim.captures,
      movingPiece: anim.movingPiece,
      captureGhosts: anim.captureGhosts,
    };
    return computeNotationAnimFrame(meta, anim.currentT, autoFlipBoard).displayBoard;
  }, [
    showReplayBoard,
    recorder.state.board,
    boards,
    positionIndex,
    initialBoard,
    replayAnimVersion,
    opponentPlayAnimVersion,
    autoFlipBoard,
    inputScrubPly,
    boardClickUsesRecorder,
    interactivePreviewMode,
    recorder.state.moves,
    authoringPlacePiecesActive,
    authoringPlacePiecesBoard,
  ]);

  const replayMotionOverlay = useMemo(() => {
    void replayAnimVersion;
    const anim = replayAnimRef.current;
    if (!showReplayBoard || !anim) return null;
    const meta: NotationAnimMetadata = {
      fromBoard: anim.fromBoard,
      toBoard: anim.toBoard,
      path: anim.path,
      captures: anim.captures,
      movingPiece: anim.movingPiece,
      captureGhosts: anim.captureGhosts,
    };
    const frame = computeNotationAnimFrame(meta, anim.currentT, autoFlipBoard);
    return {
      ghostPos: frame.ghostPos,
      movingPiece: frame.movingPiece,
      captureGhosts: frame.captureGhosts,
      captureOpacity: frame.captureOpacity,
    };
  }, [showReplayBoard, replayAnimVersion, autoFlipBoard]);

  const opponentPlayMotionOverlay = useMemo(() => {
    void opponentPlayAnimVersion;
    const oa = opponentPlayAnimRef.current;
    if (!oa || showReplayBoard) return null;
    return computeNotationAnimFrame(oa.meta, oa.currentT, autoFlipBoard);
  }, [autoFlipBoard, opponentPlayAnimVersion, showReplayBoard]);

  const opponentInputBlocked = useMemo(() => {
    void opponentPlayAnimVersion;
    return opponentPlayAnimRef.current != null;
  }, [opponentPlayAnimVersion]);

  const inputScrubbing = useMemo(() => {
    void inputScrubPly;
    const recLen = recorder.state.moves.length;
    return (
      !!boardClickUsesRecorder &&
      interactivePreviewMode === "input" &&
      recLen > 0 &&
      inputScrubPly < recLen
    );
  }, [
    inputScrubPly,
    boardClickUsesRecorder,
    interactivePreviewMode,
    recorder.state.moves.length,
  ]);

  const sourceTimeline = step?.sourceRef?.nodeTimeline ?? [];

  const boardSize = useMemo(() => {
    const playableCount = getPlayableSquareCountFromBoard(boardForEditor);
    return inferBoardSizeFromPlayableSquares(playableCount);
  }, [boardForEditor]);

  const presentationHighlights = useMemo<HighlightSpec[]>(() => {
    if (!step) return [];
    return step.presentation?.highlights ?? [];
  }, [step]);

  const presentationHighlightsFiltered = useMemo(() => {
    if (!showReplayBoard || positionIndex <= 0) return presentationHighlights;
    const snap = sourceTimeline[positionIndex - 1];
    if (snap?.replayShowHighlights === false) return [];
    return presentationHighlights;
  }, [presentationHighlights, showReplayBoard, positionIndex, sourceTimeline]);

  const presentationArrows = step?.presentation?.arrows ?? [];
  const presentationArrowsFiltered = useMemo(() => {
    if (!showReplayBoard || positionIndex <= 0) return presentationArrows;
    const snap = sourceTimeline[positionIndex - 1];
    if (snap?.replayShowArrows === false) return [];
    return presentationArrows;
  }, [presentationArrows, showReplayBoard, positionIndex, sourceTimeline]);

  const sourcePlyHighlights = useMemo(() => {
    if (!showReplayBoard || positionIndex <= 0) return [];
    const snap = sourceTimeline[positionIndex - 1];
    if (snap?.replayShowHighlights === false) return [];
    return snap?.highlights ?? [];
  }, [showReplayBoard, positionIndex, sourceTimeline]);

  const sourcePlyArrows = useMemo(() => {
    if (!showReplayBoard || positionIndex <= 0) return [];
    const snap = sourceTimeline[positionIndex - 1];
    if (snap?.replayShowArrows === false) return [];
    return snap?.arrows ?? [];
  }, [showReplayBoard, positionIndex, sourceTimeline]);

  const sourcePlyRoutes = useMemo(() => {
    if (!showReplayBoard || positionIndex <= 0) return [];
    const snap = sourceTimeline[positionIndex - 1];
    return snap?.routes ?? [];
  }, [showReplayBoard, positionIndex, sourceTimeline]);

  const presentationHighlightsForOverlay = useMemo(() => {
    if (authoringPreview && !authoringPreview.preferStubPresentationForOverlays) {
      return authoringPreview.highlights;
    }
    return presentationHighlightsFiltered;
  }, [authoringPreview, presentationHighlightsFiltered]);

  const presentationArrowsForOverlay = useMemo(() => {
    if (authoringPreview && !authoringPreview.preferStubPresentationForOverlays) {
      return authoringPreview.arrows;
    }
    return presentationArrowsFiltered;
  }, [authoringPreview, presentationArrowsFiltered]);

  const overlayRoutes = useMemo(() => {
    const base =
      authoringPreview && !authoringPreview.preferStubPresentationForOverlays
        ? authoringPreview.routes
        : step?.presentation?.routes ?? [];
    return [...base, ...sourcePlyRoutes];
  }, [authoringPreview, step?.presentation?.routes, sourcePlyRoutes]);

  const canReplay = boards.length > 1;
  const maxIndex = Math.max(0, boards.length - 1);

  const beginReplayTransition = useCallback(
    (fromIndex: number) => {
      if (!step) return;
      cancelReplayAnim();
      const nextIdx = fromIndex + 1;
      if (nextIdx > maxIndex) return;

      const fromB = boards[fromIndex] ?? initialBoard;
      const toB = boards[nextIdx] ?? fromB;

      if (replayMoveSecondsPerStep <= 0) {
        setPositionIndex(nextIdx);
        return;
      }

      const notation = getReplayMoveNotation(step, nextIdx);
      if (!notation) {
        setPositionIndex(nextIdx);
        return;
      }
      const em = resolveNotationToEngineMove(fromB, notation);
      if (!em || em.path.length < 2) {
        setPositionIndex(nextIdx);
        return;
      }

      const fromSq = em.path[0]!;
      const movingPiece = fromB.squares[fromSq];
      if (movingPiece === "empty") {
        setPositionIndex(nextIdx);
        return;
      }

      const segmentCount = Math.max(1, em.path.length - 1);
      const durationMs = Math.max(120, replayMoveSecondsPerStep * 1000 * segmentCount);
      replayAnimRef.current = {
        fromBoard: fromB,
        toBoard: toB,
        path: em.path,
        captures: em.captures,
        movingPiece,
        captureGhosts: captureGhostsFromMove(fromB, em.captures),
        durationMs,
        startedAt: performance.now(),
        currentT: 0,
      };
      setReplayAnimVersion((n) => n + 1);

      const tick = (now: number) => {
        const a = replayAnimRef.current;
        if (!a) return;
        a.currentT = Math.min(1, (now - a.startedAt) / a.durationMs);
        setReplayAnimVersion((x) => x + 1);
        if (a.currentT >= 1) {
          if (replayRafRef.current != null) {
            cancelAnimationFrame(replayRafRef.current);
            replayRafRef.current = null;
          }
          replayAnimRef.current = null;
          setReplayAnimVersion((x) => x + 1);
          setPositionIndex(nextIdx);
          return;
        }
        replayRafRef.current = requestAnimationFrame(tick);
      };
      replayRafRef.current = requestAnimationFrame(tick);
    },
    [
      step,
      boards,
      initialBoard,
      maxIndex,
      replayMoveSecondsPerStep,
      cancelReplayAnim,
    ]
  );

  useEffect(() => {
    if (playTimerRef.current) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }

    if (!isPlaying || !canReplay || !step || !showReplayBoard) {
      cancelReplayAnim();
      return;
    }
    if (positionIndex >= maxIndex) {
      setIsPlaying(false);
      cancelReplayAnim();
      return;
    }

    const delay =
      positionIndex === 0 ? getAutoplayDelay(step) : getAutoplayDuration(step);

    const fromIdx = positionIndex;
    playTimerRef.current = window.setTimeout(() => {
      beginReplayTransition(fromIdx);
    }, delay);

    return () => {
      if (playTimerRef.current) {
        window.clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
      }
      cancelReplayAnim();
    };
  }, [
    isPlaying,
    positionIndex,
    maxIndex,
    canReplay,
    step?.id,
    showReplayBoard,
    boards,
    initialBoard,
    beginReplayTransition,
  ]);

  const runtimeAutoplayOpponent =
    step?.runtimeHints?.autoplayOpponentScan !== false &&
    step?.runtimeHints?.autoplayOpponentScan !== 0;

  useEffect(() => {
    if (!step || !legacyInteractiveMoveStep) return;
    if (interactivePreviewMode !== "input") return;
    if (!recorder.state.isRecording) return;

    const recordedNotation = recorder.state.moves.map((m) => m.notation);
    const satisfied = isPreviewBoardStepSatisfied(
      step,
      initialBoard,
      recordedNotation,
      recorder.state.board,
      recorder.state.moves,
      humanSide
    );

    if (satisfied) {
      previewAutoCorrectActiveRef.current = true;
      setFeedbackType("correct");
      setFeedbackMessage(
        readLocalizedText(step.feedback?.correct, language) ||
          (language === "nl" ? "Goed gedaan." : "Well done.")
      );
      return;
    }

    if (previewAutoCorrectActiveRef.current) {
      previewAutoCorrectActiveRef.current = false;
      setFeedbackType("idle");
      setFeedbackMessage("");
    }
  }, [
    step,
    step?.id,
    legacyInteractiveMoveStep,
    interactivePreviewMode,
    initialBoard,
    humanSide,
    language,
    recorder.state.isRecording,
    recorder.state.board,
    recorder.state.moves,
  ]);

  const lastMoveHighlights = useMemo<HighlightSpec[]>(() => {
    if (!boardClickUsesRecorder || interactivePreviewMode !== "input") return [];
    void inputScrubPly;
    if (
      recorder.state.moves.length > 0 &&
      inputScrubPly < recorder.state.moves.length
    ) {
      return [];
    }
    const moves = recorder.state.moves;
    if (!moves.length) return [];
    const last = moves[moves.length - 1];
    const pathSquares = Array.from(new Set(last.path));
    const isHuman = last.side === recorderHumanSide;
    const color = isHuman ? "success" : "info";
    const suffix = isHuman ? "human" : "opponent";
    return [
      {
        id: `preview-last-move-path-${suffix}`,
        squares: pathSquares,
        color,
        fill: true,
        outline: false,
        pulse: false,
      },
    ];
  }, [
    inputScrubPly,
    boardClickUsesRecorder,
    interactivePreviewMode,
    recorderHumanSide,
    recorder.state.moves,
  ]);

  /**
   * Autoplay only for the opponent (not the human solving the move/sequence):
   * sole maximal capture when unambiguous, otherwise Scan best move (capture when required).
   */
  useEffect(() => {
    if (!step || !legacyInteractiveMoveStep) return;
    if (interactivePreviewMode !== "input") return;
    if (!runtimeAutoplayOpponent) return;
    if (!recorder.state.isRecording) return;
    if (recorder.state.chainInProgress || recorder.state.selectedFrom !== null) return;
    if (opponentPlayAnimRef.current) return;

    const board = recorder.state.board;
    const moves = recorder.state.moves;
    const recordedNotation = moves.map((m) => m.notation);

    if (
      isPreviewBoardStepSatisfied(
        step,
        initialBoard,
        recordedNotation,
        board,
        moves,
        humanSide
      )
    ) {
      opponentScanRequestRef.current += 1;
      return;
    }

    let expectedHumanPlies = 0;
    if (step.validation.type === "sequence") {
      expectedHumanPlies = step.validation.moves?.length ?? 0;
    } else if (step.validation.type === "move") {
      expectedHumanPlies = 1;
    }
    if (expectedHumanPlies > 0) {
      const humanPliesPlayed = moves.filter((m) => m.side === humanSide).length;
      if (humanPliesPlayed >= expectedHumanPlies) {
        return;
      }
    }

    if (board.sideToMove === humanSide) return;

    if (getMaxCaptureCount(board) > 0) {
      const sole = getSoleMaximalCaptureOpening(board);
      if (sole) {
        const secAnim =
          replayMoveSecondsPerStep > 0 ? replayMoveSecondsPerStep : readStudioMoveAnimationSeconds();
        const peek = recorder.previewSoleForcedApply();
        const meta =
          peek && secAnim > 0 ? prepareNotationAnimFromNotation(board, peek.notation) : null;
        if (!meta || secAnim <= 0) {
          recorder.applySoleForcedMaximalCaptureIfUnambiguous();
          return;
        }
        opponentPlayAnimCancelRef.current?.();
        opponentPlayAnimCancelRef.current = null;
        opponentPlayAnimRef.current = { meta, currentT: 0 };
        setOpponentPlayAnimVersion((n) => n + 1);
        opponentPlayAnimCancelRef.current = runNotationMoveAnimation({
          meta,
          flipped: autoFlipBoard,
          secondsPerMove: secAnim,
          onFrame: (_f, t) => {
            opponentPlayAnimRef.current = { meta, currentT: t };
            setOpponentPlayAnimVersion((n) => n + 1);
          },
          onComplete: () => {
            opponentPlayAnimCancelRef.current = null;
            opponentPlayAnimRef.current = null;
            setOpponentPlayAnimVersion((n) => n + 1);
            recorder.applySoleForcedMaximalCaptureIfUnambiguous();
          },
        });
        return;
      }
    }

    const requestId = ++opponentScanRequestRef.current;
    const fenSnapshot = boardStateToFen(board);
    const scanVariant = mapVariantToScanVariant(variantId);
    let cancelled = false;

    void (async () => {
      try {
        const scan = (await loadScanModule()) as Record<string, unknown>;
        const analyzeFn =
          (scan.analyze as
            | ((payload: Record<string, unknown>) => Promise<{ bestMove?: string }>)
            | undefined) ??
          (scan.analyzePosition as
            | ((payload: Record<string, unknown>) => Promise<{ bestMove?: string }>)
            | undefined);
        if (!analyzeFn) return;

        const analyzed = await analyzeFn({
          variant: scanVariant,
          fen: fenSnapshot,
          depth: PREVIEW_OPPONENT_SCAN_DEPTH,
          multiPv: 1,
        });
        if (cancelled || requestId !== opponentScanRequestRef.current) return;
        const bm =
          analyzed && typeof analyzed === "object" && "bestMove" in analyzed
            ? String((analyzed as { bestMove?: string }).bestMove ?? "").trim()
            : "";
        if (!bm || requestId !== opponentScanRequestRef.current) return;
        let boardAtScan: BoardState;
        try {
          boardAtScan = fenToBoardState(fenSnapshot);
        } catch {
          return;
        }
        const mustCapture = getMaxCaptureCount(boardAtScan) > 0;
        const em = resolveNotationToEngineMove(boardAtScan, bm);
        if (!em) return;
        if (mustCapture && em.captures.length === 0) return;
        if (requestId !== opponentScanRequestRef.current) return;

        const secAnim =
          replayMoveSecondsPerStep > 0 ? replayMoveSecondsPerStep : readStudioMoveAnimationSeconds();
        const meta = prepareNotationAnimFromEngineMove(boardAtScan, em);
        if (!meta || secAnim <= 0) {
          recorder.appendExternalNotation(bm);
          return;
        }

        opponentPlayAnimCancelRef.current?.();
        opponentPlayAnimCancelRef.current = null;
        opponentPlayAnimRef.current = { meta, currentT: 0 };
        setOpponentPlayAnimVersion((n) => n + 1);
        opponentPlayAnimCancelRef.current = runNotationMoveAnimation({
          meta,
          flipped: autoFlipBoard,
          secondsPerMove: secAnim,
          onFrame: (_f, t) => {
            opponentPlayAnimRef.current = { meta, currentT: t };
            setOpponentPlayAnimVersion((n) => n + 1);
          },
          onComplete: () => {
            opponentPlayAnimCancelRef.current = null;
            opponentPlayAnimRef.current = null;
            setOpponentPlayAnimVersion((n) => n + 1);
            if (requestId !== opponentScanRequestRef.current) return;
            recorder.appendExternalNotation(bm);
          },
        });
      } catch (error) {
        console.warn("[StepPreview] opponent Scan autoplay failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    step?.id,
    step,
    legacyInteractiveMoveStep,
    interactivePreviewMode,
    runtimeAutoplayOpponent,
    humanSide,
    variantId,
    recorder.state.isRecording,
    recorder.state.board,
    recorder.state.moves,
    recorder.state.chainInProgress,
    recorder.state.selectedFrom,
    recorder.appendExternalNotation,
    recorder.applySoleForcedMaximalCaptureIfUnambiguous,
    recorder.previewSoleForcedApply,
    initialBoard,
    replayMoveSecondsPerStep,
    autoFlipBoard,
  ]);

  /**
   * Authoring `askSequence` preview never used the legacy opponent Scan effect.
   * When zwart een keuzeslag heeft (meerdere maximale openzetten), resolve via authored `expectedSequence`
   * instead of leaving the position stuck or inconsistent.
   */
  useEffect(() => {
    if (
      authoringInteractiveMoment?.type !== "askSequence" ||
      authoringInteractiveMoment.interaction?.kind !== "askSequence"
    ) {
      return;
    }
    if (!step) return;
    if (interactivePreviewMode !== "input") return;
    if (!runtimeAutoplayOpponent) return;
    if (!recorder.state.isRecording) return;
    if (recorder.state.chainInProgress || recorder.state.selectedFrom !== null) return;
    if (opponentPlayAnimRef.current) return;

    const board = recorder.state.board;
    if (board.sideToMove === recorderHumanSide) return;

    const seq = authoringInteractiveMoment.interaction.expectedSequence ?? [];
    let expectedIndex = askSequenceOrderedIndexRef.current;
    if (seq.length > 0 && expectedIndex >= seq.length) return;

    if (getMaxCaptureCount(board) <= 0) return;

    // Align to the next expected ply that is actually playable for the current side-to-move.
    let auth: { notation: string } | null = null;
    let emAuth = null as ReturnType<typeof resolveNotationToEngineMove>;
    for (let i = expectedIndex; i < seq.length; i += 1) {
      const candidate = tryResolveAuthoringAskSequencePly(board, seq[i]);
      if (!candidate) continue;
      const em = resolveNotationToEngineMove(board, candidate.notation);
      if (!em) continue;
      if (em.side !== board.sideToMove) continue;
      if (em.captures.length === 0) continue;
      expectedIndex = i;
      auth = candidate;
      emAuth = em;
      break;
    }
    if (!auth || !emAuth) return;
    if (expectedIndex !== askSequenceOrderedIndexRef.current) {
      askSequenceOrderedIndexRef.current = expectedIndex;
    }

    const secAnim =
      replayMoveSecondsPerStep > 0
        ? replayMoveSecondsPerStep
        : readStudioMoveAnimationSeconds();
    const meta =
      secAnim > 0 ? prepareNotationAnimFromEngineMove(board, emAuth) : null;
    if (!meta || secAnim <= 0) {
      recorder.appendExternalNotation(auth.notation);
      askSequenceOrderedIndexRef.current += 1;
      return;
    }

    opponentPlayAnimCancelRef.current?.();
    opponentPlayAnimCancelRef.current = null;
    opponentPlayAnimRef.current = { meta, currentT: 0 };
    setOpponentPlayAnimVersion((n) => n + 1);
    opponentPlayAnimCancelRef.current = runNotationMoveAnimation({
      meta,
      flipped: autoFlipBoard,
      secondsPerMove: secAnim,
      onFrame: (_f, t) => {
        opponentPlayAnimRef.current = { meta, currentT: t };
        setOpponentPlayAnimVersion((n) => n + 1);
      },
      onComplete: () => {
        opponentPlayAnimCancelRef.current = null;
        opponentPlayAnimRef.current = null;
        setOpponentPlayAnimVersion((n) => n + 1);
        recorder.appendExternalNotation(auth.notation);
        askSequenceOrderedIndexRef.current += 1;
      },
    });
  }, [
    authoringInteractiveMoment,
    step?.id,
    step,
    interactivePreviewMode,
    runtimeAutoplayOpponent,
    recorder.state.isRecording,
    recorder.state.board,
    recorder.state.moves.length,
    recorder.state.chainInProgress,
    recorder.state.selectedFrom,
    recorderHumanSide,
    recorder.appendExternalNotation,
    replayMoveSecondsPerStep,
    autoFlipBoard,
  ]);

  if (!step) {
    return (
      <section style={emptyStyle}>
        {t("Preview appears here when you select a step.", "Voorbeeld verschijnt hier zodra je een stap selecteert.")}
      </section>
    );
  }

  const currentMoveLabel =
    positionIndex > 0 ? autoplayMoves[positionIndex - 1] ?? "" : "";
  const atStart = positionIndex <= 0;
  const atEnd = positionIndex >= maxIndex;
  const placePiecesNavigationLocked = authoringPlacePiecesActive;
  const recordedMoves = recorder.getNotationList();
  const recordedLen = recorder.state.moves.length;
  const inputScrubNav =
    !!boardClickUsesRecorder && interactivePreviewMode === "input" && recordedLen > 0;
  const timelineReplayNav = canReplay && showReplayBoard;

  const currentSourceSnapshot = (() => {
    if (sourceTimeline.length === 0) return null;
    if (boardClickUsesRecorder) {
      const idx = Math.max(0, recordedMoves.length - 1);
      return sourceTimeline[idx] ?? null;
    }
    if (positionIndex <= 0) return null;
    return sourceTimeline[positionIndex - 1] ?? null;
  })();

  const sourcePreMoveComment = currentSourceSnapshot
    ? readLocalizedText(currentSourceSnapshot.preMoveComment, language)
    : "";
  const sourcePostMoveComment = currentSourceSnapshot
    ? readLocalizedText(currentSourceSnapshot.comment, language)
    : "";

  const interactiveHighlights: HighlightSpec[] = [];

  if (step.validation.type === "select_squares" || step.validation.type === "zone_paint") {
    interactiveHighlights.push({
      id: "preview-select-squares",
      squares: selectedSquares,
      color: "primary",
      pulse: false,
      fill: true,
      outline: true,
    });
  }

  if (step.validation.type === "select_pieces") {
    interactiveHighlights.push({
      id: "preview-select-pieces",
      squares: selectedPieces,
      color: "warning",
      pulse: false,
      fill: false,
      outline: true,
    });
  }

  if (step.validation.type === "mark_path") {
    interactiveHighlights.push({
      id: "preview-mark-path",
      squares: markedPath,
      color: "info",
      pulse: false,
      fill: false,
      outline: true,
    });
  }

  if (
    step.validation.type === "goal" &&
    step.validation.goalType === "reach_square" &&
    typeof step.validation.targetSquare === "number"
  ) {
    interactiveHighlights.push({
      id: "preview-goal-target-square",
      squares: [step.validation.targetSquare],
      color: "warning",
      pulse: true,
      fill: false,
      outline: true,
    });
  }

  if (authoringInteractiveSelect && authoringInteractiveMoment) {
    const ix = authoringInteractiveMoment.interaction;
    if (
      (ix?.kind === "askSelectSquares" || ix?.kind === "askSelectPieces") &&
      (ix.hintSquares?.length ?? 0) > 0
    ) {
      interactiveHighlights.push({
        id: "authoring-pick-hint",
        squares: [...new Set(ix.hintSquares ?? [])],
        color: "info",
        pulse: false,
        fill: false,
        outline: true,
      });
    }
    if (authoringPickSquares.length > 0) {
      interactiveHighlights.push({
        id: "authoring-pick-selected",
        squares: authoringPickSquares,
        color: authoringInteractiveMoment.type === "askSelectPieces" ? "warning" : "primary",
        pulse: false,
        fill: true,
        outline: true,
      });
    }
  }

  if (authoringBoardTargetPickMode && authoringStudioSquareSelection.length > 0) {
    interactiveHighlights.push({
      id: "authoring-preview-studio-pick",
      squares: [...authoringStudioSquareSelection],
      color: "success",
      pulse: true,
      fill: false,
      outline: true,
    });
  }

  const allHighlights = [
    ...presentationHighlightsForOverlay,
    ...sourcePlyHighlights,
    ...interactiveHighlights,
    ...lastMoveHighlights,
    ...askMoveFeedbackHighlights,
  ];

  const handleBoardClick = (
    square: number,
    options?: { dragPaint?: boolean; erase?: boolean }
  ) => {
    if (authoringBoardTargetPickMode && onAuthoringTargetSquareToggle) {
      if (authoringTargetPickPiecesOnly && initialBoard.squares[square] === "empty") {
        return;
      }
      onAuthoringTargetSquareToggle(square);
      return;
    }

    if (authoringPlacePiecesActive) {
      setAuthoringPlacePiecesBoard((prev) => {
        if (options?.erase) {
          const next: BoardState = {
            ...prev,
            squares: { ...prev.squares, [square]: "empty" },
          };
          authoringPlacePiecesWorkBoardRef.current = cloneBoard(next);
          return next;
        }
        const brush = authoringPlacePiecesBrush;
        if (brush === "empty") {
          const next: BoardState = {
            ...prev,
            squares: { ...prev.squares, [square]: "empty" },
          };
          authoringPlacePiecesWorkBoardRef.current = cloneBoard(next);
          return next;
        }
        const next: BoardState = {
          ...prev,
          squares: { ...prev.squares, [square]: brush },
        };
        authoringPlacePiecesWorkBoardRef.current = cloneBoard(next);
        return next;
      });
      setAskMoveFeedbackHighlights([]);
      setAskMoveCoachCaption("");
      return;
    }

    if (authoringInteractiveSelect && authoringInteractiveMoment) {
      if (
        authoringInteractiveMoment.type === "askSelectPieces" &&
        initialBoard.squares[square] === "empty"
      ) {
        return;
      }
      setAuthoringPickSquares((prev) =>
        prev.includes(square) ? prev.filter((s) => s !== square) : [...prev, square]
      );
      setAskMoveFeedbackHighlights([]);
      setAskMoveCoachCaption("");
      return;
    }

    if (boardClickUsesRecorder) {
      if (interactivePreviewMode === "input" && opponentInputBlocked) return;
      if (interactivePreviewMode === "input" && inputScrubPly < recorder.state.moves.length) {
        setInputScrubPly(recorder.state.moves.length);
      }
      setIsPlaying(false);
      if (authoringInteractiveAsk) {
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption("");
      }
      flushSync(() => {
        recorder.handleClickSquare(square);
      });
      const clickOutcome = recorder.consumeLastSquareClickOutcome();

      if (authoringInteractiveAsk && recorder.state.chainInProgress) {
        return;
      }

      if (
        legacyInteractiveMoveStep &&
        interactivePreviewMode === "input" &&
        clickOutcome &&
        clickOutcome.nextMoveCount > clickOutcome.prevMoveCount
      ) {
        const humanAdds = clickOutcome.addedMoves.filter((m) => m.side === recorderHumanSide);
        const secAnim =
          replayMoveSecondsPerStep > 0
            ? replayMoveSecondsPerStep
            : readStudioMoveAnimationSeconds();
        if (humanAdds.length > 0 && secAnim > 0) {
          const delta = clickOutcome.nextMoveCount - clickOutcome.prevMoveCount;
          for (let u = 0; u < delta; u += 1) {
            flushSync(() => {
              recorder.undo();
            });
          }

          const replayHumanAdds = (idx: number) => {
            if (idx >= humanAdds.length) return;
            const mv = humanAdds[idx]!;
            const meta = prepareNotationAnimFromNotation(recorder.state.board, mv.notation);
            if (!meta) {
              flushSync(() => {
                recorder.appendExternalNotation(mv.notation);
              });
              replayHumanAdds(idx + 1);
              return;
            }
            cancelReplayAnim();
            opponentPlayAnimRef.current = { meta, currentT: 0 };
            setOpponentPlayAnimVersion((n) => n + 1);
            opponentPlayAnimCancelRef.current = runNotationMoveAnimation({
              meta,
              flipped: autoFlipBoard,
              secondsPerMove: secAnim,
              onFrame: (_f, t) => {
                opponentPlayAnimRef.current = { meta, currentT: t };
                setOpponentPlayAnimVersion((n) => n + 1);
              },
              onComplete: () => {
                opponentPlayAnimCancelRef.current = null;
                opponentPlayAnimRef.current = null;
                setOpponentPlayAnimVersion((n) => n + 1);
                flushSync(() => {
                  recorder.appendExternalNotation(mv.notation);
                });
                replayHumanAdds(idx + 1);
              },
            });
          };
          replayHumanAdds(0);
        }
      }

      if (
        authoringInteractiveAsk &&
        authoringInteractiveMoment &&
        interactivePreviewMode === "input" &&
        clickOutcome &&
        clickOutcome.nextMoveCount > clickOutcome.prevMoveCount
      ) {
        const movesAfter = recorder.state.moves;
        if (movesAfter.length > 0) {
          const last = movesAfter[movesAfter.length - 1]!;
          const addedFromOutcome = movesAfter.slice(
            Math.max(0, clickOutcome.prevMoveCount),
            Math.max(0, clickOutcome.nextMoveCount)
          );
          const addedMoves =
            addedFromOutcome.length > 0
              ? addedFromOutcome
              : clickOutcome.addedMoves.length > 0
                ? clickOutcome.addedMoves
                : [last];
          const boardBefore = boardAfterRecordedMovesSlice(
            recorder.state.startBoard,
            movesAfter.slice(0, Math.max(0, clickOutcome.prevMoveCount))
          );

          if (
            authoringInteractiveMoment.type === "askMove" &&
            authoringInteractiveMoment.interaction?.kind === "askMove"
          ) {
            if (last.side !== recorderHumanSide) {
              return;
            }
            const result = evaluateAskMoveAttempt(authoringInteractiveMoment, {
              boardBefore,
              attempt: last,
              priorFailedCount: authoringInteractiveFailCountRef.current,
              language,
            });
            if (result.kind === "success") {
              authoringInteractiveFailCountRef.current = 0;
              setAuthoringAttemptsPill({
                failed: 0,
                max: authoringInteractiveMaxAttempts,
              });
              setFeedbackType("correct");
              setFeedbackMessage(result.message);
              setAskMoveFeedbackHighlights(result.feedbackHighlights ?? []);
              setAskMoveCoachCaption(result.coachCaption ?? "");
              recorder.stopRecording();
            } else {
              authoringInteractiveFailCountRef.current = result.nextFailedCount;
              setAuthoringAttemptsPill({
                failed: result.nextFailedCount,
                max: authoringInteractiveMaxAttempts,
              });
              setFeedbackType(result.kind === "illegal" ? "illegal" : "incorrect");
              setFeedbackMessage(result.message);
              setAskMoveFeedbackHighlights(result.feedbackHighlights ?? []);
              setAskMoveCoachCaption(result.coachCaption ?? "");
              if (!result.allowFurtherInput) {
                recorder.stopRecording();
              } else {
                flushSync(() => {
                  recorder.undo();
                });
              }
            }
          } else if (
            authoringInteractiveMoment.type === "askSequence" &&
            authoringInteractiveMoment.interaction?.kind === "askSequence"
          ) {
            const ix = authoringInteractiveMoment.interaction;
            const requireOrder = ix.requireExactOrder !== false;
            const seqTotal = ix.expectedSequence?.length ?? 0;
            const baseMoveIndex = Math.max(0, clickOutcome.prevMoveCount);
            if (requireOrder && seqTotal > 0) {
              askSequenceOrderedIndexRef.current = computeOrderedSequenceIndexFromRecordedMoves(
                recorder.state.startBoard,
                movesAfter.slice(0, baseMoveIndex),
                ix.expectedSequence
              );
            }
            for (let ai = 0; ai < addedMoves.length; ai += 1) {
              const mv = addedMoves[ai]!;
              const absoluteMoveIndex = baseMoveIndex + ai;
              let boardCursor = boardAfterRecordedMovesSlice(
                recorder.state.startBoard,
                movesAfter.slice(0, absoluteMoveIndex)
              );
              const em = resolveNotationToEngineMove(boardCursor, mv.notation);
              // Auto/opponent plies can be appended by preview logic (forced captures, scan move).
              // They should advance board context, but must not be scored as learner input.
              if (mv.side !== recorderHumanSide) {
                if (requireOrder) {
                  const currentExpected =
                    ix.expectedSequence?.[askSequenceOrderedIndexRef.current];
                  const autoResolved = currentExpected
                    ? tryResolveAuthoringAskSequencePly(boardCursor, currentExpected)
                    : null;
                  if (autoResolved && em && em.notation === autoResolved.notation) {
                    askSequenceOrderedIndexRef.current += 1;
                  }
                }
                continue;
              }
              if (requireOrder && seqTotal > 0) {
                let alignedIndex = askSequenceOrderedIndexRef.current;
                for (let guard = 0; guard < seqTotal && alignedIndex < seqTotal; guard += 1) {
                  const exp = ix.expectedSequence?.[alignedIndex];
                  const expResolvedNotation = exp
                    ? tryResolveAuthoringAskSequencePly(boardCursor, exp)?.notation
                    : null;
                  const expResolved = expResolvedNotation
                    ? resolveNotationToEngineMove(boardCursor, expResolvedNotation)
                    : null;
                  // Skip stale/non-resolvable expected plies, or plies that belong to the other side
                  // in the current board context (they are usually auto-played already).
                  if (!expResolved || expResolved.side !== mv.side) {
                    alignedIndex += 1;
                    continue;
                  }
                  // We found a same-side expected ply; stop here (match/wrong decided by evaluator).
                  break;
                }
                if (alignedIndex !== askSequenceOrderedIndexRef.current) {
                  askSequenceOrderedIndexRef.current = Math.min(alignedIndex, seqTotal);
                }
              }
              const seqResult = evaluateAskSequenceAttempt(authoringInteractiveMoment, {
                boardBefore: boardCursor,
                attempt: mv,
                priorFailedCount: authoringInteractiveFailCountRef.current,
                language,
                orderedIndex: askSequenceOrderedIndexRef.current,
                poolRemaining: requireOrder ? undefined : askSequencePoolRef.current ?? undefined,
              });

              if (seqResult.kind === "success") {
                authoringInteractiveFailCountRef.current = 0;
                askSequenceOrderedIndexRef.current = seqTotal;
                askSequencePoolRef.current = null;
                setAuthoringAttemptsPill({
                  failed: 0,
                  max: authoringInteractiveMaxAttempts,
                });
                setAskSequenceProgress(
                  seqTotal > 0 ? { completed: seqTotal, total: seqTotal } : null
                );
                setFeedbackType("correct");
                setFeedbackMessage(seqResult.message);
                setAskMoveFeedbackHighlights(seqResult.feedbackHighlights ?? []);
                setAskMoveCoachCaption(seqResult.coachCaption ?? "");
                recorder.stopRecording();
                break;
              }

              if (seqResult.kind === "progress") {
                authoringInteractiveFailCountRef.current = 0;
                setAuthoringAttemptsPill({
                  failed: 0,
                  max: authoringInteractiveMaxAttempts,
                });
                if (seqResult.nextOrderedIndex != null) {
                  askSequenceOrderedIndexRef.current = seqResult.nextOrderedIndex;
                }
                if (!requireOrder && seqResult.nextPoolRemaining !== undefined) {
                  askSequencePoolRef.current =
                    seqResult.nextPoolRemaining.length > 0
                      ? [...seqResult.nextPoolRemaining]
                      : null;
                }
                if (seqTotal > 0) {
                  if (requireOrder && seqResult.nextOrderedIndex != null) {
                    setAskSequenceProgress({
                      completed: seqResult.nextOrderedIndex,
                      total: seqTotal,
                    });
                  } else if (!requireOrder && seqResult.nextPoolRemaining !== undefined) {
                    const rem = seqResult.nextPoolRemaining.length;
                    setAskSequenceProgress({
                      completed: seqTotal - rem,
                      total: seqTotal,
                    });
                  }
                }
                setFeedbackType("correct");
                setFeedbackMessage(seqResult.message);
                setAskMoveFeedbackHighlights(seqResult.feedbackHighlights ?? []);
                setAskMoveCoachCaption(seqResult.coachCaption ?? "");
              } else {
                authoringInteractiveFailCountRef.current = seqResult.nextFailedCount;
                setAuthoringAttemptsPill({
                  failed: seqResult.nextFailedCount,
                  max: authoringInteractiveMaxAttempts,
                });
                if (seqResult.nextOrderedIndex != null) {
                  askSequenceOrderedIndexRef.current = seqResult.nextOrderedIndex;
                }
                if (seqResult.nextPoolRemaining !== undefined) {
                  askSequencePoolRef.current =
                    seqResult.nextPoolRemaining.length > 0
                      ? [...seqResult.nextPoolRemaining]
                      : null;
                }
                setAskSequenceProgress(seqTotal > 0 ? { completed: 0, total: seqTotal } : null);
                setFeedbackType(seqResult.kind === "illegal" ? "illegal" : "incorrect");
                setFeedbackMessage(seqResult.message);
                setAskMoveFeedbackHighlights(seqResult.feedbackHighlights ?? []);
                setAskMoveCoachCaption(seqResult.coachCaption ?? "");
                if (!seqResult.allowFurtherInput) {
                  recorder.stopRecording();
                } else {
                  flushSync(() => {
                    recorder.undo();
                  });
                }
                break;
              }

              if (!em) break;
            }
          }
        }
      }
      return;
    }

    switch (step.validation.type) {
      case "select_squares":
      case "zone_paint":
        setSelectedSquares((prev) =>
          prev.includes(square) ? prev.filter((s) => s !== square) : [...prev, square]
        );
        break;

      case "select_pieces":
        if (initialBoard.squares[square] === "empty") return;
        setSelectedPieces((prev) =>
          prev.includes(square) ? prev.filter((s) => s !== square) : [...prev, square]
        );
        break;

      case "mark_path":
        if (step.validation.mode === "exact_path") {
          setMarkedPath((prev) =>
            prev.length > 0 && prev[prev.length - 1] === square
              ? prev.slice(0, -1)
              : [...prev, square]
          );
        } else {
          setMarkedPath([square]);
        }
        break;

      default:
        break;
    }
  };

  const checkAnswer = () => {
    if (
      authoringInteractiveMoment?.type === "askCount" &&
      authoringInteractiveMoment.interaction?.kind === "askCount"
    ) {
      const raw = authoringCountDraft.trim();
      const num = raw === "" ? NaN : Number(raw);
      const entered = Number.isFinite(num) ? Math.round(num) : null;
      const result = evaluateAskCountAttempt(
        authoringInteractiveMoment,
        entered,
        authoringInteractiveFailCountRef.current,
        language
      );
      if (result.status === "success") {
        authoringInteractiveFailCountRef.current = 0;
        setAuthoringAttemptsPill({
          failed: 0,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("correct");
        setFeedbackMessage(result.message);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      } else {
        authoringInteractiveFailCountRef.current = result.nextFailedCount;
        setAuthoringAttemptsPill({
          failed: result.nextFailedCount,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("incorrect");
        setFeedbackMessage(result.message);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      }
      return;
    }

    if (
      authoringInteractiveMoment?.type === "askSelectSquares" &&
      authoringInteractiveMoment.interaction?.kind === "askSelectSquares"
    ) {
      const result = evaluateAskSelectSquaresAttempt(
        authoringInteractiveMoment,
        authoringPickSquares,
        authoringInteractiveFailCountRef.current,
        language
      );
      if (result.status === "success") {
        authoringInteractiveFailCountRef.current = 0;
        setAuthoringAttemptsPill({
          failed: 0,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("correct");
        setFeedbackMessage(result.feedback);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      } else {
        authoringInteractiveFailCountRef.current = result.nextFailedCount;
        setAuthoringAttemptsPill({
          failed: result.nextFailedCount,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("incorrect");
        setFeedbackMessage(result.feedback);
        setAskMoveFeedbackHighlights(result.feedbackHighlights ?? []);
        setAskMoveCoachCaption(result.coachCaption);
      }
      return;
    }

    if (
      authoringInteractiveMoment?.type === "askSelectPieces" &&
      authoringInteractiveMoment.interaction?.kind === "askSelectPieces"
    ) {
      const result = evaluateAskSelectPiecesAttempt(
        authoringInteractiveMoment,
        authoringPickSquares,
        authoringInteractiveFailCountRef.current,
        language
      );
      if (result.status === "success") {
        authoringInteractiveFailCountRef.current = 0;
        setAuthoringAttemptsPill({
          failed: 0,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("correct");
        setFeedbackMessage(result.feedback);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      } else {
        authoringInteractiveFailCountRef.current = result.nextFailedCount;
        setAuthoringAttemptsPill({
          failed: result.nextFailedCount,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("incorrect");
        setFeedbackMessage(result.feedback);
        setAskMoveFeedbackHighlights(result.feedbackHighlights ?? []);
        setAskMoveCoachCaption(result.coachCaption);
      }
      return;
    }

    if (
      authoringInteractiveMoment?.type === "multipleChoice" &&
      authoringInteractiveMoment.interaction?.kind === "multipleChoice"
    ) {
      const result = evaluateMultipleChoiceAttempt(
        authoringInteractiveMoment,
        authoringMultipleChoiceSelectedIds,
        authoringInteractiveFailCountRef.current,
        language
      );
      if (result.status === "success") {
        authoringInteractiveFailCountRef.current = 0;
        setAuthoringAttemptsPill({
          failed: 0,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("correct");
        setFeedbackMessage(result.message);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      } else {
        authoringInteractiveFailCountRef.current = result.nextFailedCount;
        setAuthoringAttemptsPill({
          failed: result.nextFailedCount,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("incorrect");
        setFeedbackMessage(result.message);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      }
      return;
    }

    if (
      authoringInteractiveMoment?.type === "placePieces" &&
      authoringInteractiveMoment.interaction?.kind === "placePieces"
    ) {
      const result = evaluatePlacePiecesAttempt(
        authoringInteractiveMoment,
        authoringPlacePiecesBoard,
        authoringInteractiveFailCountRef.current,
        language
      );
      if (result.status === "success") {
        authoringInteractiveFailCountRef.current = 0;
        setAuthoringAttemptsPill({
          failed: 0,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("correct");
        setFeedbackMessage(result.message);
        setAskMoveFeedbackHighlights([]);
        setAskMoveCoachCaption(result.coachCaption);
      } else {
        authoringInteractiveFailCountRef.current = result.nextFailedCount;
        setAuthoringAttemptsPill({
          failed: result.nextFailedCount,
          max: authoringInteractiveMaxAttempts,
        });
        setFeedbackType("incorrect");
        setFeedbackMessage(result.message);
        setAskMoveFeedbackHighlights(result.feedbackHighlights);
        setAskMoveCoachCaption(result.coachCaption);
      }
      return;
    }

    switch (step.validation.type) {
      case "none":
        setFeedbackType("correct");
        setFeedbackMessage(
          readLocalizedText(step.feedback?.correct, language) ||
            t("This step has no answer validation.", "Deze stap heeft geen antwoordvalidatie.")
        );
        return;

      case "move": {
        const recorded = recorder.getNotationList();
        const correctMoves = step.validation.correctMoves ?? [];
        const success = recorded.length === 1 && correctMoves.includes(recorded[0]);
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Well done.", "Goed gedaan.")
            : readLocalizedText(step.feedback?.incorrect, language) || t("Not correct yet.", "Nog niet correct.")
        );
        return;
      }

      case "sequence": {
        const recorded = recorder.getNotationList();
        const expected = step.validation.moves ?? [];
        const success =
          equalNotationSequence(recorded, expected) ||
          equalByBoardEvolution(initialBoard, recorded, expected) ||
          equalByCaptureSourcePattern(recorded, expected);
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Well done.", "Goed gedaan.")
            : `${
                readLocalizedText(step.feedback?.incorrect, language) ||
                t("Not correct yet.", "Nog niet correct.")
              } ${t("Expected", "Verwacht")}: ${expected.join(", ") || "—"} · ${t(
                "Played",
                "Gespeeld"
              )}: ${recorded.join(", ") || "—"}`
        );
        return;
      }

      case "select_squares": {
        const success = arraysEqualAsSet(selectedSquares, step.validation.squares ?? []);
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Correct selection.", "Correcte selectie.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
              t("The selection is not correct yet.", "De selectie is nog niet correct.")
        );
        return;
      }

      case "select_pieces": {
        const success = arraysEqualAsSet(selectedPieces, step.validation.pieceSquares ?? []);
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Correct selection.", "Correcte selectie.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
              t("The selection is not correct yet.", "De selectie is nog niet correct.")
        );
        return;
      }

      case "zone_paint": {
        const success = arraysEqualAsSet(selectedSquares, step.validation.squares ?? []);
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Zone is correct.", "Zone is correct.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
              t("Zone is not correct yet.", "Zone is nog niet correct.")
        );
        return;
      }

      case "mark_path": {
        if (step.validation.mode === "exact_path") {
          const success = arraysEqualOrdered(markedPath, step.validation.path ?? []);
          setFeedbackType(success ? "correct" : "incorrect");
          setFeedbackMessage(
            success
              ? readLocalizedText(step.feedback?.correct, language) || t("Path is correct.", "Pad is correct.")
              : readLocalizedText(step.feedback?.incorrect, language) ||
                t("Path is not correct yet.", "Pad is nog niet correct.")
          );
          return;
        }

        const success =
          markedPath.length > 0 &&
          markedPath[0] === step.validation.targetSquare;

        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Target reached.", "Doel bereikt.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
              t("Not the correct target yet.", "Nog niet het juiste doel.")
        );
        return;
      }

      case "goal": {
        const human: PreviewSide =
          step.initialState.sideToMove === "black" ? "B" : "W";
        const success = evaluateGoalBoardPreview(
          step.validation,
          human,
          initialBoard,
          recorder.state.board,
          recorder.state.moves
        );
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Goal reached.", "Doel bereikt.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
                t("Goal not satisfied yet.", "Het doel is nog niet bereikt.")
        );
        return;
      }

      case "count": {
        const numericAnswer = Number(countAnswer);
        const success = Number.isFinite(numericAnswer) && numericAnswer === step.validation.expected;
        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Correct count.", "Correct aantal.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
              t("That count is not correct yet.", "Dat aantal is nog niet correct.")
        );
        return;
      }

      case "multiple_choice": {
        const correctIds = (step.validation.options ?? [])
          .filter((option) => option.isCorrect)
          .map((option) => option.id)
          .sort();

        const selectedIds = [...chosenOptionIds].sort();
        const success =
          correctIds.length === selectedIds.length &&
          correctIds.every((id, index) => id === selectedIds[index]);

        setFeedbackType(success ? "correct" : "incorrect");
        setFeedbackMessage(
          success
            ? readLocalizedText(step.feedback?.correct, language) || t("Correct choice.", "Correcte keuze.")
            : readLocalizedText(step.feedback?.incorrect, language) ||
              t("That is not the correct choice yet.", "Dat is nog niet de juiste keuze.")
        );
        return;
      }

      default:
        setFeedbackType("idle");
        setFeedbackMessage("");
    }
  };

  const resetInteraction = () => {
    cancelReplayAnim();
    previewAutoCorrectActiveRef.current = false;
    setSelectedSquares([]);
    setSelectedPieces([]);
    setMarkedPath([]);
    setChosenOptionIds([]);
    setAuthoringMultipleChoiceSelectedIds([]);
    const resetBoard = cloneBoard(placePiecesBaseBoard);
    setAuthoringPlacePiecesBoard(resetBoard);
    authoringPlacePiecesWorkBoardRef.current = cloneBoard(resetBoard);
    setAuthoringPlacePiecesBrush("wm");
    setCountAnswer("");
    setFeedbackMessage("");
    setFeedbackType("idle");
    setAskMoveFeedbackHighlights([]);
    setAskMoveCoachCaption("");
    setAuthoringPickSquares([]);
    setAuthoringCountDraft("");
    setIsPlaying(false);
    setPositionIndex(0);
    setInputScrubPly(0);
    prevRecordedMovesLenRef.current = 0;
    authoringInteractiveFailCountRef.current = 0;
    askSequenceOrderedIndexRef.current = 0;
    askSequencePoolRef.current = null;

    if (
      authoringInteractiveMoment?.type === "askSequence" &&
      authoringInteractiveMoment.interaction?.kind === "askSequence"
    ) {
      const total = authoringInteractiveMoment.interaction.expectedSequence?.length ?? 0;
      setAskSequenceProgress(total > 0 ? { completed: 0, total } : null);
    } else {
      setAskSequenceProgress(null);
    }

    if (authoringInteractiveRecorder || authoringInteractiveAuthoringExtra) {
      setAuthoringAttemptsPill({
        failed: 0,
        max: authoringInteractiveMaxAttempts,
      });
    } else {
      setAuthoringAttemptsPill(null);
    }

    recorder.resetToStartPosition(initialBoard);
    if (boardClickUsesRecorder) {
      recorder.startRecording(initialBoard);
    }
  };

  const moveRuntimeHint =
    step.validation.type === "move"
      ? t("Play the correct move on the board.", "Speel de correcte zet op het bord.")
      : step.validation.type === "sequence"
      ? t("Play the full sequence on the board.", "Speel de volledige reeks op het bord.")
      : step.validation.type === "goal"
      ? step.validation.goalType === "reach_square"
        ? t(
            "Play on the board until one of your pieces occupies the marked target square.",
            "Speel op het bord tot een van je stukken op het gemarkeerde doelveld staat."
          )
        : step.validation.goalType === "no_legal_moves"
        ? t(
            "Play until your opponent is to move but has no legal move.",
            "Speel tot je tegenstander aan zet is maar geen enkele legale zet heeft."
          )
        : step.validation.goalType === "force_capture"
        ? t(
            "Play until your opponent is to move in a forced-capture position.",
            "Speel tot je tegenstander aan zet is en verplicht moet slaan."
          )
        : step.validation.goalType === "promote_in_one"
        ? t("Play a single move that promotes one of your men.", "Speel één zet waarmee je een dam promoveert.")
        : step.validation.goalType === "win_material"
        ? t(
            "Play until you have more material (men + kings) than your opponent.",
            "Speel tot je meer materiaal (schijven + dames) hebt dan je tegenstander."
          )
        : t("Play on the board to satisfy the goal.", "Speel op het bord om het doel te halen.")
      : "";

  return (
    <section style={wrapStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>{t("Preview", "Voorbeeld")}</div>
          <h2 style={titleStyle}>
            {readLocalizedText(step.title, language) || step.type}
          </h2>
          <div style={sideToMoveMetaStyle}>
            {t("Side to move", "Aan zet")}: {step.initialState.sideToMove}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              if (placePiecesNavigationLocked) return;
              onPreviousStep?.();
            }}
            style={replayNavButtonStyle}
            disabled={placePiecesNavigationLocked || !hasPreviousStep}
          >
            {t("Previous", "Vorige")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (placePiecesNavigationLocked) return;
              onNextStep?.();
            }}
            style={replayNavButtonStyle}
            disabled={placePiecesNavigationLocked || !hasNextStep}
          >
            {t("Next", "Volgende")}
          </button>
          {legacyInteractiveMoveStep && canReplay ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (placePiecesNavigationLocked) return;
                  setIsPlaying(false);
                  setInteractivePreviewMode("input");
                }}
                style={
                  interactivePreviewMode === "input"
                    ? replayNavButtonActiveStyle
                    : replayNavButtonStyle
                }
              >
                {t("Input", "Invoer")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (placePiecesNavigationLocked) return;
                  setIsPlaying(false);
                  setPositionIndex(0);
                  setInteractivePreviewMode("replay");
                }}
                style={
                  interactivePreviewMode === "replay"
                    ? replayNavButtonActiveStyle
                    : replayNavButtonStyle
                }
              >
                {t("Replay", "Herhalen")}
              </button>
            </>
          ) : null}
          <div style={statusPillStyle}>
            {authoringInteractiveAuthoringExtra
              ? authoringInteractiveMoment?.type === "askCount"
                ? t("askCount (moment)", "askCount (moment)")
                : authoringInteractiveMoment?.type === "multipleChoice"
                  ? t("multipleChoice (moment)", "multipleChoice (moment)")
                  : authoringInteractiveMoment?.type === "placePieces"
                    ? t("placePieces (moment)", "placePieces (moment)")
                    : authoringInteractiveMoment?.type === "askSelectPieces"
                      ? t("askSelectPieces (moment)", "askSelectPieces (moment)")
                      : t("askSelectSquares (moment)", "askSelectSquares (moment)")
              : boardClickUsesRecorder && interactivePreviewMode === "input"
                ? authoringInteractiveAsk
                  ? authoringInteractiveMoment?.type === "askSequence"
                    ? t("Play sequence (moment)", "Speel volgorde (moment)")
                    : t("Try move (moment)", "Probeer zet (moment)")
                  : t("Player input", "Spelerinvoer")
                : legacyInteractiveMoveStep && interactivePreviewMode === "replay"
                  ? `Replay ${positionIndex}/${maxIndex}`
                  : canReplay
                    ? `Move ${positionIndex}/${maxIndex}`
                    : t("No autoplay", "Geen autoplay")}
          </div>
        </div>
      </div>

      <div style={contentLayoutStyle}>
        <div style={boardColumnStyle}>
          {authoringPreview ? (
            <AuthoringRuntimePreviewStrip preview={authoringPreview} language={language} />
          ) : null}
          <div style={boardShellStyle}>
            <div style={boardInnerStyle}>
              <BoardEditor
                board={boardForEditor}
                currentBrush={authoringPlacePiecesActive ? authoringPlacePiecesBrush : "wm"}
                onPaintSquare={handleBoardClick}
                selectedSquare={
                  boardClickUsesRecorder && interactivePreviewMode === "input"
                    ? inputScrubbing
                      ? null
                      : recorder.state.selectedFrom
                    : null
                }
                legalTargets={
                  boardClickUsesRecorder && interactivePreviewMode === "input"
                    ? opponentInputBlocked || inputScrubbing
                      ? []
                      : recorder.legalTargets
                    : []
                }
                flipped={autoFlipBoard}
              />

              {replayMotionOverlay &&
              replayMotionOverlay.captureGhosts.length > 0 &&
              replayMotionOverlay.captureOpacity > 0
                ? replayMotionOverlay.captureGhosts.map((cg) => {
                    const c = squareToBoardPercentCenter(cg.square, autoFlipBoard);
                    const vis = pieceVisualForReplay(cg.piece);
                    return (
                      <div
                        key={`cap-ghost-${cg.square}`}
                        style={{
                          position: "absolute",
                          left: `${c.leftPct}%`,
                          top: `${c.topPct}%`,
                          transform: "translate(-50%, -50%)",
                          width: "10.5%",
                          height: "10.5%",
                          borderRadius: "50%",
                          background: vis.background,
                          border: vis.border,
                          opacity: replayMotionOverlay.captureOpacity,
                          pointerEvents: "none",
                          zIndex: 6,
                          boxShadow:
                            "inset 0 2px 4px rgba(255,255,255,0.35), 0 3px 6px rgba(0,0,0,0.25)",
                          transition: "opacity 40ms linear",
                        }}
                      />
                    );
                  })
                : null}

              {replayMotionOverlay?.ghostPos ? (
                (() => {
                  const vis = pieceVisualForReplay(replayMotionOverlay.movingPiece);
                  const g = replayMotionOverlay.ghostPos;
                  return (
                    <div
                      style={{
                        position: "absolute",
                        left: `${g.leftPct}%`,
                        top: `${g.topPct}%`,
                        transform: "translate(-50%, -50%)",
                        width: "12%",
                        height: "12%",
                        borderRadius: "50%",
                        background: vis.background,
                        border: vis.border,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.95rem",
                        fontWeight: 800,
                        color: vis.labelColor,
                        pointerEvents: "none",
                        zIndex: 7,
                        boxShadow:
                          "inset 0 2px 4px rgba(255,255,255,0.35), 0 4px 10px rgba(0,0,0,0.35)",
                      }}
                    >
                      {vis.label}
                    </div>
                  );
                })()
              ) : null}

              {opponentPlayMotionOverlay ? (
                <NotationMoveAnimationOverlay
                  flipped={autoFlipBoard}
                  ghostPos={opponentPlayMotionOverlay.ghostPos}
                  movingPiece={opponentPlayMotionOverlay.movingPiece}
                  captureGhosts={opponentPlayMotionOverlay.captureGhosts}
                  captureOpacity={opponentPlayMotionOverlay.captureOpacity}
                />
              ) : null}

              <BoardOverlayLayer
                boardSize={boardSize}
                highlights={allHighlights}
                arrows={[...presentationArrowsForOverlay, ...sourcePlyArrows]}
                routes={overlayRoutes}
                squareGlyphs={authoringPreview?.squareGlyphs ?? []}
              />
            </div>
          </div>

          <div style={replayNavStyle}>
            <button
              type="button"
              onClick={() => {
                if (placePiecesNavigationLocked) return;
                setIsPlaying(false);
                if (inputScrubNav) {
                  setInputScrubPly(0);
                  return;
                }
                setPositionIndex(0);
              }}
              style={replayNavButtonStyle}
              disabled={
                placePiecesNavigationLocked ||
                (inputScrubNav ? inputScrubPly <= 0 : !timelineReplayNav || atStart)
              }
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => {
                if (placePiecesNavigationLocked) return;
                setIsPlaying(false);
                if (inputScrubNav) {
                  setInputScrubPly((p) => Math.max(0, p - 1));
                  return;
                }
                setPositionIndex((prev) => Math.max(0, prev - 1));
              }}
              style={replayNavButtonStyle}
              disabled={
                placePiecesNavigationLocked ||
                (inputScrubNav ? inputScrubPly <= 0 : !timelineReplayNav || atStart)
              }
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => {
                if (placePiecesNavigationLocked) return;
                if (!timelineReplayNav) return;
                setIsPlaying((prev) => !prev);
              }}
              style={isPlaying ? replayNavButtonActiveStyle : replayNavButtonStyle}
              disabled={placePiecesNavigationLocked || inputScrubNav || !timelineReplayNav}
            >
              {isPlaying ? "⏸" : "⏯"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (placePiecesNavigationLocked) return;
                setIsPlaying(false);
                if (inputScrubNav) {
                  setInputScrubPly((p) => Math.min(recordedLen, p + 1));
                  return;
                }
                if (!timelineReplayNav || atEnd) return;
                const idx = positionIndex;
                window.setTimeout(() => beginReplayTransition(idx), 0);
              }}
              style={replayNavButtonStyle}
              disabled={
                placePiecesNavigationLocked ||
                (inputScrubNav ? inputScrubPly >= recordedLen : !timelineReplayNav || atEnd)
              }
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => {
                if (placePiecesNavigationLocked) return;
                setIsPlaying(false);
                if (inputScrubNav) {
                  setInputScrubPly(recordedLen);
                  return;
                }
                setPositionIndex(maxIndex);
              }}
              style={replayNavButtonStyle}
              disabled={
                placePiecesNavigationLocked ||
                (inputScrubNav ? inputScrubPly >= recordedLen : !timelineReplayNav || atEnd)
              }
            >
              ⏭
            </button>
          </div>
          {inputScrubNav ? (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#64748b",
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              {t(
                "⏮ ◀ ▶ ⏭ browse plies you played; tap the board to return to the live end.",
                "⏮ ◀ ▶ ⏭ blader door je zetten; tik op het bord om naar het live einde te gaan."
              )}
            </div>
          ) : null}
        </div>

        <aside style={sidePanelStyle}>
          <div style={cardStyle}>
            <div style={interactionTitleStyle}>{t("Step info", "Stapinfo")}</div>
            <div style={sideTextStyle}>
              {readLocalizedText(step.prompt, language) || "—"}
            </div>
            {readLocalizedText(step.hint, language) ? (
              <div style={sideSubtleTextStyle}>
                {t("Hint", "Hint")}: {readLocalizedText(step.hint, language)}
              </div>
            ) : null}
            {readLocalizedText(step.explanation, language) ? (
              <div style={sideSubtleTextStyle}>
                {t("Explanation", "Uitleg")}: {readLocalizedText(step.explanation, language)}
              </div>
            ) : null}
            {canReplay && replayMoveSecondsPerStep > 0 ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  lineHeight: 1.45,
                }}
              >
                {legacyInteractiveMoveStep && !showReplayBoard
                  ? t(
                      "Animated moves (you, Scan, forced plies): same speed as in Settings. Replay: tap “Replay”, then ▶ or ⏯. Under the board: ⏮ ◀ ▶ ⏭ while solving.",
                      "Geanimeerde zetten (jij, Scan, gedwongen zetten): zelfde snelheid als onder Instellingen. Replay: tik “Herhalen”, daarna ▶ of ⏯. Onder het bord: ⏮ ◀ ▶ ⏭ tijdens oplossen."
                    )
                  : t(
                      "Move animation is on: use ▶ or play (⏯) to advance one ply.",
                      "Zet-animatie staat aan: gebruik ▶ of afspelen (⏯) voor de volgende zet."
                    )}
              </div>
            ) : null}
          </div>

          <div style={cardStyle}>
            <div style={interactionTitleStyle}>{t("Progress", "Voortgang")}</div>
            {boardClickUsesRecorder ? (
              <div style={runtimeHintStyle}>
                {authoringInteractiveAsk
                  ? authoringInteractiveMoment?.type === "askSequence"
                    ? t(
                        "Play each ply on the board. Evaluation follows only the selected askSequence moment.",
                        "Speel elke zet op het bord. Evaluatie volgt alleen het geselecteerde askSequence-moment."
                      )
                    : t(
                        "Play on the board. Evaluation uses only the selected askMove moment.",
                        "Speel op het bord. Evaluatie gebruikt alleen het geselecteerde askMove-moment."
                      )
                  : moveRuntimeHint}
              </div>
            ) : authoringInteractiveSelect ? (
              <div style={runtimeHintStyle}>
                {authoringInteractiveMoment?.type === "askSelectPieces"
                  ? t(
                      "Tap occupied squares to toggle selection, then Check.",
                      "Tik op bezette velden om te wisselen, daarna Controleer."
                    )
                  : t(
                      "Tap squares to toggle selection, then Check.",
                      "Tik op velden om te wisselen, daarna Controleer."
                    )}
              </div>
            ) : authoringInteractiveMoment?.type === "askCount" ? (
              <div style={runtimeHintStyle}>
                {t(
                  "Enter your answer and tap Check.",
                  "Voer je antwoord in en tik op Controleer."
                )}
              </div>
            ) : authoringInteractiveMoment?.type === "multipleChoice" ? (
              <div style={runtimeHintStyle}>
                {authoringInteractiveMoment.interaction?.kind === "multipleChoice" &&
                authoringInteractiveMoment.interaction.allowMultiple
                  ? t(
                      "Select all correct answers, then tap Check.",
                      "Kies alle juiste antwoorden en tik op Controleer."
                    )
                  : t(
                      "Select one answer, then tap Check.",
                      "Kies één antwoord en tik op Controleer."
                    )}
              </div>
            ) : authoringInteractiveMoment?.type === "placePieces" ? (
              <div style={runtimeHintStyle}>
                {t(
                  "Choose a piece in the bank, tap squares to place or toggle, then Check.",
                  "Kies een stuk in de bank, tik op velden om te plaatsen of te wisselen, daarna Controleer."
                )}
              </div>
            ) : null}
            <div style={metaRowStyle}>
              <InfoPill
                label={t("Position", "Positie")}
                value={
                  boardClickUsesRecorder
                    ? `${recordedMoves.length} ${t("move(s)", "zet(ten)")}`
                    : authoringInteractiveMoment?.type === "multipleChoice"
                      ? `${authoringMultipleChoiceSelectedIds.length} ${t("selected", "geselecteerd")}`
                      : authoringInteractiveMoment?.type === "placePieces"
                        ? `${Object.values(authoringPlacePiecesBoard.squares).filter((p) => p !== "empty").length} ${t(
                            "pieces",
                            "stukken"
                          )}`
                        : authoringInteractiveSelect
                          ? `${authoringPickSquares.length} ${t("selected", "geselecteerd")}`
                          : `${positionIndex}/${maxIndex}`
                }
              />
              <InfoPill
                label={t("Last move", "Laatste zet")}
                value={
                  boardClickUsesRecorder
                    ? recordedMoves[recordedMoves.length - 1] || "—"
                    : authoringInteractiveAuthoringExtra
                      ? "—"
                      : currentMoveLabel || "—"
                }
              />
              {askSequenceProgress ? (
                <InfoPill
                  label={t("Sequence", "Volgorde")}
                  value={`${askSequenceProgress.completed}/${askSequenceProgress.total}`}
                />
              ) : null}
              {authoringInteractiveMoment?.type === "multipleChoice" ? (
                <InfoPill
                  label={t("Type", "Type")}
                  value={t("Multiple choice", "Meerkeuze")}
                />
              ) : null}
              {authoringInteractiveMoment?.type === "placePieces" ? (
                <InfoPill
                  label={t("Type", "Type")}
                  value={t("Place pieces", "Stukken plaatsen")}
                />
              ) : null}
              {(authoringInteractiveRecorder || authoringInteractiveAuthoringExtra) &&
              authoringAttemptsPill ? (
                <InfoPill
                  label={t("Attempts (fails)", "Pogingen (fouten)")}
                  value={`${authoringAttemptsPill.failed}/${authoringAttemptsPill.max}`}
                />
              ) : null}
            </div>
          </div>

          {authoringInteractivePromptMoment && authoringInteractiveMoment ? (
            <div style={cardStyle}>
              <div style={interactionTitleStyle}>{t("Moment prompt", "Momentprompt")}</div>
              <div style={sideTextStyle}>
                {readLocalizedText(
                  authoringInteractiveMoment.interaction?.kind === "askMove" ||
                    authoringInteractiveMoment.interaction?.kind === "askSequence" ||
                    authoringInteractiveMoment.interaction?.kind === "askCount" ||
                    authoringInteractiveMoment.interaction?.kind === "askSelectSquares" ||
                    authoringInteractiveMoment.interaction?.kind === "askSelectPieces" ||
                    authoringInteractiveMoment.interaction?.kind === "multipleChoice" ||
                    authoringInteractiveMoment.interaction?.kind === "placePieces"
                    ? authoringInteractiveMoment.interaction.prompt
                    : undefined,
                  language
                ) ||
                  readLocalizedText(authoringInteractiveMoment.body, language) ||
                  (authoringInteractiveRecorder
                    ? t("Your turn.", "Jij bent aan zet.")
                    : t("Follow the moment instructions.", "Volg de instructies van het moment."))}
              </div>
            </div>
          ) : null}

          {authoringPlacePiecesActive ? (
            <div style={cardStyle}>
              <div style={interactionTitleStyle}>{t("Piece bank", "Stukkenbank")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {(
                  [
                    { code: "wm" as const, lab: "wm" },
                    { code: "wk" as const, lab: "wk ★" },
                    { code: "bm" as const, lab: "bm" },
                    { code: "bk" as const, lab: "bk ★" },
                    { code: "empty" as const, lab: t("Erase", "Wissen") },
                  ] as const
                ).map(({ code, lab }) => {
                  const sel = authoringPlacePiecesBrush === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setAuthoringPlacePiecesBrush(code)}
                      style={{
                        ...replayNavButtonStyle,
                        border: sel ? "2px solid #059669" : "1px solid #cbd5e1",
                        background: sel ? "#d1fae5" : "#fff",
                      }}
                    >
                      {lab}
                    </button>
                  );
                })}
                <button
                  type="button"
                  style={replayNavButtonStyle}
                  onClick={() => {
                    const empty = createEmptyBoardState();
                    setAuthoringPlacePiecesBoard(empty);
                    setAskMoveFeedbackHighlights([]);
                    setAskMoveCoachCaption("");
                  }}
                >
                  {t("Clear board", "Bord leegmaken")}
                </button>
                <button
                  type="button"
                  style={replayNavButtonStyle}
                  onClick={() => {
                    setAuthoringPlacePiecesBoard(cloneBoard(authoringPlacePiecesWorkBoardRef.current));
                    setAskMoveFeedbackHighlights([]);
                    setAskMoveCoachCaption("");
                  }}
                >
                  {t("Restore my board", "Herstel mijn bord")}
                </button>
                {authoringInteractiveMoment?.type === "placePieces" &&
                authoringInteractiveMoment.interaction?.kind === "placePieces" &&
                authoringInteractiveMoment.interaction.previewStartsEmpty ? (
                  <button
                    type="button"
                    style={replayNavButtonStyle}
                    onClick={() => {
                      setAuthoringPlacePiecesBoard(cloneBoard(placePiecesStartBoard));
                      setAskMoveFeedbackHighlights([]);
                      setAskMoveCoachCaption("");
                    }}
                  >
                    {t("Show start position", "Toon startpositie")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {authoringInteractiveMoment?.type === "askCount" &&
          authoringInteractiveMoment.interaction?.kind === "askCount" ? (
            <div style={cardStyle}>
              <div style={interactionTitleStyle}>{t("Your answer", "Jouw antwoord")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  style={replayNavButtonStyle}
                  onClick={() =>
                    setAuthoringCountDraft((v) =>
                      String(Math.max(0, (Number(v) || 0) - 1))
                    )
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  style={countInputStyle}
                  value={authoringCountDraft}
                  onChange={(e) => setAuthoringCountDraft(e.target.value)}
                  placeholder={t("Number", "Getal")}
                />
                <button
                  type="button"
                  style={replayNavButtonStyle}
                  onClick={() =>
                    setAuthoringCountDraft((v) => String((Number(v) || 0) + 1))
                  }
                >
                  +
                </button>
              </div>
            </div>
          ) : null}

          {authoringInteractiveMoment?.type === "multipleChoice" &&
          authoringInteractiveMoment.interaction?.kind === "multipleChoice" ? (
            <div style={interactionCardStyle}>
              <div style={interactionTitleStyle}>{t("Answers", "Antwoorden")}</div>
              <div style={mcAnswersMetaStyle}>
                {t("{{n}} of {{m}} selected", "{{n}} van {{m}} geselecteerd")
                  .replace("{{n}}", String(authoringMultipleChoiceSelectedIds.length))
                  .replace(
                    "{{m}}",
                    String(authoringInteractiveMoment.interaction.options?.length ?? 0)
                  )}
              </div>
              <div style={optionsGridStyle}>
                {(authoringInteractiveMoment.interaction.options ?? []).map((option) => {
                  const selected = authoringMultipleChoiceSelectedIds.includes(option.id);
                  const allowMulti =
                    authoringInteractiveMoment.interaction?.kind === "multipleChoice"
                      ? !!authoringInteractiveMoment.interaction.allowMultiple
                      : false;
                  const explain = readLocalizedText(option.explanation, language).trim();
                  return (
                    <div key={option.id} style={mcOptionRowStyle}>
                      <button
                        type="button"
                        onClick={() => {
                          if (allowMulti) {
                            setAuthoringMultipleChoiceSelectedIds((prev) =>
                              prev.includes(option.id)
                                ? prev.filter((id) => id !== option.id)
                                : [...prev, option.id]
                            );
                          } else {
                            setAuthoringMultipleChoiceSelectedIds([option.id]);
                          }
                        }}
                        style={{
                          ...optionButtonStyle,
                          border: selected ? "2px solid #2563eb" : "1px solid #dbe3ec",
                          background: selected ? "#eff6ff" : "#fff",
                        }}
                      >
                        {readLocalizedText(option.label, language) ||
                          t("Option", "Optie")}
                      </button>
                      {explain ? (
                        <div style={mcOptionExplainPreviewStyle}>
                          <span style={{ fontWeight: 700 }}>{t("Note", "Noot")}: </span>
                          {explain}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentSourceSnapshot ? (
            <div style={cardStyle}>
              <div style={interactionTitleStyle}>{t("Source annotation", "Bronannotatie")}</div>
              <div style={metaRowStyle}>
                <InfoPill label="Ply" value={`${currentSourceSnapshot.plyIndex}`} />
                <InfoPill label="Move" value={currentSourceSnapshot.notation || "—"} />
              </div>
              {currentSourceSnapshot.glyphs && currentSourceSnapshot.glyphs.length > 0 ? (
                <div style={glyphRowStyle}>
                  {currentSourceSnapshot.glyphs.map((glyph, index) => (
                    <span key={`${glyph}-${index}`} style={glyphBadgeStyle}>
                      {glyph}
                    </span>
                  ))}
                </div>
              ) : null}
              {sourcePreMoveComment ? (
                <div style={sourceCommentStyle}>{t("Before move", "Voor zet")}: {sourcePreMoveComment}</div>
              ) : null}
              {sourcePostMoveComment ? (
                <div style={sourceCommentStyle}>{t("After move", "Na zet")}: {sourcePostMoveComment}</div>
              ) : null}
            </div>
          ) : null}

          {step.validation.type === "multiple_choice" &&
          authoringInteractiveMoment?.type !== "multipleChoice" ? (
            <div style={interactionCardStyle}>
              <div style={interactionTitleStyle}>{t("Answers", "Antwoorden")}</div>
              <div style={optionsGridStyle}>
                {(step.validation.options ?? []).map((option, index) => {
                  const selected = chosenOptionIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        const v = step.validation;
                        if (v.type === "multiple_choice" && v.allowMultiple) {
                          setChosenOptionIds((prev) =>
                            prev.includes(option.id)
                              ? prev.filter((id) => id !== option.id)
                              : [...prev, option.id]
                          );
                        } else {
                          setChosenOptionIds([option.id]);
                        }
                      }}
                      style={{
                        ...optionButtonStyle,
                        border: selected ? "2px solid #2563eb" : "1px solid #dbe3ec",
                        background: selected ? "#eff6ff" : "#fff",
                      }}
                    >
                      {readLocalizedText(option.label, language) ||
                        `${t("Option", "Optie")} ${index + 1}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step.validation.type === "count" ? (
            <div style={interactionCardStyle}>
              <div style={interactionTitleStyle}>{t("Enter count", "Voer aantal in")}</div>
              <input
                type="number"
                value={countAnswer}
                onChange={(e) => setCountAnswer(e.target.value)}
                style={countInputStyle}
                placeholder={t("Enter a number", "Voer een getal in")}
              />
            </div>
          ) : null}

          <div style={actionRowStyle}>
            <button type="button" onClick={resetInteraction} style={controlButtonStyle}>
              {t("Reset", "Reset")}
            </button>
            {authoringInteractiveRecorder ? null : (
              <button type="button" onClick={checkAnswer} style={primaryControlButtonStyle}>
                {t("Check", "Controleer")}
              </button>
            )}
          </div>

          <div
            style={{
              ...feedbackBoxStyle,
              borderColor:
                feedbackType === "correct"
                  ? "#86efac"
                  : feedbackType === "illegal"
                  ? "#fdba74"
                  : feedbackType === "incorrect"
                  ? "#fca5a5"
                  : "#dbe3ec",
              background:
                feedbackType === "correct"
                  ? "#f0fdf4"
                  : feedbackType === "illegal"
                  ? "#fff7ed"
                  : feedbackType === "incorrect"
                  ? "#fef2f2"
                  : "#f8fafc",
            }}
          >
            {feedbackMessage ||
              t(
                "Use this area to feel how the step behaves for the player.",
                "Gebruik dit vlak om te voelen hoe de stap zich voor de speler gedraagt."
              )}
          </div>
          {askSequenceInteractionSpec &&
          authoringInteractiveAsk &&
          (feedbackType === "incorrect" || feedbackType === "illegal") ? (
            <div style={askSequenceStopExplainStyle}>
              {feedbackType === "illegal"
                ? t(
                    "Attempt stopped: the move is not legal here or is blocked by lesson constraints.",
                    "Poging gestopt: de zet is hier niet legaal of niet toegestaan volgens de lesregels."
                  )
                : t(
                    "Attempt stopped: that move does not match the next expected ply (or the remaining set when order is off).",
                    "Poging gestopt: die zet hoort niet bij de volgende verwachte zet (of bij de resterende set zonder vaste volgorde)."
                  )}
            </div>
          ) : null}
          {askSequenceInteractionSpec &&
          authoringInteractiveAsk &&
          (feedbackType === "incorrect" || feedbackType === "illegal") &&
          readLocalizedText(askSequenceInteractionSpec.sequenceHintMessage, language).trim() ? (
            <div style={askSequenceAuthorHintStyle}>
              <span style={{ fontWeight: 800 }}>{t("Hint", "Hint")}: </span>
              {readLocalizedText(askSequenceInteractionSpec.sequenceHintMessage, language)}
            </div>
          ) : null}
          {authoringInteractiveMoment?.type === "multipleChoice" &&
          authoringInteractiveMoment.interaction?.kind === "multipleChoice" &&
          readLocalizedText(authoringInteractiveMoment.interaction.hintMessage, language).trim() ? (
            <div style={askSequenceAuthorHintStyle}>
              <span style={{ fontWeight: 800 }}>{t("Hint", "Hint")}: </span>
              {readLocalizedText(authoringInteractiveMoment.interaction.hintMessage, language)}
            </div>
          ) : null}
          {authoringInteractiveMoment?.type === "placePieces" &&
          authoringInteractiveMoment.interaction?.kind === "placePieces" &&
          readLocalizedText(authoringInteractiveMoment.interaction.hintMessage, language).trim() ? (
            <div style={askSequenceAuthorHintStyle}>
              <span style={{ fontWeight: 800 }}>{t("Hint", "Hint")}: </span>
              {readLocalizedText(authoringInteractiveMoment.interaction.hintMessage, language)}
            </div>
          ) : null}
          {askMoveCoachCaption.trim() ? (
            <div style={askMoveCoachCaptionStyle}>{askMoveCoachCaption}</div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={infoPillStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  padding: 20,
  boxSizing: "border-box",
  display: "grid",
  gap: 18,
};

const emptyStyle: CSSProperties = {
  padding: 24,
  border: "1px dashed #cfd8e3",
  borderRadius: 16,
  background: "#fafcff",
  color: "#6b7280",
  fontSize: 15,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 4px 0",
  fontSize: 26,
  lineHeight: 1.1,
  color: "#111827",
};

const sideToMoveMetaStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
  textTransform: "capitalize",
};

const statusPillStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#f8fafc",
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  color: "#374151",
};

const contentLayoutStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 14,
};

const boardColumnStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const replayNavStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  gap: 6,
};

const replayNavButtonStyle: CSSProperties = {
  flex: "1 1 0",
  height: 32,
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  color: "#111827",
  fontSize: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const replayNavButtonActiveStyle: CSSProperties = {
  ...replayNavButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const runtimeHintStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
  padding: "2px 0",
};

const controlButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
};

const primaryControlButtonStyle: CSSProperties = {
  ...controlButtonStyle,
  background: "#2563eb",
  border: "1px solid #2563eb",
  color: "#fff",
};

const sidePanelStyle: CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  display: "grid",
  alignContent: "start",
  gap: 10,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#fcfdff",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 8,
};

const sideTextStyle: CSSProperties = {
  fontSize: 14,
  color: "#111827",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const sideSubtleTextStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const infoPillStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#f8fafc",
  borderRadius: 12,
  padding: "10px 12px",
  minWidth: 120,
};

const infoLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6b7280",
  marginBottom: 4,
};

const infoValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
};

const glyphRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const glyphBadgeStyle: CSSProperties = {
  border: "1px solid #c7d2fe",
  background: "#eef2ff",
  color: "#3730a3",
  borderRadius: 999,
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 800,
};

const sourceCommentStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.4,
  color: "#374151",
  whiteSpace: "pre-wrap",
};

const interactionCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#fcfdff",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 12,
};

const interactionTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const optionsGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const mcAnswersMetaStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
  marginBottom: 4,
};

const mcOptionRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

/** Bundel 13b: dev-light preview of per-option explanation (stored for future runtime). */
const mcOptionExplainPreviewStyle: CSSProperties = {
  fontSize: 11,
  fontStyle: "italic",
  color: "#64748b",
  lineHeight: 1.35,
  paddingLeft: 4,
};

const optionButtonStyle: CSSProperties = {
  textAlign: "left",
  borderRadius: 12,
  padding: "12px 14px",
  background: "#fff",
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
  cursor: "pointer",
};

const countInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  background: "#fff",
  color: "#111827",
};

const boardShellStyle: CSSProperties = {
  width: "100%",
  minHeight: "min(62vh, 700px)",
  border: "1px solid #dbe3ec",
  background: "#f9fbff",
  borderRadius: 18,
  padding: 12,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
};

const boardInnerStyle: CSSProperties = {
  position: "relative",
  width: "min(62vh, 52vw, 640px)",
  aspectRatio: "1 / 1",
  lineHeight: 0,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const feedbackBoxStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 14,
  padding: 14,
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const askSequenceStopExplainStyle: CSSProperties = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f1f5f9",
  fontSize: 12,
  fontWeight: 600,
  color: "#475569",
  lineHeight: 1.45,
};

const askSequenceAuthorHintStyle: CSSProperties = {
  marginTop: 6,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  fontSize: 12,
  fontWeight: 600,
  color: "#92400e",
  lineHeight: 1.45,
};

const askMoveCoachCaptionStyle: CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  color: "#475569",
  lineHeight: 1.45,
};