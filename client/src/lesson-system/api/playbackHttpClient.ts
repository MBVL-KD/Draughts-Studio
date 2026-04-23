import { apiGet } from "./httpClient";
import type { ApiError } from "./httpClient";
import { PLAYBACK_EXPORT_REQUIRED_LANGUAGES } from "../config/playbackExportLanguages";

/**
 * HTTP client for lesson-step playback — aligned with bridge / CONTRACT_PLAYBACK_HTTP_V1:
 * - Headers: x-owner-type, x-owner-id (see server middleware authContext.js)
 * - Query: lang + repeated requiredLanguage (matches Express array query + comma form)
 *
 * Runtime consumers should use response.item only (payloadVersion 2).
 */

export type PlaybackEnvelope = {
  item: unknown;
  meta?: {
    bookId?: string;
    lessonId?: string;
    stepId?: string;
    language?: string;
  };
};

export type FetchPlaybackCommon = {
  /** Base API URL including origin; empty string uses same-origin + VITE_API_BASE_URL from httpClient. */
  baseUrl?: string;
  lang: string;
  /** Languages that must be non-empty in Studio for export (title, prompt, feedback, MC labels). */
  requiredLanguages: string[];
  ownerType: string;
  ownerId: string;
  signal?: AbortSignal;
};

function ownerHeaders(ownerType: string, ownerId: string): HeadersInit {
  return {
    "x-owner-type": ownerType,
    "x-owner-id": ownerId,
  };
}

/**
 * Build query string: bookId, lessonId, lang, and one requiredLanguage param per language
 * (same pattern as repeated query keys in Node fetch / puzzleSelection-style bridges).
 */
export function buildPlaybackQueryString(params: {
  bookId?: string;
  lessonId?: string;
  lang: string;
  requiredLanguages: string[];
}): string {
  const search = new URLSearchParams();
  if (params.bookId?.trim()) search.set("bookId", params.bookId.trim());
  if (params.lessonId?.trim()) search.set("lessonId", params.lessonId.trim());
  search.set("lang", params.lang.trim() || "en");
  const langs = params.requiredLanguages.length ? params.requiredLanguages : [...PLAYBACK_EXPORT_REQUIRED_LANGUAGES];
  for (const code of langs) {
    const t = String(code).trim();
    if (t) search.append("requiredLanguage", t);
  }
  return search.toString();
}

/**
 * Cache key convention (bridge / Roblox): revision avoids stale content after Studio publish.
 */
export function playbackCacheKey(parts: {
  bookId: string;
  lessonId: string;
  stepId: string;
  lang: string;
  bookRevision?: number | string | null;
}): string {
  const rev =
    parts.bookRevision === undefined || parts.bookRevision === null ? "unknown" : String(parts.bookRevision);
  return `playback:${parts.bookId}:${parts.lessonId}:${parts.stepId}:${parts.lang}:${rev}`;
}

function resolvePlaybackUrl(pathWithQuery: string, baseUrl?: string): string {
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  if (baseUrl && baseUrl.trim()) {
    return `${baseUrl.replace(/\/+$/, "")}${path}`;
  }
  return path;
}

/**
 * GET /api/steps/:stepId/playback?bookId&lessonId&lang&requiredLanguage=…
 */
export async function fetchPlaybackPayloadByStepId(
  params: FetchPlaybackCommon & {
    stepId: string;
    bookId?: string;
    lessonId?: string;
  }
): Promise<PlaybackEnvelope> {
  const qs = buildPlaybackQueryString({
    bookId: params.bookId,
    lessonId: params.lessonId,
    lang: params.lang,
    requiredLanguages: params.requiredLanguages,
  });
  const url = resolvePlaybackUrl(`/api/steps/${encodeURIComponent(params.stepId)}/playback?${qs}`, params.baseUrl);
  return apiGet<PlaybackEnvelope>(url, {
    headers: ownerHeaders(params.ownerType, params.ownerId),
    signal: params.signal,
  });
}

/**
 * GET /api/steps/book/:bookId/lesson/:lessonId/step/:stepId?lang&requiredLanguage=…
 */
export async function fetchPlaybackPayloadByBookLessonStep(
  params: FetchPlaybackCommon & {
    bookId: string;
    lessonId: string;
    stepId: string;
  }
): Promise<PlaybackEnvelope> {
  const qs = buildPlaybackQueryString({
    lang: params.lang,
    requiredLanguages: params.requiredLanguages,
  });
  const path = `/api/steps/book/${encodeURIComponent(params.bookId)}/lesson/${encodeURIComponent(
    params.lessonId
  )}/step/${encodeURIComponent(params.stepId)}?${qs}`;
  const url = resolvePlaybackUrl(path, params.baseUrl);
  return apiGet<PlaybackEnvelope>(url, {
    headers: ownerHeaders(params.ownerType, params.ownerId),
    signal: params.signal,
  });
}

export function isPlaybackApiError(e: unknown): e is ApiError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    typeof (e as ApiError).status === "number"
  );
}
