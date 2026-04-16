import type { Book } from "../types/lessonTypes";
import type { LocalizedText } from "../types/i18nTypes";
import { findMissingLocalizedTexts } from "./findMissingLocalizedTexts";

export type MissingTextExportEntry = {
  path: string;
  existing: Record<string, string>;
  missing: string[];
};

function toLocalizedText(value: unknown): LocalizedText | null {
  if (!value || typeof value !== "object") return null;
  if (!("values" in value)) return null;
  const maybeValues = (value as { values?: unknown }).values;
  if (!maybeValues || typeof maybeValues !== "object") return null;
  return value as LocalizedText;
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

function readByPath(input: unknown, path: string): unknown {
  let cursor: unknown = input;
  for (const token of tokenizePath(path)) {
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

export function exportMissingTexts(
  book: Book,
  requiredLanguages: string[]
): MissingTextExportEntry[] {
  const missing = findMissingLocalizedTexts(book, requiredLanguages);
  return missing.map((entry) => {
    const localized = toLocalizedText(readByPath(book, entry.path));
    const existing: Record<string, string> = {};
    if (localized?.values && typeof localized.values === "object") {
      Object.entries(localized.values).forEach(([language, value]) => {
        existing[language] = typeof value === "string" ? value : "";
      });
    }
    return {
      path: entry.path,
      existing,
      missing: [...entry.languagesMissing],
    };
  });
}
