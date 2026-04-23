import { apiGet } from "./httpClient";
import { PLAYBACK_EXPORT_REQUIRED_LANGUAGES } from "../config/playbackExportLanguages";

export type PlaybackResponse<T = unknown> = {
  item: T;
  meta?: Record<string, unknown>;
};

export function getStepPlayback(
  stepId: string,
  params?: {
    bookId?: string;
    lessonId?: string;
    lang?: string;
    requiredLanguage?: string[];
  }
) {
  const qs = new URLSearchParams();
  if (params?.bookId) qs.set("bookId", params.bookId);
  if (params?.lessonId) qs.set("lessonId", params.lessonId);
  if (params?.lang) qs.set("lang", params.lang);
  const required =
    params?.requiredLanguage && params.requiredLanguage.length > 0
      ? params.requiredLanguage
      : [...PLAYBACK_EXPORT_REQUIRED_LANGUAGES];
  required.forEach((language) => qs.append("requiredLanguage", language));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet<PlaybackResponse>(
    `/api/steps/${encodeURIComponent(stepId)}/playback${suffix}`
  );
}

