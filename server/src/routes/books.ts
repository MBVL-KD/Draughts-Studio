import express from "express";
import {
  createBook,
  getBookById,
  listBooks,
  patchBook,
  softDeleteBook,
} from "../repositories/bookRepository";
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

function parseSort(value: unknown): "updatedAt_desc" | "updatedAt_asc" | undefined {
  if (value === "updatedAt_desc" || value === "updatedAt_asc") return value;
  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sendItem(res: Res, item: Record<string, unknown>) {
  res.json({
    item: {
      ...item,
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
    const items = await listBooks(owner, {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
      limit,
      offset,
      sort: parseSort(req.query.sort),
    });
    res.json({
      items,
      pagination: {
        limit: limit ?? 25,
        offset: offset ?? 0,
        count: items.length,
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
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

booksRouter.delete("/:bookId", async (req: Req, res: Res) => {
  try {
    const owner = getOwnerContext(req);
    const item = await softDeleteBook(owner, req.params.bookId);
    sendItem(res, item as unknown as Record<string, unknown>);
  } catch (error) {
    handleRouteError(res, error);
  }
});

