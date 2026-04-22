import { PlaybackStepModel } from "../models/PlaybackStepModel";
import { getLessonAppId, getStepAppId } from "../utils/idResolvers";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type BookLike = Record<string, unknown> & {
  bookId?: string;
  id?: string;
  revision?: number;
  lessons?: unknown[];
};

type LessonLike = Record<string, unknown> & {
  lessonId?: string;
  id?: string;
  steps?: unknown[];
  variantId?: string;
  authoringV2?: unknown;
};

type StepLike = Record<string, unknown> & {
  stepId?: string;
  id?: string;
};

function ownerFilter(owner: OwnerContext) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };
}

function normalizeOrderedStepIds(lesson: LessonLike, steps: StepLike[]): string[] {
  const bundle = lesson.authoringV2 as
    | {
        authoringLesson?: { stepIds?: unknown[] };
      }
    | undefined;
  const authoringStepIds = Array.isArray(bundle?.authoringLesson?.stepIds)
    ? bundle!.authoringLesson!.stepIds!.filter((id): id is string => typeof id === "string")
    : [];
  if (authoringStepIds.length > 0) return authoringStepIds;
  return steps.map((step) => getStepAppId(step));
}

function buildLessonStepDocs(
  owner: OwnerContext,
  bookId: string,
  bookRevision: number,
  lesson: LessonLike
) {
  const lessonId = getLessonAppId(lesson);
  const steps = (Array.isArray(lesson.steps) ? lesson.steps : []) as StepLike[];
  const orderedStepIds = normalizeOrderedStepIds(lesson, steps);
  const authoringBundle = lesson.authoringV2 as
    | {
        stepsById?: Record<string, unknown>;
      }
    | undefined;
  const docs = [];
  for (const step of steps) {
    const stepId = getStepAppId(step);
    if (!stepId) continue;
    docs.push({
      id: `${owner.ownerType}:${owner.ownerId}:${bookId}:${lessonId}:${stepId}`,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      bookId,
      lessonId,
      stepId,
      bookRevision,
      variantId: typeof lesson.variantId === "string" ? lesson.variantId : null,
      step: step as Record<string, unknown>,
      authoringStep:
        (authoringBundle?.stepsById?.[stepId] as Record<string, unknown> | undefined) ?? null,
      orderedStepIds,
    });
  }
  return { lessonId, docs };
}

export async function replacePlaybackStepsForLesson(
  owner: OwnerContext,
  bookId: string,
  bookRevision: number,
  lesson: LessonLike
) {
  const { lessonId, docs } = buildLessonStepDocs(owner, bookId, bookRevision, lesson);
  await PlaybackStepModel.deleteMany({
    ...ownerFilter(owner),
    bookId,
    lessonId,
  });
  if (docs.length > 0) {
    await PlaybackStepModel.insertMany(docs, { ordered: false });
  }
}

export async function replacePlaybackStepsForBook(owner: OwnerContext, book: BookLike) {
  const bookId = String(book.bookId ?? book.id ?? "").trim();
  if (!bookId) return;
  const bookRevision = Number.isFinite(Number(book.revision)) ? Number(book.revision) : 1;
  const lessons = (Array.isArray(book.lessons) ? book.lessons : []) as LessonLike[];
  await PlaybackStepModel.deleteMany({
    ...ownerFilter(owner),
    bookId,
  });
  const docs = lessons.flatMap((lesson) => buildLessonStepDocs(owner, bookId, bookRevision, lesson).docs);
  if (docs.length > 0) {
    await PlaybackStepModel.insertMany(docs, { ordered: false });
  }
}

export async function findIndexedPlaybackStepByContext(
  owner: OwnerContext,
  bookId: string,
  lessonId: string,
  stepId: string
) {
  return PlaybackStepModel.findOne({
    ...ownerFilter(owner),
    bookId,
    lessonId,
    stepId,
  }).lean();
}

export async function findIndexedPlaybackStepByStepId(owner: OwnerContext, stepId: string) {
  return PlaybackStepModel.findOne({
    ...ownerFilter(owner),
    stepId,
  }).lean();
}

export async function removePlaybackStepsByBook(owner: OwnerContext, bookId: string) {
  await PlaybackStepModel.deleteMany({
    ...ownerFilter(owner),
    bookId,
  });
}
