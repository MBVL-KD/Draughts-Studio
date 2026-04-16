import type { BoardState } from "../../features/board/boardTypes";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import type { RecordedMove } from "../../features/recorder/useSolutionRecorder";
import type { RecorderAuthoringAnnotationInput } from "../types/authoring/recorderAuthoringTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode, LocalizedText } from "../types/i18nTypes";
import type { TimingSpec } from "../types/authoring/presentationRuntimeTypes";
import type { RecorderSlotOverlay } from "./stepRecorderApply";
import { readLocalizedText } from "./i18nHelpers";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";
import { recorderSlotOverlayToAuthoringOverlays } from "./recorderSlotToAuthoringOverlays";

export type RecordedLineToMomentsOutputMode = "showLine" | "showMove";

export type RecordedLineToMomentsOptions = {
  output: RecordedLineToMomentsOutputMode;
  /** FEN of the board when recording started (first ply is legal from here). */
  startFen: string;
  timing?: Partial<TimingSpec>;
  /** Used to merge multi-line pre/post text for `showLine` when building i18n. */
  language?: LanguageCode;
  /**
   * Recorder highlights/arrows per ply: index `i` = position before move `i`
   * (same indexing as the board-scene recorder slots while capturing).
   */
  slotOverlays?: RecorderSlotOverlay[];
};

function moveRefFromRecorded(m: RecordedMove) {
  return {
    type: "inline" as const,
    from: m.from,
    to: m.to,
    path: m.path.length > 2 ? [...m.path] : undefined,
    captures: m.captures.length > 0 ? [...m.captures] : undefined,
    side: m.side === "W" ? ("white" as const) : ("black" as const),
  };
}

/**
 * FEN before each recorded ply. Returns `null` if any notation fails to resolve from the running board.
 */
export function computeFenBeforeEachRecordedMove(
  startFen: string,
  moves: RecordedMove[]
): string[] | null {
  const trimmed = startFen.trim();
  if (!trimmed) return null;
  try {
    let board: BoardState = fenToBoardState(trimmed);
    const fens: string[] = [];
    for (let i = 0; i < moves.length; i += 1) {
      fens.push(boardStateToFen(board));
      const em = resolveNotationToEngineMove(board, moves[i]!.notation);
      if (!em) return null;
      board = fenToBoardState(em.fenAfter);
    }
    return fens;
  } catch {
    return null;
  }
}

function mergeLocalizedLines(
  parts: (LocalizedText | undefined)[],
  language: LanguageCode
): LocalizedText | undefined {
  const lines = parts
    .map((p) => readLocalizedText(p, language).trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  const joined = lines.join("\n");
  return { values: { en: joined, nl: joined } };
}

const DEFAULT_SHOW_MOVE_TIMING: TimingSpec = { autoPlay: true, durationMs: 900 };
const DEFAULT_SHOW_LINE_TIMING: TimingSpec = { autoPlay: true, durationMs: 1200 };

/**
 * Pure: build `showLine` or `showMove[]` moments from a recorder line + optional per-ply annotations.
 * All new moment ids use `crypto.randomUUID()`.
 */
export function recordedLineToMoments(
  moves: RecordedMove[],
  annotations: Array<RecorderAuthoringAnnotationInput | undefined>,
  options: RecordedLineToMomentsOptions
): StepMoment[] {
  const { output, startFen, timing, language = "en", slotOverlays } = options;
  if (moves.length === 0) return [];

  const fensBefore = computeFenBeforeEachRecordedMove(startFen, moves);
  const fallbackFen = startFen.trim();
  const slots = slotOverlays ?? [];

  if (output === "showMove") {
    return moves.map((m, i) => {
      const ann = annotations[i];
      const ref = moveRefFromRecorded(m);
      const fenForMoment =
        fensBefore && fensBefore[i] != null ? fensBefore[i]! : fallbackFen;

      const timingOut: TimingSpec = {
        ...DEFAULT_SHOW_MOVE_TIMING,
        ...timing,
      };

      const slotOx = recorderSlotOverlayToAuthoringOverlays(
        slots[i] ?? { highlights: [], arrows: [] }
      );

      const moment: StepMoment = {
        id: crypto.randomUUID(),
        type: "showMove",
        positionRef: fenForMoment
          ? { type: "fen", fen: fenForMoment }
          : undefined,
        moveRef: ref,
        body: ann?.preText,
        caption: ann?.postText,
        timing: timingOut,
        overlays: slotOx.length > 0 ? slotOx : undefined,
        glyphMarkers:
          ann?.glyph != null
            ? [
                {
                  id: crypto.randomUUID(),
                  glyph: ann.glyph,
                  moveRef: ref,
                },
              ]
            : undefined,
        recorderMeta: {
          semanticRole: ann?.semanticRole,
          sourceNotationIndex: i,
        },
      };
      return moment;
    });
  }

  const lineRef = {
    type: "inline" as const,
    moves: moves.map(moveRefFromRecorded),
  };

  const glyphMarkers = moves.flatMap((m, i) => {
    const ann = annotations[i];
    if (!ann?.glyph) return [];
    return [
      {
        id: crypto.randomUUID(),
        glyph: ann.glyph,
        moveRef: moveRefFromRecorded(m),
      },
    ];
  });

  const plySemanticRoles = moves.map((_, i) => annotations[i]?.semanticRole);
  const hasAnyRole = plySemanticRoles.some((r) => r != null);

  const mergedSlotOverlays = moves.flatMap((_, i) =>
    recorderSlotOverlayToAuthoringOverlays(slots[i] ?? { highlights: [], arrows: [] })
  );

  const showLineMoment: StepMoment = {
    id: crypto.randomUUID(),
    type: "showLine",
    positionRef: fallbackFen ? { type: "fen", fen: fallbackFen } : undefined,
    lineRef,
    body: mergeLocalizedLines(
      annotations.map((a) => a?.preText),
      language
    ),
    caption: mergeLocalizedLines(
      annotations.map((a) => a?.postText),
      language
    ),
    timing: { ...DEFAULT_SHOW_LINE_TIMING, ...timing },
    overlays: mergedSlotOverlays.length > 0 ? mergedSlotOverlays : undefined,
    glyphMarkers: glyphMarkers.length > 0 ? glyphMarkers : undefined,
    recorderMeta: {
      sourceNotationIndex: 0,
      ...(hasAnyRole ? { plySemanticRoles } : {}),
    },
  };

  return [showLineMoment];
}
