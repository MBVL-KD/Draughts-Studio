import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import { apiDelete, apiGet, apiPatch, apiPost } from "./httpClient";

type ItemResponse<T> = { item: T };
type ListResponse<T> = { items: T[] };

export function getStepsByLesson(lessonId: string, init?: RequestInit) {
  return apiGet<ListResponse<AuthoringLessonStep>>(
    `/api/steps/by-lesson/${encodeURIComponent(lessonId)}`,
    init
  );
}

export function getStep(stepId: string, init?: RequestInit) {
  return apiGet<ItemResponse<AuthoringLessonStep>>(
    `/api/steps/${encodeURIComponent(stepId)}`,
    init
  );
}

export function createStep(document: AuthoringLessonStep, init?: RequestInit) {
  return apiPost<ItemResponse<AuthoringLessonStep>>("/api/steps", { document }, init);
}

export function patchStep(
  stepId: string,
  expectedRevision: number,
  document: AuthoringLessonStep,
  init?: RequestInit
) {
  return apiPatch<ItemResponse<AuthoringLessonStep>>(
    `/api/steps/${encodeURIComponent(stepId)}`,
    { expectedRevision, document },
    init
  );
}

export function deleteStep(stepId: string, init?: RequestInit) {
  return apiDelete<ItemResponse<AuthoringLessonStep>>(
    `/api/steps/${encodeURIComponent(stepId)}`,
    init
  );
}
