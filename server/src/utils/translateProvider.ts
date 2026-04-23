/**
 * Shared translation helpers (OpenAI, generic HTTP API, or phrase-map fallback).
 * Mirrors server/src/scripts/autoTranslateMissingLocalizedTexts.js
 */

const PHRASE_MAP_NL_TO_EN = new Map<string, string>([
  ["Niveau", "Level"],
  ["Examen", "Exam"],
  ["Combineren", "Combinations"],
  ["De Eerste Zet", "The First Move"],
  ["De Tweede Zet", "The Second Move"],
  ["eerste", "first"],
  ["tweede", "second"],
  ["EERSTE", "FIRST"],
  ["TWEEDE", "SECOND"],
  ["VOOR", "FOR"],
  ["Het", "The"],
  ["HET", "THE"],
  ["Geïmporteerde puzzels", "Imported puzzles"],
  ["Elke les is een collectie.", "Each lesson is a collection."],
  ["Slagzet Van De Dag", "Capture of the Day"],
  ["Puzzels", "Puzzles"],
  ["Probeer opnieuw.", "Try again."],
  ["Goed gedaan.", "Correct."],
]);

const PHRASE_MAP_EN_TO_NL = new Map<string, string>([
  ["Level", "Niveau"],
  ["Exam", "Examen"],
  ["Combinations", "Combineren"],
  ["The First Move", "De Eerste Zet"],
  ["The Second Move", "De Tweede Zet"],
  ["FIRST", "EERSTE"],
  ["SECOND", "TWEEDE"],
  ["FOR", "VOOR"],
  ["Puzzles", "Puzzels"],
  ["Capture of the Day", "Slagzet van de dag"],
  ["Try again.", "Probeer opnieuw."],
  ["Correct.", "Goed gedaan."],
]);

function applyPhraseMap(text: string, phraseMap: Map<string, string>): string {
  let out = text;
  for (const [source, target] of phraseMap.entries()) {
    out = out.replaceAll(source, target);
  }
  return out;
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function smartTranslate(text: string, direction: "nlToEn" | "enToNl"): string {
  const trimmed = normalizeSpace(text);
  if (!trimmed) return "";
  if (direction === "nlToEn") return applyPhraseMap(trimmed, PHRASE_MAP_NL_TO_EN);
  return applyPhraseMap(trimmed, PHRASE_MAP_EN_TO_NL);
}

async function translateViaApi(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  const apiUrl = process.env.TRANSLATE_API_URL;
  if (!apiUrl) return null;
  const payload: Record<string, unknown> = {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: "text",
  };
  const apiKey = process.env.TRANSLATE_API_KEY;
  if (apiKey) payload.api_key = apiKey;
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { translatedText?: string };
    const translated =
      typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
    return translated || null;
  } catch {
    return null;
  }
}

async function translateViaOpenAI(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const endpoint = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  const systemPrompt =
    "You are a translation engine. Translate exactly and naturally. Return only the translated text, no quotes, no markdown, no explanation.";
  const userPrompt = `Translate from ${sourceLang} to ${targetLang}:\n${text}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    return null;
  } catch {
    return null;
  }
}

export async function translateViaProvider(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  const provider = (process.env.TRANSLATE_PROVIDER || "").trim().toLowerCase();
  if (provider === "openai") return translateViaOpenAI(text, sourceLang, targetLang);
  return translateViaApi(text, sourceLang, targetLang);
}

export function isBlankLocalized(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export type LocalizedValues = { values: Record<string, string> };

export function ensureLocalizedObject(value: unknown): LocalizedValues {
  if (
    value &&
    typeof value === "object" &&
    "values" in value &&
    typeof (value as { values?: unknown }).values === "object" &&
    (value as { values?: unknown }).values !== null
  ) {
    return { values: { ...((value as { values: Record<string, string> }).values ?? {}) } };
  }
  return { values: {} };
}

export async function fillMissingEnNlPair(
  localized: LocalizedValues
): Promise<{
  changed: boolean;
  filledEn: number;
  filledNl: number;
  apiTranslated: number;
  fallbackTranslated: number;
}> {
  const en = typeof localized.values.en === "string" ? localized.values.en : "";
  const nl = typeof localized.values.nl === "string" ? localized.values.nl : "";
  let changed = false;
  let filledEn = 0;
  let filledNl = 0;
  let apiTranslated = 0;
  let fallbackTranslated = 0;

  if (isBlankLocalized(en) && !isBlankLocalized(nl)) {
    const from = normalizeSpace(nl);
    const apiText = await translateViaProvider(from, "nl", "en");
    localized.values.en = apiText || smartTranslate(from, "nlToEn");
    changed = true;
    filledEn = 1;
    if (apiText) apiTranslated = 1;
    else fallbackTranslated = 1;
  }

  if (isBlankLocalized(nl) && !isBlankLocalized(en)) {
    const from = normalizeSpace(en);
    const apiText = await translateViaProvider(from, "en", "nl");
    localized.values.nl = apiText || smartTranslate(from, "enToNl");
    changed = true;
    filledNl = 1;
    if (apiText) apiTranslated += 1;
    else fallbackTranslated += 1;
  }

  return { changed, filledEn, filledNl, apiTranslated, fallbackTranslated };
}
