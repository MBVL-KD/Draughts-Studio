import express from "express";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  createBook,
  getBookById,
  listBooks,
  patchBook,
  softDeleteBook,
} from "../repositories/bookRepository";
import {
  removePlaybackStepsByBook,
  replacePlaybackStepsForBook,
} from "../repositories/playbackStepRepository";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/httpErrors";
import { getOwnerContext } from "./ownerContext";

type Req = express.Request;
type Res = express.Response;
const execFileAsync = promisify(execFile);

function startDetachedSplitLargePuzzelsJob(ownerType: string, ownerId: string) {
  const scriptPath = path.resolve(__dirname, "../scripts/splitLargePuzzelsBooks.ts");
  const reportsDir = path.resolve(__dirname, "../../..", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(
    reportsDir,
    `split-large-puzzels-${ownerType}-${ownerId}-${stamp}.log`
  );
  const fd = fs.openSync(logPath, "a");
  const env = {
    ...process.env,
    TS_NODE_TRANSPILE_ONLY: "true",
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({
      module: "CommonJS",
      moduleResolution: "Node",
      target: "ES2020",
      esModuleInterop: true,
      ignoreDeprecations: "6.0",
    }),
  };
  const child = spawn(
    process.execPath,
    [
      "-r",
      "ts-node/register",
      scriptPath,
      "--write",
      `--ownerType=${ownerType}`,
      `--ownerId=${ownerId}`,
    ],
    {
      cwd: path.resolve(__dirname, "../.."),
      env,
      detached: true,
      stdio: ["ignore", fd, fd],
    }
  );
  child.unref();
  fs.closeSync(fd);
  return {
    pid: child.pid,
    logPath,
  };
}

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
  const type = obj.type === "requires_exams" ? "requires_exams" : "none";
  const requiredBookId = typeof obj.requiredBookId === "string" && obj.requiredBookId.trim() ? obj.requiredBookId : undefined;
  const requiredExamLessonIds = Array.isArray(obj.requiredExamLessonIds)
    ? obj.requiredExamLessonIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : undefined;
  const requiredPassMode = obj.requiredPassMode === "any" ? "any" : obj.requiredPassMode === "all" ? "all" : undefined;
  return { type, requiredBookId, requiredExamLessonIds, requiredPassMode };
}

function normalizeBookForClient(
  item: Record<string, unknown>,
  gates?: { isEntitled?: boolean; examGatePassed?: boolean },
  options?: { compactImport?: boolean }
): Record<string, unknown> {
  const accessModel = item.accessModel === "paid" ? "paid" : "free";
  const productId = typeof item.productId === "string" ? item.productId : "";
  const unlockRules = normalizeUnlockRules(item.unlockRules);
  const sequenceIndexRaw = Number(item.sequenceIndex);
  const sequenceIndex = Number.isFinite(sequenceIndexRaw) ? Math.trunc(sequenceIndexRaw) : 9999;
  const lessons = Array.isArray(item.lessons) ? item.lessons : [];
  const normalizedLessons = lessons.map((lesson) => {
    if (!lesson || typeof lesson !== "object") return lesson;
    const row = lesson as Record<string, unknown>;
    return {
      ...row,
      isExam: row.isExam === true,
    };
  });

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
    lessons: normalizedLessons,
    ...(options?.compactImport === true &&
    Array.isArray(item.tags) &&
    item.tags.includes("puzzels-import")
      ? { isCompactImport: true }
      : {}),
    eligibility: {
      eligible: entitlementOk && examGateOk,
      entitlementOk,
      examGateOk,
      lockReasons,
    },
  };
}

function sendItem(res: Res, item: Record<string, unknown>) {
  const normalized = normalizeBookForClient(item);
  res.json({
    item: {
      ...normalized,
      revision: item.revision,
    },
  });
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

export const booksRouter = express.Router();

booksRouter.get("/", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const limit = toFiniteNumber(req.query.limit);
    const offset = toFiniteNumber(req.query.offset);
    const includeImport = toBoolean(req.query.includeImport) === true;
    const compactImport = toBoolean(req.query.compactImport) === true;
    const items = await listBooks(owner, {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
      includeImport,
      compactImport,
      limit,
      offset,
      sort: parseSort(req.query.sort),
    });
    const isEntitled = toBoolean(req.query.isEntitled);
    const examGatePassed = toBoolean(req.query.examGatePassed);
    const normalizedItems = items.map((it) =>
      normalizeBookForClient(
        it as unknown as Record<string, unknown>,
        { isEntitled, examGatePassed },
        { compactImport }
      )
    );
    res.json({
      items: normalizedItems,
      pagination: {
        limit: limit ?? 25,
        offset: offset ?? 0,
        count: normalizedItems.length,
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.get("/:bookId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await getBookById(owner, req.params.bookId);
    if (!item) {
      throw new NotFoundError("Book not found");
    }
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.post("/", async (req: Req, res: Res) => {
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

    const owner = getOwnerContext(req);
    const item = await createBook(owner, req.body.document);
    await replacePlaybackStepsForBook(
      owner,
      item as Record<string, unknown> & { bookId?: string; id?: string; revision?: number }
    );
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.patch("/:bookId", async (req: Req, res: Res) => {
  try {
    const expectedRevision = req.body?.expectedRevision;
    const document = req.body?.document;
    if (!Number.isFinite(expectedRevision) || !isPlainObject(document)) {
      const issues = [];
      if (!Number.isFinite(expectedRevision)) {
        issues.push({
          path: "expectedRevision",
          code: "request.expected_revision.invalid",
          message: "PATCH requires expectedRevision as a finite number",
          severity: "error" as const,
        });
      }
      if (!isPlainObject(document)) {
        issues.push({
          path: "document",
          code: "request.document.invalid",
          message: "PATCH requires document as a plain object",
          severity: "error" as const,
        });
      }
      throw new ValidationError("Invalid request body", [
        ...issues,
      ]);
    }

    const owner = getOwnerContext(req);
    const item = await patchBook(
      owner,
      req.params.bookId,
      document,
      Number(expectedRevision)
    );
    await replacePlaybackStepsForBook(
      owner,
      item as Record<string, unknown> & { bookId?: string; id?: string; revision?: number }
    );
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.delete("/:bookId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await softDeleteBook(owner, req.params.bookId);
    await removePlaybackStepsByBook(owner, req.params.bookId);
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.post("/i18n/auto-translate", async (req: Req, res: Res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const scriptPath = path.resolve(__dirname, "../scripts/autoTranslateMissingLocalizedTexts.js");
    const args = [scriptPath, ...(dryRun ? ["--dry-run"] : [])];
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: path.resolve(__dirname, "../.."),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
    const match = output.match(/(\{[\s\S]*\})\s*$/);
    if (!match) {
      throw new Error("No JSON result returned by translation script.");
    }
    const parsed = JSON.parse(match[1]);
    res.json({ item: parsed });
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.post("/admin/split-large-puzzels", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const job = startDetachedSplitLargePuzzelsJob(owner.ownerType, owner.ownerId);
    res.json({
      item: {
        started: true,
        pid: job.pid,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        logPath: job.logPath,
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

