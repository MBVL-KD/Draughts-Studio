import { getBookById, patchBook } from "../repositories/bookRepository";
import { NotFoundError, ValidationError } from "../utils/httpErrors";
import { fillMissingEnNlPair, overwriteEnFromNl } from "../utils/translateProvider";
import { isLocalizedObject, readByPath, setLocalizedAtPath, toLocalizedValues } from "../utils/i18nPathUtils";

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
  /** Translated patches for the client to apply to the in-memory book (includes lesson/step paths). */
  translatedPatches?: Array<{ path: string; values: Record<string, string> }>;
};

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
    mode?: "fill_missing" | "nl_to_en_overwrite";
  }
): Promise<FillBookMissingI18nResult> {
  const dryRun = body.dryRun === true;
  const mode = body.mode === "nl_to_en_overwrite" ? "nl_to_en_overwrite" : "fill_missing";
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
  const translatedPatches: Array<{ path: string; values: Record<string, string> }> = [];

  for (const entry of entries) {
    assertSafeI18nPath(entry.path);
    const current = readByPath(working, entry.path);

    // Use the path-resolved value when it's a proper localized object.
    // For lesson/step paths the book document has no embedded lessons, so readByPath
    // returns undefined — fall back to entry.existing (sent by the client) as the source.
    const isLocalizedInDoc = isLocalizedObject(current);

    let localized: { values: Record<string, string> };
    if (isLocalizedInDoc) {
      localized = toLocalizedValues(current);
    } else if (entry.existing && typeof entry.existing === "object") {
      localized = { values: { ...(entry.existing as Record<string, string>) } };
    } else {
      pathsSkippedNoSource += 1;
      continue;
    }

    let fillResult: { changed: boolean; filledEn: number; filledNl?: number; apiTranslated: number; fallbackTranslated: number };
    if (mode === "nl_to_en_overwrite") {
      fillResult = await overwriteEnFromNl(localized);
    } else {
      fillResult = await fillMissingEnNlPair(localized, entry.missing);
    }

    if (!fillResult.changed) {
      if (entry.missing.length > 0) pathsSkippedNoSource += 1;
      continue;
    }

    pathsProcessed += 1;
    filledEnCount += fillResult.filledEn;
    filledNlCount += fillResult.filledNl ?? 0;
    apiTranslatedCount += fillResult.apiTranslated;
    fallbackTranslatedCount += fillResult.fallbackTranslated;

    // Always collect as client patch (client applies to in-memory book for lesson/step paths).
    translatedPatches.push({ path: entry.path, values: { ...localized.values } });

    // Also write into the working book doc for paths that resolved (book-level fields).
    if (isLocalizedInDoc) {
      setLocalizedAtPath(working, entry.path, localized);
    }
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
      translatedPatches,
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
    translatedPatches,
    book: updated,
  };
}

