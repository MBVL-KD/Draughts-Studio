import { SourceModel } from "../models/SourceModel";
import { ensureCanonicalIdPair } from "../utils/canonicalIds";
import { getSourceAppId } from "../utils/idResolvers";
import { ConflictError, NotFoundError, ValidationError } from "../utils/httpErrors";
import { estimateJsonBytes, warnIfLargeDocument, warnIfSourceCounts } from "../utils/sizeGuards";
import { validateSourceForDraftSave } from "../validation/saveValidators";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

type ListQuery = {
  search?: string;
  status?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  sort?: "updatedAt_desc" | "updatedAt_asc";
};

type SourceLike = {
  id?: string;
  sourceId?: string;
  nodes?: unknown[];
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

function normalizeCreateDocument(input: SourceLike): SourceLike {
  const canonical = ensureCanonicalIdPair(input, "sourceId");
  return {
    ...canonical,
    id: getSourceAppId(canonical),
    sourceId: getSourceAppId(canonical),
  };
}

function normalizeReplacementDocument(input: SourceLike, sourceId: string): SourceLike {
  const normalized = ensureCanonicalIdPair(input, "sourceId");
  return {
    ...normalized,
    id: sourceId,
    sourceId,
  };
}

function withOwnerFilter(owner: OwnerContext) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    isDeleted: false,
  };
}

export async function getSourceById(owner: OwnerContext, sourceId: string) {
  return SourceModel.findOne({
    ...withOwnerFilter(owner),
    sourceId,
  }).lean();
}

export async function listSources(owner: OwnerContext, query?: ListQuery) {
  const { limit, offset } = clampPagination(query);
  const filter: Record<string, unknown> = {
    ...withOwnerFilter(owner),
  };

  if (query?.status) filter.status = query.status;
  if (query?.tag) filter.tags = query.tag;
  if (query?.search?.trim()) {
    filter.$or = [
      { "title.values.en": { $regex: query.search, $options: "i" } },
      { "title.values.nl": { $regex: query.search, $options: "i" } },
      { "sourceMeta.white": { $regex: query.search, $options: "i" } },
      { "sourceMeta.black": { $regex: query.search, $options: "i" } },
      { "sourceMeta.event": { $regex: query.search, $options: "i" } },
    ];
  }

  const sort = query?.sort === "updatedAt_asc" ? { updatedAt: 1 } : { updatedAt: -1 };

  return SourceModel.find(filter).sort(sort).skip(offset).limit(limit).lean();
}

export async function createSource(owner: OwnerContext, document: SourceLike) {
  const normalized = normalizeCreateDocument(document);
  const payload: SourceLike = {
    ...normalized,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };

  const draftValidation = validateSourceForDraftSave(payload);
  if (!draftValidation.ok) {
    throw new ValidationError("Source draft validation failed", draftValidation.issues);
  }

  const bytes = estimateJsonBytes(payload);
  warnIfLargeDocument("source", getSourceAppId(payload), bytes);
  warnIfSourceCounts(getSourceAppId(payload), {
    nodes: payload.nodes?.length ?? 0,
  });

  const created = await SourceModel.create(payload);
  return created.toObject();
}

export async function patchSource(
  owner: OwnerContext,
  sourceId: string,
  nextDocument: SourceLike,
  expectedRevision: number
) {
  const replacement = normalizeReplacementDocument(nextDocument, sourceId);
  const payload: SourceLike = {
    ...replacement,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    revision: expectedRevision + 1,
  };

  const draftValidation = validateSourceForDraftSave(payload);
  if (!draftValidation.ok) {
    throw new ValidationError("Source draft validation failed", draftValidation.issues);
  }

  const bytes = estimateJsonBytes(payload);
  warnIfLargeDocument("source", sourceId, bytes);
  warnIfSourceCounts(sourceId, {
    nodes: payload.nodes?.length ?? 0,
  });

  const updated = await SourceModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      sourceId,
      revision: expectedRevision,
    },
    { $set: payload },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await SourceModel.exists({
      ...withOwnerFilter(owner),
      sourceId,
    });
    if (!exists) throw new NotFoundError("Source not found");
    throw new ConflictError("Source revision conflict");
  }

  return updated;
}

export async function softDeleteSource(
  owner: OwnerContext,
  sourceId: string,
  actorId?: string
) {
  const updated = await SourceModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      sourceId,
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

  if (!updated) throw new NotFoundError("Source not found");
  return updated;
}

