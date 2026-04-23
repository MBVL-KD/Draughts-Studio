import express from "express";
import { getStepById, upsertStep, patchStep, softDeleteStep } from "../repositories/stepRepository";
import { getLessonById } from "../repositories/lessonRepository";
import { getBookById } from "../repositories/bookRepository";
import { buildPlaybackPayload } from "../services/playbackService";
import { parseCurriculumFallbackOwner } from "../services/playbackContentOwner";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/httpErrors";
import { getOwnerContext } from "./ownerContext";

type Req = express.Request;
type Res = express.Response;

type OwnerContext = { ownerType: "user" | "school" | "org"; ownerId: string };

type PlaybackCacheEntry = {
  expiresAtMs: number;
  responseBody: { item: unknown; meta: Record<string, unknown> };
};

const PLAYBACK_CACHE_TTL_MS = Math.max(
  30000,
  Math.min(60000, Number(process.env.PLAYBACK_CACHE_TTL_MS || 45000))
);
const playbackResponseCache = new Map<string, PlaybackCacheEntry>();

function msSince(startedAtMs: number): number {
  return Date.now() - startedAtMs;
}

function safeJsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return -1;
  }
}

function makePlaybackCacheKey(
  bookId: string,
  lessonId: string,
  stepId: string,
  language: string
): string {
  return `${bookId}:${lessonId}:${stepId}:${language}`;
}

function readPlaybackCache(cacheKey: string): PlaybackCacheEntry | null {
  const now = Date.now();
  const entry = playbackResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAtMs <= now) {
    playbackResponseCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function writePlaybackCache(
  cacheKey: string,
  responseBody: { item: unknown; meta: Record<string, unknown> }
): void {
  playbackResponseCache.set(cacheKey, {
    expiresAtMs: Date.now() + PLAYBACK_CACHE_TTL_MS,
    responseBody,
  });
}

function resolveRequestedLanguage(req: Req): string {
  const raw = req.query.lang;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "en";
}

function sameOwner(a: OwnerContext, b: OwnerContext): boolean {
  return a.ownerType === b.ownerType && a.ownerId === b.ownerId;
}

async function resolveStepWithFallback(
  requestOwner: OwnerContext,
  stepId: string
): Promise<{ step: Record<string, unknown>; contentOwner: OwnerContext } | null> {
  const step = await getStepById(requestOwner, stepId);
  if (step) return { step: step as Record<string, unknown>, contentOwner: requestOwner };

  const fb = parseCurriculumFallbackOwner();
  if (!fb || sameOwner(requestOwner, fb)) return null;

  const fbStep = await getStepById(fb, stepId);
  if (!fbStep) return null;
  return { step: fbStep as Record<string, unknown>, contentOwner: fb };
}

function handleRouteError(res: Res, error: unknown): void {
  if (error instanceof ValidationError) {
    res.status(400).json({ message: error.message, issues: error.issues });
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
  console.error("[steps-route] unhandled error", error);
  res.status(500).json({ message: "Internal server error" });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export const playbackRouter = express.Router();

// ─── Step CRUD ────────────────────────────────────────────────────────────────

playbackRouter.get("/:stepId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const resolved = await resolveStepWithFallback(owner, req.params.stepId);
    if (!resolved) throw new NotFoundError("Step not found");
    res.json({ item: resolved.step });
  } catch (error) {
    handleRouteError(res, error);
  }
});

playbackRouter.post("/", async (req: Req, res: Res) => {
  try {
    if (!isPlainObject(req.body?.document)) {
      throw new ValidationError("Invalid request body", [
        {
          path: "document",
          code: "request.document.invalid",
          message: "POST body must include document as a plain object",
          severity: "error",
        },
      ]);
    }
    const owner = getOwnerContext(req);
    const item = await upsertStep(owner, req.body.document);
    res.status(201).json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

playbackRouter.patch("/:stepId", async (req: Req, res: Res) => {
  try {
    const { expectedRevision, document } = req.body ?? {};
    if (!Number.isFinite(expectedRevision) || !isPlainObject(document)) {
      const issues = [];
      if (!Number.isFinite(expectedRevision))
        issues.push({
          path: "expectedRevision",
          code: "request.expected_revision.invalid",
          message: "PATCH requires expectedRevision as a finite number",
          severity: "error" as const,
        });
      if (!isPlainObject(document))
        issues.push({
          path: "document",
          code: "request.document.invalid",
          message: "PATCH requires document as a plain object",
          severity: "error" as const,
        });
      throw new ValidationError("Invalid request body", issues);
    }
    const owner = getOwnerContext(req);
    const item = await patchStep(owner, req.params.stepId, document, Number(expectedRevision));
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

playbackRouter.delete("/:stepId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await softDeleteStep(owner, req.params.stepId);
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

// ─── Playback ─────────────────────────────────────────────────────────────────

playbackRouter.get("/:stepId/playback", async (req: Req, res: Res) => {
  const startedAtMs = Date.now();
  let lookupMs = 0;
  let buildPayloadMs = 0;
  let responseBytes = -1;
  let outcome = "unknown";

  try {
    const owner = getOwnerContext(req);
    const requestedLanguage = resolveRequestedLanguage(req);
    const stepId = req.params.stepId;

    const guardBookId =
      typeof req.query.bookId === "string" ? req.query.bookId.trim() : "";
    const guardLessonId =
      typeof req.query.lessonId === "string" ? req.query.lessonId.trim() : "";

    const cacheKey =
      guardBookId && guardLessonId
        ? makePlaybackCacheKey(guardBookId, guardLessonId, stepId, requestedLanguage)
        : null;

    if (cacheKey) {
      const cached = readPlaybackCache(cacheKey);
      if (cached) {
        res.json(cached.responseBody);
        console.info(
          `[playback-timing] route=step-playback outcome=cache_hit status=200 stepId=${stepId} t_total_ms=${msSince(startedAtMs)}`
        );
        return;
      }
    }

    const lookupStartedAt = Date.now();
    const resolved = await resolveStepWithFallback(owner, stepId);
    if (!resolved) throw new NotFoundError("Step not found");
    const { step, contentOwner } = resolved;

    const stepBookId = String(step.bookId ?? "");
    const stepLessonId = String(step.lessonId ?? "");

    if (guardBookId && guardBookId !== stepBookId) {
      throw new ValidationError("Step context mismatch", [
        {
          path: "bookId",
          code: "playback.context.book_mismatch",
          message: "bookId does not match resolved step context",
          severity: "error",
        },
      ]);
    }
    if (guardLessonId && guardLessonId !== stepLessonId) {
      throw new ValidationError("Step context mismatch", [
        {
          path: "lessonId",
          code: "playback.context.lesson_mismatch",
          message: "lessonId does not match resolved step context",
          severity: "error",
        },
      ]);
    }

    const [lesson, book] = await Promise.all([
      stepLessonId ? getLessonById(contentOwner, stepLessonId) : null,
      stepBookId ? getBookById(contentOwner, stepBookId) : null,
    ]);
    lookupMs = msSince(lookupStartedAt);

    const orderedStepIds = Array.isArray(lesson?.stepIds)
      ? (lesson.stepIds as string[]).filter((id): id is string => typeof id === "string")
      : [stepId];

    const payloadBuildStartedAt = Date.now();
    const payload = buildPlaybackPayload({
      step,
      orderedStepIds,
      language: requestedLanguage,
      lessonId: stepLessonId,
      bookId: stepBookId,
    });
    buildPayloadMs = msSince(payloadBuildStartedAt);
    responseBytes = safeJsonBytes(payload);
    outcome = "ok";

    const revision =
      typeof (book as { revision?: unknown } | null)?.revision === "number" &&
      Number.isFinite((book as { revision: number }).revision)
        ? (book as { revision: number }).revision
        : undefined;

    const responseBody = {
      item: payload,
      meta: {
        bookId: stepBookId,
        lessonId: stepLessonId,
        stepId,
        language: requestedLanguage,
        ...(revision !== undefined ? { revision, bookRevision: revision } : {}),
      },
    };
    res.json(responseBody);

    const resolvedCacheKey =
      stepBookId && stepLessonId
        ? makePlaybackCacheKey(stepBookId, stepLessonId, stepId, requestedLanguage)
        : null;
    if (resolvedCacheKey) writePlaybackCache(resolvedCacheKey, responseBody);

    console.info(
      `[playback-timing] route=step-playback outcome=${outcome} status=200 stepId=${stepId} bookId=${stepBookId} lessonId=${stepLessonId} t_lookup_ms=${lookupMs} t_build_payload_ms=${buildPayloadMs} t_total_ms=${msSince(startedAtMs)} response_size_bytes=${responseBytes}`
    );
  } catch (error) {
    outcome = error instanceof Error ? error.name : "error";
    console.info(
      `[playback-timing] route=step-playback outcome=${outcome} status=error stepId=${req.params.stepId} t_total_ms=${msSince(startedAtMs)}`
    );
    handleRouteError(res, error);
  }
});

// Legacy context route — kept for Roblox client backward compatibility
playbackRouter.get(
  "/book/:bookId/lesson/:lessonId/step/:stepId",
  async (req: Req, res: Res) => {
    const startedAtMs = Date.now();
    let lookupMs = 0;
    let buildPayloadMs = 0;
    let responseBytes = -1;
    let outcome = "unknown";

    try {
      const owner = getOwnerContext(req);
      const requestedLanguage = resolveRequestedLanguage(req);
      const bookId = String(req.params.bookId ?? "").trim();
      const lessonId = String(req.params.lessonId ?? "").trim();
      const stepId = String(req.params.stepId ?? "").trim();

      if (!bookId || !lessonId || !stepId) {
        throw new ValidationError("Missing playback route params", [
          {
            path: "params",
            code: "playback.context.missing",
            message: "bookId, lessonId and stepId are required",
            severity: "error",
          },
        ]);
      }

      const cacheKey = makePlaybackCacheKey(bookId, lessonId, stepId, requestedLanguage);
      const cached = readPlaybackCache(cacheKey);
      if (cached) {
        res.json(cached.responseBody);
        console.info(
          `[playback-timing] route=context-step outcome=cache_hit status=200 stepId=${stepId} t_total_ms=${msSince(startedAtMs)}`
        );
        return;
      }

      const lookupStartedAt = Date.now();
      const resolved = await resolveStepWithFallback(owner, stepId);
      if (!resolved) throw new NotFoundError("Step not found");
      const { step, contentOwner } = resolved;

      const stepBookId = String(step.bookId ?? "");
      const stepLessonId = String(step.lessonId ?? "");

      if (stepBookId && stepBookId !== bookId) {
        throw new ValidationError("Step context mismatch", [
          {
            path: "bookId",
            code: "playback.context.book_mismatch",
            message: "bookId does not match resolved step context",
            severity: "error",
          },
        ]);
      }
      if (stepLessonId && stepLessonId !== lessonId) {
        throw new ValidationError("Step context mismatch", [
          {
            path: "lessonId",
            code: "playback.context.lesson_mismatch",
            message: "lessonId does not match resolved step context",
            severity: "error",
          },
        ]);
      }

      const [lesson, book] = await Promise.all([
        getLessonById(contentOwner, lessonId),
        getBookById(contentOwner, bookId),
      ]);
      lookupMs = msSince(lookupStartedAt);

      const orderedStepIds = Array.isArray(lesson?.stepIds)
        ? (lesson.stepIds as string[]).filter((id): id is string => typeof id === "string")
        : [stepId];

      const payloadBuildStartedAt = Date.now();
      const payload = buildPlaybackPayload({
        step,
        orderedStepIds,
        language: requestedLanguage,
        lessonId,
        bookId,
      });
      buildPayloadMs = msSince(payloadBuildStartedAt);
      responseBytes = safeJsonBytes(payload);
      outcome = "ok";

      const revision =
        typeof (book as { revision?: unknown } | null)?.revision === "number" &&
        Number.isFinite((book as { revision: number }).revision)
          ? (book as { revision: number }).revision
          : undefined;

      const responseBody = {
        item: payload,
        meta: {
          bookId,
          lessonId,
          stepId,
          language: requestedLanguage,
          ...(revision !== undefined ? { revision, bookRevision: revision } : {}),
        },
      };
      res.json(responseBody);
      writePlaybackCache(cacheKey, responseBody);

      console.info(
        `[playback-timing] route=context-step outcome=${outcome} status=200 stepId=${stepId} bookId=${bookId} lessonId=${lessonId} t_lookup_ms=${lookupMs} t_build_payload_ms=${buildPayloadMs} t_total_ms=${msSince(startedAtMs)} response_size_bytes=${responseBytes}`
      );
    } catch (error) {
      outcome = error instanceof Error ? error.name : "error";
      console.info(
        `[playback-timing] route=context-step outcome=${outcome} status=error stepId=${req.params.stepId} bookId=${req.params.bookId} lessonId=${req.params.lessonId} t_total_ms=${msSince(startedAtMs)}`
      );
      handleRouteError(res, error);
    }
  }
);
