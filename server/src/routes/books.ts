import express from "express";
import {
  createBook,
  getBookById,
  listBooks,
  patchBook,
  softDeleteBook,
} from "../repositories/bookRepository";
import { softDeleteLessonsByBookId } from "../repositories/lessonRepository";
import { softDeleteStepsByBookId } from "../repositories/stepRepository";
import { fillBookMissingI18nFromExport } from "../services/fillBookMissingI18nService";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/httpErrors";
import { getOwnerContext } from "./ownerContext";

type Req = express.Request;
type Res = express.Response;

type UnlockRules = {
  type: "none" | "requires_exams";
  requiredBookId?: string;
  requiredExamLessonIds?: string[];
  requiredPassMode?: "all" | "any";
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseSort(value: unknown): "updatedAt_desc" | "updatedAt_asc" | undefined {
  if (value === "updatedAt_desc" || value === "updatedAt_asc") return value;
  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function normalizeUnlockRules(raw: unknown): UnlockRules {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    type: obj.type === "requires_exams" ? "requires_exams" : "none",
    requiredBookId:
      typeof obj.requiredBookId === "string" && obj.requiredBookId.trim()
        ? obj.requiredBookId
        : undefined,
    requiredExamLessonIds: Array.isArray(obj.requiredExamLessonIds)
      ? obj.requiredExamLessonIds.filter((v): v is string => typeof v === "string" && !!v.trim())
      : undefined,
    requiredPassMode:
      obj.requiredPassMode === "any"
        ? "any"
        : obj.requiredPassMode === "all"
          ? "all"
          : undefined,
  };
}

function normalizeBookForClient(
  item: Record<string, unknown>,
  gates?: { isEntitled?: boolean; examGatePassed?: boolean }
): Record<string, unknown> {
  const accessModel = item.accessModel === "paid" ? "paid" : "free";
  const productId = typeof item.productId === "string" ? item.productId : "";
  const unlockRules = normalizeUnlockRules(item.unlockRules);
  const sequenceIndex = Number.isFinite(Number(item.sequenceIndex))
    ? Math.trunc(Number(item.sequenceIndex))
    : 9999;

  const entitlementOk = accessModel === "free" || (!!productId && gates?.isEntitled === true);
  const examGateOk = unlockRules.type !== "requires_exams" || gates?.examGatePassed === true;
  const lockReasons: string[] = [];
  if (!entitlementOk && accessModel === "paid") lockReasons.push("LOCKED_PURCHASE_REQUIRED");
  if (!examGateOk) lockReasons.push("LOCKED_PREREQ_EXAMS");

  return {
    ...item,
    accessModel,
    productId,
    unlockRules,
    sequenceIndex,
    eligibility: {
      eligible: entitlementOk && examGateOk,
      entitlementOk,
      examGateOk,
      lockReasons,
    },
  };
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
  console.error("[books-route] unhandled error", error);
  res.status(500).json({ message: "Internal server error" });
}

export const booksRouter = express.Router();

booksRouter.get("/", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const limit = toFiniteNumber(req.query.limit);
    const offset = toFiniteNumber(req.query.offset);
    const excludeImport = toBoolean(req.query.includeImport) !== true;

    const items = await listBooks(owner, {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
      excludeTag: excludeImport ? "puzzels-import" : undefined,
      limit,
      offset,
      sort: parseSort(req.query.sort),
    });

    const isEntitled = toBoolean(req.query.isEntitled);
    const examGatePassed = toBoolean(req.query.examGatePassed);
    const normalizedItems = items.map((it) =>
      normalizeBookForClient(it as unknown as Record<string, unknown>, {
        isEntitled,
        examGatePassed,
      })
    );

    res.json({
      items: normalizedItems,
      pagination: { limit: limit ?? 25, offset: offset ?? 0, count: normalizedItems.length },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.get("/:bookId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await getBookById(owner, req.params.bookId);
    if (!item) throw new NotFoundError("Book not found");
    res.json({ item: normalizeBookForClient(item as unknown as Record<string, unknown>) });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.post("/", async (req: Req, res: Res) => {
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
    const item = await createBook(owner, req.body.document);
    res.status(201).json({ item: normalizeBookForClient(item as unknown as Record<string, unknown>) });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.patch("/:bookId", async (req: Req, res: Res) => {
  try {
    const { expectedRevision, document } = req.body ?? {};
    if (!Number.isFinite(expectedRevision) || !isPlainObject(document)) {
      const issues = [];
      if (!Number.isFinite(expectedRevision))
        issues.push({ path: "expectedRevision", code: "request.expected_revision.invalid", message: "PATCH requires expectedRevision as a finite number", severity: "error" as const });
      if (!isPlainObject(document))
        issues.push({ path: "document", code: "request.document.invalid", message: "PATCH requires document as a plain object", severity: "error" as const });
      throw new ValidationError("Invalid request body", issues);
    }
    const owner = getOwnerContext(req);
    const item = await patchBook(owner, req.params.bookId, document, Number(expectedRevision));
    res.json({ item: normalizeBookForClient(item as unknown as Record<string, unknown>) });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.delete("/:bookId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await softDeleteBook(owner, req.params.bookId);
    // Cascade soft-delete to lessons and steps
    await Promise.all([
      softDeleteLessonsByBookId(owner, req.params.bookId),
      softDeleteStepsByBookId(owner, req.params.bookId),
    ]);
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.post("/:bookId/i18n/fill-missing-export", async (req: Req, res: Res) => {
  try {
    if (!isPlainObject(req.body)) throw new ValidationError("Invalid request body", [{ path: "body", code: "request.body.invalid", message: "Body must be a plain object", severity: "error" }]);
    const owner = getOwnerContext(req);
    const item = await fillBookMissingI18nFromExport(owner, req.params.bookId, {
      expectedRevision: req.body.expectedRevision,
      entries: req.body.entries,
      dryRun: req.body.dryRun === true,
      mode: req.body.mode === "nl_to_en_overwrite" ? "nl_to_en_overwrite" : "fill_missing",
    });
    res.json({ item });
  } catch (error) {
    handleRouteError(res, error);
  }
});
