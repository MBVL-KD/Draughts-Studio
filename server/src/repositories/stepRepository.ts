import { StepModel } from "../models/StepModel";
import { ConflictError, NotFoundError } from "../utils/httpErrors";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type StepLike = Record<string, unknown> & {
  stepId?: string;
  id?: string;
};

function withOwnerFilter(owner: OwnerContext) {
  return { ownerType: owner.ownerType, ownerId: owner.ownerId, isDeleted: false };
}

export async function getStepById(owner: OwnerContext, stepId: string) {
  return StepModel.findOne({ ...withOwnerFilter(owner), stepId }).lean();
}

export async function getStepsByLessonId(owner: OwnerContext, lessonId: string) {
  return StepModel.find({ ...withOwnerFilter(owner), lessonId })
    .sort({ orderIndex: 1 })
    .lean();
}

export async function getStepsByIds(owner: OwnerContext, stepIds: string[]) {
  if (stepIds.length === 0) return [];
  return StepModel.find({ ...withOwnerFilter(owner), stepId: { $in: stepIds } }).lean();
}

export async function getStepsByBookId(owner: OwnerContext, bookId: string) {
  return StepModel.find({ ...withOwnerFilter(owner), bookId })
    .sort({ orderIndex: 1 })
    .lean();
}

export async function createStep(owner: OwnerContext, document: StepLike) {
  const stepId = String(document.stepId ?? document.id ?? "");
  const payload = {
    ...document,
    id: stepId,
    stepId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    revision: 1,
  };
  const created = await StepModel.create(payload);
  return created.toObject();
}

export async function upsertStep(owner: OwnerContext, document: StepLike) {
  const stepId = String(document.stepId ?? document.id ?? "");
  const payload = {
    ...document,
    id: stepId,
    stepId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };
  const updated = await StepModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), stepId },
    { $set: payload },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return updated;
}

export async function patchStep(
  owner: OwnerContext,
  stepId: string,
  nextDocument: StepLike,
  expectedRevision: number
) {
  const payload = {
    ...nextDocument,
    id: stepId,
    stepId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    revision: expectedRevision + 1,
  };

  const updated = await StepModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), stepId, revision: expectedRevision },
    { $set: payload },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await StepModel.exists({ ...withOwnerFilter(owner), stepId });
    if (!exists) throw new NotFoundError("Step not found");
    throw new ConflictError("Step revision conflict");
  }
  return updated;
}

export async function softDeleteStep(owner: OwnerContext, stepId: string, actorId?: string) {
  const updated = await StepModel.findOneAndUpdate(
    { ...withOwnerFilter(owner), stepId },
    { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: actorId ?? null } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new NotFoundError("Step not found");
  return updated;
}

export async function softDeleteStepsByLessonId(
  owner: OwnerContext,
  lessonId: string,
  actorId?: string
) {
  return StepModel.updateMany(
    { ...withOwnerFilter(owner), lessonId },
    { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: actorId ?? null } }
  );
}

export async function softDeleteStepsByBookId(
  owner: OwnerContext,
  bookId: string,
  actorId?: string
) {
  return StepModel.updateMany(
    { ...withOwnerFilter(owner), bookId },
    { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: actorId ?? null } }
  );
}
