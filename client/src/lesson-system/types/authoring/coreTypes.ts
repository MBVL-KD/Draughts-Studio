/**
 * Ultra-small shared primitives for the lesson authoring model.
 * Lesson-specific enums live in their own modules — not here.
 */

export type Id = string;

/** ISO-like instant string; optional metadata only. */
export type TimestampString = string;

export type Side = "white" | "black";

export type { LanguageCode, LocalizedText } from "../i18nTypes";
