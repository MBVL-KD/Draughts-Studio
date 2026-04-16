import type { BoardState } from "../../features/board/boardTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { HighlightSpec } from "../types/presentationTypes";
import { readLocalizedText } from "./i18nHelpers";
import {
  expectedPlacementToBoard,
  normalizeExpectedPlacement,
  placementsBoardLayoutEqual,
  squaresWherePiecesDiffer,
} from "./placementHelpers";
import { fenToBoardState } from "../../features/board/fenUtils";

function moveSpecToNotation(mv: { from: number; to: number; path?: number[]; captures?: number[] }): string {
  const isCapture = (mv.captures?.length ?? 0) > 0;
  const sep = isCapture ? "x" : "-";
  const path = mv.path && mv.path.length >= 2 ? mv.path : [mv.from, mv.to];
  return path.join(sep);
}

export type PlacePiecesEvalResult = {
  status: "success" | "incorrect";
  message: string;
  coachCaption: string;
  feedbackHighlights: HighlightSpec[];
  allowFurtherInput: boolean;
  nextFailedCount: number;
};

function wrongType(language: LanguageCode): PlacePiecesEvalResult {
  return {
    status: "incorrect",
    message:
      language === "nl"
        ? "Dit moment is geen placePieces-interactie."
        : "This moment is not a placePieces interaction.",
    coachCaption: "",
    feedbackHighlights: [],
    allowFurtherInput: false,
    nextFailedCount: 0,
  };
}

/**
 * Pure: compare learner board to exact expected placement (50 squares).
 */
export function evaluatePlacePiecesAttempt(
  moment: StepMoment,
  placedBoard: BoardState,
  priorFailedCount: number,
  language: LanguageCode
): PlacePiecesEvalResult {
  if (moment.type !== "placePieces" || moment.interaction?.kind !== "placePieces") {
    return wrongType(language);
  }

  const ix = moment.interaction;
  const maxAttempts = Math.max(1, ix.maxAttempts ?? 5);
  const allowRetry = ix.allowRetry !== false;
  const raw = ix.expectedPlacement ?? [];
  const normalized = normalizeExpectedPlacement(raw);
  let expectedBoard: BoardState | null = null;
  if (ix.targetFen?.trim()) {
    try {
      expectedBoard = fenToBoardState(ix.targetFen.trim());
    } catch {
      expectedBoard = null;
    }
  }
  if (!expectedBoard && normalized.length === 0) {
    const msg =
      language === "nl"
        ? "Geen doelopstelling ingesteld — voeg minstens één stuk toe in de configuratie."
        : "No target placement set — add at least one piece in the configuration.";
    return {
      status: "incorrect",
      message: msg,
      coachCaption: "",
      feedbackHighlights: [],
      allowFurtherInput: false,
      nextFailedCount: priorFailedCount,
    };
  }

  if (!expectedBoard) {
    let baseBoard: BoardState | undefined;
    if (moment.positionRef?.type === "fen") {
      try {
        baseBoard = fenToBoardState(moment.positionRef.fen);
      } catch {
        baseBoard = undefined;
      }
    }
    expectedBoard = expectedPlacementToBoard(normalized, baseBoard);
  }
  const ok = placementsBoardLayoutEqual(expectedBoard, placedBoard);

  if (ok) {
    const successCoach = readLocalizedText(ix.successCoachCaption, language).trim();
    const body = readLocalizedText(moment.body, language).trim();
    return {
      status: "success",
      message: language === "nl" ? "Correct!" : "Correct!",
      coachCaption: successCoach || body,
      feedbackHighlights: [],
      allowFurtherInput: false,
      nextFailedCount: 0,
    };
  }

  const wrongPlain = readLocalizedText(ix.wrongMessage, language).trim();
  const msg =
    wrongPlain ||
    (language === "nl"
      ? "De stelling klopt nog niet exact."
      : "The position is not an exact match yet.");
  const next = priorFailedCount + 1;
  const maxed = next >= maxAttempts;
  const coach = readLocalizedText(ix.wrongCoachCaption, language).trim();
  const sequenceHint =
    ix.solutionSequence && ix.solutionSequence.length
      ? ix.solutionSequence.map((mv) => moveSpecToNotation(mv)).join(" ")
      : "";
  const diffSq = squaresWherePiecesDiffer(expectedBoard, placedBoard);
  const feedbackHighlights: HighlightSpec[] =
    diffSq.length > 0
      ? [
          {
            id: "place-pieces-diff",
            squares: diffSq,
            color: "warning",
            pulse: false,
            fill: true,
            outline: true,
          },
        ]
      : [];

  return {
    status: "incorrect",
    message: msg,
    coachCaption: coach || sequenceHint,
    feedbackHighlights,
    allowFurtherInput: allowRetry && !maxed,
    nextFailedCount: next,
  };
}
