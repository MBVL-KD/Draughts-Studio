import type { Lesson } from "../types/lessonTypes";
import { apiDelete, apiGet, apiPatch, apiPost } from "./httpClient";

type ItemResponse<T> = { item: T };
type ListResponse<T> = { items: T[] };

export function getLessonsByBook(bookId: string, init?: RequestInit) {
  return apiGet<ListResponse<Lesson>>(
    `/api/lessons/by-book/${encodeURIComponent(bookId)}`,
    init
  );
}

export function getLesson(lessonId: string, init?: RequestInit) {
  return apiGet<ItemResponse<Lesson>>(`/api/lessons/${encodeURIComponent(lessonId)}`, init);
}

export function createLesson(document: Lesson, init?: RequestInit) {
  return apiPost<ItemResponse<Lesson>>("/api/lessons", { document }, init);
}

export function patchLesson(
  lessonId: string,
  expectedRevision: number,
  document: Lesson,
  init?: RequestInit
) {
  return apiPatch<ItemResponse<Lesson>>(
    `/api/lessons/${encodeURIComponent(lessonId)}`,
    { expectedRevision, document },
    init
  );
}

export function deleteLesson(lessonId: string, init?: RequestInit) {
  return apiDelete<ItemResponse<Lesson>>(`/api/lessons/${encodeURIComponent(lessonId)}`, init);
}
