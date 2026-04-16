import { ImportJobModel } from "../models/ImportJobModel";
import type { ImportJob, ImportJobStatus } from "../types/importTypes";
import { ensureImportJobCanonicalIds } from "../utils/importCanonicalIds";
import { ConflictError, NotFoundError, ValidationError } from "../utils/httpErrors";
import { estimateJsonBytes, warnIfLargeDocument } from "../utils/sizeGuards";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type ListImportJobsQuery = {
  status?: ImportJobStatus;
  limit?: number;
  offset?: number;
  sort?: "updatedAt_desc" | "updatedAt_asc";
};

type ProgressUpdate = {
  processedItemsInc?: number;
  successfulItemsInc?: number;
  failedItemsInc?: number;
  currentIndex?: number;
};

function withOwnerFilter(owner: OwnerContext) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    isDeleted: false,
  };
}

function clampPagination(query?: ListImportJobsQuery) {
  const defaultLimit = 25;
  const maxLimit = 100;
  const rawLimit = query?.limit ?? defaultLimit;
  const rawOffset = query?.offset ?? 0;
  const limit = Math.max(1, Math.min(maxLimit, rawLimit));
  const offset = Math.max(0, rawOffset);
  return { limit, offset };
}

function ensureFiniteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`Invalid ${field}`, [
      {
        path: field,
        code: "invalid_number",
        message: "Expected finite number",
        severity: "error",
      },
    ]);
  }
}

function logImportJobCounts(job: { jobId?: string; totalItems?: number; processedItems?: number }) {
  console.warn(
    `[size] importJob counts appId=${job.jobId ?? ""} totalItems=${job.totalItems ?? 0} processedItems=${job.processedItems ?? 0}`
  );
}

export async function createImportJob(owner: OwnerContext, document: ImportJob) {
  if (!document || typeof document !== "object") {
    throw new ValidationError("Import job document must be an object", [
      {
        path: "document",
        code: "invalid_shape",
        message: "Expected object",
        severity: "error",
      },
    ]);
  }
  if (!document.sourceType || !document.sourceUrl || !document.collectionSlug) {
    throw new ValidationError("Import job document missing required fields", [
      {
        path: "sourceType",
        code: "required",
        message: "Required",
        severity: "error",
      },
      {
        path: "sourceUrl",
        code: "required",
        message: "Required",
        severity: "error",
      },
      {
        path: "collectionSlug",
        code: "required",
        message: "Required",
        severity: "error",
      },
    ]);
  }

  const canonical = ensureImportJobCanonicalIds(document);
  const payload = {
    ...canonical,
    id: canonical.jobId,
    jobId: canonical.jobId,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };

  const bytes = estimateJsonBytes(payload);
  warnIfLargeDocument("importJob", payload.jobId, bytes);
  logImportJobCounts(payload);

  const created = await ImportJobModel.create(payload);
  return created.toObject();
}

export async function getImportJobById(owner: OwnerContext, jobId: string) {
  const found = await ImportJobModel.findOne({
    ...withOwnerFilter(owner),
    jobId,
  }).lean();
  if (!found) throw new NotFoundError("Import job not found");
  return found;
}

export async function listImportJobs(owner: OwnerContext, query?: ListImportJobsQuery) {
  const { limit, offset } = clampPagination(query);
  const filter: Record<string, unknown> = { ...withOwnerFilter(owner) };
  if (query?.status) filter.status = query.status;
  const sort = query?.sort === "updatedAt_asc" ? { updatedAt: 1 } : { updatedAt: -1 };

  const [items, count] = await Promise.all([
    ImportJobModel.find(filter).sort(sort).skip(offset).limit(limit).lean(),
    ImportJobModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { limit, offset, count },
  };
}

export async function updateImportJobStatus(
  owner: OwnerContext,
  jobId: string,
  status: ImportJobStatus,
  expectedRevision: number
) {
  ensureFiniteNumber(expectedRevision, "expectedRevision");
  const updated = await ImportJobModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      jobId,
      revision: expectedRevision,
    },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportJobModel.exists({
      ...withOwnerFilter(owner),
      jobId,
    });
    if (!exists) throw new NotFoundError("Import job not found");
    throw new ConflictError("Import job revision conflict");
  }

  const bytes = estimateJsonBytes(updated);
  warnIfLargeDocument("importJob", updated.jobId, bytes);
  logImportJobCounts(updated);
  return updated;
}

export async function incrementJobProgress(
  owner: OwnerContext,
  jobId: string,
  updates: ProgressUpdate,
  expectedRevision: number
) {
  ensureFiniteNumber(expectedRevision, "expectedRevision");
  const $inc: Record<string, number> = { revision: 1 };
  const $set: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.processedItemsInc) $inc.processedItems = updates.processedItemsInc;
  if (updates.successfulItemsInc) $inc.successfulItems = updates.successfulItemsInc;
  if (updates.failedItemsInc) $inc.failedItems = updates.failedItemsInc;
  if (typeof updates.currentIndex === "number" && Number.isFinite(updates.currentIndex)) {
    $set.currentIndex = updates.currentIndex;
  }

  const updated = await ImportJobModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      jobId,
      revision: expectedRevision,
    },
    { $inc, $set },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportJobModel.exists({
      ...withOwnerFilter(owner),
      jobId,
    });
    if (!exists) throw new NotFoundError("Import job not found");
    throw new ConflictError("Import job revision conflict");
  }

  const bytes = estimateJsonBytes(updated);
  warnIfLargeDocument("importJob", updated.jobId, bytes);
  logImportJobCounts(updated);
  return updated;
}

export async function softDeleteImportJob(
  owner: OwnerContext,
  jobId: string,
  actorId?: string
) {
  const updated = await ImportJobModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      jobId,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: actorId ?? null,
      },
      $inc: {
        revision: 1,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) throw new NotFoundError("Import job not found");
  return updated;
}
