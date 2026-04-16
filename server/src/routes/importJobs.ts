import express from "express";
import mongoose from "mongoose";
import {
  createImportJob,
  getImportJobById,
  listImportJobs,
} from "../repositories/importJobRepository";
import { listItemsByJob } from "../repositories/importItemRepository";
import {
  pauseImportJob,
  resumeImportJob,
  retryFailedImportItems,
  retrySkippedImportItems,
  runImportJobUntilStopped,
} from "../services/importRunnerService";
import { seedImportJobFromCollectionIndex } from "../services/importSeedService";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/httpErrors";
import { getOwnerContext } from "./ownerContext";

type Req = express.Request;
type Res = express.Response;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLimitOffset(req: Req): { limit?: number; offset?: number } {
  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;
  const limit = toFiniteNumber(rawLimit);
  const offset = toFiniteNumber(rawOffset);

  const issues = [];
  if (rawLimit !== undefined && limit === undefined) {
    issues.push({
      path: "limit",
      code: "request.query.limit.invalid",
      message: "limit must be a finite number",
      severity: "error" as const,
    });
  }
  if (rawOffset !== undefined && offset === undefined) {
    issues.push({
      path: "offset",
      code: "request.query.offset.invalid",
      message: "offset must be a finite number",
      severity: "error" as const,
    });
  }
  if (issues.length > 0) throw new ValidationError("Invalid query parameters", issues);
  return { limit, offset };
}

function parseSort(value: unknown): "updatedAt_desc" | "updatedAt_asc" | undefined {
  if (value === undefined) return undefined;
  if (value === "updatedAt_desc" || value === "updatedAt_asc") return value;
  throw new ValidationError("Invalid query parameters", [
    {
      path: "sort",
      code: "request.query.sort.invalid",
      message: "sort must be one of: updatedAt_desc, updatedAt_asc",
      severity: "error",
    },
  ]);
}

function parseAllPages(value: unknown): boolean {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  return false;
}

function parseExpectedRevision(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    throw new ValidationError("Invalid request body", [
      {
        path: "expectedRevision",
        code: "request.expected_revision.invalid",
        message: "expectedRevision must be a finite number when provided",
        severity: "error",
      },
    ]);
  }
  return parsed;
}

function parseRunMaxItems(value: unknown): number {
  if (value === undefined) return 1;
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    throw new ValidationError("Invalid request body", [
      {
        path: "maxItems",
        code: "request.max_items.invalid",
        message: "maxItems must be a finite number",
        severity: "error",
      },
    ]);
  }
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function parseDifficultyBand(
  value: unknown
): "beginner" | "intermediate" | "advanced" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "beginner" || value === "intermediate" || value === "advanced") return value;
  throw new ValidationError("Invalid request body", [
    {
      path: "document.baseDifficultyBand",
      code: "request.document.base_difficulty_band.invalid",
      message: "baseDifficultyBand must be one of: beginner, intermediate, advanced",
      severity: "error",
    },
  ]);
}

function parseBasePuzzleRating(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) {
    throw new ValidationError("Invalid request body", [
      {
        path: "document.basePuzzleRating",
        code: "request.document.base_puzzle_rating.invalid",
        message: "basePuzzleRating must be a finite number when provided",
        severity: "error",
      },
    ]);
  }
  return Math.max(100, Math.min(3000, Math.round(parsed)));
}

function sendItem(res: Res, item: Record<string, unknown>) {
  res.json({
    item: {
      ...item,
      revision: item.revision,
    },
  });
}

function mongoDuplicateMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: number }).code;
  if (code !== 11000) return null;
  const msg = (error as { message?: string }).message;
  return typeof msg === "string" && msg.length > 0 ? msg : "Duplicate key";
}

function handleRouteError(res: Res, error: unknown) {
  if (error instanceof ValidationError) {
    res.status(400).json({ message: error.message, issues: error.issues });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const issues = Object.entries(error.errors).map(([path, e]) => ({
      path,
      code: "mongoose.validation",
      message: e instanceof Error ? e.message : String(e),
      severity: "error" as const,
    }));
    res.status(400).json({ message: error.message, issues });
    return;
  }
  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      message: error.message,
      issues: [
        {
          path: error.path ?? "unknown",
          code: "mongoose.cast",
          message: error.message,
          severity: "error" as const,
        },
      ],
    });
    return;
  }
  const dupMsg = mongoDuplicateMessage(error);
  if (dupMsg) {
    res.status(409).json({ message: dupMsg });
    return;
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ message: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    res.status(409).json({ message: error.message });
    return;
  }
  console.error("[import-jobs]", error);
  res.status(500).json({ message: "Internal server error" });
}

export const importJobsRouter = express.Router();

importJobsRouter.post("/", async (req: Req, res: Res) => {
  try {
    if (!isPlainObject(req.body) || !isPlainObject(req.body.document)) {
      throw new ValidationError("Invalid request body", [
        {
          path: "document",
          code: "request.document.invalid",
          message: "POST body must include document as a plain object",
          severity: "error",
        },
      ]);
    }

    const document = req.body.document;
    if (typeof document.sourceType !== "string" || !document.sourceType.trim()) {
      throw new ValidationError("Invalid request body", [
        {
          path: "document.sourceType",
          code: "request.document.source_type.invalid",
          message: "sourceType is required",
          severity: "error",
        },
      ]);
    }
    if (typeof document.sourceUrl !== "string" || !document.sourceUrl.trim()) {
      throw new ValidationError("Invalid request body", [
        {
          path: "document.sourceUrl",
          code: "request.document.source_url.invalid",
          message: "sourceUrl is required",
          severity: "error",
        },
      ]);
    }
    if (typeof document.collectionSlug !== "string" || !document.collectionSlug.trim()) {
      throw new ValidationError("Invalid request body", [
        {
          path: "document.collectionSlug",
          code: "request.document.collection_slug.invalid",
          message: "collectionSlug is required",
          severity: "error",
        },
      ]);
    }

    const baseDifficultyBand = parseDifficultyBand(document.baseDifficultyBand);
    const basePuzzleRating = parseBasePuzzleRating(document.basePuzzleRating);
    const owner = getOwnerContext(req);
    const item = await createImportJob(owner, {
      ...(document as any),
      ...(baseDifficultyBand !== undefined ? { baseDifficultyBand } : {}),
      ...(basePuzzleRating !== undefined ? { basePuzzleRating } : {}),
    });
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.get("/", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const { limit, offset } = parseLimitOffset(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const sort = parseSort(req.query.sort);
    const result = await listImportJobs(owner, {
      status: status as any,
      limit,
      offset,
      sort,
    });
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.get("/:jobId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await getImportJobById(owner, req.params.jobId);
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.get("/:jobId/items", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const { limit, offset } = parseLimitOffset(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const result = await listItemsByJob(owner, req.params.jobId, {
      status: status as any,
      limit,
      offset,
    });
    res.json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.post("/:jobId/seed", async (req: Req, res: Res) => {
  try {
    if (req.body !== undefined && !isPlainObject(req.body)) {
      throw new ValidationError("Invalid request body", [
        {
          path: "body",
          code: "request.body.invalid",
          message: "Body must be a plain object when provided",
          severity: "error",
        },
      ]);
    }
    const owner = getOwnerContext(req);
    const page = toFiniteNumber(req.body?.page);
    const allPages = parseAllPages(req.body?.allPages);
    const maxPages = toFiniteNumber(req.body?.maxPages);
    const expectedRevision = parseExpectedRevision(req.body?.expectedRevision);
    const result = await seedImportJobFromCollectionIndex(owner, req.params.jobId, {
      page,
      allPages,
      maxPages,
      expectedRevision,
    });
    res.json({
      item: result.job,
      seededCount: result.seededCount,
      collectionTitle: result.collectionTitle,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      ...(result.pagesFetched !== undefined
        ? { pagesFetched: result.pagesFetched }
        : {}),
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.post("/:jobId/run", async (req: Req, res: Res) => {
  try {
    if (req.body !== undefined && !isPlainObject(req.body)) {
      throw new ValidationError("Invalid request body", [
        {
          path: "body",
          code: "request.body.invalid",
          message: "Body must be a plain object when provided",
          severity: "error",
        },
      ]);
    }
    const owner = getOwnerContext(req);
    const maxItems = parseRunMaxItems(req.body?.maxItems);
    const results = await runImportJobUntilStopped(owner, req.params.jobId, { maxItems });
    const item = results.length > 0
      ? results[results.length - 1]
      : {
          action: "idle",
          jobId: req.params.jobId,
          message: "No processing actions executed",
        };
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.post("/:jobId/pause", async (req: Req, res: Res) => {
  try {
    if (req.body !== undefined && !isPlainObject(req.body)) {
      throw new ValidationError("Invalid request body", [
        {
          path: "body",
          code: "request.body.invalid",
          message: "Body must be a plain object when provided",
          severity: "error",
        },
      ]);
    }
    const owner = getOwnerContext(req);
    const expectedRevision = parseExpectedRevision(req.body?.expectedRevision);
    const item = await pauseImportJob(owner, req.params.jobId, expectedRevision);
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.post("/:jobId/resume", async (req: Req, res: Res) => {
  try {
    if (req.body !== undefined && !isPlainObject(req.body)) {
      throw new ValidationError("Invalid request body", [
        {
          path: "body",
          code: "request.body.invalid",
          message: "Body must be a plain object when provided",
          severity: "error",
        },
      ]);
    }
    const owner = getOwnerContext(req);
    const expectedRevision = parseExpectedRevision(req.body?.expectedRevision);
    const item = await resumeImportJob(owner, req.params.jobId, expectedRevision);
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.post("/:jobId/retry-failed", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const result = await retryFailedImportItems(owner, req.params.jobId);
    res.json({
      item: {
        jobId: req.params.jobId,
        resetCount: result.modifiedCount ?? 0,
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

importJobsRouter.post("/:jobId/retry-skipped", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const result = await retrySkippedImportItems(owner, req.params.jobId);
    res.json({
      item: {
        jobId: req.params.jobId,
        resetCount: result.modifiedCount ?? 0,
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});
