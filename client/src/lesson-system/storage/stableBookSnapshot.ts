import type { Book } from "../types/lessonTypes";

/**
 * Deterministic JSON string for dirty detection and last-saved fingerprints.
 * Sorts object keys recursively; omits undefined (JSON.stringify already does).
 */
export function stableStringifyBookForSnapshot(book: Book): string {
  return JSON.stringify(book, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) {
        sorted[k] = obj[k];
      }
      return sorted;
    }
    return value;
  });
}
