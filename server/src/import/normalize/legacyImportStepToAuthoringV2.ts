import { randomUUID } from "crypto";
import { resolveNotationLineToStructuredMovesDetailed } from "../../playback/resolveNotationLineToStructuredMoves";

function parseNotationPath(notation: string): number[] | null {
  const cleaned = String(notation ?? "").trim();
  if (!cleaned) return null;
  const path = cleaned
    .split(/[-x]/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  if (path.length < 2) return null;
  for (const n of path) {
    if (n < 1 || n > 50) return null;
  }
  return path;
}

function notationToExpectedMoveSpec(notation: string): Record<string, unknown> | null {
  const cleaned = String(notation ?? "").trim();
  const path = parseNotationPath(cleaned);
  if (!path || path.length < 2) return null;

  // Slagzet import format for captures: "from-to-captured1-captured2-..."
  // (with '-' only, no x). In this format the second token is the final landing square.
  if (!cleaned.includes("x") && path.length >= 3) {
    const from = path[0] as number;
    const to = path[1] as number;
    const captures = path.slice(2);
    return captures.length > 0 ? { from, to, captures } : { from, to };
  }

  const from = path[0] as number;
  const to = path[path.length - 1] as number;
  const spec: Record<string, unknown> = { from, to };
  if (path.length > 2) spec.path = path;
  return spec;
}

function asLocalized(values: unknown): { values: Record<string, string> } {
  if (values && typeof values === "object" && "values" in (values as object)) {
    const v = (values as { values?: Record<string, string> }).values;
    if (v && typeof v === "object") {
      return { values: { en: v.en ?? "", nl: v.nl ?? "" } };
    }
  }
  return { values: { en: "", nl: "" } };
}

function extractMovesFromLegacyStep(step: Record<string, unknown>): string[] {
  const validation = step.validation as Record<string, unknown> | undefined;
  const raw = validation?.moves;
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => String(m).trim()).filter(Boolean);
}

function resolveExpectedSequenceWithEngine(
  initialFen: string,
  notations: string[]
): Record<string, unknown>[] {
  const fen = String(initialFen ?? "").trim();
  const list = notations.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (!fen || list.length === 0) return [];
  const detailed = resolveNotationLineToStructuredMovesDetailed(fen, list);
  if (!detailed.ok || detailed.moves.length !== list.length) return [];
  return detailed.moves.map((m) => ({
    from: m.from,
    to: m.to,
    path: m.path,
    captures: m.captures,
  }));
}

/**
 * Builds an authoring-v2 step from a post-scan Slagzet legacy import step.
 */
export function legacyImportStepToAuthoringLessonStep(input: {
  step: Record<string, unknown>;
  lessonId: string;
  orderIndex: number;
}): Record<string, unknown> | null {
  const { step, lessonId, orderIndex } = input;
  const id = String(step.id ?? step.stepId ?? randomUUID());
  const initialState = step.initialState as Record<string, unknown> | undefined;
  const fen = String(initialState?.fen ?? "");
  const sideToMove =
    initialState?.sideToMove === "black" || initialState?.sideToMove === "white"
      ? initialState.sideToMove
      : "white";

  const moves = extractMovesFromLegacyStep(step);
  const resolvedExpected = resolveExpectedSequenceWithEngine(fen, moves);
  const expectedSequence =
    resolvedExpected.length === moves.length && resolvedExpected.length > 0
      ? resolvedExpected
      : moves
          .map((n) => notationToExpectedMoveSpec(n))
          .filter((s): s is Record<string, unknown> => !!s);

  const title = asLocalized(step.title);
  const prompt = asLocalized(step.prompt);
  const hint = asLocalized(step.hint);

  const sourceRefRaw = step.sourceRef as Record<string, unknown> | undefined;
  const sourceId =
    typeof sourceRefRaw?.sourceId === "string" ? sourceRefRaw.sourceId : undefined;

  const puzzleMeta = step.puzzleMeta;
  const runtimeHints =
    step.runtimeHints && typeof step.runtimeHints === "object"
      ? { ...(step.runtimeHints as Record<string, unknown>) }
      : undefined;

  const tags = Array.isArray(step.tags) ? [...step.tags] : [];

  const introId = randomUUID();
  const askId = randomUUID();

  const introMoment: Record<string, unknown> = {
    id: introId,
    type: "introText",
    title: { values: { en: "Puzzle", nl: "Puzzel" } },
    body: prompt,
    timing: { waitForUser: true },
  };

  if (expectedSequence.length === 0) return null;

  const askMoment: Record<string, unknown> = {
    id: askId,
    type: "askSequence",
    body: prompt,
    interaction: {
      kind: "askSequence",
      requireExactOrder: true,
      allowRetry: true,
      maxAttempts: 1,
      expectedSequence,
      sequenceHintMessage: hint.values?.en || hint.values?.nl ? hint : undefined,
    },
  };

  return {
    id,
    lessonId,
    kind: "trySequence",
    orderIndex,
    title,
    initialState: {
      fen,
      sideToMove,
      variantId: "international",
    },
    sourceRef: sourceId ? { sourceId } : undefined,
    tags,
    puzzleMeta,
    runtimeHints,
    metadata: {
      slagzetImport: {
        importedAt:
          typeof sourceRefRaw?.importedAt === "string" ? sourceRefRaw.importedAt : undefined,
        snapshotFen: typeof sourceRefRaw?.snapshotFen === "string" ? sourceRefRaw.snapshotFen : fen,
      },
    },
    timeline: [introMoment, askMoment],
  };
}

/** Minimal legacy row aligned with client `authoringLessonStepToLegacyStub`. */
export function authoringLessonStepToLegacyStubRecord(
  authoring: Record<string, unknown>
): Record<string, unknown> {
  const id = String(authoring.id ?? randomUUID());
  const init = (authoring.initialState as Record<string, unknown> | undefined) ?? {};
  const fen = String(init.fen ?? "");
  const sideToMove = init.sideToMove === "black" ? "black" : "white";
  const title = asLocalized(authoring.title ?? authoring.shortTitle);
  const tags = Array.isArray(authoring.tags) ? [...authoring.tags] : undefined;
  const puzzleMeta = authoring.puzzleMeta;
  const runtimeHints =
    authoring.runtimeHints && typeof authoring.runtimeHints === "object"
      ? { ...(authoring.runtimeHints as Record<string, unknown>) }
      : undefined;

  const meta = authoring.metadata as Record<string, unknown> | undefined;
  const slag = meta?.slagzetImport as Record<string, unknown> | undefined;
  const sourceRefAuth = authoring.sourceRef as Record<string, unknown> | undefined;
  const sourceId = typeof sourceRefAuth?.sourceId === "string" ? sourceRefAuth.sourceId : "";
  const legacySourceRef =
    sourceId || slag
      ? {
          sourceId,
          lineMode: "custom",
          ...(typeof slag?.importedAt === "string" ? { importedAt: slag.importedAt } : {}),
          ...(typeof slag?.snapshotFen === "string" ? { snapshotFen: slag.snapshotFen } : {}),
        }
      : undefined;

  return {
    id,
    stepId: id,
    type: "explain",
    title,
    prompt: { values: { en: "", nl: "" } },
    hint: { values: { en: "", nl: "" } },
    explanation: { values: { en: "", nl: "" } },
    initialState: { fen, sideToMove },
    presentation: {
      highlights: [],
      arrows: [],
      routes: [],
      animations: [],
      npc: {
        npcId: "",
        text: { values: { en: "", nl: "" } },
        mode: "bubble",
      },
      autoplay: {
        moves: [],
        moveDurationMs: 900,
        startDelayMs: 300,
        autoPlayOnStepOpen: false,
      },
    },
    validation: { type: "none" },
    feedback: {
      correct: { values: { en: "Correct.", nl: "Goed." } },
      incorrect: { values: { en: "Try again.", nl: "Probeer opnieuw." } },
    },
    analytics: { tags: [] },
    examBehavior: { disableHints: false, maxAttempts: undefined },
    orderIndex: authoring.orderIndex,
    tags,
    puzzleMeta,
    runtimeHints,
    sourceRef: legacySourceRef,
  };
}

function sortLegacySteps(steps: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...steps].sort((a, b) => {
    const ai = Number(a.orderIndex);
    const bi = Number(b.orderIndex);
    const aOk = Number.isFinite(ai);
    const bOk = Number.isFinite(bi);
    if (aOk && bOk && ai !== bi) return ai - bi;
    return 0;
  });
}

/**
 * When a lesson has legacy steps but no authoring bundle yet, infer authoring v2
 * so imports and the studio share one model.
 */
export function migrateLessonLegacyStepsToAuthoringBundle(
  lesson: Record<string, unknown>,
  bookId: string
): Record<string, unknown> | null {
  const rawSteps = Array.isArray(lesson.steps) ? (lesson.steps as Record<string, unknown>[]) : [];
  if (rawSteps.length === 0) return null;

  const lessonId = String(lesson.lessonId ?? lesson.id ?? "");
  if (!lessonId) return null;

  const ordered = sortLegacySteps(rawSteps);
  const stepIds: string[] = [];
  const stepsById: Record<string, unknown> = {};

  ordered.forEach((legacyStep, index) => {
    const a = legacyImportStepToAuthoringLessonStep({
      step: legacyStep,
      lessonId,
      orderIndex: index,
    });
    if (!a) return;
    const sid = String(a.id);
    stepIds.push(sid);
    stepsById[sid] = a;
  });
  if (stepIds.length === 0) return null;

  const title = asLocalized(lesson.title);
  const description = asLocalized(lesson.description);

  return {
    authoringLesson: {
      id: lessonId,
      bookId,
      slug: `lesson-${lessonId}`,
      title,
      description,
      entryStepId: stepIds[0] ?? lessonId,
      stepIds,
    },
    stepsById,
    branchesById: {},
  };
}

export function syncLegacyStepsFromAuthoringBundle(bundle: Record<string, unknown>): Record<string, unknown>[] {
  const al = bundle.authoringLesson as Record<string, unknown> | undefined;
  const stepIds = Array.isArray(al?.stepIds) ? (al.stepIds as string[]) : [];
  const stepsById = (bundle.stepsById as Record<string, unknown> | undefined) ?? {};
  return stepIds.map((sid) => {
    const a = stepsById[sid];
    return a
      ? authoringLessonStepToLegacyStubRecord(a as Record<string, unknown>)
      : authoringLessonStepToLegacyStubRecord({ id: sid, initialState: {} });
  });
}
