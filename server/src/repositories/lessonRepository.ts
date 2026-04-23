import { LessonModel } from "../models/LessonModel";
import { ConflictError, NotFoundError } from "../utils/httpErrors";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type LessonLike = Record<string, unknown> & {
  lessonId?: string;
  id?: string;
};

function withOwnerFilter(owner: OwnerContext) {
  return { ownerType: owner.ownerType, ownerId: owner.ownerId, isDeleted: false };
}

export async function getLessonById(owner: OwnerContext, lessonId: string) {
  return LessonModel.findOne({ ...withOwnerFilter(owner), lessonId }).lean();
}

export async function getLessonsByBookId(owner: OwnerContext, bookId: string) {
  return LessonModel.find({ ...withOwnerFilter(owner), bookId }).lean();
}

export async function getLessonsByIds(owner: OwnerContext, lessonIds: string[]) {
  if (lessonIds.length === 0) return [];
  return LessonModel.find({ ...withOwnerFilter(owner), lessonId: { $in: lessonIds } }).lean();
}

export async function createLesson(owner: OwnerContext, document: LessonLike) {
  const lessonId = String(document.lessonId ?? document.id ?? "");
  const payload = {
    ...document,
    id: lessonId,
    lessonId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    revision: 1,
  };
  const created = await LessonModel.create(payload);
  return created.toObject();
}

export async function upsertLesson(owner: OwnerContext, document: LessonLike) {
  const lessonId = String(document.lessonId ?? document.id ?? "");
  const payload = {
    ...document,
    id: lessonId,
    lessonId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };
  const updated = await LessonModel.findOneAndUpdate(
    { ownerType: owner.ownerType, ownerId: owner.ownerId, lessonId },
    { $set: payload },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return updated;
}

export async function patchLesson(
  owner: OwnerContext,
  lessonId: string,
  nextDocument: LessonLike,
  expectedRevision: number
) {
  const payload = {
    ...nextDocument,
    id: lessonId,
    lessonId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    revision: expectedRevision + 1,
  };

  const updated = await LessonModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), lessonId, revision: expectedRevision },
    { $set: payload },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await LessonModel.exists({ ...withOwnerFilter(owner), lessonId });
    if (!exists) throw new NotFoundError("Lesson not found");
    throw new ConflictError("Lesson revision conflict");
  }
  return updated;
}

export async function appendStepIdToLesson(
  owner: OwnerContext,
  lessonId: string,
  stepId: string,
  expectedRevision: number
) {
  const updated = await LessonModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), lessonId, revision: expectedRevision },
    {
      $push: { stepIds: stepId },
      $inc: { revision: 1 },
      $set: { updatedAt: new Date() },
      $setOnInsert: { entryStepId: stepId },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await LessonModel.exists({ ...withOwnerFilter(owner), lessonId });
    if (!exists) throw new NotFoundError("Lesson not found");
    throw new ConflictError("Lesson revision conflict");
  }
  // Set entryStepId if this was the first step
  if (Array.isArray(updated.stepIds) && updated.stepIds.length === 1 && !updated.entryStepId) {
    return LessonModel.findOneAndUpdate(
      { ...withOwnerFilter(owner), lessonId },
      { $set: { entryStepId: stepId } },
      { returnDocument: "after" }
    ).lean();
  }
  return updated;
}

export async function removeStepIdFromLesson(
  owner: OwnerContext,
  lessonId: string,
  stepId: string,
  expectedRevision: number
) {
  const updated = await LessonModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), lessonId, revision: expectedRevision },
    { $pull: { stepIds: stepId }, $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await LessonModel.exists({ ...withOwnerFilter(owner), lessonId });
    if (!exists) throw new NotFoundError("Lesson not found");
    throw new ConflictError("Lesson revision conflict");
  }
  return updated;
}

export async function softDeleteLesson(owner: OwnerContext, lessonId: string, actorId?: string) {
  const updated = await LessonModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), lessonId },
    { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: actorId ?? null } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new NotFoundError("Lesson not found");
  return updated;
}

export async function softDeleteLessonsByBookId(
  owner: OwnerContext,
  bookId: string,
  actorId?: string
) {
  return LessonModel.updateMany(
    { ...withOwnerFilter(owner), bookId },
    { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: actorId ?? null } }
  );
}

export async function countLessonSteps(owner: OwnerContext, lessonId: string): Promise<number> {
  const lesson = await LessonModel.findOne(
    { ...withOwnerFilter(owner), lessonId },
    { stepIds: 1 }
  ).lean();
  return Array.isArray(lesson?.stepIds) ? lesson.stepIds.length : 0;
}

export async function countBookSteps(owner: OwnerContext, bookId: string): Promise<number> {
  const lessons = await LessonModel.find(
    { ...withOwnerFilter(owner), bookId },
    { stepIds: 1 }
  ).lean();
  return lessons.reduce((sum, l) => sum + (Array.isArray(l.stepIds) ? l.stepIds.length : 0), 0);
}
