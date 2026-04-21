import type { LanguageCode } from "../types/i18nTypes";

/**
 * Fixed set of languages that must pass `validateStepForRuntimeExport` on the server
 * (title; feedback.correct/incorrect and MC option labels when applicable).
 *
 * Keep this **identical** to Roblox `LearningRuntimeConfig` / `PlaybackRequiredLanguages`
 * (and to every `requiredLanguage` query param on playback requests).
 */
export const PLAYBACK_EXPORT_REQUIRED_LANGUAGES: readonly LanguageCode[] = ["en", "nl"];
