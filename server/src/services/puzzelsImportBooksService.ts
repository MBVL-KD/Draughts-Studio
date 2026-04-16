import { randomUUID } from "crypto";
import {
  createBook,
  getBookById,
  listBooks,
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
  const titleNorm = normalizeCollectionTitle(collectionTitle);
  let book = await getBookById(owner, bookId);
  if (!book) throw new NotFoundError("Puzzels book not found");

  const lessons = Array.isArray((book as any).lessons)
    ? ([...(book as any).lessons] as Record<string, unknown>[])
    : [];

  const existing = lessons.find((l) => {
    const values = (l.title as { values?: Record<string, string> })?.values;
    const en = values?.en?.trim();
    const nl = values?.nl?.trim();
    return en === titleNorm || nl === titleNorm;
  });
  if (existing) {
    return getLessonAppId(existing as Record<string, unknown>);
  }

  const lessonId = randomUUID();
  lessons.push({
    id: lessonId,
    lessonId,
    title: { values: { en: titleNorm, nl: titleNorm } },
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
  const bookId = await ensurePuzzelsBook(owner);
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

  const updatedBook = await patchBook(
    owner,
    bookId,
    {
      ...(book as any),
      lessons,
    },
    Number((book as any).revision ?? 0)
  );

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
