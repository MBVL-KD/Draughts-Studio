import express from "express";
import { findStepRef, getLessonByIdWithinBook } from "../repositories/bookRepository";
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

type Req = express.Request;
type Res = express.Response;

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

export const playbackRouter = express.Router();

playbackRouter.get("/:stepId/playback", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const requestedLanguage = resolveRequestedLanguage(req);
    const requiredLanguages = resolveRequiredLanguages(req);
    const stepId = req.params.stepId;

    const stepRef = await findStepRef(owner, stepId);
    if (!stepRef) {
      throw new NotFoundError("Step not found");
    }

    const guardBookId =
      typeof req.query.bookId === "string" ? req.query.bookId.trim() : "";
    const guardLessonId =
      typeof req.query.lessonId === "string" ? req.query.lessonId.trim() : "";
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

    const sourceId =
      typeof stepRef.step?.sourceRef?.sourceId === "string"
        ? stepRef.step.sourceRef.sourceId
        : undefined;
    const source = sourceId ? await getSourceById(owner, sourceId) : undefined;

    const runtimeValidation = validateStepForRuntimeExport(stepRef.step, source, {
      requiredLanguages,
    });
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

    const lessonAny = (stepRef.lesson ?? {}) as Record<string, unknown>;
    const authoringBundle = lessonAny.authoringV2 as
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

    const payload = buildPlaybackPayload({
      step: stepRef.step,
      language: requestedLanguage,
      variantId,
      lessonId: stepRef.lessonId,
      authoringStep,
      navigation,
    });

    const revision = revisionFromBook(stepRef.book);
    res.json({
      item: payload,
      meta: {
        bookId: stepRef.bookId,
        lessonId: stepRef.lessonId,
        stepId: stepRef.stepId,
        language: requestedLanguage,
        ...(revision !== undefined ? { revision, bookRevision: revision } : {}),
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

playbackRouter.get(
  "/book/:bookId/lesson/:lessonId/step/:stepId",
  async (req: Req, res: Res) => {
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
      const lessonRef = await getLessonByIdWithinBook(owner, bookId, lessonId);
      if (!lessonRef?.lesson) throw new NotFoundError("Lesson not found");
      const lesson = lessonRef.lesson as Record<string, unknown>;
      const steps = ((lesson.steps ?? []) as Array<{ id?: string; stepId?: string }>).filter(Boolean);
      const step = steps.find((s) => getStepAppId(s) === stepId);
      if (!step) throw new NotFoundError("Step not found");

      const sourceId =
        typeof (step as { sourceRef?: { sourceId?: string } }).sourceRef?.sourceId === "string"
          ? (step as { sourceRef: { sourceId: string } }).sourceRef.sourceId
          : undefined;
      const source = sourceId ? await getSourceById(owner, sourceId) : undefined;
      const runtimeValidation = validateStepForRuntimeExport(step, source, {
        requiredLanguages,
      });
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

      const payload = buildPlaybackPayload({
        step,
        language: requestedLanguage,
        variantId,
        lessonId,
        authoringStep,
        navigation,
      });

      const revision = revisionFromBook(lessonRef.book);
      res.json({
        item: payload,
        meta: {
          bookId,
          lessonId,
          stepId,
          language: requestedLanguage,
          ...(revision !== undefined ? { revision, bookRevision: revision } : {}),
        },
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  }
);

