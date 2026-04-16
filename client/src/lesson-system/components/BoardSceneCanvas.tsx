import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import BoardEditor from "../../features/board/BoardEditor";
import {
  createEmptyBoardState,
  type BoardState,
  type PieceCode,
} from "../../features/board/boardTypes";
import {
  useSolutionRecorder,
  type RecordedMove,
} from "../../features/recorder/useSolutionRecorder";
import { useNodeEngineAnalysis } from "../../engine/scan/useNodeEngineAnalysis";
import BoardOverlayLayer from "./BoardOverlayLayer";
import PaintToolbar from "./editors/PaintToolbar";
import type { LessonStep } from "../types/stepTypes";
import {
  getPlayableSquareCountFromBoard,
  inferBoardSizeFromPlayableSquares,
} from "../utils/boardOverlayGeometry";
import type {
  ArrowSpec,
  HighlightSpec,
  RouteSpec,
  HighlightColor,
} from "../types/presentationTypes";
import type {
  MarkPathValidation,
  SelectPiecesValidation,
  SelectSquaresValidation,
  ZonePaintValidation,
} from "../types/validationTypes";
import {
  applyRecorderLineToStep,
  buildRecorderNodeTimelineSnapshots,
} from "../utils/stepRecorderApply";
import type { RecorderApplyTarget, RecorderSlotOverlay } from "../utils/stepRecorderApply";
import {
  getMaxCaptureCount,
  getSoleMaximalCaptureOpening,
} from "../source-editor/sourceBoardEngine";
import { resolveNotationToEngineMove } from "../utils/resolveNotationToEngineMove";
import { tryResolveAuthoringAskSequencePly } from "../utils/expectedMoveSpecNotation";
import {
  computeNotationAnimFrame,
  prepareNotationAnimFromEngineMove,
  prepareNotationAnimFromNotation,
  readStudioMoveAnimationSeconds,
  runNotationMoveAnimation,
  type NotationAnimMetadata,
} from "../utils/notationMoveAnimation";
import NotationMoveAnimationOverlay from "./NotationMoveAnimationOverlay";
import type { AuthoringPreviewResolved } from "../utils/resolveAuthoringPreviewState";
import type { ExpectedMoveSpec } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { MoveGlyph } from "../types/analysisTypes";
import type { RecorderMoveSemanticRole } from "../types/authoring/recorderAuthoringTypes";
import type { RecorderAuthoringAnnotationInput } from "../types/authoring/recorderAuthoringTypes";
import {
  computeFenBeforeEachRecordedMove,
  recordedLineToMoments,
} from "../utils/recordedLineToMoments";
import { createLocalizedText } from "../utils/i18nHelpers";

type Props = {
  step: LessonStep | null;
  variantId?: string;
  defaultScanDepth?: number;
  currentBrush: PieceCode | "eraser";
  onBrushChange: (tool: PieceCode | "eraser") => void;
  onStepChange: (nextStep: LessonStep) => void;
  /** Authoring moment preview (FEN + overlays); does not replace onStepChange persistence on the legacy step. */
  authoringPreview?: AuthoringPreviewResolved | null;
  /** When true, recorder panel can append converted moments into authoring v2 timeline. */
  authoringRecordingEnabled?: boolean;
  authoringRecordingLanguage?: LanguageCode;
  onAppendAuthoringMomentsFromRecording?: (moments: StepMoment[]) => void;
  /** When set, recorder can apply the current line as `expectedSequence` on the selected askSequence moment (step or branch). */
  onApplyRecordingToAskSequence?: (moves: RecordedMove[]) => void;
  /** Appends recorder line to existing askSequence expectedSequence (merge mode). */
  onAppendRecordingToAskSequence?: (moves: RecordedMove[]) => void;
  /** Apply line to selected placePieces and insert a showLine after it. */
  onApplyRecordingToPlacePiecesWithShowLine?: (moves: RecordedMove[]) => void;
  /** Append a new `askMove` moment from the first recorded ply (timeline end). */
  onAppendRecordingAsNewAskMove?: (moves: RecordedMove[]) => void;
  /** Append a new `askSequence` moment from the full recorded line. */
  onAppendRecordingAsNewAskSequence?: (moves: RecordedMove[]) => void;
  /** Bundel 12b: when true, square clicks toggle authoring target selection (before paint/record modes). */
  authoringBoardTargetPickMode?: boolean;
  /** Optional editor-only FEN override (e.g. inspect a selected askSequence ply). */
  authoringBoardFenOverride?: string | null;
  authoringStudioSquareSelection?: number[];
  /** When true, empty squares are ignored for target picking (askSelectPieces). */
  authoringTargetPickPiecesOnly?: boolean;
  onAuthoringTargetSquareToggle?: (square: number) => void;
  /**
   * When playtesting an `askSequence` on the main board, use this line to disambiguate
   * keuzeslagen instead of picking an arbitrary engine best move.
   */
  authoringAskSequenceHint?: { expectedSequence: ExpectedMoveSpec[] } | null;
};

const RECORDING_GLYPH_OPTIONS: MoveGlyph[] = ["!", "?", "!!", "??", "!?", "?!"];

const RECORDING_ROLE_OPTIONS: RecorderMoveSemanticRole[] = [
  "best",
  "candidate",
  "mistake",
  "blunder",
  "idea",
];

type RecorderAuthoringRowDraft = {
  glyph: MoveGlyph | "";
  pre: string;
  post: string;
  role: RecorderMoveSemanticRole | "";
};

const emptyRecorderAuthoringRow = (): RecorderAuthoringRowDraft => ({
  glyph: "",
  pre: "",
  post: "",
  role: "",
});

type SceneMode =
  | "paint"
  | "highlight"
  | "arrow"
  | "route"
  | "validation"
  | "record";

function supportsBoardValidationMode(stepType: LessonStep["type"]): boolean {
  return (
    stepType === "select_squares" ||
    stepType === "select_pieces" ||
    stepType === "zone_paint" ||
    stepType === "mark_path" ||
    stepType === "goal_challenge"
  );
}

const OVERLAY_COLORS: HighlightColor[] = [
  "primary",
  "success",
  "warning",
  "danger",
  "info",
];

function nextOverlayColorByCount(count: number): HighlightColor {
  if (count <= 0) return OVERLAY_COLORS[0];
  return OVERLAY_COLORS[count % OVERLAY_COLORS.length] ?? OVERLAY_COLORS[0];
}

function recorderSlotSummary(slot: RecorderSlotOverlay): string {
  const hlSq = slot.highlights.reduce((n, h) => n + (h.squares?.length ?? 0), 0);
  const ar = slot.arrows.filter((a) => a.from != null && a.to != null).length;
  const bits: string[] = [];
  if (hlSq > 0) bits.push(`${hlSq} ▢`);
  if (ar > 0) bits.push(`${ar} →`);
  return bits.length > 0 ? bits.join(" · ") : "—";
}

function parseRecorderSquares(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
}

const INTERNATIONAL_START_FEN =
  "W:W31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20";

export default function BoardSceneCanvas({
  step,
  variantId = "international",
  defaultScanDepth = 8,
  currentBrush,
  onBrushChange,
  onStepChange,
  authoringPreview = null,
  authoringRecordingEnabled = false,
  authoringRecordingLanguage = "en",
  onAppendAuthoringMomentsFromRecording,
  onApplyRecordingToAskSequence,
  onAppendRecordingToAskSequence,
  onApplyRecordingToPlacePiecesWithShowLine,
  onAppendRecordingAsNewAskMove,
  onAppendRecordingAsNewAskSequence,
  authoringBoardTargetPickMode = false,
  authoringBoardFenOverride = null,
  authoringStudioSquareSelection = [],
  authoringTargetPickPiecesOnly = false,
  onAuthoringTargetSquareToggle,
  authoringAskSequenceHint = null,
}: Props) {
  const [sceneMode, setSceneMode] = useState<SceneMode>("paint");
  type RecordOverlayTool = "moves" | "highlight" | "arrow";
  const [recordOverlayTool, setRecordOverlayTool] = useState<RecordOverlayTool>("moves");
  const [recordSlotOverlays, setRecordSlotOverlays] = useState<RecorderSlotOverlay[]>([
    { highlights: [], arrows: [] },
  ]);
  const [recorderAuthoringRows, setRecorderAuthoringRows] = useState<
    RecorderAuthoringRowDraft[]
  >([]);
  /** When set, board shows FEN before this ply and highlight/arrow tools edit that slot. */
  const [recorderInspectPly, setRecorderInspectPly] = useState<number | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [activeArrowId, setActiveArrowId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [pendingArrowFrom, setPendingArrowFrom] = useState<number | null>(null);
  const [dragArrowFrom, setDragArrowFrom] = useState<number | null>(null);
  const [dragArrowTo, setDragArrowTo] = useState<number | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const suppressNextBoardClickRef = useRef(false);
  const recordForcedCaptureDedupeRef = useRef("");
  const recordActiveHighlightIdRef = useRef<string | null>(null);
  const recordActiveArrowIdRef = useRef<string | null>(null);
  const recordPendingArrowFromRef = useRef<number | null>(null);
  const recordForceNewArrowRef = useRef(false);
  const forceNewArrowOnNextPaintRef = useRef(false);
  const dragArrowIdRef = useRef<string | null>(null);

  const recordBaseFen = useMemo(() => {
    // In paint mode we must edit the actual step board; preview FEN is view-only context.
    if (sceneMode === "paint") {
      return (authoringBoardFenOverride ?? step?.initialState.fen ?? "").trim();
    }
    return (authoringBoardFenOverride ?? authoringPreview?.fen ?? step?.initialState.fen ?? "").trim();
  }, [authoringBoardFenOverride, authoringPreview?.fen, sceneMode, step?.initialState.fen]);

  const board = useMemo<BoardState>(() => {
    if (!recordBaseFen) {
      return createEmptyBoardState();
    }

    try {
      return fenToBoardState(recordBaseFen);
    } catch {
      return createEmptyBoardState();
    }
  }, [recordBaseFen]);

  const recorder = useSolutionRecorder(board);

  /** Recorder API is a new object each render; never list it in effect deps or resets wipe recording. */
  const recorderResetRef = useRef(recorder.resetToStartPosition);
  recorderResetRef.current = recorder.resetToStartPosition;

  useEffect(() => {
    const n = recorder.state.moves.length;
    setRecorderAuthoringRows((prev) => {
      if (prev.length === n) return prev;
      if (prev.length > n) return prev.slice(0, n);
      const next = [...prev];
      while (next.length < n) next.push(emptyRecorderAuthoringRow());
      return next;
    });
  }, [recorder.state.moves.length]);

  const activeBoard = useMemo<BoardState>(() => {
    return recorder.state.isRecording ? recorder.state.board : board;
  }, [board, recorder.state.board, recorder.state.isRecording]);

  const recordScanAnimRef = useRef<{ meta: NotationAnimMetadata; currentT: number } | null>(null);
  const recordScanAnimCancelRef = useRef<(() => void) | null>(null);
  const [recordScanAnimVersion, setRecordScanAnimVersion] = useState(0);

  const cancelRecordScanAnim = useCallback(() => {
    recordScanAnimCancelRef.current?.();
    recordScanAnimCancelRef.current = null;
    recordScanAnimRef.current = null;
    setRecordScanAnimVersion((n) => n + 1);
  }, []);

  useEffect(() => () => cancelRecordScanAnim(), [cancelRecordScanAnim]);

  const displayBoardForRecord = useMemo(() => {
    void recordScanAnimVersion;
    const a = recordScanAnimRef.current;
    if (!a || sceneMode !== "record") return activeBoard;
    return computeNotationAnimFrame(a.meta, a.currentT, isFlipped).displayBoard;
  }, [activeBoard, isFlipped, recordScanAnimVersion, sceneMode]);

  const recordScanMotionOverlay = useMemo(() => {
    void recordScanAnimVersion;
    const a = recordScanAnimRef.current;
    if (!a || sceneMode !== "record") return null;
    return computeNotationAnimFrame(a.meta, a.currentT, isFlipped);
  }, [isFlipped, recordScanAnimVersion, sceneMode]);

  const recorderMovesSig = recorder.state.moves.map((m) => m.notation).join("|");

  const recordInspectBoard = useMemo(() => {
    if (recorderInspectPly === null) return null;
    const startFen = boardStateToFen(recorder.state.startBoard);
    const fens = computeFenBeforeEachRecordedMove(startFen, recorder.state.moves);
    if (!fens || recorderInspectPly < 0 || recorderInspectPly >= fens.length) return null;
    try {
      return fenToBoardState(fens[recorderInspectPly]!);
    } catch {
      return null;
    }
  }, [recorderInspectPly, recorder.state.startBoard, recorderMovesSig]);

  const boardForEditor =
    sceneMode === "record"
      ? recordInspectBoard ?? displayBoardForRecord
      : activeBoard;
  const isRecordScanAnimating = recordScanMotionOverlay != null;

  const recordFen = useMemo(() => boardStateToFen(activeBoard), [activeBoard]);

  const recordEngine = useNodeEngineAnalysis({
    enabled: sceneMode === "record",
    variantId,
    fen: recordFen,
    depth: Math.max(1, Math.min(99, Math.floor(defaultScanDepth || 8))),
    multiPv: 1,
  });

  const boardSize = useMemo(() => {
    const playableCount = getPlayableSquareCountFromBoard(boardForEditor);
    return inferBoardSizeFromPlayableSquares(playableCount);
  }, [boardForEditor]);

  useEffect(() => {
    cancelRecordScanAnim();
    setPendingArrowFrom(null);
    setDragArrowFrom(null);
    setDragArrowTo(null);
    setIsFlipped(false);
    forceNewArrowOnNextPaintRef.current = false;
    dragArrowIdRef.current = null;
    recordForcedCaptureDedupeRef.current = "";
    setRecordSlotOverlays([{ highlights: [], arrows: [] }]);
    setRecordOverlayTool("moves");
    setRecorderInspectPly(null);
    recordActiveHighlightIdRef.current = null;
    recordActiveArrowIdRef.current = null;
    recordPendingArrowFromRef.current = null;
    recordForceNewArrowRef.current = false;
    // While recording, activeBoard follows the recorder — without this, changing steps
    // keeps the previous step's position so Scan / sole-capture still run on the old FEN.
    recorderResetRef.current(board);
  }, [step?.id, recordBaseFen, sceneMode, cancelRecordScanAnim]);

  useEffect(() => {
    if (recorderInspectPly !== null) cancelRecordScanAnim();
  }, [recorderInspectPly, cancelRecordScanAnim]);

  useEffect(() => {
    if (recorder.state.moves.length === 0) {
      setRecorderInspectPly(null);
      return;
    }
    if (
      recorderInspectPly !== null &&
      recorderInspectPly >= recorder.state.moves.length
    ) {
      setRecorderInspectPly(recorder.state.moves.length - 1);
    }
  }, [recorder.state.moves.length, recorderInspectPly]);

  useEffect(() => {
    recordActiveHighlightIdRef.current = null;
    recordActiveArrowIdRef.current = null;
    recordPendingArrowFromRef.current = null;
    recordForceNewArrowRef.current = false;
  }, [recorderInspectPly]);

  useEffect(() => {
    if (sceneMode !== "record") return;
    if (!recorder.state.isRecording) return;
    if (recorder.state.chainInProgress || recorder.state.selectedFrom !== null) return;
    if (recordScanAnimRef.current) return;
    const b = recorder.state.board;
    if (getMaxCaptureCount(b) <= 0) return;

    const sole = getSoleMaximalCaptureOpening(b);
    if (sole) {
      const key = `sole|${recorder.state.moves.length}|${recordFen}|${sole.from}-${sole.to}-${sole.captured}`;
      if (recordForcedCaptureDedupeRef.current === key) return;
      recordForcedCaptureDedupeRef.current = key;

      const sec = readStudioMoveAnimationSeconds();
      const peek = recorder.previewSoleForcedApply();
      const meta =
        peek && sec > 0 ? prepareNotationAnimFromNotation(b, peek.notation) : null;
      if (!meta || sec <= 0) {
        recorder.applySoleForcedMaximalCaptureIfUnambiguous();
        return;
      }

      cancelRecordScanAnim();
      recordScanAnimRef.current = { meta, currentT: 0 };
      setRecordScanAnimVersion((n) => n + 1);
      recordScanAnimCancelRef.current = runNotationMoveAnimation({
        meta,
        flipped: isFlipped,
        secondsPerMove: sec,
        onFrame: (_f, t) => {
          recordScanAnimRef.current = { meta, currentT: t };
          setRecordScanAnimVersion((n) => n + 1);
        },
        onComplete: () => {
          recordScanAnimCancelRef.current = null;
          recordScanAnimRef.current = null;
          setRecordScanAnimVersion((n) => n + 1);
          recorder.applySoleForcedMaximalCaptureIfUnambiguous();
        },
      });
      return;
    }

    if (
      !authoringBoardFenOverride &&
      authoringAskSequenceHint?.expectedSequence?.length
    ) {
      const spec =
        authoringAskSequenceHint.expectedSequence[recorder.state.moves.length];
      const auth = tryResolveAuthoringAskSequencePly(b, spec);
      if (auth) {
        const emAuth = resolveNotationToEngineMove(b, auth.notation);
        if (emAuth && emAuth.captures.length > 0) {
          const key = `authseq|${recorder.state.moves.length}|${recordFen}|${auth.notation}`;
          if (recordForcedCaptureDedupeRef.current === key) return;
          recordForcedCaptureDedupeRef.current = key;

          const sec = readStudioMoveAnimationSeconds();
          const meta =
            sec > 0 ? prepareNotationAnimFromEngineMove(b, emAuth) : null;
          if (!meta || sec <= 0) {
            recorder.appendExternalNotation(auth.notation);
            return;
          }

          cancelRecordScanAnim();
          recordScanAnimRef.current = { meta, currentT: 0 };
          setRecordScanAnimVersion((n) => n + 1);
          recordScanAnimCancelRef.current = runNotationMoveAnimation({
            meta,
            flipped: isFlipped,
            secondsPerMove: sec,
            onFrame: (_f, t) => {
              recordScanAnimRef.current = { meta, currentT: t };
              setRecordScanAnimVersion((n) => n + 1);
            },
            onComplete: () => {
              recordScanAnimCancelRef.current = null;
              recordScanAnimRef.current = null;
              setRecordScanAnimVersion((n) => n + 1);
              recorder.appendExternalNotation(auth.notation);
            },
          });
          return;
        }
      }
    }

    if (!recordEngine || recordEngine.status !== "ok") return;
    const bm = (recordEngine.bestMove ?? "").trim();
    if (!bm) return;
    const em = resolveNotationToEngineMove(b, bm);
    if (!em || em.captures.length === 0) return;
    const key = `scan|${recorder.state.moves.length}|${recordFen}|${bm}`;
    if (recordForcedCaptureDedupeRef.current === key) return;
    recordForcedCaptureDedupeRef.current = key;

    const meta = prepareNotationAnimFromEngineMove(b, em);
    const sec = readStudioMoveAnimationSeconds();
    if (!meta || sec <= 0) {
      recorder.appendExternalNotation(bm);
      return;
    }

    cancelRecordScanAnim();
    recordScanAnimRef.current = { meta, currentT: 0 };
    setRecordScanAnimVersion((n) => n + 1);
    recordScanAnimCancelRef.current = runNotationMoveAnimation({
      meta,
      flipped: isFlipped,
      secondsPerMove: sec,
      onFrame: (_f, t) => {
        recordScanAnimRef.current = { meta, currentT: t };
        setRecordScanAnimVersion((n) => n + 1);
      },
      onComplete: () => {
        recordScanAnimCancelRef.current = null;
        recordScanAnimRef.current = null;
        setRecordScanAnimVersion((n) => n + 1);
        recorder.appendExternalNotation(bm);
      },
    });
  }, [
    sceneMode,
    recorder.state.isRecording,
    recorder.state.board,
    recorder.state.moves.length,
    recorder.state.chainInProgress,
    recorder.state.selectedFrom,
    recordFen,
    recordEngine?.status,
    recordEngine?.bestMove,
    recorder.applySoleForcedMaximalCaptureIfUnambiguous,
    recorder.previewSoleForcedApply,
    recorder.appendExternalNotation,
    cancelRecordScanAnim,
    isFlipped,
    authoringBoardFenOverride,
    authoringAskSequenceHint,
  ]);

  useEffect(() => {
    if (sceneMode !== "record") return;
    const len = recorder.state.moves.length + 1;
    setRecordSlotOverlays((prev) => {
      const next = prev.slice(0, len);
      while (next.length < len) {
        next.push({ highlights: [], arrows: [] });
      }
      return next;
    });
  }, [sceneMode, recorder.state.moves.length]);

  useEffect(() => {
    if (!step) return;
    if (sceneMode !== "validation") return;
    if (supportsBoardValidationMode(step.type)) return;
    setSceneMode("paint");
  }, [sceneMode, step]);

  useEffect(() => {
    if (!step) return;

    if (
      sceneMode === "highlight" &&
      !activeHighlightId &&
      step.presentation?.highlights?.[0]?.id
    ) {
      setActiveHighlightId(step.presentation.highlights[0].id);
    }

    if (
      sceneMode === "arrow" &&
      !activeArrowId &&
      step.presentation?.arrows?.[0]?.id
    ) {
      setActiveArrowId(step.presentation.arrows[0].id);
    }

    if (
      sceneMode === "route" &&
      !activeRouteId &&
      step.presentation?.routes?.[0]?.id
    ) {
      setActiveRouteId(step.presentation.routes[0].id);
    }
  }, [sceneMode, step, activeHighlightId, activeArrowId, activeRouteId]);

  const recordEngineArrow = useMemo<ArrowSpec | null>(() => {
    if (sceneMode !== "record") return null;
    if (!recordEngine || recordEngine.status !== "ok") return null;
    const move = (recordEngine.bestMove ?? recordEngine.pv?.[0] ?? "").trim();
    if (!move) return null;
    const nums = move.match(/\d+/g);
    if (!nums || nums.length < 2) return null;
    const from = Number(nums[0]);
    const to = Number(nums[1]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    if (from < 1 || from > 50 || to < 1 || to > 50) return null;
    return {
      id: "record-scan-bestmove",
      from,
      to,
      color: "primary",
    };
  }, [sceneMode, recordEngine]);

  if (!step) {
    return (
      <section style={emptyWrapStyle}>
        Select a step first to edit the board and scene.
      </section>
    );
  }

  const safeHighlights = step.presentation?.highlights ?? [];
  const safeArrows = step.presentation?.arrows ?? [];
  const safeRoutes = step.presentation?.routes ?? [];

  const useAuthoringMomentOverlays =
    authoringPreview != null && !authoringPreview.preferStubPresentationForOverlays;

  const displayHighlights = useAuthoringMomentOverlays
    ? authoringPreview.highlights
    : safeHighlights;
  const displayArrows = useAuthoringMomentOverlays
    ? authoringPreview.arrows
    : safeArrows;
  const displayRoutes = useAuthoringMomentOverlays
    ? authoringPreview.routes
    : safeRoutes;

  const effectiveRecordSlot =
    recorderInspectPly !== null ? recorderInspectPly : recorder.state.moves.length;
  const selectedRecorderPly =
    recorderInspectPly !== null
      ? recorderInspectPly
      : recorder.state.moves.length > 0
      ? recorder.state.moves.length - 1
      : null;
  const selectedRecorderRow =
    selectedRecorderPly !== null
      ? recorderAuthoringRows[selectedRecorderPly] ?? emptyRecorderAuthoringRow()
      : null;
  const selectedRecorderSlot =
    selectedRecorderPly !== null
      ? recordSlotOverlays[selectedRecorderPly] ?? { highlights: [], arrows: [] }
      : null;
  const recordMergedHighlights =
    sceneMode === "record" && recorder.state.isRecording
      ? (recordSlotOverlays[effectiveRecordSlot]?.highlights ?? [])
      : [];
  const recordMergedArrows =
    sceneMode === "record" && recorder.state.isRecording
      ? (recordSlotOverlays[effectiveRecordSlot]?.arrows ?? [])
      : [];

  const authoringStudioPickHighlight: HighlightSpec[] =
    authoringBoardTargetPickMode && authoringStudioSquareSelection.length > 0
      ? [
          {
            id: "authoring-studio-target-pick",
            squares: [...authoringStudioSquareSelection],
            color: "success",
            pulse: true,
            fill: false,
            outline: true,
          },
        ]
      : [];

  const writeBoardToStep = (nextBoard: BoardState) => {
    onStepChange({
      ...step,
      initialState: {
        fen: boardStateToFen(nextBoard),
        sideToMove: nextBoard.sideToMove === "W" ? "white" : "black",
      },
    });
  };

  const updatePresentation = (patch: Partial<LessonStep["presentation"]>) => {
    onStepChange({
      ...step,
      presentation: {
        ...step.presentation,
        ...patch,
      },
    });
  };

  const handleSquareClick = (
    square: number,
    options?: { dragPaint?: boolean; erase?: boolean }
  ) => {
    if (suppressNextBoardClickRef.current) {
      suppressNextBoardClickRef.current = false;
      return;
    }

    if (authoringBoardTargetPickMode && onAuthoringTargetSquareToggle) {
      if (authoringTargetPickPiecesOnly && board.squares[square] === "empty") {
        return;
      }
      onAuthoringTargetSquareToggle(square);
      return;
    }

    if (sceneMode === "record") {
      if (!recorder.state.isRecording) {
        recorder.beginRecordingAtBoardWithSquare(board, square);
        return;
      }
      if (recorderInspectPly !== null && recordOverlayTool === "moves") {
        setRecorderInspectPly(null);
        return;
      }
      if (recordOverlayTool !== "moves") {
        if (recordOverlayTool === "highlight") {
          handleRecordHighlightSquare(square);
        } else {
          handleRecordArrowSquare(square);
        }
        return;
      }
      recorder.handleClickSquare(square);
      return;
    }

    switch (sceneMode) {
      case "paint":
        handlePaintSquare(square, options);
        return;
      case "highlight":
        handleHighlightSquare(square);
        return;
      case "arrow":
        handleArrowSquare(square);
        return;
      case "route":
        handleRouteSquare(square);
        return;
      case "validation":
        handleValidationSquare(square);
        return;
    }
  };

  const handlePaintSquare = (
    square: number,
    options?: { dragPaint?: boolean; erase?: boolean }
  ) => {
    const currentPieceOnSquare = board.squares[square];

    if (options?.erase) {
      if (currentPieceOnSquare === "empty") return;
      const nextBoard: BoardState = {
        ...board,
        squares: {
          ...board.squares,
          [square]: "empty",
        },
      };
      writeBoardToStep(nextBoard);
      return;
    }

    const nextPiece = currentBrush === "eraser" || currentBrush === "empty" ? "empty" : currentBrush;

    const nextBoard: BoardState = {
      ...board,
      squares: {
        ...board.squares,
        [square]: nextPiece,
      },
    };

    writeBoardToStep(nextBoard);
  };

  const setSideToMove = (side: "white" | "black") => {
    const nextBoard: BoardState = {
      ...board,
      sideToMove: side === "white" ? "W" : "B",
    };

    writeBoardToStep(nextBoard);
  };

  const loadStartPosition = () => {
    try {
      const startBoard = fenToBoardState(INTERNATIONAL_START_FEN);
      writeBoardToStep(startBoard);
    } catch {
      // no-op
    }
  };

  const clearBoard = () => {
    writeBoardToStep(createEmptyBoardState());
  };

  const ensureActiveHighlightInList = (
    highlights: HighlightSpec[],
    currentActiveId: string | null
  ): {
    list: HighlightSpec[];
    active: HighlightSpec;
    activeId: string;
  } => {
    const existing =
      highlights.find((h) => h.id === currentActiveId) ?? highlights[0];

    if (existing) {
      return {
        list: highlights,
        active: existing,
        activeId: existing.id,
      };
    }

    const created: HighlightSpec = {
      id: crypto.randomUUID(),
      squares: [],
      color: "primary",
      pulse: false,
      fill: true,
      outline: true,
    };

    return {
      list: [...highlights, created],
      active: created,
      activeId: created.id,
    };
  };

  const ensureActiveArrowInList = (
    arrows: ArrowSpec[],
    currentActiveId: string | null
  ): {
    list: ArrowSpec[];
    active: ArrowSpec;
    activeId: string;
  } => {
    if (currentActiveId) {
      const existing = arrows.find((a) => a.id === currentActiveId);
      if (existing) {
        return {
          list: arrows,
          active: existing,
          activeId: existing.id,
        };
      }
    }

    // No active arrow selected: start a brand new arrow.
    const created: ArrowSpec = {
      id: crypto.randomUUID(),
      from: null,
      to: null,
      color: nextOverlayColorByCount(arrows.length),
      curved: false,
      dashed: false,
      label: "",
    };

    return {
      list: [...arrows, created],
      active: created,
      activeId: created.id,
    };
  };

  const ensureActiveRouteInList = (
    routes: RouteSpec[],
    currentActiveId: string | null
  ): {
    list: RouteSpec[];
    active: RouteSpec;
    activeId: string;
  } => {
    const existing = routes.find((r) => r.id === currentActiveId) ?? routes[0];

    if (existing) {
      return {
        list: routes,
        active: existing,
        activeId: existing.id,
      };
    }

    const created: RouteSpec = {
      id: crypto.randomUUID(),
      squares: [],
      color: "info",
      closed: false,
      dashed: false,
      label: "",
    };

    return {
      list: [...routes, created],
      active: created,
      activeId: created.id,
    };
  };

  const handleHighlightSquare = (square: number) => {
    const ensured = ensureActiveHighlightInList(
      safeHighlights,
      activeHighlightId
    );
    setActiveHighlightId(ensured.activeId);

    updatePresentation({
      highlights: ensured.list.map((highlight) =>
        highlight.id === ensured.active.id
          ? {
              ...highlight,
              squares: toggleNumber(highlight.squares ?? [], square),
            }
          : highlight
      ),
    });
  };

  const handleArrowSquare = (square: number) => {
    const ensured = ensureActiveArrowInList(
      safeArrows,
      forceNewArrowOnNextPaintRef.current ? null : activeArrowId
    );
    forceNewArrowOnNextPaintRef.current = false;
    setActiveArrowId(ensured.activeId);

    if (pendingArrowFrom == null) {
      setPendingArrowFrom(square);

      updatePresentation({
        arrows: ensured.list.map((arrow) =>
          arrow.id === ensured.active.id
            ? {
                ...arrow,
                from: square,
                to: null,
              }
            : arrow
        ),
      });
      return;
    }

    updatePresentation({
      arrows: ensured.list.map((arrow) =>
        arrow.id === ensured.active.id
          ? {
              ...arrow,
              from: pendingArrowFrom,
              to: square,
            }
          : arrow
      ),
    });

    setPendingArrowFrom(null);
    setActiveArrowId(null);
    forceNewArrowOnNextPaintRef.current = true;
  };

  const handleRecordHighlightSquare = (square: number) => {
    const slotIdx = effectiveRecordSlot;
    setRecordSlotOverlays((slots) => {
      const next = [...slots];
      while (next.length <= slotIdx) {
        next.push({ highlights: [], arrows: [] });
      }
      const slot = next[slotIdx] ?? { highlights: [], arrows: [] };
      const ensured = ensureActiveHighlightInList(
        slot.highlights,
        recordActiveHighlightIdRef.current
      );
      recordActiveHighlightIdRef.current = ensured.activeId;
      const nextHighlights = ensured.list.map((highlight) =>
        highlight.id === ensured.active.id
          ? {
              ...highlight,
              squares: toggleNumber(highlight.squares ?? [], square),
            }
          : highlight
      );
      next[slotIdx] = { ...slot, highlights: nextHighlights };
      return next;
    });
  };

  const handleRecordArrowSquare = (square: number) => {
    const slotIdx = effectiveRecordSlot;
    setRecordSlotOverlays((slots) => {
      const next = [...slots];
      while (next.length <= slotIdx) {
        next.push({ highlights: [], arrows: [] });
      }
      const slot = next[slotIdx] ?? { highlights: [], arrows: [] };
      const ensured = ensureActiveArrowInList(
        slot.arrows,
        recordForceNewArrowRef.current ? null : recordActiveArrowIdRef.current
      );
      recordForceNewArrowRef.current = false;
      recordActiveArrowIdRef.current = ensured.activeId;

      if (recordPendingArrowFromRef.current == null) {
        recordPendingArrowFromRef.current = square;
        const nextArrows = ensured.list.map((arrow) =>
          arrow.id === ensured.active.id
            ? {
                ...arrow,
                from: square,
                to: null,
              }
            : arrow
        );
        next[slotIdx] = { ...slot, arrows: nextArrows };
        return next;
      }

      const from = recordPendingArrowFromRef.current;
      recordPendingArrowFromRef.current = null;
      recordActiveArrowIdRef.current = null;
      recordForceNewArrowRef.current = true;
      const nextArrows = ensured.list.map((arrow) =>
        arrow.id === ensured.active.id
          ? {
              ...arrow,
              from,
              to: square,
            }
          : arrow
      );
      next[slotIdx] = { ...slot, arrows: nextArrows };
      return next;
    });
  };

  const handleBoardPointerDown = (square: number, button: number) => {
    if (sceneMode !== "arrow" || button !== 0) return;
    setDragArrowFrom(square);
    setDragArrowTo(square);
    setPendingArrowFrom(square);

    const ensured = ensureActiveArrowInList(
      safeArrows,
      forceNewArrowOnNextPaintRef.current ? null : activeArrowId
    );
    forceNewArrowOnNextPaintRef.current = false;
    dragArrowIdRef.current = ensured.activeId;
    setActiveArrowId(ensured.activeId);
    updatePresentation({
      arrows: ensured.list.map((arrow) =>
        arrow.id === ensured.active.id
          ? {
              ...arrow,
              from: square,
              to: square,
            }
          : arrow
      ),
    });
  };

  const handleBoardPointerHover = (square: number, buttons: number) => {
    if (sceneMode !== "arrow") return;
    if (dragArrowFrom == null) return;
    if ((buttons & 1) !== 1) return;

    setDragArrowTo(square);
    const ensured = ensureActiveArrowInList(
      safeArrows,
      dragArrowIdRef.current ?? activeArrowId
    );
    dragArrowIdRef.current = ensured.activeId;
    setActiveArrowId(ensured.activeId);
    updatePresentation({
      arrows: ensured.list.map((arrow) =>
        arrow.id === ensured.active.id
          ? {
              ...arrow,
              from: dragArrowFrom,
              to: square,
            }
          : arrow
      ),
    });
  };

  const handleBoardPointerUp = (square: number, button: number) => {
    if (sceneMode !== "arrow" || button !== 0) return;
    if (dragArrowFrom == null) return;

    suppressNextBoardClickRef.current = true;
    const from = dragArrowFrom;
    const to = square ?? dragArrowTo ?? from;
    const ensured = ensureActiveArrowInList(
      safeArrows,
      forceNewArrowOnNextPaintRef.current
        ? null
        : dragArrowIdRef.current ?? activeArrowId
    );
    forceNewArrowOnNextPaintRef.current = false;
    dragArrowIdRef.current = ensured.activeId;
    setActiveArrowId(ensured.activeId);

    if (to === from) {
      updatePresentation({
        arrows: ensured.list.map((arrow) =>
          arrow.id === ensured.active.id
            ? {
                ...arrow,
                from,
                to: null,
              }
            : arrow
        ),
      });
      setPendingArrowFrom(from);
    } else {
      updatePresentation({
        arrows: ensured.list.map((arrow) =>
          arrow.id === ensured.active.id
            ? {
                ...arrow,
                from,
                to,
              }
            : arrow
        ),
      });
      setPendingArrowFrom(null);
      setActiveArrowId(null);
      forceNewArrowOnNextPaintRef.current = true;
    }

    setDragArrowFrom(null);
    setDragArrowTo(null);
    dragArrowIdRef.current = null;
  };

  const handleRouteSquare = (square: number) => {
    const ensured = ensureActiveRouteInList(safeRoutes, activeRouteId);
    setActiveRouteId(ensured.activeId);

    updatePresentation({
      routes: ensured.list.map((route) =>
        route.id === ensured.active.id
          ? {
              ...route,
              squares:
                (route.squares ?? []).length > 0 &&
                route.squares[route.squares.length - 1] === square
                  ? route.squares.slice(0, -1)
                  : [...(route.squares ?? []), square],
            }
          : route
      ),
    });
  };

  const handleValidationSquare = (square: number) => {
    const validation = step.validation;

    switch (validation.type) {
      case "select_squares": {
        const nextValidation: SelectSquaresValidation = {
          ...validation,
          squares: toggleNumber(validation.squares ?? [], square),
        };

        onStepChange({
          ...step,
          validation: nextValidation,
        });
        return;
      }

      case "select_pieces": {
        const nextValidation: SelectPiecesValidation = {
          ...validation,
          pieceSquares: toggleNumber(validation.pieceSquares ?? [], square),
        };

        onStepChange({
          ...step,
          validation: nextValidation,
        });
        return;
      }

      case "zone_paint": {
        const nextValidation: ZonePaintValidation = {
          ...validation,
          squares: toggleNumber(validation.squares ?? [], square),
        };

        onStepChange({
          ...step,
          validation: nextValidation,
        });
        return;
      }

      case "mark_path": {
        if (validation.mode === "exact_path") {
          const currentPath = validation.path ?? [];
          const nextValidation: MarkPathValidation = {
            ...validation,
            path:
              currentPath.length > 0 &&
              currentPath[currentPath.length - 1] === square
                ? currentPath.slice(0, -1)
                : [...currentPath, square],
          };

          onStepChange({
            ...step,
            validation: nextValidation,
          });
        } else {
          const nextValidation: MarkPathValidation = {
            ...validation,
            targetSquare: square,
          };

          onStepChange({
            ...step,
            validation: nextValidation,
          });
        }
        return;
      }

      case "goal": {
        if (validation.goalType === "reach_square") {
          onStepChange({
            ...step,
            validation: {
              ...validation,
              targetSquare: square,
            },
          });
        }
        return;
      }

      default:
        return;
    }
  };

  const handleApplyRecorder = (target: RecorderApplyTarget) => {
    const notation = recorder.getNotationList();
    let nextStep = applyRecorderLineToStep(step, notation, target);
    if (notation.length > 0) {
      try {
        const timeline = buildRecorderNodeTimelineSnapshots(
          step,
          notation,
          recordSlotOverlays
        );
        nextStep = {
          ...nextStep,
          sourceRef: {
            sourceId: nextStep.sourceRef?.sourceId ?? `embedded-${nextStep.id}`,
            lineMode: nextStep.sourceRef?.lineMode ?? "custom",
            anchorNodeId: nextStep.sourceRef?.anchorNodeId ?? null,
            startNodeId: nextStep.sourceRef?.startNodeId ?? null,
            endNodeId: nextStep.sourceRef?.endNodeId ?? null,
            focusNodeId: nextStep.sourceRef?.focusNodeId ?? null,
            nodeTimeline: timeline,
          },
        };
      } catch {
        // illegal line: skip embedding timeline
      }
    }
    onStepChange(nextStep);
    setRecordSlotOverlays([{ highlights: [], arrows: [] }]);
    setRecordOverlayTool("moves");
    recordActiveHighlightIdRef.current = null;
    recordActiveArrowIdRef.current = null;
    recordPendingArrowFromRef.current = null;
    recordForceNewArrowRef.current = false;
  };

  const convertRecordingToAuthoringTimeline = (
    output: "showLine" | "showMove"
  ) => {
    if (!onAppendAuthoringMomentsFromRecording) return;
    const moves = recorder.state.moves;
    if (moves.length === 0) return;
    const startFen = boardStateToFen(recorder.state.startBoard);
    const annotations: Array<RecorderAuthoringAnnotationInput | undefined> =
      recorderAuthoringRows.map((row) => {
        const ann: RecorderAuthoringAnnotationInput = {};
        if (row.glyph) ann.glyph = row.glyph;
        if (row.pre.trim()) {
          ann.preText = createLocalizedText(row.pre.trim(), row.pre.trim());
        }
        if (row.post.trim()) {
          ann.postText = createLocalizedText(row.post.trim(), row.post.trim());
        }
        if (row.role) ann.semanticRole = row.role;
        return Object.keys(ann).length > 0 ? ann : undefined;
      });
    const moments = recordedLineToMoments(moves, annotations, {
      output,
      startFen,
      language: authoringRecordingLanguage,
      slotOverlays: recordSlotOverlays,
    });
    onAppendAuthoringMomentsFromRecording(moments);
    recorder.clearRecording();
    setRecorderAuthoringRows([]);
    setRecorderInspectPly(null);
  };

  const applyRecordingToAskSequenceTarget = () => {
    if (!onApplyRecordingToAskSequence) return;
    const moves = recorder.state.moves;
    if (moves.length === 0) return;
    onApplyRecordingToAskSequence(moves);
    recorder.clearRecording();
    setRecorderAuthoringRows([]);
    setRecorderInspectPly(null);
  };

  const appendRecordingToAskSequenceTarget = () => {
    if (!onAppendRecordingToAskSequence) return;
    const moves = recorder.state.moves;
    if (moves.length === 0) return;
    onAppendRecordingToAskSequence(moves);
    recorder.clearRecording();
    setRecorderAuthoringRows([]);
    setRecorderInspectPly(null);
  };

  const applyRecordingToPlacePiecesWithShowLineTarget = () => {
    if (!onApplyRecordingToPlacePiecesWithShowLine) return;
    const moves = recorder.state.moves;
    if (moves.length === 0) return;
    onApplyRecordingToPlacePiecesWithShowLine(moves);
    recorder.clearRecording();
    setRecorderAuthoringRows([]);
    setRecorderInspectPly(null);
  };


  const appendNewAskMoveFromRecording = () => {
    if (!onAppendRecordingAsNewAskMove) return;
    const moves = recorder.state.moves;
    if (moves.length === 0) return;
    onAppendRecordingAsNewAskMove(moves);
    recorder.clearRecording();
    setRecorderAuthoringRows([]);
    setRecorderInspectPly(null);
  };

  const appendNewAskSequenceFromRecording = () => {
    if (!onAppendRecordingAsNewAskSequence) return;
    const moves = recorder.state.moves;
    if (moves.length === 0) return;
    onAppendRecordingAsNewAskSequence(moves);
    recorder.clearRecording();
    setRecorderAuthoringRows([]);
    setRecorderInspectPly(null);
  };

  const patchSelectedRecorderRow = (patch: Partial<RecorderAuthoringRowDraft>) => {
    if (selectedRecorderPly == null || !selectedRecorderRow) return;
    setRecorderAuthoringRows((prev) => {
      const next = [...prev];
      next[selectedRecorderPly] = { ...selectedRecorderRow, ...patch };
      return next;
    });
  };

  const patchSelectedRecorderSlot = (
    update: (slot: RecorderSlotOverlay) => RecorderSlotOverlay
  ) => {
    if (selectedRecorderPly == null) return;
    setRecordSlotOverlays((prev) => {
      const next = [...prev];
      while (next.length <= selectedRecorderPly) {
        next.push({ highlights: [], arrows: [] });
      }
      const base = next[selectedRecorderPly] ?? { highlights: [], arrows: [] };
      next[selectedRecorderPly] = update(base);
      return next;
    });
  };

  const validationOverlayHighlights = getValidationOverlayHighlights(step);

  const showValidationApply =
    step.type === "move" || step.type === "sequence";
  const showValidationModeButton = supportsBoardValidationMode(step.type);

  return (
    <section style={wrapStyle}>
      <div style={topToolbarStyle}>
        <div style={toolbarRowStyle}>
          <strong style={titleStyle}>Board scene</strong>

          <PaintToolbar
            selectedTool={currentBrush}
            sideToMove={board.sideToMove === "W" ? "white" : "black"}
            onSelectTool={onBrushChange}
            onSetSideToMove={setSideToMove}
            onClearBoard={clearBoard}
            onResetBoard={loadStartPosition}
          />
        </div>

        <div style={toolbarRowStyle}>
          <ModeButton active={sceneMode === "paint"} onClick={() => setSceneMode("paint")}>
            Paint
          </ModeButton>
          <ModeButton active={sceneMode === "highlight"} onClick={() => setSceneMode("highlight")}>
            Highlight
          </ModeButton>
          <ModeButton active={sceneMode === "arrow"} onClick={() => setSceneMode("arrow")}>
            Arrow
          </ModeButton>
          <ModeButton active={sceneMode === "route"} onClick={() => setSceneMode("route")}>
            Route
          </ModeButton>
          {showValidationModeButton ? (
            <ModeButton
              active={sceneMode === "validation"}
              onClick={() => setSceneMode("validation")}
            >
              Validation
            </ModeButton>
          ) : null}
          <ModeButton active={sceneMode === "record"} onClick={() => setSceneMode("record")}>
            Record
          </ModeButton>
          <ModeButton active={isFlipped} onClick={() => setIsFlipped((prev) => !prev)}>
            Flip
          </ModeButton>
        </div>
      </div>

      <div style={workspaceStyle}>
        <div style={boardAreaStyle}>
          <div style={canvasWrapStyle}>
            <div style={canvasInnerStyle}>
              <BoardEditor
                board={boardForEditor}
                currentBrush={currentBrush === "eraser" ? "empty" : currentBrush}
                onPaintSquare={handleSquareClick}
                onSquarePointerDown={handleBoardPointerDown}
                onSquarePointerHover={handleBoardPointerHover}
                onSquarePointerUp={handleBoardPointerUp}
                enableDragPaint={sceneMode === "paint"}
                selectedSquare={
                  sceneMode === "record" &&
                  (!recorder.state.isRecording || recorderInspectPly !== null)
                    ? null
                    : recorder.state.selectedFrom
                }
                legalTargets={
                  sceneMode === "record"
                    ? isRecordScanAnimating || recorderInspectPly !== null
                      ? []
                      : recorder.legalTargets
                    : []
                }
                flipped={isFlipped}
              />

              {recordScanMotionOverlay && recorderInspectPly === null ? (
                <NotationMoveAnimationOverlay
                  flipped={isFlipped}
                  ghostPos={recordScanMotionOverlay.ghostPos}
                  movingPiece={recordScanMotionOverlay.movingPiece}
                  captureGhosts={recordScanMotionOverlay.captureGhosts}
                  captureOpacity={recordScanMotionOverlay.captureOpacity}
                />
              ) : null}

              <BoardOverlayLayer
                boardSize={boardSize}
                highlights={[
                  ...displayHighlights,
                  ...authoringStudioPickHighlight,
                  ...validationOverlayHighlights,
                  ...recordMergedHighlights,
                ]}
                arrows={[
                  ...displayArrows,
                  ...(recordEngineArrow ? [recordEngineArrow] : []),
                  ...recordMergedArrows,
                ]}
                routes={displayRoutes}
                squareGlyphs={authoringPreview?.squareGlyphs ?? []}
              />
            </div>
          </div>
        </div>

        <aside style={toolsColumnStyle}>
          {(sceneMode === "highlight" || sceneMode === "arrow" || sceneMode === "route") && (
            <div style={managerCardStyle}>
              {sceneMode === "highlight" && (
                <>
                  <div style={managerHeaderStyle}>
                    <div>
                      <div style={managerTitleStyle}>Highlights</div>
                      <div style={managerSubtitleStyle}>
                        Create multiple highlights, choose a color, and remove them.
                      </div>
                    </div>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => {
                        const created: HighlightSpec = {
                          id: crypto.randomUUID(),
                          squares: [],
                          color: "primary",
                          pulse: false,
                          fill: true,
                          outline: true,
                        };
                        updatePresentation({
                          highlights: [...safeHighlights, created],
                        });
                        setActiveHighlightId(created.id);
                      }}
                    >
                      + Highlight
                    </button>
                  </div>

                  <div style={managerListStyle}>
                    {safeHighlights.length === 0 ? (
                      <div style={emptyManagerStyle}>No highlights yet.</div>
                    ) : (
                      safeHighlights.map((item, index) => (
                        <div key={item.id} style={managerItemStyle}>
                          <div style={managerItemTopStyle}>
                            <div style={managerLabelStyle}>
                              Highlight {index + 1} · {item.squares.length} squares
                            </div>

                            <div style={managerActionsInlineStyle}>
                              <button
                                type="button"
                                style={item.id === activeHighlightId ? activeMiniButtonStyle : miniButtonStyle}
                                onClick={() => setActiveHighlightId(item.id)}
                              >
                                Active
                              </button>

                              <button
                                type="button"
                                style={dangerMiniButtonStyle}
                                onClick={() => {
                                  const next = safeHighlights.filter((h) => h.id !== item.id);
                                  updatePresentation({ highlights: next });
                                  if (activeHighlightId === item.id) {
                                    setActiveHighlightId(next[0]?.id ?? null);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div style={colorRowStyle}>
                            {OVERLAY_COLORS.map((color) => (
                              <ColorChip
                                key={color}
                                color={color}
                                active={item.color === color}
                                onClick={() => {
                                  updatePresentation({
                                    highlights: safeHighlights.map((h) =>
                                      h.id === item.id ? { ...h, color } : h
                                    ),
                                  });
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {sceneMode === "arrow" && (
                <>
                  <div style={managerHeaderStyle}>
                    <div>
                      <div style={managerTitleStyle}>Arrows</div>
                      <div style={managerSubtitleStyle}>
                        Create multiple arrows, choose a color, and remove them.
                      </div>
                    </div>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => {
                        const created: ArrowSpec = {
                          id: crypto.randomUUID(),
                          from: null,
                          to: null,
                          color: nextOverlayColorByCount(safeArrows.length),
                          curved: false,
                          dashed: false,
                          label: "",
                        };
                        updatePresentation({
                          arrows: [...safeArrows, created],
                        });
                        setActiveArrowId(created.id);
                        setPendingArrowFrom(null);
                      }}
                    >
                      + Arrow
                    </button>
                  </div>

                  <div style={managerListStyle}>
                    {safeArrows.length === 0 ? (
                      <div style={emptyManagerStyle}>No arrows yet.</div>
                    ) : (
                      safeArrows.map((item, index) => (
                        <div key={item.id} style={managerItemStyle}>
                          <div style={managerItemTopStyle}>
                            <div style={managerLabelStyle}>
                              Arrow {index + 1} ·{" "}
                              {typeof item.from === "number" && typeof item.to === "number"
                                ? `${item.from} → ${item.to}`
                                : "not complete yet"}
                            </div>

                            <div style={managerActionsInlineStyle}>
                              <button
                                type="button"
                                style={item.id === activeArrowId ? activeMiniButtonStyle : miniButtonStyle}
                                onClick={() => {
                                  setActiveArrowId(item.id);
                                  setPendingArrowFrom(null);
                                }}
                              >
                                Active
                              </button>

                              <button
                                type="button"
                                style={dangerMiniButtonStyle}
                                onClick={() => {
                                  const next = safeArrows.filter((a) => a.id !== item.id);
                                  updatePresentation({ arrows: next });
                                  if (activeArrowId === item.id) {
                                    setActiveArrowId(next[0]?.id ?? null);
                                  }
                                  setPendingArrowFrom(null);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div style={colorRowStyle}>
                            {OVERLAY_COLORS.map((color) => (
                              <ColorChip
                                key={color}
                                color={color}
                                active={item.color === color}
                                onClick={() => {
                                  updatePresentation({
                                    arrows: safeArrows.map((a) =>
                                      a.id === item.id ? { ...a, color } : a
                                    ),
                                  });
                                }}
                              />
                            ))}
                          </div>

                          <div style={toggleRowStyle}>
                            <label style={toggleLabelStyle}>
                              <input
                                type="checkbox"
                                checked={!!item.curved}
                                onChange={(e) => {
                                  updatePresentation({
                                    arrows: safeArrows.map((a) =>
                                      a.id === item.id ? { ...a, curved: e.target.checked } : a
                                    ),
                                  });
                                }}
                              />
                              Curved
                            </label>

                            <label style={toggleLabelStyle}>
                              <input
                                type="checkbox"
                                checked={!!item.dashed}
                                onChange={(e) => {
                                  updatePresentation({
                                    arrows: safeArrows.map((a) =>
                                      a.id === item.id ? { ...a, dashed: e.target.checked } : a
                                    ),
                                  });
                                }}
                              />
                              Dashed
                            </label>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {sceneMode === "route" && (
                <>
                  <div style={managerHeaderStyle}>
                    <div>
                      <div style={managerTitleStyle}>Routes</div>
                      <div style={managerSubtitleStyle}>
                        Create multiple routes, choose a color, and remove them.
                      </div>
                    </div>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => {
                        const created: RouteSpec = {
                          id: crypto.randomUUID(),
                          squares: [],
                          color: "info",
                          closed: false,
                          dashed: false,
                          label: "",
                        };
                        updatePresentation({
                          routes: [...safeRoutes, created],
                        });
                        setActiveRouteId(created.id);
                      }}
                    >
                      + Route
                    </button>
                  </div>

                  <div style={managerListStyle}>
                    {safeRoutes.length === 0 ? (
                      <div style={emptyManagerStyle}>No routes yet.</div>
                    ) : (
                      safeRoutes.map((item, index) => (
                        <div key={item.id} style={managerItemStyle}>
                          <div style={managerItemTopStyle}>
                            <div style={managerLabelStyle}>
                              Route {index + 1} · {item.squares.length} points
                            </div>

                            <div style={managerActionsInlineStyle}>
                              <button
                                type="button"
                                style={item.id === activeRouteId ? activeMiniButtonStyle : miniButtonStyle}
                                onClick={() => setActiveRouteId(item.id)}
                              >
                                Active
                              </button>

                              <button
                                type="button"
                                style={dangerMiniButtonStyle}
                                onClick={() => {
                                  const next = safeRoutes.filter((r) => r.id !== item.id);
                                  updatePresentation({ routes: next });
                                  if (activeRouteId === item.id) {
                                    setActiveRouteId(next[0]?.id ?? null);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div style={colorRowStyle}>
                            {OVERLAY_COLORS.map((color) => (
                              <ColorChip
                                key={color}
                                color={color}
                                active={item.color === color}
                                onClick={() => {
                                  updatePresentation({
                                    routes: safeRoutes.map((r) =>
                                      r.id === item.id ? { ...r, color } : r
                                    ),
                                  });
                                }}
                              />
                            ))}
                          </div>

                          <div style={toggleRowStyle}>
                            <label style={toggleLabelStyle}>
                              <input
                                type="checkbox"
                                checked={!!item.closed}
                                onChange={(e) => {
                                  updatePresentation({
                                    routes: safeRoutes.map((r) =>
                                      r.id === item.id ? { ...r, closed: e.target.checked } : r
                                    ),
                                  });
                                }}
                              />
                              Closed
                            </label>

                            <label style={toggleLabelStyle}>
                              <input
                                type="checkbox"
                                checked={!!item.dashed}
                                onChange={(e) => {
                                  updatePresentation({
                                    routes: safeRoutes.map((r) =>
                                      r.id === item.id ? { ...r, dashed: e.target.checked } : r
                                    ),
                                  });
                                }}
                              />
                              Dashed
                            </label>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {sceneMode === "record" && (
            <>
              <style>
                {`
                  .board-scene-recorder-scroll {
                    height: min(74vh, 760px);
                    max-height: min(74vh, 760px);
                    min-height: 0;
                    overflow-y: auto;
                    overflow-x: hidden;
                    scrollbar-width: thin;
                    -ms-overflow-style: auto;
                    padding-bottom: 64px;
                  }
                  .board-scene-recorder-scroll::-webkit-scrollbar {
                    display: block;
                    width: 8px;
                    height: 8px;
                  }
                  .board-scene-recorder-scroll::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 999px;
                  }
                `}
              </style>
              <div style={cardStyle}>
                <div className="board-scene-recorder-scroll">
              <div style={recorderHeaderStyle}>
                <div>
                  <div style={cardTitleStyle}>Recorder</div>
                  <div style={cardSubtitleStyle}>
                    {recorder.state.isRecording
                      ? authoringRecordingLanguage === "nl"
                        ? "Speel zetten op het bord; optioneel highlight/pijl per zet."
                        : "Play moves on the board; optional highlight/arrow per ply."
                      : authoringRecordingLanguage === "nl"
                        ? "Tik op een stuk van de partij die aan zet is om opname te starten (Idle → Recording)."
                        : "Tap a piece of the side to move on the board to start recording (Idle → Recording)."}
                  </div>
                </div>

                <div style={miniStatusStyle}>
                  {recorder.state.isRecording ? "Recording" : "Idle"}
                </div>
              </div>

              <div style={recorderControlsStyle}>
                <button type="button" onClick={recorder.undo} style={buttonStyle}>
                  Undo
                </button>

                <button
                  type="button"
                  onClick={() => {
                    recorder.resetToStartPosition(recorder.state.startBoard);
                    setRecorderInspectPly(null);
                  }}
                  style={buttonStyle}
                >
                  Clear
                </button>
                {onApplyRecordingToPlacePiecesWithShowLine ? (
                  <button
                    type="button"
                    style={
                      recorder.state.moves.length > 0
                        ? primaryButtonStyle
                        : { ...primaryButtonStyle, opacity: 0.5, cursor: "not-allowed" }
                    }
                    disabled={recorder.state.moves.length === 0}
                    onClick={applyRecordingToPlacePiecesWithShowLineTarget}
                    title="Set moves in placePieces and append showLine"
                  >
                    PP + showLine
                  </button>
                ) : null}
              </div>

              <div style={recorderInfoStyle}>
                {recorderInspectPly !== null
                  ? authoringRecordingLanguage === "nl"
                    ? `Inspecteren: zet ${recorderInspectPly + 1} — ${recorder.state.moves[recorderInspectPly]?.notation ?? ""}`
                    : `Inspecting: move ${recorderInspectPly + 1} — ${recorder.state.moves[recorderInspectPly]?.notation ?? ""}`
                  : `Moves: ${recorder.state.moves.length} · Chain: ${
                      recorder.state.chainInProgress ? "yes" : "no"
                    }`}
              </div>

              {recorderInspectPly !== null ? (
                <div style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    onClick={() => setRecorderInspectPly(null)}
                  >
                    {authoringRecordingLanguage === "nl"
                      ? "Terug naar live bord"
                      : "Back to live board"}
                  </button>
                </div>
              ) : null}

              {recorder.state.isRecording ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 8,
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#64748b", width: "100%" }}>
                    {authoringRecordingLanguage === "nl"
                      ? "Klik een zet hieronder voor die stand op het bord; Highlight/Pijl gelden voor die zet. Zetten: tik opnieuw op het bord (eerst terug naar live)."
                      : "Click a move below to show that position; Highlight/Arrow apply to that ply. To play moves: use the board (switch to live first with one click if inspecting)."}
                  </span>
                  <button
                    type="button"
                    style={recordOverlayTool === "moves" ? primaryButtonStyle : buttonStyle}
                    onClick={() => setRecordOverlayTool("moves")}
                  >
                    Moves
                  </button>
                  <button
                    type="button"
                    style={recordOverlayTool === "highlight" ? primaryButtonStyle : buttonStyle}
                    onClick={() => setRecordOverlayTool("highlight")}
                  >
                    Highlight
                  </button>
                  <button
                    type="button"
                    style={recordOverlayTool === "arrow" ? primaryButtonStyle : buttonStyle}
                    onClick={() => setRecordOverlayTool("arrow")}
                  >
                    Arrow
                  </button>
                </div>
              ) : null}

              <div style={notationBoxStyle}>
                {recorder.getNotationList().join(", ") || "No moves recorded yet"}
              </div>

              <div style={applyRowStyle}>
                {showValidationApply ? (
                  <button
                    type="button"
                    onClick={() => handleApplyRecorder("validation")}
                    style={buttonStyle}
                  >
                    Validation
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleApplyRecorder("autoplay")}
                  style={buttonStyle}
                >
                  Autoplay
                </button>

                {showValidationApply ? (
                  <button
                    type="button"
                    onClick={() => handleApplyRecorder("both")}
                    style={primaryButtonStyle}
                  >
                    Both
                  </button>
                ) : null}
              </div>

              {authoringRecordingEnabled && onAppendAuthoringMomentsFromRecording ? (
                <div style={authoringRecorderV2Style}>
                  <div style={authoringRecorderV2TitleStyle}>Authoring timeline</div>
                  {recorder.state.moves.length === 0 ? (
                    <div style={authoringRecorderHintStyle}>
                      Record one or more plies, add optional notes per ply, then convert.
                    </div>
                  ) : (
                    <>
                      <div style={authoringPlyListStyle}>
                        {recorder.state.moves.map((m, i) => {
                          const slot = recordSlotOverlays[i] ?? { highlights: [], arrows: [] };
                          const active = selectedRecorderPly === i;
                          return (
                            <button
                              key={`${i}-${m.notation}`}
                              type="button"
                              style={{
                                ...authoringPlyListRowBtnStyle,
                                ...(active ? authoringPlyListRowBtnActiveStyle : {}),
                              }}
                              onClick={() => setRecorderInspectPly(i)}
                            >
                              <span style={authoringPlyMoveNotationStyle}>
                                {i + 1}. {m.notation}
                              </span>
                              <span style={authoringPlyListMetaStyle}>
                                {recorderSlotSummary(slot)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {selectedRecorderPly != null && selectedRecorderRow && selectedRecorderSlot ? (
                        <div style={authoringPlyDetailStyle}>
                          <div style={authoringPlyDetailTitleStyle}>
                            {authoringRecordingLanguage === "nl" ? "Ply" : "Ply"} {selectedRecorderPly + 1}:{" "}
                            {recorder.state.moves[selectedRecorderPly]?.notation ?? ""}
                          </div>
                          <div style={authoringPlyChipRowStyle}>
                            <span style={authoringPlyChipLabelStyle}>Glyph</span>
                            <button
                              type="button"
                              style={{
                                ...authoringRecorderChipStyle,
                                ...(selectedRecorderRow.glyph === ""
                                  ? authoringRecorderChipActiveStyle
                                  : {}),
                              }}
                              onClick={() => patchSelectedRecorderRow({ glyph: "" })}
                            >
                              —
                            </button>
                            {RECORDING_GLYPH_OPTIONS.map((g) => (
                              <button
                                key={g}
                                type="button"
                                style={{
                                  ...authoringRecorderChipStyle,
                                  ...(selectedRecorderRow.glyph === g
                                    ? authoringRecorderChipActiveStyle
                                    : {}),
                                }}
                                onClick={() =>
                                  patchSelectedRecorderRow({
                                    glyph: selectedRecorderRow.glyph === g ? "" : g,
                                  })
                                }
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                          <div style={authoringPlyChipRowStyle}>
                            <span style={authoringPlyChipLabelStyle}>Role</span>
                            <button
                              type="button"
                              style={{
                                ...authoringRecorderChipStyle,
                                ...(selectedRecorderRow.role === ""
                                  ? authoringRecorderChipActiveStyle
                                  : {}),
                              }}
                              onClick={() => patchSelectedRecorderRow({ role: "" })}
                            >
                              —
                            </button>
                            {RECORDING_ROLE_OPTIONS.map((r) => (
                              <button
                                key={r}
                                type="button"
                                style={{
                                  ...authoringRecorderChipStyle,
                                  ...(selectedRecorderRow.role === r
                                    ? authoringRecorderChipActiveStyle
                                    : {}),
                                }}
                                onClick={() =>
                                  patchSelectedRecorderRow({
                                    role: selectedRecorderRow.role === r ? "" : r,
                                  })
                                }
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          <div style={authoringPlyFieldsStyle}>
                            <input
                              type="text"
                              placeholder={authoringRecordingLanguage === "nl" ? "Tekst vóór" : "Pre text"}
                              value={selectedRecorderRow.pre}
                              style={authoringTextInputStyle}
                              onChange={(e) => patchSelectedRecorderRow({ pre: e.target.value })}
                            />
                            <input
                              type="text"
                              placeholder={authoringRecordingLanguage === "nl" ? "Tekst na" : "Post text"}
                              value={selectedRecorderRow.post}
                              style={authoringTextInputStyle}
                              onChange={(e) => patchSelectedRecorderRow({ post: e.target.value })}
                            />
                          </div>
                          <label style={authoringPlyDetailFieldStyle}>
                            {authoringRecordingLanguage === "nl"
                              ? "Highlights (velden, komma)"
                              : "Highlights (squares, comma)"}
                            <input
                              style={authoringTextInputStyle}
                              value={(selectedRecorderSlot.highlights[0]?.squares ?? []).join(", ")}
                              onChange={(e) =>
                                patchSelectedRecorderSlot((slot) => {
                                  const squares = parseRecorderSquares(e.target.value);
                                  const first = slot.highlights[0] ?? {
                                    id: crypto.randomUUID(),
                                    squares: [],
                                    color: "warning" as const,
                                    pulse: false,
                                    fill: true,
                                    outline: true,
                                  };
                                  const nextHighlights =
                                    squares.length > 0
                                      ? [{ ...first, squares }]
                                      : slot.highlights.slice(1);
                                  return { ...slot, highlights: nextHighlights };
                                })
                              }
                            />
                          </label>
                          <label style={authoringPlyDetailFieldStyle}>
                            {authoringRecordingLanguage === "nl"
                              ? "Pijl (van-naar)"
                              : "Arrow (from-to)"}
                            <input
                              style={authoringTextInputStyle}
                              placeholder="35-40"
                              value={
                                selectedRecorderSlot.arrows[0]?.from != null &&
                                selectedRecorderSlot.arrows[0]?.to != null
                                  ? `${selectedRecorderSlot.arrows[0]?.from}-${selectedRecorderSlot.arrows[0]?.to}`
                                  : ""
                              }
                              onChange={(e) =>
                                patchSelectedRecorderSlot((slot) => {
                                  const nums = parseRecorderSquares(e.target.value.replace(/x/gi, "-"));
                                  if (nums.length < 2) return { ...slot, arrows: slot.arrows.slice(1) };
                                  const first = slot.arrows[0] ?? {
                                    id: crypto.randomUUID(),
                                    from: nums[0] ?? null,
                                    to: nums[1] ?? null,
                                    color: "warning" as const,
                                    dashed: false,
                                  };
                                  return {
                                    ...slot,
                                    arrows: [{ ...first, from: nums[0] ?? null, to: nums[1] ?? null }],
                                  };
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : null}
                    </>
                  )}
                  <div style={authoringConvertRowStyle}>
                    <button
                      type="button"
                      style={
                        recorder.state.moves.length > 0
                          ? buttonStyle
                          : { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" }
                      }
                      disabled={recorder.state.moves.length === 0}
                      onClick={() => convertRecordingToAuthoringTimeline("showLine")}
                    >
                      {authoringRecordingLanguage === "nl"
                        ? "Commit → 1x showLine"
                        : "Commit → 1x showLine"}
                    </button>
                    <button
                      type="button"
                      style={
                        recorder.state.moves.length > 0
                          ? primaryButtonStyle
                          : { ...primaryButtonStyle, opacity: 0.5, cursor: "not-allowed" }
                      }
                      disabled={recorder.state.moves.length === 0}
                      onClick={() => convertRecordingToAuthoringTimeline("showMove")}
                    >
                      {authoringRecordingLanguage === "nl"
                        ? "Commit → timeline (showMove)"
                        : "Commit → timeline (showMove)"}
                    </button>
                    {onApplyRecordingToAskSequence ? (
                      <button
                        type="button"
                        style={
                          recorder.state.moves.length > 0
                            ? primaryButtonStyle
                            : { ...primaryButtonStyle, opacity: 0.5, cursor: "not-allowed" }
                        }
                        disabled={recorder.state.moves.length === 0}
                        onClick={applyRecordingToAskSequenceTarget}
                        title="Overwrite expectedSequence on the selected askSequence moment"
                      >
                        Apply → askSequence
                      </button>
                    ) : null}
                    {onAppendRecordingToAskSequence ? (
                      <button
                        type="button"
                        style={
                          recorder.state.moves.length > 0
                            ? buttonStyle
                            : { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" }
                        }
                        disabled={recorder.state.moves.length === 0}
                        onClick={appendRecordingToAskSequenceTarget}
                        title="Append recorder line to expectedSequence on selected askSequence moment"
                      >
                        Append → askSequence
                      </button>
                    ) : null}
                    {onApplyRecordingToPlacePiecesWithShowLine ? (
                      <button
                        type="button"
                        style={
                          recorder.state.moves.length > 0
                            ? buttonStyle
                            : { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" }
                        }
                        disabled={recorder.state.moves.length === 0}
                        onClick={applyRecordingToPlacePiecesWithShowLineTarget}
                        title="Set moves in placePieces and append showLine"
                      >
                        {"PP + showLine"}
                      </button>
                    ) : null}
                    {onAppendRecordingAsNewAskMove ? (
                        <button
                          type="button"
                          style={
                            recorder.state.moves.length > 0
                              ? buttonStyle
                              : { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" }
                          }
                          disabled={recorder.state.moves.length === 0}
                          onClick={appendNewAskMoveFromRecording}
                          title={
                            authoringRecordingLanguage === "nl"
                              ? "Nieuw askMove-moment (eerste zet) aan einde tijdlijn"
                              : "Append new askMove (first ply) to timeline end"
                          }
                        >
                          {authoringRecordingLanguage === "nl"
                            ? "Nieuw askMove"
                            : "New askMove"}
                        </button>
                      ) : null}
                    {onAppendRecordingAsNewAskSequence ? (
                      <button
                        type="button"
                        style={
                          recorder.state.moves.length > 0
                            ? buttonStyle
                            : { ...buttonStyle, opacity: 0.5, cursor: "not-allowed" }
                        }
                        disabled={recorder.state.moves.length === 0}
                        onClick={appendNewAskSequenceFromRecording}
                        title={
                          authoringRecordingLanguage === "nl"
                            ? "Nieuw askSequence van hele lijn aan einde tijdlijn"
                            : "Append new askSequence from full line to timeline end"
                        }
                      >
                        {authoringRecordingLanguage === "nl"
                          ? "Nieuw askSequence"
                          : "New askSequence"}
                      </button>
                    ) : null}
                  </div>
                  {onApplyRecordingToAskSequence ? (
                    <div style={authoringRecorderHintStyle}>
                      {authoringRecordingLanguage === "nl"
                        ? "Kies een askSequence-moment in de inspector, neem de zetten hier op, tik daarna op Toepassen → askSequence."
                        : "Select an askSequence moment in the inspector, record plies here, then Apply → askSequence."}
                    </div>
                  ) : onApplyRecordingToPlacePiecesWithShowLine ? (
                    <div style={authoringRecorderHintStyle}>
                      {authoringRecordingLanguage === "nl"
                        ? "Kies een placePieces-moment en gebruik Apply -> placePieces + showLine."
                        : "Select a placePieces moment and use Apply -> placePieces + showLine."}
                    </div>
                  ) : (
                    <div style={authoringRecorderHintStyle}>
                      {authoringRecordingLanguage === "nl"
                        ? "Selecteer een askSequence-moment om Apply/Append → askSequence te zien."
                        : "Select an askSequence moment to enable Apply/Append → askSequence."}
                    </div>
                  )}
                </div>
              ) : null}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function getValidationOverlayHighlights(step: LessonStep): HighlightSpec[] {
  const validation = step.validation;

  switch (validation.type) {
    case "select_squares":
      return [
        {
          id: "validation-select-squares",
          squares: validation.squares ?? [],
          color: "success",
          pulse: false,
          fill: true,
          outline: true,
        },
      ];

    case "select_pieces":
      return [
        {
          id: "validation-select-pieces",
          squares: validation.pieceSquares ?? [],
          color: "warning",
          pulse: false,
          fill: false,
          outline: true,
        },
      ];

    case "zone_paint":
      return [
        {
          id: "validation-zone-paint",
          squares: validation.squares ?? [],
          color: "info",
          pulse: false,
          fill: true,
          outline: true,
        },
      ];

    case "mark_path":
      if (validation.mode === "reaches_goal" && validation.targetSquare) {
        return [
          {
            id: "validation-mark-path-target",
            squares: [validation.targetSquare],
            color: "danger",
            pulse: true,
            fill: false,
            outline: true,
          },
        ];
      }
      return [];

    case "goal":
      if (validation.goalType === "reach_square" && validation.targetSquare) {
        return [
          {
            id: "validation-goal-target",
            squares: [validation.targetSquare],
            color: "danger",
            pulse: true,
            fill: false,
            outline: true,
          },
        ];
      }
      return [];

    default:
      return [];
  }
}

function toggleNumber(list: number[], value: number): number[] {
  return list.includes(value) ? list.filter((n) => n !== value) : [...list, value];
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid #2563eb" : "1px solid #d0d7e2",
        background: active ? "#eff6ff" : "#fff",
        color: active ? "#1d4ed8" : "#111827",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ColorChip({
  color,
  active,
  onClick,
}: {
  color: HighlightColor;
  active: boolean;
  onClick: () => void;
}) {
  const map: Record<HighlightColor, string> = {
    primary: "#2563eb",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#0891b2",
  };

  return (
    <button
      type="button"
      title={color}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        border: active ? "3px solid #111827" : "1px solid #cfd8e3",
        background: map[color],
        cursor: "pointer",
        padding: 0,
      }}
    />
  );
}

const wrapStyle: CSSProperties = {
  padding: 14,
  boxSizing: "border-box",
  display: "grid",
  gap: 12,
};

const topToolbarStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const toolbarRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  marginRight: 6,
};

const workspaceStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 320px",
  gap: 18,
  alignItems: "start",
};

const boardAreaStyle: CSSProperties = {
  minWidth: 0,
};

const toolsColumnStyle: CSSProperties = {
  width: 320,
  minWidth: 320,
  display: "grid",
  gap: 16,
  alignSelf: "stretch",
};

const managerCardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 14,
};

const managerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const managerTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const managerSubtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginTop: 4,
};

const managerListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const managerItemStyle: CSSProperties = {
  border: "1px solid #e5edf5",
  borderRadius: 12,
  padding: 12,
  background: "#fafcff",
  display: "grid",
  gap: 10,
};

const managerItemTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const managerLabelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
};

const managerActionsInlineStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const colorRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
};

const toggleLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const emptyManagerStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  padding: 4,
};

const canvasWrapStyle: CSSProperties = {
  width: "100%",
  minHeight: "min(70vh, 780px)",
  border: "1px solid #dbe3ec",
  background: "#f9fbff",
  borderRadius: 18,
  padding: 10,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
};

const canvasInnerStyle: CSSProperties = {
  position: "relative",
  width: "min(72vh, 56vw, 740px)",
  aspectRatio: "1 / 1",
  lineHeight: 0,
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#fff",
  borderRadius: 16,
  padding: 16,
};

const recorderHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const cardTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const cardSubtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  marginTop: 4,
  lineHeight: 1.45,
};

const miniStatusStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  background: "#f8fafc",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
  color: "#374151",
};

const recorderControlsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 10,
};

const recorderInfoStyle: CSSProperties = {
  fontSize: 13,
  color: "#555",
  marginBottom: 10,
};

const notationBoxStyle: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #dbe3ec",
  background: "#fafcff",
  marginBottom: 12,
  fontSize: 14,
  color: "#111827",
  minHeight: 20,
};

const applyRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  position: "sticky",
  bottom: 0,
  background: "linear-gradient(to top, rgba(255,255,255,0.96), rgba(255,255,255,0.7), rgba(255,255,255,0))",
  padding: "6px 0 4px",
  zIndex: 2,
};

const authoringRecorderV2Style: CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid #e2e8f0",
};

const authoringRecorderV2TitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 8,
};

const authoringRecorderHintStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  lineHeight: 1.45,
  marginTop: 4,
};

const authoringPlyListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 10,
};

const authoringPlyListRowBtnStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #dbe3ec",
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
};

const authoringPlyListRowBtnActiveStyle: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#eff6ff",
};

const authoringPlyMoveNotationStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#0f172a",
  fontVariantNumeric: "tabular-nums",
};

const authoringPlyListMetaStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  fontVariantNumeric: "tabular-nums",
};

const authoringPlyDetailStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 10,
  background: "#fff",
  padding: 10,
  display: "grid",
  gap: 8,
  marginBottom: 8,
};

const authoringPlyDetailTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1e293b",
};

const authoringPlyDetailFieldStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const authoringPlyChipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  alignItems: "center",
  marginBottom: 6,
};

const authoringPlyChipLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  minWidth: 36,
};

const authoringRecorderChipStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  cursor: "pointer",
  lineHeight: 1.2,
};

const authoringRecorderChipActiveStyle: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#dbeafe",
  color: "#1e3a8a",
};

const authoringPlyFieldsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const authoringTextInputStyle: CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  minWidth: 0,
  flex: "1 1 120px",
};

const authoringConvertRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  position: "sticky",
  bottom: 0,
  background: "linear-gradient(to top, rgba(255,255,255,0.96), rgba(255,255,255,0.7), rgba(255,255,255,0))",
  padding: "6px 0 4px",
  zIndex: 3,
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#2b7fff",
  color: "#fff",
  border: "1px solid #2b7fff",
};

const miniButtonStyle: CSSProperties = {
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  padding: "6px 8px",
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  color: "#111827",
};

const activeMiniButtonStyle: CSSProperties = {
  ...miniButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const dangerMiniButtonStyle: CSSProperties = {
  ...miniButtonStyle,
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b91c1c",
};

const emptyWrapStyle: CSSProperties = {
  padding: 24,
  border: "1px dashed #cfd8e3",
  borderRadius: 16,
  background: "#fafcff",
  color: "#6b7280",
  fontSize: 15,
};