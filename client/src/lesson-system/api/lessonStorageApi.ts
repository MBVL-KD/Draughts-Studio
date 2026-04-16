import type { Book } from "../types/lessonTypes";
import type { ApiError } from "./httpClient";
import { createBook, getBook, listBooks, patchBook } from "./booksApi";

export type PersistCurriculumBookParams = {
  book: Book;
  knownRevision: number | undefined;
  signal?: AbortSignal;
};

export async function persistCurriculumBookDocument(params: PersistCurriculumBookParams) {
  const { book, knownRevision, signal } = params;
  const bookId = book.bookId ?? book.id;
  if (typeof knownRevision === "number" && Number.isFinite(knownRevision)) {
    return patchBook(bookId, knownRevision, book, { signal });
  }
  return createBook(book, { signal });
}

export function formatStorageApiError(error: unknown, fallback: string): string {
  const apiError = error as ApiError | undefined;
  if (!apiError || typeof apiError !== "object") return fallback;
  const base = apiError.message || fallback;
  const issues = Array.isArray(apiError.issues) ? apiError.issues : [];
  if (issues.length === 0) return base;
  const top = issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(" | ");
  return `${base} — ${top}`;
}

export { getBook, listBooks };
