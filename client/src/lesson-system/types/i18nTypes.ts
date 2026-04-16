export type LanguageCode = "en" | "nl";

export type LocalizedText = {
  values: Partial<Record<LanguageCode, string>>;
};