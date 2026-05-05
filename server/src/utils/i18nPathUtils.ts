export type LocalizedValues = { values: Record<string, string> };

/** Strips "book." prefix that export paths carry. */
export function stripBookRootPrefix(path: string): string {
  return path.startsWith("book.") ? path.slice("book.".length) : path;
}

/** Splits a dot/bracket path into string and numeric tokens. */
export function tokenizePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const regex = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path))) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(Number(match[2]));
  }
  return tokens;
}

/** Type guard: true when value has shape { values: object }. */
export function isLocalizedObject(value: unknown): value is LocalizedValues {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "values" in (value as object) &&
    typeof (value as { values: unknown }).values === "object" &&
    (value as { values: unknown }).values !== null
  );
}

/**
 * Reads value at `path` inside `root`.
 * Automatically strips "book." prefix.
 */
export function readByPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const token of tokenizePath(stripBookRootPrefix(path))) {
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

/**
 * Writes a LocalizedValues object at `path` inside `root`.
 * Only writes when the last token resolves to an object property.
 */
export function setLocalizedAtPath(
  root: unknown,
  path: string,
  localized: LocalizedValues
): void {
  const tokens = tokenizePath(stripBookRootPrefix(path));
  if (tokens.length === 0) return;
  let cursor: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
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

/** Returns a copy of value as LocalizedValues, or { values: {} } if not valid. */
export function toLocalizedValues(value: unknown): LocalizedValues {
  if (isLocalizedObject(value)) {
    return { values: { ...(value.values as Record<string, string>) } };
  }
  return { values: {} };
}
