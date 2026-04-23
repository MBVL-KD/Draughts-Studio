import express from "express";
import {
  getLessonById,
  getLessonsByBookId,
  upsertLesson,
  patchLesson,
  softDeleteLesson,
} from "../repositories/lessonRepository";
import { softDeleteStepsByLessonId } from "../repositories/stepRepository";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/httpErrors";
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
  console.error("[lessons-route] unhandled error", error);
  res.status(500).json({ message: "Internal server error" });
}

export const lessonsRouter = express.Router();

lessonsRouter.get("/by-book/:bookId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const items = await getLessonsByBookId(owner, req.params.bookId);
    res.json({ items });
  } catch (error) {
    handleRouteError(res, error);
  }
});

lessonsRouter.get("/:lessonId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await getLessonById(owner, req.params.lessonId);
    if (!item) throw new NotFoundError("Lesson not found");
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

lessonsRouter.post("/", async (req: Req, res: Res) => {
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
    const item = await upsertLesson(owner, req.body.document);
    res.status(201).json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

lessonsRouter.patch("/:lessonId", async (req: Req, res: Res) => {
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
    const item = await patchLesson(
      owner,
      req.params.lessonId,
      document,
      Number(expectedRevision)
    );
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

lessonsRouter.delete("/:lessonId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await softDeleteLesson(owner, req.params.lessonId);
    // Cascade soft-delete steps belonging to this lesson
    await softDeleteStepsByLessonId(owner, req.params.lessonId);
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});
