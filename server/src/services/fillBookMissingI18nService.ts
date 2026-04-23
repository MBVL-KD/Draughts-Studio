import { getBookById, patchBook } from "../repositories/bookRepository";
import { NotFoundError, ValidationError } from "../utils/httpErrors";
import { ensureLocalizedObject, fillMissingEnNlPair } from "../utils/translateProvider";

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

export type MissingI18nExportEntry = {
  path: string;
  existing?: Record<string, string>;
  missing: string[];
};

export type FillBookMissingI18nResult = {
  ok: true;
  bookId: string;
  dryRun: boolean;
  entriesReceived: number;
  pathsProcessed: number;
  pathsSkippedNoSource: number;
  filledEnCount: number;
  filledNlCount: number;
  apiTranslatedCount: number;
  fallbackTranslatedCount: number;
  book?: Record<string, unknown>;
};

function stripBookRootPrefix(path: string): string {
  return path.startsWith("book.") ? path.slice("book.".length) : path;
}

function assertSafeI18nPath(path: string) {
  if (typeof path !== "string" || path.length === 0 || path.length > 800) {
    throw new ValidationError("Invalid i18n path", [
      {
        path: "entries[].path",
        code: "i18n.path.invalid",
        message: "Path must be a non-empty string under 800 chars",
        severity: "error",
      },
    ]);
  }
  if (/__proto__|prototype|constructor/i.test(path)) {
    throw new ValidationError("Invalid i18n path", [
      {
        path: "entries[].path",
        code: "i18n.path.unsafe",
        message: "Path contains forbidden segments",
        severity: "error",
      },
    ]);
  }
  if (!/^[\w.\[\]\-]+$/.test(path)) {
    throw new ValidationError("Invalid i18n path", [
      {
        path: "entries[].path",
        code: "i18n.path.pattern",
        message: "Path has invalid characters",
        severity: "error",
      },
    ]);
  }
}

function tokenizePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const regex = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path))) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(Number(match[2]));
  }
  return tokens;
}

function readByPath(root: unknown, path: string): unknown {
  const effective = stripBookRootPrefix(path);
  let cursor: unknown = root;
  for (const token of tokenizePath(effective)) {
    if (typeof token === "number") {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[token];
      continue;
    }
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return cursor;
}

function setLocalizedAtPath(root: unknown, path: string, localized: { values: Record<string, string> }) {
  const effective = stripBookRootPrefix(path);
  const tokens = tokenizePath(effective);
  if (tokens.length === 0) return;
  let cursor: unknown = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (typeof token === "number") {
      if (!Array.isArray(cursor) || token < 0 || token >= cursor.length) return;
      cursor = cursor[token];
      continue;
    }
    if (!cursor || typeof cursor !== "object") return;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  const last = tokens[tokens.length - 1];
  if (typeof last === "number") return;
  if (!cursor || typeof cursor !== "object") return;
  (cursor as Record<string, unknown>)[last] = localized;
}

function parseEntries(raw: unknown): MissingI18nExportEntry[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("Invalid request body", [
      {
        path: "entries",
        code: "request.entries.invalid",
        message: "entries must be an array",
        severity: "error",
      },
    ]);
  }
  if (raw.length > 8000) {
    throw new ValidationError("Invalid request body", [
      {
        path: "entries",
        code: "request.entries.too_large",
        message: "Too many entries in one request",
        severity: "error",
      },
    ]);
  }
  const out: MissingI18nExportEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const path = String((row as { path?: unknown }).path ?? "").trim();
    const missing = (row as { missing?: unknown }).missing;
    if (!path || !Array.isArray(missing)) continue;
    const missingList = missing.filter((m): m is string => typeof m === "string" && m.trim().length > 0);
    if (missingList.length === 0) continue;
    out.push({
      path,
      existing:
        (row as { existing?: unknown }).existing &&
        typeof (row as { existing?: unknown }).existing === "object"
          ? { ...((row as { existing: Record<string, string> }).existing ?? {}) }
          : undefined,
      missing: missingList,
    });
  }
  return out;
}

export async function fillBookMissingI18nFromExport(
  owner: OwnerContext,
  bookId: string,
  body: {
    expectedRevision: number;
    entries: unknown;
    dryRun?: boolean;
  }
): Promise<FillBookMissingI18nResult> {
  const dryRun = body.dryRun === true;
  if (!Number.isFinite(body.expectedRevision)) {
    throw new ValidationError("Invalid request body", [
      {
        path: "expectedRevision",
        code: "request.expected_revision.invalid",
        message: "expectedRevision must be a finite number",
        severity: "error",
      },
    ]);
  }

  const book = await getBookById(owner, bookId);
  if (!book) throw new NotFoundError("Book not found");

  const entries = parseEntries(body.entries);
  const working = JSON.parse(JSON.stringify(book)) as Record<string, unknown>;

  let pathsProcessed = 0;
  let pathsSkippedNoSource = 0;
  let filledEnCount = 0;
  let filledNlCount = 0;
  let apiTranslatedCount = 0;
  let fallbackTranslatedCount = 0;

  for (const entry of entries) {
    assertSafeI18nPath(entry.path);
    const current = readByPath(working, entry.path);
    const localized = ensureLocalizedObject(current);
    const fillResult = await fillMissingEnNlPair(localized);

    if (!fillResult.changed) {
      if (entry.missing.length > 0) pathsSkippedNoSource += 1;
      continue;
    }

    pathsProcessed += 1;
    filledEnCount += fillResult.filledEn;
    filledNlCount += fillResult.filledNl;
    apiTranslatedCount += fillResult.apiTranslated;
    fallbackTranslatedCount += fillResult.fallbackTranslated;

    setLocalizedAtPath(working, entry.path, localized);
  }

  if (dryRun) {
    return {
      ok: true,
      bookId,
      dryRun: true,
      entriesReceived: entries.length,
      pathsProcessed,
      pathsSkippedNoSource,
      filledEnCount,
      filledNlCount,
      apiTranslatedCount,
      fallbackTranslatedCount,
    };
  }

  const updated = (await patchBook(
    owner,
    bookId,
    working as Parameters<typeof patchBook>[2],
    Number(body.expectedRevision)
  )) as Record<string, unknown>;

  return {
    ok: true,
    bookId,
    dryRun: false,
    entriesReceived: entries.length,
    pathsProcessed,
    pathsSkippedNoSource,
    filledEnCount,
    filledNlCount,
    apiTranslatedCount,
    fallbackTranslatedCount,
    book: updated,
  };
}

