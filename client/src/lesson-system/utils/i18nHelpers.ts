// client/src/lesson-system/utils/i18nHelpers.ts

import type { LanguageCode, LocalizedText } from "../types/i18nTypes";

export function createLocalizedText(
  en = "",
  nl = ""
): LocalizedText {
  return {
    values: {
      en,
      nl,
    },
  };
}

export function readLocalizedText(
  value: LocalizedText | undefined,
  language: LanguageCode = "en",
  fallbackLanguage: LanguageCode = "en"
): string {
  if (!value?.values) return "";
  const primary = value.values[language];
  if (typeof primary === "string" && primary.trim().length > 0) return primary;
  const fallback = value.values[fallbackLanguage];
  if (typeof fallback === "string" && fallback.trim().length > 0) return fallback;
  // Last resort: return first non-empty localized value if present.
  const firstNonEmpty = Object.values(value.values).find(
    (entry) => typeof entry === "string" && entry.trim().length > 0
  );
  return typeof firstNonEmpty === "string" ? firstNonEmpty : "";
}

export function writeLocalizedText(
  current: LocalizedText | undefined,
  language: LanguageCode,
  text: string
): LocalizedText {
  return {
    values: {
      ...(current?.values ?? {}),
      [language]: text,
    },
  };
}