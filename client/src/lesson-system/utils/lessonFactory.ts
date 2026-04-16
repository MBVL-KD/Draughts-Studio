// client/src/lesson-system/utils/lessonFactory.ts

import type { Book, Lesson } from "../types/lessonTypes";
import type { LessonStep, LessonStepType } from "../types/stepTypes";
import type { StepValidation } from "../types/stepTypes";
import { createLocalizedText } from "../utils/i18nHelpers";
import { createEmptyAuthoringBundle } from "./authoringLessonStepFactory";
import { authoringLessonStepToLegacyStub } from "./authoringStepToLegacyStub";

export function createEmptyBook(): Book {
  const id = crypto.randomUUID();
  const lesson = createEmptyLesson(id);
  return {
    id,
    bookId: id,
    schemaVersion: 1,
    revision: 1,
    status: "draft",
    title: createLocalizedText("New book", ""),
    description: createLocalizedText("", ""),
    lessons: [lesson],
    exams: [],
  };
}

export function createEmptyLesson(bookId: string): Lesson {
  const id = crypto.randomUUID();
  const draft: Lesson = {
    id,
    lessonId: id,
    title: createLocalizedText("New lesson", ""),
    description: createLocalizedText("", ""),
    steps: [],
    variantId: "international",
    rulesetId: "classic",
    difficulty: 1,
    estimatedMinutes: 5,
    rewards: [],
  };
  const authoringV2 = createEmptyAuthoringBundle(bookId, draft);
  const firstStepId = authoringV2.authoringLesson.stepIds[0]!;
  const firstAuthoring = authoringV2.stepsById[firstStepId]!;
  return {
    ...draft,
    authoringV2,
    steps: [authoringLessonStepToLegacyStub(firstAuthoring)],
  };
}

export function createStep(type: LessonStepType): LessonStep {
  const id = crypto.randomUUID();
  return {
    id,
    stepId: id,
    type,
    title: createLocalizedText(defaultTitleForStepType(type), ""),
    prompt: createLocalizedText("", ""),
    hint: createLocalizedText("", ""),
    explanation: createLocalizedText("", ""),
    initialState: {
      fen: "",
      sideToMove: "white",
    },
    presentation: {
      highlights: [],
      arrows: [],
      routes: [],
      animations: [],
      npc: {
        npcId: "",
        text: createLocalizedText("", ""),
        mode: "bubble",
      },
      autoplay: {
        moves: [],
        moveDurationMs: 900,
        startDelayMs: 300,
        autoPlayOnStepOpen: true,
      },
    },
    validation: defaultValidationForStepType(type),
    feedback: {
      correct: createLocalizedText("Correct.", ""),
      incorrect: createLocalizedText("Try again.", ""),
    },
    analytics: {
      tags: [],
    },
    examBehavior: {
      disableHints: false,
      maxAttempts: undefined,
    },
  };
}

function defaultTitleForStepType(type: LessonStepType): string {
  switch (type) {
    case "explain":
      return "Explanation";
    case "demo":
      return "Demo";
    case "move":
      return "Move";
    case "sequence":
      return "Sequence";
    case "count":
      return "Count";
    case "select_squares":
      return "Select squares";
    case "select_pieces":
      return "Select pieces";
    case "multiple_choice":
      return "Multiple choice";
    case "place_pieces":
      return "Place pieces";
    case "mark_path":
      return "Mark path";
    case "zone_paint":
      return "Zone paint";
    case "goal_challenge":
      return "Goal challenge";
    default:
      return "New step";
  }
}

function defaultValidationForStepType(type: LessonStepType): StepValidation {
  switch (type) {
    case "explain":
    case "demo":
      return {
        type: "none",
      };

    case "move":
      return {
        type: "move",
        mode: "exact",
        correctMoves: [],
      };

    case "sequence":
      return {
        type: "sequence",
        moves: [],
        allowBranches: false,
      };

    case "count":
      return {
        type: "count",
        countType: "legal_moves",
        expected: 0,
      };

    case "select_squares":
      return {
        type: "select_squares",
        mode: "exact",
        squares: [],
      };

    case "select_pieces":
      return {
        type: "select_pieces",
        mode: "exact",
        pieceSquares: [],
      };

    case "multiple_choice":
      return {
        type: "multiple_choice",
        allowMultiple: false,
        options: [
          {
            id: crypto.randomUUID(),
            label: createLocalizedText("Option A", ""),
            isCorrect: true,
          },
          {
            id: crypto.randomUUID(),
            label: createLocalizedText("Option B", ""),
            isCorrect: false,
          },
        ],
      };

    case "place_pieces":
      return {
        type: "place_pieces",
        mode: "goal",
        pieceBank: [{ piece: "wm", count: 1 }],
        goalType: "opponent_no_legal_moves",
        sideToTest: "black",
      };

    case "mark_path":
      return {
        type: "mark_path",
        mode: "exact_path",
        path: [],
      };

    case "zone_paint":
      return {
        type: "zone_paint",
        mode: "exact",
        squares: [],
      };

    case "goal_challenge":
      return {
        type: "goal",
        goalType: "no_legal_moves",
        sideToTest: "black",
      };

    default:
      return { type: "none" };
  }
}