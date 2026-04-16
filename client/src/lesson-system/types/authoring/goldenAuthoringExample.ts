import type { LessonAuthoring, LessonBook, LessonModule } from "./curriculumTypes";
import type { AuthoringLessonStep } from "./lessonStepTypes";
import type { StepMoment } from "./timelineTypes";

const bookId = "golden-book";
const moduleId = "golden-module";
const lessonId = "golden-lesson";
const stepId = "golden-step";

const introMoment: StepMoment = {
  id: "golden-moment-intro",
  type: "introText",
  title: { values: { en: "Idea", nl: "Idee" } },
  body: {
    values: {
      en: "White can use a tempo to prepare a breakthrough.",
      nl: "Wit kan met een tempo een doorbraak voorbereiden.",
    },
  },
  timing: { waitForUser: true },
};

const focusMoment: StepMoment = {
  id: "golden-moment-focus",
  type: "focusBoard",
  caption: { values: { en: "Watch the long diagonal.", nl: "Let op de lange diagonaal." } },
  camera: [{ type: "frameArea", squares: [33, 39, 44], durationMs: 400 }],
};

const showMoment: StepMoment = {
  id: "golden-moment-show",
  type: "showMove",
  moveRef: { type: "inline", from: 31, to: 35, side: "white" },
  overlays: [
    {
      type: "arrow",
      from: 31,
      to: 35,
      style: "hint",
      animated: true,
    },
  ],
  timing: { autoPlay: true, durationMs: 900, pauseAfterMs: 200 },
};

const askMoment: StepMoment = {
  id: "golden-moment-ask",
  type: "askMove",
  body: { values: { en: "Play the correct breakthrough move.", nl: "Speel de juiste doorbraakzet." } },
  interaction: {
    kind: "askMove",
    allowRetry: true,
    maxAttempts: 3,
    expectedMoves: [{ from: 31, to: 35 }],
    wrongMessage: {
      values: {
        en: "Not quite — look for a forcing tempo on the diagonal.",
        nl: "Niet helemaal — zoek een dwingend tempo op de diagonaal.",
      },
    },
    successPolicy: "anyExpected",
  },
  illegalResponses: [
    {
      message: {
        values: {
          en: "That move is not legal in this position.",
          nl: "Die zet is hier niet legaal.",
        },
      },
    },
  ],
  constraints: {
    requireCapture: false,
    forbidBackwardMove: false,
  },
};

const summaryMoment: StepMoment = {
  id: "golden-moment-summary",
  type: "summary",
  body: {
    values: {
      en: "Tempo moves restrict the opponent before the main combination.",
      nl: "Tempozetten beperken de tegenstander vóór de hoofdcombinatie.",
    },
  },
};

/** One full step with a minimal teachable arc (intro → focus → demo → try → summary). */
export const goldenAuthoringLessonStep: AuthoringLessonStep = {
  id: stepId,
  lessonId,
  kind: "tryMove",
  orderIndex: 0,
  title: { values: { en: "Breakthrough tempo", nl: "Doorbraaktempo" } },
  initialState: {
    fen: "W:W31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50:B1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20",
    sideToMove: "white",
    variantId: "international",
    orientation: "whiteBottom",
  },
  timeline: [introMoment, focusMoment, showMoment, askMoment, summaryMoment],
  tags: ["golden-example"],
};

/** Minimal book → module → lesson pointing at the golden step. */
export const goldenAuthoringBook: LessonBook = {
  id: bookId,
  slug: "golden-authoring",
  title: { values: { en: "Golden authoring sample", nl: "Gouden authoring-voorbeeld" } },
  moduleIds: [moduleId],
};

export const goldenAuthoringModule: LessonModule = {
  id: moduleId,
  bookId,
  title: { values: { en: "Basics", nl: "Basis" } },
  orderIndex: 0,
  lessonIds: [lessonId],
};

export const goldenAuthoringLesson: LessonAuthoring = {
  id: lessonId,
  bookId,
  moduleId,
  slug: "golden-lesson",
  title: { values: { en: "Sample lesson", nl: "Voorbeeldles" } },
  entryStepId: stepId,
  stepIds: [stepId],
};
