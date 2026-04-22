import { BookModel } from "../models/BookModel";
import { ensureCanonicalIdPair } from "../utils/canonicalIds";
import { getBookAppId, getLessonAppId, getStepAppId } from "../utils/idResolvers";
import { ConflictError, NotFoundError, ValidationError } from "../utils/httpErrors";
import { estimateJsonBytes, warnIfBookCounts, warnIfLargeDocument } from "../utils/sizeGuards";
import { validateBookForDraftSave } from "../validation/saveValidators";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type ListQuery = {
  search?: string;
  status?: string;
  tag?: string;
  includeImport?: boolean;
  compactImport?: boolean;
  limit?: number;
  offset?: number;
  sort?: "updatedAt_desc" | "updatedAt_asc";
};

const PUZZELS_IMPORT_TAG = "puzzels-import";

type LessonLike = {
  id?: string;
  lessonId?: string;
  steps?: StepLike[];
};

type StepLike = {
  id?: string;
  stepId?: string;
};

type BookLike = {
  id?: string;
  bookId?: string;
  lessons?: LessonLike[];
  [key: string]: unknown;
};

function clampPagination(query?: ListQuery) {
  const defaultLimit = 25;
  const maxLimit = 100;
  const rawLimit = query?.limit ?? defaultLimit;
  const rawOffset = query?.offset ?? 0;
  const limit = Math.max(1, Math.min(maxLimit, rawLimit));
  const offset = Math.max(0, rawOffset);
  return { limit, offset };
}

function countSteps(lessons: LessonLike[] = []): number {
  return lessons.reduce((sum, lesson) => sum + (lesson.steps?.length ?? 0), 0);
}

function normalizeCreateDocument(input: BookLike): BookLike {
  const canonical = ensureCanonicalIdPair(input, "bookId");
  return {
    ...canonical,
    id: getBookAppId(canonical),
    bookId: getBookAppId(canonical),
  };
}

function normalizeReplacementDocument(input: BookLike, bookId: string): BookLike {
  const normalized = ensureCanonicalIdPair(input, "bookId");
  return {
    ...normalized,
    id: bookId,
    bookId,
  };
}

function withOwnerFilter(owner: OwnerContext) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    isDeleted: false,
  };
}

export async function getBookById(owner: OwnerContext, bookId: string) {
  return BookModel.findOne({
    ...withOwnerFilter(owner),
    bookId,
  }).lean();
}

export async function listBooks(owner: OwnerContext, query?: ListQuery) {
  const { limit, offset } = clampPagination(query);
  const baseFilter: Record<string, unknown> = {
    ...withOwnerFilter(owner),
  };

  if (query?.status) baseFilter.status = query.status;
  if (query?.search?.trim()) {
    baseFilter.$or = [
      { "title.values.en": { $regex: query.search, $options: "i" } },
      { "title.values.nl": { $regex: query.search, $options: "i" } },
    ];
  }

  const sort = query?.sort === "updatedAt_asc" ? { updatedAt: 1 } : { updatedAt: -1 };

  if (query?.tag) {
    return BookModel.find({ ...baseFilter, tags: query.tag })
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .lean();
  }

  if (query?.includeImport !== true) {
    return BookModel.find({ ...baseFilter, tags: { $nin: [PUZZELS_IMPORT_TAG] } })
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .lean();
  }

  if (query?.compactImport === true) {
    const [normalBooks, importBooksCompact] = await Promise.all([
      BookModel.find({ ...baseFilter, tags: { $nin: [PUZZELS_IMPORT_TAG] } }).lean(),
      BookModel.find({ ...baseFilter, tags: PUZZELS_IMPORT_TAG })
        .select("-lessons -exams")
        .lean(),
    ]);
    const merged = [...normalBooks, ...importBooksCompact].sort((a, b) => {
      const at = new Date((a as Record<string, unknown>).updatedAt as string).getTime();
      const bt = new Date((b as Record<string, unknown>).updatedAt as string).getTime();
      return sort.updatedAt === 1 ? at - bt : bt - at;
    });
    return merged.slice(offset, offset + limit);
  }

  return BookModel.find(baseFilter).sort(sort).skip(offset).limit(limit).lean();
}

export async function createBook(owner: OwnerContext, document: BookLike) {
  const normalized = normalizeCreateDocument(document);
  const payload: BookLike = {
    ...normalized,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };

  const draftValidation = validateBookForDraftSave(payload);
  if (!draftValidation.ok) {
    throw new ValidationError("Book draft validation failed", draftValidation.issues);
  }

  const bytes = estimateJsonBytes(payload);
  warnIfLargeDocument("book", getBookAppId(payload), bytes);
  warnIfBookCounts(getBookAppId(payload), {
    lessons: payload.lessons?.length ?? 0,
    steps: countSteps(payload.lessons),
  });

  const created = await BookModel.create(payload);
  return created.toObject();
}

export async function patchBook(
  owner: OwnerContext,
  bookId: string,
  nextDocument: BookLike,
  expectedRevision: number
) {
  const replacement = normalizeReplacementDocument(nextDocument, bookId);
  const payload: BookLike = {
    ...replacement,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    revision: expectedRevision + 1,
  };

  const draftValidation = validateBookForDraftSave(payload);
  if (!draftValidation.ok) {
    throw new ValidationError("Book draft validation failed", draftValidation.issues);
  }

  const bytes = estimateJsonBytes(payload);
  warnIfLargeDocument("book", bookId, bytes);
  warnIfBookCounts(bookId, {
    lessons: payload.lessons?.length ?? 0,
    steps: countSteps(payload.lessons),
  });

  const updated = await BookModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      bookId,
      revision: expectedRevision,
    },
    { $set: payload },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await BookModel.exists({
      ...withOwnerFilter(owner),
      bookId,
    });
    if (!exists) throw new NotFoundError("Book not found");
    throw new ConflictError("Book revision conflict");
  }

  return updated;
}

export async function softDeleteBook(
  owner: OwnerContext,
  bookId: string,
  actorId?: string
) {
  const updated = await BookModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      bookId,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: actorId ?? null,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) throw new NotFoundError("Book not found");
  return updated;
}

export async function getLessonByIdWithinBook(
  owner: OwnerContext,
  bookId: string,
  lessonId: string
) {
  const book = await getBookById(owner, bookId);
  if (!book) return null;
  const lessons = (book.lessons ?? []) as LessonLike[];
  const lesson = lessons.find((item) => getLessonAppId(item) === lessonId) ?? null;
  return {
    book,
    lesson,
  };
}

export async function updateStepInBook(
  owner: OwnerContext,
  bookId: string,
  lessonId: string,
  stepId: string,
  updater: (step: StepLike) => StepLike,
  expectedRevision: number
) {
  const book = await getBookById(owner, bookId);
  if (!book) throw new NotFoundError("Book not found");

  const lessons = ((book.lessons ?? []) as LessonLike[]).map((lesson) => {
    if (getLessonAppId(lesson) !== lessonId) return lesson;
    const nextSteps = (lesson.steps ?? []).map((step) =>
      getStepAppId(step) === stepId ? updater(step) : step
    );
    return {
      ...lesson,
      steps: nextSteps,
    };
  });

  return patchBook(
    owner,
    bookId,
    {
      ...(book as BookLike),
      lessons,
    },
    expectedRevision
  );
}

export async function patchLessonInBook(
  owner: OwnerContext,
  bookId: string,
  lessonId: string,
  nextLesson: Record<string, unknown>,
  expectedRevision: number
) {
  const updated = await BookModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      bookId,
      revision: expectedRevision,
      $or: [{ "lessons.lessonId": lessonId }, { "lessons.id": lessonId }],
    },
    {
      $set: {
        "lessons.$": nextLesson,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await BookModel.exists({
      ...withOwnerFilter(owner),
      bookId,
    });
    if (!exists) throw new NotFoundError("Book not found");
    throw new ConflictError("Book revision conflict");
  }

  return updated;
}

export async function findStepRef(owner: OwnerContext, stepId: string) {
  const books = await BookModel.find({
    ...withOwnerFilter(owner),
  }).lean();

  for (const book of books) {
    const lessons = (book.lessons ?? []) as LessonLike[];
    for (const lesson of lessons) {
      const steps = lesson.steps ?? [];
      for (const step of steps) {
        if (getStepAppId(step) !== stepId) continue;
        return {
          book,
          lesson,
          step,
          bookId: getBookAppId(book as unknown as BookLike),
          lessonId: getLessonAppId(lesson),
          stepId: getStepAppId(step),
        };
      }
    }
  }

  return null;
}

