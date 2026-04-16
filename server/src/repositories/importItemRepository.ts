import { ImportItemModel } from "../models/ImportItemModel";
import type { ImportItem, ImportItemStatus, ImportScanResult } from "../types/importTypes";
import { ensureImportItemCanonicalIds } from "../utils/importCanonicalIds";
import { ConflictError, NotFoundError, ValidationError } from "../utils/httpErrors";
import { estimateJsonBytes, warnIfLargeDocument } from "../utils/sizeGuards";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type ListItemsQuery = {
  status?: ImportItemStatus;
  limit?: number;
  offset?: number;
};

type DonePayload = {
  importedStepId?: string | null;
  importedLessonId?: string | null;
  scanResult?: ImportScanResult;
};
type SkippedPayload = {
  reason?: string | null;
  scanResult?: ImportScanResult;
};

function withOwnerFilter(owner: OwnerContext) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    isDeleted: false,
  };
}

function clampPagination(query?: ListItemsQuery) {
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

function logImportItemCounts(item: { itemId?: string; jobId?: string; index?: number }) {
  console.warn(
    `[size] importItem counts appId=${item.itemId ?? ""} jobId=${item.jobId ?? ""} index=${item.index ?? 0}`
  );
}

export async function createItemsBulk(owner: OwnerContext, items: ImportItem[]) {
  const payload = (Array.isArray(items) ? items : []).map((item) => {
    const canonical = ensureImportItemCanonicalIds(item);
    return {
      ...canonical,
      id: canonical.itemId,
      itemId: canonical.itemId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
    };
  });

  const inserted = await ImportItemModel.insertMany(payload);
  return inserted.map((doc) => {
    const next = doc.toObject();
    warnIfLargeDocument("importItem", next.itemId, estimateJsonBytes(next));
    logImportItemCounts(next);
    return next;
  });
}

export async function getNextPendingItem(owner: OwnerContext, jobId: string) {
  return ImportItemModel.findOne({
    ...withOwnerFilter(owner),
    jobId,
    status: "pending",
  })
    .sort({ index: 1 })
    .lean();
}

export async function markItemProcessing(
  owner: OwnerContext,
  itemId: string,
  expectedRevision: number
) {
  ensureFiniteNumber(expectedRevision, "expectedRevision");
  const updated = await ImportItemModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      itemId,
      revision: expectedRevision,
    },
    {
      $set: {
        status: "processing",
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportItemModel.exists({
      ...withOwnerFilter(owner),
      itemId,
    });
    if (!exists) throw new NotFoundError("Import item not found");
    throw new ConflictError("Import item revision conflict");
  }

  warnIfLargeDocument("importItem", updated.itemId, estimateJsonBytes(updated));
  logImportItemCounts(updated);
  return updated;
}

export async function markItemDone(
  owner: OwnerContext,
  itemId: string,
  payload: DonePayload,
  expectedRevision: number
) {
  ensureFiniteNumber(expectedRevision, "expectedRevision");
  const nextSet: Record<string, unknown> = {
    status: "done",
    errorMessage: null,
    updatedAt: new Date(),
  };
  if (payload.importedStepId !== undefined) {
    nextSet.importedStepId = payload.importedStepId;
  }
  if (payload.importedLessonId !== undefined) {
    nextSet.importedLessonId = payload.importedLessonId;
  }
  if (payload.scanResult !== undefined) {
    nextSet.scanResult = payload.scanResult;
  }

  const updated = await ImportItemModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      itemId,
      revision: expectedRevision,
    },
    {
      $set: nextSet,
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportItemModel.exists({
      ...withOwnerFilter(owner),
      itemId,
    });
    if (!exists) throw new NotFoundError("Import item not found");
    throw new ConflictError("Import item revision conflict");
  }

  warnIfLargeDocument("importItem", updated.itemId, estimateJsonBytes(updated));
  logImportItemCounts(updated);
  return updated;
}

export async function markItemFailed(
  owner: OwnerContext,
  itemId: string,
  errorMessage: string,
  expectedRevision: number
) {
  ensureFiniteNumber(expectedRevision, "expectedRevision");
  const updated = await ImportItemModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      itemId,
      revision: expectedRevision,
    },
    {
      $set: {
        status: "failed",
        errorMessage,
        updatedAt: new Date(),
      },
      $inc: { retries: 1, revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportItemModel.exists({
      ...withOwnerFilter(owner),
      itemId,
    });
    if (!exists) throw new NotFoundError("Import item not found");
    throw new ConflictError("Import item revision conflict");
  }

  warnIfLargeDocument("importItem", updated.itemId, estimateJsonBytes(updated));
  logImportItemCounts(updated);
  return updated;
}

export async function markItemSkipped(
  owner: OwnerContext,
  itemId: string,
  payload: SkippedPayload,
  expectedRevision: number
) {
  ensureFiniteNumber(expectedRevision, "expectedRevision");
  const nextSet: Record<string, unknown> = {
    status: "skipped",
    importedStepId: null,
    importedLessonId: null,
    errorMessage: payload.reason ?? null,
    updatedAt: new Date(),
  };
  if (payload.scanResult !== undefined) {
    nextSet.scanResult = payload.scanResult;
  }

  const updated = await ImportItemModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      itemId,
      revision: expectedRevision,
    },
    {
      $set: nextSet,
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportItemModel.exists({
      ...withOwnerFilter(owner),
      itemId,
    });
    if (!exists) throw new NotFoundError("Import item not found");
    throw new ConflictError("Import item revision conflict");
  }

  warnIfLargeDocument("importItem", updated.itemId, estimateJsonBytes(updated));
  logImportItemCounts(updated);
  return updated;
}

export async function resetFailedItems(owner: OwnerContext, jobId: string) {
  const result = await ImportItemModel.updateMany(
    {
      ...withOwnerFilter(owner),
      jobId,
      status: "failed",
    },
    {
      $set: {
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      },
      $inc: {
        revision: 1,
      },
    }
  );
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}

export async function resetSkippedItems(owner: OwnerContext, jobId: string) {
  const result = await ImportItemModel.updateMany(
    {
      ...withOwnerFilter(owner),
      jobId,
      status: "skipped",
    },
    {
      $set: {
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      },
      $inc: {
        revision: 1,
      },
    }
  );
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}

export async function resetStaleProcessingItems(
  owner: OwnerContext,
  jobId: string,
  olderThanMs: number
) {
  const thresholdMs =
    typeof olderThanMs === "number" && Number.isFinite(olderThanMs)
      ? Math.max(1_000, Math.floor(olderThanMs))
      : 60_000;
  const staleBefore = new Date(Date.now() - thresholdMs);
  const result = await ImportItemModel.updateMany(
    {
      ...withOwnerFilter(owner),
      jobId,
      status: "processing",
      updatedAt: { $lt: staleBefore },
    },
    {
      $set: {
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      },
      $inc: {
        revision: 1,
      },
    }
  );
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}

export async function listItemsByJob(
  owner: OwnerContext,
  jobId: string,
  query?: ListItemsQuery
) {
  const { limit, offset } = clampPagination(query);
  const filter: Record<string, unknown> = {
    ...withOwnerFilter(owner),
    jobId,
  };
  if (query?.status) filter.status = query.status;

  const [items, count] = await Promise.all([
    ImportItemModel.find(filter).sort({ index: 1 }).skip(offset).limit(limit).lean(),
    ImportItemModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { limit, offset, count },
  };
}
