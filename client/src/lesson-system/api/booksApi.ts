import type { Book } from "../types/lessonTypes";
import { apiDelete, apiGet, apiPatch, apiPost } from "./httpClient";

type ItemResponse<T> = {
  item: T;
};

export type AutoTranslateResult = {
  ok: boolean;
  booksScanned: number;
  updatedBooks: number;
  scannedFields: number;
  filledEnCount: number;
  filledNlCount: number;
  apiTranslatedCount: number;
  fallbackTranslatedCount: number;
  dryRun: boolean;
  reportPath: string;
};

type ListResponse<T> = {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
};

export function listBooks(
  params?: {
    search?: string;
    status?: string;
    tag?: string;
    includeImport?: boolean;
    compactImport?: boolean;
    limit?: number;
    offset?: number;
    sort?: "updatedAt_desc" | "updatedAt_asc";
  },
  init?: RequestInit
) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.includeImport === true) qs.set("includeImport", "true");
  if (params?.compactImport === true) qs.set("compactImport", "true");
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number") qs.set("offset", String(params.offset));
  if (params?.sort) qs.set("sort", params.sort);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet<ListResponse<Book>>(`/api/books${suffix}`, init);
}

export function getBook(bookId: string, init?: RequestInit) {
  return apiGet<ItemResponse<Book>>(`/api/books/${encodeURIComponent(bookId)}`, init);
}

export function createBook(document: Book, init?: RequestInit) {
  return apiPost<ItemResponse<Book>>("/api/books", { document }, init);
}

export function patchBook(
  bookId: string,
  expectedRevision: number,
  document: Book,
  init?: RequestInit
) {
  return apiPatch<ItemResponse<Book>>(
    `/api/books/${encodeURIComponent(bookId)}`,
    {
      expectedRevision,
      document,
    },
    init
  );
}

export function deleteBook(bookId: string, init?: RequestInit) {
  return apiDelete<ItemResponse<Book>>(`/api/books/${encodeURIComponent(bookId)}`, init);
}

export function autoTranslateMissingI18n(dryRun = false, init?: RequestInit) {
  return apiPost<ItemResponse<AutoTranslateResult>>("/api/books/i18n/auto-translate", { dryRun }, init);
}

