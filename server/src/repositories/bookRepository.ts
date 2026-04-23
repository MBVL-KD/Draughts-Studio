import { BookModel } from "../models/BookModel";
import { ensureCanonicalIdPair } from "../utils/canonicalIds";
import { getBookAppId } from "../utils/idResolvers";
import { ConflictError, NotFoundError, ValidationError } from "../utils/httpErrors";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type ListQuery = {
  search?: string;
  status?: string;
  tag?: string;
  excludeTag?: string;
  limit?: number;
  offset?: number;
  sort?: "updatedAt_desc" | "updatedAt_asc";
};

type BookLike = {
  id?: string;
  bookId?: string;
  lessonIds?: string[];
  [key: string]: unknown;
};

function clampPagination(query?: ListQuery) {
  const limit = Math.max(1, Math.min(100, query?.limit ?? 25));
  const offset = Math.max(0, query?.offset ?? 0);
  return { limit, offset };
}

function withOwnerFilter(owner: OwnerContext) {
  return { ownerType: owner.ownerType, ownerId: owner.ownerId, isDeleted: false };
}

function normalizeCreateDocument(input: BookLike): BookLike {
  const canonical = ensureCanonicalIdPair(input, "bookId");
  return { ...canonical, id: getBookAppId(canonical), bookId: getBookAppId(canonical) };
}

function normalizeReplacementDocument(input: BookLike, bookId: string): BookLike {
  const normalized = ensureCanonicalIdPair(input, "bookId");
  return { ...normalized, id: bookId, bookId };
}

export async function getBookById(owner: OwnerContext, bookId: string) {
  return BookModel.findOne({ ...withOwnerFilter(owner), bookId }).lean();
}

export async function listBooks(owner: OwnerContext, query?: ListQuery) {
  const { limit, offset } = clampPagination(query);
  const filter: Record<string, unknown> = { ...withOwnerFilter(owner) };

  if (query?.status) filter.status = query.status;
  if (query?.tag) filter.tags = query.tag;
  if (query?.excludeTag) filter.tags = { $nin: [query.excludeTag] };
  if (query?.search?.trim()) {
    filter.$or = [
      { "title.values.en": { $regex: query.search, $options: "i" } },
      { "title.values.nl": { $regex: query.search, $options: "i" } },
    ];
  }

  const sort = query?.sort === "updatedAt_asc" ? { updatedAt: 1 } : { updatedAt: -1 };
  return BookModel.find(filter).sort(sort).skip(offset).limit(limit).lean();
}

export async function createBook(owner: OwnerContext, document: BookLike) {
  const normalized = normalizeCreateDocument(document);
  const payload: BookLike = { ...normalized, ownerType: owner.ownerType, ownerId: owner.ownerId };

  if (!payload.bookId) {
    throw new ValidationError("Book validation failed", [
      { path: "bookId", code: "bookId.required", message: "bookId is required", severity: "error" },
    ]);
  }

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

  const updated = await BookModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), bookId, revision: expectedRevision },
    { $set: payload },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await BookModel.exists({ ...withOwnerFilter(owner), bookId });
    if (!exists) throw new NotFoundError("Book not found");
    throw new ConflictError("Book revision conflict");
  }
  return updated;
}

export async function appendLessonIdToBook(
  owner: OwnerContext,
  bookId: string,
  lessonId: string,
  expectedRevision: number
) {
  const updated = await BookModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), bookId, revision: expectedRevision },
    { $push: { lessonIds: lessonId }, $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await BookModel.exists({ ...withOwnerFilter(owner), bookId });
    if (!exists) throw new NotFoundError("Book not found");
    throw new ConflictError("Book revision conflict");
  }
  return updated;
}

export async function removeLessonIdFromBook(
  owner: OwnerContext,
  bookId: string,
  lessonId: string,
  expectedRevision: number
) {
  const updated = await BookModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), bookId, revision: expectedRevision },
    { $pull: { lessonIds: lessonId }, $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await BookModel.exists({ ...withOwnerFilter(owner), bookId });
    if (!exists) throw new NotFoundError("Book not found");
    throw new ConflictError("Book revision conflict");
  }
  return updated;
}

export async function softDeleteBook(owner: OwnerContext, bookId: string, actorId?: string) {
  const updated = await BookModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), bookId },
    { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: actorId ?? null } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new NotFoundError("Book not found");
  return updated;
}
