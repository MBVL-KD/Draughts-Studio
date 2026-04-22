import express from "express";
import {
  findStepRefWithCurriculumFallback,
  getLessonRefWithCurriculumFallback,
  parseCurriculumFallbackOwner,
} from "../services/playbackContentOwner";
import { getSourceById } from "../repositories/sourceRepository";
import { buildPlaybackPayload } from "../services/playbackService";
import { validateStepForRuntimeExport } from "../validation/saveValidators";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/httpErrors";
import { getOwnerContext } from "./ownerContext";
import { getStepAppId } from "../utils/idResolvers";
import {
  findIndexedPlaybackStepByContext,
  findIndexedPlaybackStepByStepId,
} from "../repositories/playbackStepRepository";

type Req = express.Request;
type Res = express.Response;

type PlaybackCacheEntry = {
  expiresAtMs: number;
  responseBody: {
    item: unknown;
    meta: Record<string, unknown>;
  };
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

function requiredLanguageKey(requiredLanguages: string[]) {
  return [...requiredLanguages].sort().join(",");
}

function makePlaybackCacheKey(
  bookId: string,
  lessonId: string,
  stepId: string,
  language: string,
  requiredLanguages: string[]
) {
  return `${bookId}:${lessonId}:${stepId}:${language}:${requiredLanguageKey(requiredLanguages)}`;
}

function readPlaybackCache(cacheKey: string) {
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
  responseBody: {
    item: unknown;
    meta: Record<string, unknown>;
  }
) {
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

function resolveRequiredLanguages(req: Req): string[] {
  const raw = req.query.requiredLanguage;
  if (Array.isArray(raw)) {
    return raw
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return ["en"];
}

function handleRouteError(res: Res, error: unknown) {
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
  res.status(500).json({ message: "Internal server error" });
}

/** Same numeric source as `GET /api/books/:bookId` → `item.revision` (BookModel). */
function revisionFromBook(book: unknown): number | undefined {
  const r = (book as { revision?: unknown } | null | undefined)?.revision;
  return typeof r === "number" && Number.isFinite(r) ? r : undefined;
}

function hasAuthoringAskSequence(lesson: unknown, stepId: string): boolean {
  const bundle = (lesson as { authoringV2?: unknown })?.authoringV2 as
    | {
        stepsById?: Record<string, unknown>;
      }
    | undefined;
  const step = bundle?.stepsById?.[stepId] as
    | {
        timeline?: Array<{ type?: string; interaction?: { kind?: string; expectedSequence?: unknown[] } }>;
      }
    | undefined;
  const timeline = step?.timeline ?? [];
  return timeline.some(
    (m) =>
      m?.type === "askSequence" &&
      m.interaction?.kind === "askSequence" &&
      Array.isArray(m.interaction.expectedSequence) &&
      m.interaction.expectedSequence.length > 0
  );
}

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

function sameOwner(a: OwnerContext, b: OwnerContext) {
  return a.ownerType === b.ownerType && a.ownerId === b.ownerId;
}

function buildStepRefFromIndexed(indexed: Record<string, unknown>) {
  const stepId = String(indexed.stepId ?? "");
  const orderedStepIds = Array.isArray(indexed.orderedStepIds)
    ? indexed.orderedStepIds.filter((id): id is string => typeof id === "string")
    : [];
  const authoringStep =
    indexed.authoringStep && typeof indexed.authoringStep === "object"
      ? (indexed.authoringStep as Record<string, unknown>)
      : undefined;
  const lesson: Record<string, unknown> = {
    variantId: typeof indexed.variantId === "string" ? indexed.variantId : undefined,
    steps: orderedStepIds.map((id) => ({ id, stepId: id })),
    authoringV2: {
      authoringLesson: {
        stepIds: orderedStepIds,
      },
      stepsById: authoringStep ? { [stepId]: authoringStep } : {},
    },
  };
  return {
    book: {
      revision: Number(indexed.bookRevision ?? 1),
    },
    lesson,
    step: (indexed.step ?? {}) as Record<string, unknown>,
    bookId: String(indexed.bookId ?? ""),
    lessonId: String(indexed.lessonId ?? ""),
    stepId,
  };
}

async function resolveIndexedStepByContextWithFallback(
  requestOwner: OwnerContext,
  bookId: string,
  lessonId: string,
  stepId: string
): Promise<{ stepRef: ReturnType<typeof buildStepRefFromIndexed>; contentOwner: OwnerContext } | null> {
  const primary = await findIndexedPlaybackStepByContext(requestOwner, bookId, lessonId, stepId);
  if (primary) {
    return {
      stepRef: buildStepRefFromIndexed(primary as unknown as Record<string, unknown>),
      contentOwner: requestOwner,
    };
  }
  const fb = parseCurriculumFallbackOwner();
  if (!fb || sameOwner(requestOwner, fb)) return null;
  const secondary = await findIndexedPlaybackStepByContext(fb, bookId, lessonId, stepId);
  if (!secondary) return null;
  return {
    stepRef: buildStepRefFromIndexed(secondary as unknown as Record<string, unknown>),
    contentOwner: fb,
  };
}

async function resolveIndexedStepByStepIdWithFallback(
  requestOwner: OwnerContext,
  stepId: string
): Promise<{ stepRef: ReturnType<typeof buildStepRefFromIndexed>; contentOwner: OwnerContext } | null> {
  const primary = await findIndexedPlaybackStepByStepId(requestOwner, stepId);
  if (primary) {
    return {
      stepRef: buildStepRefFromIndexed(primary as unknown as Record<string, unknown>),
      contentOwner: requestOwner,
    };
  }
  const fb = parseCurriculumFallbackOwner();
  if (!fb || sameOwner(requestOwner, fb)) return null;
  const secondary = await findIndexedPlaybackStepByStepId(fb, stepId);
  if (!secondary) return null;
  return {
    stepRef: buildStepRefFromIndexed(secondary as unknown as Record<string, unknown>),
    contentOwner: fb,
  };
}

export const playbackRouter = express.Router();

playbackRouter.get("/:stepId/playback", async (req: Req, res: Res) => {
  const startedAtMs = Date.now();
  let lookupMs = 0;
  let sourceFetchMs = 0;
  let validateMs = 0;
  let buildPayloadMs = 0;
  let responseBytes = -1;
  let outcome = "unknown";
  try {
    const owner = getOwnerContext(req);
    const requestedLanguage = resolveRequestedLanguage(req);
    const requiredLanguages = resolveRequiredLanguages(req);
    const stepId = req.params.stepId;

    const guardBookId =
      typeof req.query.bookId === "string" ? req.query.bookId.trim() : "";
    const guardLessonId =
      typeof req.query.lessonId === "string" ? req.query.lessonId.trim() : "";
    const cacheKey =
      guardBookId && guardLessonId
        ? makePlaybackCacheKey(
            guardBookId,
            guardLessonId,
            stepId,
            requestedLanguage,
            requiredLanguages
          )
        : null;
    if (cacheKey) {
      const cached = readPlaybackCache(cacheKey);
      if (cached) {
        res.json(cached.responseBody);
        console.info(
          `[playback-timing] route=step-playback outcome=cache_hit status=200 stepId=${stepId} bookId=${guardBookId} lessonId=${guardLessonId} t_lookup_ms=0 t_source_fetch_ms=0 t_validate_ms=0 t_build_payload_ms=0 t_total_ms=${msSince(startedAtMs)} response_size_bytes=${safeJsonBytes(cached.responseBody.item)}`
        );
        return;
      }
    }
    let stepRef: {
      book: unknown;
      lesson: Record<string, unknown>;
      step: Record<string, unknown>;
      bookId: string;
      lessonId: string;
      stepId: string;
    };
    let contentOwner = owner;

    const lookupStartedAt = Date.now();
    if (guardBookId && guardLessonId) {
      const indexed = await resolveIndexedStepByContextWithFallback(
        owner,
        guardBookId,
        guardLessonId,
        stepId
      );
      if (indexed) {
        stepRef = indexed.stepRef;
        contentOwner = indexed.contentOwner;
      } else {
        const resolvedLesson = await getLessonRefWithCurriculumFallback(
          owner,
          guardBookId,
          guardLessonId
        );
        if (!resolvedLesson?.lessonRef?.lesson) {
          throw new NotFoundError("Lesson not found");
        }
        const lessonAny = resolvedLesson.lessonRef.lesson as Record<string, unknown>;
        const steps = Array.isArray(lessonAny.steps)
          ? (lessonAny.steps as Array<{ id?: string; stepId?: string }>)
          : [];
        const step = steps.find((s) => getStepAppId(s) === stepId);
        if (!step) throw new NotFoundError("Step not found");
        contentOwner = resolvedLesson.contentOwner;
        stepRef = {
          book: resolvedLesson.lessonRef.book,
          lesson: lessonAny,
          step: step as unknown as Record<string, unknown>,
          bookId: guardBookId,
          lessonId: guardLessonId,
          stepId,
        };
      }
    } else {
      const indexed = await resolveIndexedStepByStepIdWithFallback(owner, stepId);
      if (indexed) {
        stepRef = indexed.stepRef;
        contentOwner = indexed.contentOwner;
      } else {
        const resolved = await findStepRefWithCurriculumFallback(owner, stepId);
        if (!resolved) {
          throw new NotFoundError("Step not found");
        }
        stepRef = resolved.stepRef as typeof stepRef;
        contentOwner = resolved.contentOwner;
      }

      if (guardBookId && guardBookId !== stepRef.bookId) {
        throw new ValidationError("Step context mismatch", [
          {
            path: "bookId",
            code: "playback.context.book_mismatch",
            message: "bookId does not match resolved step context",
            severity: "error",
          },
        ]);
      }
      if (guardLessonId && guardLessonId !== stepRef.lessonId) {
        throw new ValidationError("Step context mismatch", [
          {
            path: "lessonId",
            code: "playback.context.lesson_mismatch",
            message: "lessonId does not match resolved step context",
            severity: "error",
          },
        ]);
      }
    }
    lookupMs = msSince(lookupStartedAt);

    const sourceId =
      typeof stepRef.step?.sourceRef?.sourceId === "string"
        ? stepRef.step.sourceRef.sourceId
        : undefined;
    const sourceFetchStartedAt = Date.now();
    const source = sourceId ? await getSourceById(contentOwner, sourceId) : undefined;
    sourceFetchMs = msSince(sourceFetchStartedAt);

    const lessonAnyPre = (stepRef.lesson ?? {}) as Record<string, unknown>;
    const authoringBundlePre = lessonAnyPre.authoringV2 as
      | { stepsById?: Record<string, unknown> }
      | undefined;
    const authoringStepForValidate =
      (authoringBundlePre?.stepsById?.[stepRef.stepId] as Record<string, unknown> | undefined) ??
      undefined;

    const validateStartedAt = Date.now();
    const runtimeValidation = validateStepForRuntimeExport(stepRef.step, source, {
      requiredLanguages,
      authoringStep: authoringStepForValidate,
    });
    validateMs = msSince(validateStartedAt);
    if (!runtimeValidation.ok && !hasAuthoringAskSequence(stepRef.lesson, stepRef.stepId)) {
      throw new ValidationError(
        "Step is not ready for runtime playback export",
        runtimeValidation.issues
      );
    }

    const lesson = stepRef.lesson as { variantId?: string } | undefined;
    const variantId =
      typeof lesson?.variantId === "string" && lesson.variantId.trim()
        ? lesson.variantId.trim()
        : undefined;

    const authoringBundle = lessonAnyPre.authoringV2 as
      | {
          authoringLesson?: { stepIds?: string[] };
          stepsById?: Record<string, unknown>;
        }
      | undefined;
    const authoringStepIds = Array.isArray(authoringBundle?.authoringLesson?.stepIds)
      ? authoringBundle!.authoringLesson!.stepIds!.filter((id): id is string => typeof id === "string")
      : [];
    const orderedStepIds =
      authoringStepIds.length > 0
        ? authoringStepIds
        : ((stepRef.lesson?.steps ?? []) as Array<{ id?: string; stepId?: string }>).map((s) =>
            getStepAppId(s)
          );
    const idx = orderedStepIds.findIndex((id) => id === stepRef.stepId);
    const navigation = {
      bookId: stepRef.bookId,
      lessonId: stepRef.lessonId,
      stepId: stepRef.stepId,
      stepIndex: idx >= 0 ? idx : 0,
      totalSteps: orderedStepIds.length,
      previousStepId: idx > 0 ? orderedStepIds[idx - 1] ?? null : null,
      nextStepId: idx >= 0 && idx < orderedStepIds.length - 1 ? orderedStepIds[idx + 1] ?? null : null,
    };
    const authoringStep =
      (authoringBundle?.stepsById?.[stepRef.stepId] as Record<string, unknown> | undefined) ?? undefined;

    const payloadBuildStartedAt = Date.now();
    const payload = buildPlaybackPayload({
      step: stepRef.step,
      language: requestedLanguage,
      variantId,
      lessonId: stepRef.lessonId,
      authoringStep,
      navigation,
    });
    buildPayloadMs = msSince(payloadBuildStartedAt);
    responseBytes = safeJsonBytes(payload);
    outcome = "ok";

    const revision = revisionFromBook(stepRef.book);
    const responseBody = {
      item: payload,
      meta: {
        bookId: stepRef.bookId,
        lessonId: stepRef.lessonId,
        stepId: stepRef.stepId,
        language: requestedLanguage,
        ...(revision !== undefined ? { revision, bookRevision: revision } : {}),
      },
    };
    res.json(responseBody);
    if (cacheKey) {
      writePlaybackCache(cacheKey, responseBody);
    }
    console.info(
      `[playback-timing] route=step-playback outcome=${outcome} status=200 stepId=${stepRef.stepId} bookId=${stepRef.bookId} lessonId=${stepRef.lessonId} t_lookup_ms=${lookupMs} t_source_fetch_ms=${sourceFetchMs} t_validate_ms=${validateMs} t_build_payload_ms=${buildPayloadMs} t_total_ms=${msSince(startedAtMs)} response_size_bytes=${responseBytes}`
    );
  } catch (error) {
    outcome = error instanceof Error ? error.name : "error";
    console.info(
      `[playback-timing] route=step-playback outcome=${outcome} status=error stepId=${req.params.stepId} t_lookup_ms=${lookupMs} t_source_fetch_ms=${sourceFetchMs} t_validate_ms=${validateMs} t_build_payload_ms=${buildPayloadMs} t_total_ms=${msSince(startedAtMs)}`
    );
    handleRouteError(res, error);
  }
});

playbackRouter.get(
  "/book/:bookId/lesson/:lessonId/step/:stepId",
  async (req: Req, res: Res) => {
    const startedAtMs = Date.now();
    let lookupMs = 0;
    let sourceFetchMs = 0;
    let validateMs = 0;
    let buildPayloadMs = 0;
    let responseBytes = -1;
    let outcome = "unknown";
    try {
      const owner = getOwnerContext(req);
      const requestedLanguage = resolveRequestedLanguage(req);
      const requiredLanguages = resolveRequiredLanguages(req);
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
      const cacheKey = makePlaybackCacheKey(
        bookId,
        lessonId,
        stepId,
        requestedLanguage,
        requiredLanguages
      );
      const cached = readPlaybackCache(cacheKey);
      if (cached) {
        res.json(cached.responseBody);
        console.info(
          `[playback-timing] route=context-step outcome=cache_hit status=200 stepId=${stepId} bookId=${bookId} lessonId=${lessonId} t_lookup_ms=0 t_source_fetch_ms=0 t_validate_ms=0 t_build_payload_ms=0 t_total_ms=${msSince(startedAtMs)} response_size_bytes=${safeJsonBytes(cached.responseBody.item)}`
        );
        return;
      }
      const lookupStartedAt = Date.now();
      const indexed = await resolveIndexedStepByContextWithFallback(owner, bookId, lessonId, stepId);
      let lesson: Record<string, unknown>;
      let step: Record<string, unknown>;
      let steps: Array<{ id?: string; stepId?: string }> = [];
      let contentOwner = owner;
      let revision: number | undefined;
      if (indexed) {
        lesson = indexed.stepRef.lesson;
        step = indexed.stepRef.step;
        steps = ((lesson.steps ?? []) as Array<{ id?: string; stepId?: string }>).filter(Boolean);
        contentOwner = indexed.contentOwner;
        revision = revisionFromBook(indexed.stepRef.book);
      } else {
        const resolvedLesson = await getLessonRefWithCurriculumFallback(owner, bookId, lessonId);
        if (!resolvedLesson) throw new NotFoundError("Lesson not found");
        const lessonRef = resolvedLesson.lessonRef;
        contentOwner = resolvedLesson.contentOwner;
        lesson = lessonRef.lesson as Record<string, unknown>;
        steps = ((lesson.steps ?? []) as Array<{ id?: string; stepId?: string }>).filter(Boolean);
        const found = steps.find((s) => getStepAppId(s) === stepId);
        if (!found) throw new NotFoundError("Step not found");
        step = found as Record<string, unknown>;
        revision = revisionFromBook(lessonRef.book);
      }
      lookupMs = msSince(lookupStartedAt);

      const sourceId =
        typeof (step as { sourceRef?: { sourceId?: string } }).sourceRef?.sourceId === "string"
          ? (step as { sourceRef: { sourceId: string } }).sourceRef.sourceId
          : undefined;
      const sourceFetchStartedAt = Date.now();
      const source = sourceId ? await getSourceById(contentOwner, sourceId) : undefined;
      sourceFetchMs = msSince(sourceFetchStartedAt);
      const authoringBundlePre = lesson.authoringV2 as { stepsById?: Record<string, unknown> } | undefined;
      const authoringStepForValidate =
        (authoringBundlePre?.stepsById?.[stepId] as Record<string, unknown> | undefined) ?? undefined;
      const validateStartedAt = Date.now();
      const runtimeValidation = validateStepForRuntimeExport(step, source, {
        requiredLanguages,
        authoringStep: authoringStepForValidate,
      });
      validateMs = msSince(validateStartedAt);
      if (!runtimeValidation.ok && !hasAuthoringAskSequence(lesson, stepId)) {
        throw new ValidationError(
          "Step is not ready for runtime playback export",
          runtimeValidation.issues
        );
      }

      const variantId =
        typeof (lesson as { variantId?: string }).variantId === "string" &&
        (lesson as { variantId?: string }).variantId!.trim()
          ? (lesson as { variantId: string }).variantId.trim()
          : undefined;
      const authoringBundle = lesson.authoringV2 as
        | {
            authoringLesson?: { stepIds?: string[] };
            stepsById?: Record<string, unknown>;
          }
        | undefined;
      const authoringStepIds = Array.isArray(authoringBundle?.authoringLesson?.stepIds)
        ? authoringBundle!.authoringLesson!.stepIds!.filter(
            (id): id is string => typeof id === "string"
          )
        : [];
      const orderedStepIds =
        authoringStepIds.length > 0 ? authoringStepIds : steps.map((s) => getStepAppId(s));
      const idx = orderedStepIds.findIndex((id) => id === stepId);
      const navigation = {
        bookId,
        lessonId,
        stepId,
        stepIndex: idx >= 0 ? idx : 0,
        totalSteps: orderedStepIds.length,
        previousStepId: idx > 0 ? orderedStepIds[idx - 1] ?? null : null,
        nextStepId:
          idx >= 0 && idx < orderedStepIds.length - 1 ? orderedStepIds[idx + 1] ?? null : null,
      };
      const authoringStep =
        (authoringBundle?.stepsById?.[stepId] as Record<string, unknown> | undefined) ?? undefined;

      const payloadBuildStartedAt = Date.now();
      const payload = buildPlaybackPayload({
        step,
        language: requestedLanguage,
        variantId,
        lessonId,
        authoringStep,
        navigation,
      });
      buildPayloadMs = msSince(payloadBuildStartedAt);
      responseBytes = safeJsonBytes(payload);
      outcome = "ok";

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
        `[playback-timing] route=context-step outcome=${outcome} status=200 stepId=${stepId} bookId=${bookId} lessonId=${lessonId} t_lookup_ms=${lookupMs} t_source_fetch_ms=${sourceFetchMs} t_validate_ms=${validateMs} t_build_payload_ms=${buildPayloadMs} t_total_ms=${msSince(startedAtMs)} response_size_bytes=${responseBytes}`
      );
    } catch (error) {
      outcome = error instanceof Error ? error.name : "error";
      console.info(
        `[playback-timing] route=context-step outcome=${outcome} status=error stepId=${req.params.stepId} bookId=${req.params.bookId} lessonId=${req.params.lessonId} t_lookup_ms=${lookupMs} t_source_fetch_ms=${sourceFetchMs} t_validate_ms=${validateMs} t_build_payload_ms=${buildPayloadMs} t_total_ms=${msSince(startedAtMs)}`
      );
      handleRouteError(res, error);
    }
  }
);

