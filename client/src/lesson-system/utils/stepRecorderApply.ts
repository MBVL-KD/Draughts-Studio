import type { LessonStep } from "../types/stepTypes";
import type { ArrowSpec, HighlightSpec } from "../types/presentationTypes";
import type { StepSourceNodeSnapshot } from "../types/stepSourceTypes";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import type { BoardState } from "../../features/board/boardTypes";
import { resolveNotationToEngineMove } from "./resolveNotationToEngineMove";

export type RecorderApplyTarget =
  | "validation"
  | "autoplay"
  | "both";

export function applyRecorderLineToStep(
  step: LessonStep,
  notationMoves: string[],
  target: RecorderApplyTarget
): LessonStep {
  const cleaned = notationMoves.map((m) => m.trim()).filter(Boolean);

  if (cleaned.length === 0) {
    return step;
  }

  let nextStep = step;

  if (target === "validation" || target === "both") {
    nextStep = applyToValidation(nextStep, cleaned);
  }

  if (target === "autoplay" || target === "both") {
    nextStep = applyToAutoplay(nextStep, cleaned);
  }

  return nextStep;
}

function applyToValidation(step: LessonStep, moves: string[]): LessonStep {
  switch (step.type) {
    case "move":
      return {
        ...step,
        validation: {
          type: "move",
          mode: "exact",
          correctMoves: moves[0] ? [moves[0]] : [],
        },
      };

    case "sequence":
      return {
        ...step,
        validation: {
          type: "sequence",
          moves,
          allowBranches:
            step.validation.type === "sequence"
              ? !!step.validation.allowBranches
              : false,
        },
      };

    default:
      return step;
  }
}

function applyToAutoplay(step: LessonStep, moves: string[]): LessonStep {
  return {
    ...step,
    presentation: {
      ...step.presentation,
      autoplay: {
        moves,
        moveDurationMs: step.presentation.autoplay?.moveDurationMs ?? 900,
        startDelayMs: step.presentation.autoplay?.startDelayMs ?? 300,
        autoPlayOnStepOpen:
          step.presentation.autoplay?.autoPlayOnStepOpen ?? true,
      },
    },
  };
}

export type RecorderSlotOverlay = {
  highlights: HighlightSpec[];
  arrows: ArrowSpec[];
};

function applyNotationToBoard(board: BoardState, notation: string): BoardState {
  const em = resolveNotationToEngineMove(board, notation);
  if (!em) {
    throw new Error(`Illegal move in recorder timeline: ${notation}`);
  }
  return fenToBoardState(em.fenAfter);
}

/**
 * Builds `nodeTimeline` snapshots for a line recorded on the step board.
 * `slots[i]` holds overlays on the position after `i` plies (slot 0 = start, slot 1 = after first move, …).
 */
export function buildRecorderNodeTimelineSnapshots(
  step: LessonStep,
  moves: string[],
  slots: RecorderSlotOverlay[]
): StepSourceNodeSnapshot[] {
  const startFen = step.initialState?.fen?.trim();
  let board: BoardState =
    startFen && startFen.length > 0
      ? fenToBoardState(startFen)
      : fenToBoardState("W:W:B");

  const out: StepSourceNodeSnapshot[] = [];

  for (let j = 0; j < moves.length; j++) {
    board = applyNotationToBoard(board, moves[j]);
    const afterSlot = slots[j + 1] ?? { highlights: [], arrows: [] };
    out.push({
      nodeId: `rec:${step.id}:${j}`,
      plyIndex: j + 1,
      notation: moves[j],
      fenAfter: boardStateToFen(board),
      highlights: afterSlot.highlights.length > 0 ? afterSlot.highlights : undefined,
      arrows: afterSlot.arrows.length > 0 ? afterSlot.arrows : undefined,
    });
  }

  return out;
}