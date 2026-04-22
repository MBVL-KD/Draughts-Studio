import { randomUUID } from "crypto";
import {
  createBook,
  getBookById,
  listBooks,
  patchLessonInBook,
  patchBook,
} from "../repositories/bookRepository";
import { NotFoundError } from "../utils/httpErrors";
import { getBookAppId, getLessonAppId } from "../utils/idResolvers";
import {
  legacyImportStepToAuthoringLessonStep,
  migrateLessonLegacyStepsToAuthoringBundle,
  syncLegacyStepsFromAuthoringBundle,
} from "../import/normalize/legacyImportStepToAuthoringV2";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

export const PUZZELS_BOOK_TAG = "puzzels-import";

const MAX_COLLECTION_TITLE_LEN = 200;
const MAX_STEPS_PER_LESSON = 220;
const MAX_TOTAL_STEPS_PER_BOOK = 900;
const MAX_BOOK_BYTES_FOR_IMPORT_APPEND = 1_200_000;

/**
 * One book per owner: title "Puzzels", tagged for lookup.
 */
export async function ensurePuzzelsBook(owner: OwnerContext): Promise<string> {
  const books = await listBooks(owner, { tag: PUZZELS_BOOK_TAG, limit: 1 });
  const first = Array.isArray(books) ? books[0] : null;
  if (first && getBookAppId(first as Record<string, unknown>)) {
    return getBookAppId(first as Record<string, unknown>);
  }

  const bookId = randomUUID();
  const created = await createBook(owner, {
    id: bookId,
    bookId,
    schemaVersion: 1,
    revision: 1,
    title: {
      values: {
        en: "Puzzels",
        nl: "Puzzels",
      },
    },
    description: {
      values: {
        en: "Geïmporteerde puzzels (Slagzet). Elke les is een collectie.",
        nl: "Geïmporteerde puzzels (Slagzet). Elke les is een collectie.",
      },
    },
    status: "draft",
    tags: [PUZZELS_BOOK_TAG],
    lessons: [],
    exams: [],
  } as Record<string, unknown>);
  return getBookAppId(created as Record<string, unknown>);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function getBookTitle(book: Record<string, unknown>): string {
  const title = book.title as { values?: Record<string, string> } | undefined;
  return normalizeText(title?.values?.nl || title?.values?.en || "");
}

function countLessonSteps(lesson: Record<string, unknown>): number {
  const authoring = lesson.authoringV2 as Record<string, unknown> | undefined;
  const authoringLesson = authoring?.authoringLesson as Record<string, unknown> | undefined;
  const stepIds = Array.isArray(authoringLesson?.stepIds) ? authoringLesson.stepIds : null;
  if (stepIds) return stepIds.length;
  return Array.isArray(lesson.steps) ? lesson.steps.length : 0;
}

function countBookSteps(book: Record<string, unknown>): number {
  const lessons = Array.isArray(book.lessons) ? (book.lessons as Record<string, unknown>[]) : [];
  return lessons.reduce((sum, lesson) => sum + countLessonSteps(lesson), 0);
}

function toFiniteSequenceIndex(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function maxPuzzleBookSequenceIndex(books: Record<string, unknown>[]): number {
  let max = 0;
  for (const book of books) {
    const seq = toFiniteSequenceIndex(book.sequenceIndex);
    if (seq !== null && seq > max) max = seq;
  }
  return max;
}

function isBookWithinImportCapacity(book: Record<string, unknown>): boolean {
  const bytes = Buffer.byteLength(JSON.stringify(book));
  const steps = countBookSteps(book);
  return bytes < MAX_BOOK_BYTES_FOR_IMPORT_APPEND && steps < MAX_TOTAL_STEPS_PER_BOOK;
}

function normalizeCollectionBaseLabel(collectionTitle: string): string {
  return normalizeCollectionTitle(collectionTitle);
}

function parseCollectionPartNumber(title: string, baseLabel: string): number {
  const normalized = normalizeText(title);
  if (!normalized) return -1;
  if (normalized === baseLabel) return 1;
  const escaped = baseLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = normalized.match(new RegExp(`^${escaped}\\s+\\(part\\s+(\\d+)\\)$`, "i"));
  if (!m) return -1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : -1;
}

function buildCollectionLessonTitle(baseLabel: string, part: number): string {
  return part <= 1 ? baseLabel : `${baseLabel} (part ${part})`;
}

async function choosePuzzelsBookForAppend(owner: OwnerContext): Promise<Record<string, unknown>> {
  const books = await listBooks(owner, {
    tag: PUZZELS_BOOK_TAG,
    limit: 200,
    sort: "updatedAt_desc",
  });
  const puzzleBooks = (Array.isArray(books) ? books : []).map(
    (b) => b as unknown as Record<string, unknown>
  );
  const candidate = puzzleBooks.find((book) => isBookWithinImportCapacity(book));
  if (candidate) return candidate;

  const nextSequenceIndex = maxPuzzleBookSequenceIndex(puzzleBooks) + 1;
  const nextIndex = puzzleBooks.length + 1;
  const suffix = nextIndex <= 1 ? "" : ` ${nextIndex}`;
  const bookId = randomUUID();
  const created = await createBook(owner, {
    id: bookId,
    bookId,
    schemaVersion: 1,
    revision: 1,
    title: {
      values: {
        en: `Puzzles${suffix}`,
        nl: `Puzzels${suffix}`,
      },
    },
    description: {
      values: {
        en: "Imported puzzles (Slagzet). Split into multiple books for performance.",
        nl: "Geimporteerde puzzels (Slagzet). Opgesplitst over meerdere boeken voor performance.",
      },
    },
    status: "draft",
    sequenceIndex: nextSequenceIndex,
    tags: [PUZZELS_BOOK_TAG],
    lessons: [],
    exams: [],
  } as Record<string, unknown>);
  return created as unknown as Record<string, unknown>;
}

function normalizeCollectionTitle(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim().slice(0, MAX_COLLECTION_TITLE_LEN);
  return t.length > 0 ? t : "Collectie";
}

/**
 * Finds or creates a lesson whose title matches the collection name (en/nl).
 */
export async function ensureCollectionLesson(
  owner: OwnerContext,
  bookId: string,
  collectionTitle: string
): Promise<string> {
  const titleNorm = normalizeCollectionBaseLabel(collectionTitle);
  let book = await getBookById(owner, bookId);
  if (!book) throw new NotFoundError("Puzzels book not found");

  const lessons = Array.isArray((book as any).lessons)
    ? ([...(book as any).lessons] as Record<string, unknown>[])
    : [];

  const matchingLessons = lessons
    .map((lesson) => {
      const values = (lesson.title as { values?: Record<string, string> })?.values;
      const label = normalizeText(values?.nl || values?.en || "");
      const part = parseCollectionPartNumber(label, titleNorm);
      if (part < 1) return null;
      return { lesson, part };
    })
    .filter((row): row is { lesson: Record<string, unknown>; part: number } => !!row)
    .sort((a, b) => a.part - b.part);

  const reusable = matchingLessons.find((row) => countLessonSteps(row.lesson) < MAX_STEPS_PER_LESSON);
  if (reusable) {
    return getLessonAppId(reusable.lesson as Record<string, unknown>);
  }

  const nextPart =
    matchingLessons.length > 0
      ? matchingLessons[matchingLessons.length - 1].part + 1
      : 1;
  const lessonTitle = buildCollectionLessonTitle(titleNorm, nextPart);
  const lessonId = randomUUID();
  lessons.push({
    id: lessonId,
    lessonId,
    title: { values: { en: lessonTitle, nl: lessonTitle } },
    description: { values: { en: "", nl: "" } },
    steps: [],
    variantId: "international",
    rulesetId: "classic",
    difficulty: 1,
    estimatedMinutes: 5,
    rewards: [],
  });

  await patchBook(
    owner,
    bookId,
    {
      ...(book as Record<string, unknown>),
      lessons,
    } as Record<string, unknown>,
    Number((book as any).revision ?? 0)
  );
  return lessonId;
}

export async function appendImportedPuzzleStep(
  owner: OwnerContext,
  job: Record<string, any>,
  step: Record<string, any>
): Promise<{
  skipped?: boolean;
  skipReason?: string;
  updatedBook: Record<string, unknown>;
  updatedLesson: Record<string, unknown>;
  importedStep: Record<string, unknown>;
}> {
  const selectedBook = await choosePuzzelsBookForAppend(owner);
  const bookId = getBookAppId(selectedBook as Record<string, unknown>);
  const collectionName =
    (typeof job.collectionTitle === "string" && job.collectionTitle.trim()
      ? job.collectionTitle
      : null) ?? (typeof job.collectionSlug === "string" ? job.collectionSlug : "Collectie");

  const targetLessonId = await ensureCollectionLesson(owner, bookId, collectionName);

  const book = await getBookById(owner, bookId);
  if (!book) throw new NotFoundError("Puzzels book not found");

  const lessons = Array.isArray((book as any).lessons)
    ? ([...(book as any).lessons] as any[])
    : [];
  const lessonIndex = lessons.findIndex(
    (lesson) => getLessonAppId(lesson) === targetLessonId
  );
  if (lessonIndex < 0) throw new NotFoundError("Collection lesson not found in Puzzels book");

  const lesson = lessons[lessonIndex] ?? {};
  const nextStep = {
    ...step,
    id: step.stepId ?? step.id,
    stepId: step.stepId ?? step.id,
  };

  const legacyStepsExisting = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
  const existingAuthoring = lesson.authoringV2 as Record<string, unknown> | undefined;

  let bundle: Record<string, unknown> | undefined =
    existingAuthoring && typeof existingAuthoring === "object"
      ? {
          ...existingAuthoring,
          authoringLesson: {
            ...((existingAuthoring.authoringLesson as Record<string, unknown>) ?? {}),
          },
          stepsById: {
            ...((existingAuthoring.stepsById as Record<string, unknown>) ?? {}),
          },
        }
      : undefined;

  if (!bundle && legacyStepsExisting.length > 0) {
    const migrated = migrateLessonLegacyStepsToAuthoringBundle(
      { ...lesson, steps: legacyStepsExisting },
      bookId
    );
    if (migrated) bundle = migrated;
  }

  const nextOrderIndexForAuthoring = bundle
    ? (() => {
        const al = bundle.authoringLesson as Record<string, unknown> | undefined;
        const ids = Array.isArray(al?.stepIds) ? (al.stepIds as string[]) : [];
        return ids.length;
      })()
    : 0;

  const authoringStep = legacyImportStepToAuthoringLessonStep({
    step: nextStep,
    lessonId: targetLessonId,
    orderIndex: nextOrderIndexForAuthoring,
  });
  if (!authoringStep) {
    return {
      skipped: true,
      skipReason: "No valid slagzet sequence found; item skipped.",
      updatedBook: book as Record<string, unknown>,
      updatedLesson: lesson as Record<string, unknown>,
      importedStep: nextStep as Record<string, unknown>,
    };
  }
  const authStepId = String(authoringStep.id);

  if (!bundle) {
    bundle = {
      authoringLesson: {
        id: targetLessonId,
        bookId,
        slug: `lesson-${targetLessonId}`,
        title: lesson.title ?? { values: { en: "", nl: "" } },
        description: lesson.description ?? { values: { en: "", nl: "" } },
        entryStepId: authStepId,
        stepIds: [authStepId],
      },
      stepsById: { [authStepId]: authoringStep },
      branchesById: {},
    };
  } else {
    const al = { ...((bundle.authoringLesson as Record<string, unknown>) ?? {}) };
    const stepIds = [...(Array.isArray(al.stepIds) ? (al.stepIds as string[]) : [])];
    const stepsById = { ...((bundle.stepsById as Record<string, unknown>) ?? {}) };
    stepIds.push(authStepId);
    stepsById[authStepId] = authoringStep;
    if (!al.entryStepId && stepIds[0]) {
      al.entryStepId = stepIds[0];
    }
    bundle = {
      ...bundle,
      authoringLesson: { ...al, stepIds },
      stepsById,
      branchesById:
        bundle.branchesById && typeof bundle.branchesById === "object"
          ? bundle.branchesById
          : {},
    };
  }

  const syncedSteps = syncLegacyStepsFromAuthoringBundle(bundle);

  const updatedLesson = {
    ...lesson,
    authoringV2: bundle,
    steps: syncedSteps,
  };
  lessons[lessonIndex] = updatedLesson;

  let updatedBook: Record<string, unknown>;
  try {
    updatedBook = (await patchLessonInBook(
      owner,
      bookId,
      targetLessonId,
      updatedLesson as Record<string, unknown>,
      Number((book as any).revision ?? 0)
    )) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("positional operator did not find the match")) {
      throw error;
    }
    // Rare race/shape edge-case: fallback to full patch to keep import moving.
    updatedBook = (await patchBook(
      owner,
      bookId,
      {
        ...(book as any),
        lessons,
      },
      Number((book as any).revision ?? 0)
    )) as Record<string, unknown>;
  }

  const importedStub =
    syncedSteps.find(
      (s) =>
        String((s as Record<string, unknown>).id) === authStepId ||
        String((s as Record<string, unknown>).stepId) === authStepId
    ) ?? (syncedSteps[syncedSteps.length - 1] as Record<string, unknown>);

  return {
    updatedBook: updatedBook as Record<string, unknown>,
    updatedLesson: updatedLesson as Record<string, unknown>,
    importedStep: importedStub,
  };
}
