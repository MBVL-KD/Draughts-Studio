import type { Book } from "../types/lessonTypes";
import type { LocalizedText } from "../types/i18nTypes";

export type TranslatedTextPatch = {
  path: string;
  values: Record<string, string>;
};

function tokenizePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const regex = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path))) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(Number(match[2]));
  }
  return tokens;
}

function getLocalizedShape(value: unknown): LocalizedText {
  if (
    value &&
    typeof value === "object" &&
    "values" in value &&
    typeof (value as { values?: unknown }).values === "object" &&
    (value as { values?: unknown }).values !== null
  ) {
    return value as LocalizedText;
  }
  return { values: {} };
}

function mergeValues(
  current: LocalizedText,
  incoming: Record<string, string>
): LocalizedText {
  const next: LocalizedText = {
    values: {
      ...(current.values ?? {}),
    },
  };

  Object.entries(incoming).forEach(([language, value]) => {
    if (typeof value !== "string") return;
    if (!value.trim()) return;
    const existing = next.values?.[language as keyof typeof next.values];
    if (typeof existing === "string" && existing.trim() && !value.trim()) return;
    next.values[language as keyof typeof next.values] = value;
  });

  return next;
}

function setByPath(root: unknown, path: string, incoming: Record<string, string>): void {
  const tokens = tokenizePath(path);
  if (tokens.length === 0) return;
  let cursor: unknown = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (typeof token === "number") {
      if (!Array.isArray(cursor) || token < 0 || token >= cursor.length) return;
      cursor = cursor[token];
      continue;
    }
    if (!cursor || typeof cursor !== "object") return;
    cursor = (cursor as Record<string, unknown>)[token];
  }

  const last = tokens[tokens.length - 1];
  if (typeof last === "number") return;
  if (!cursor || typeof cursor !== "object") return;

  const targetObject = cursor as Record<string, unknown>;
  const current = getLocalizedShape(targetObject[last]);
  targetObject[last] = mergeValues(current, incoming);
}

export function applyTranslatedTexts(
  book: Book,
  translations: TranslatedTextPatch[]
): Book {
  const next: Book = {
    ...book,
    lessons: Array.isArray(book.lessons)
      ? book.lessons.map((lesson) => ({
          ...lesson,
          steps: Array.isArray(lesson.steps)
            ? lesson.steps.map((step) => ({
                ...step,
                feedback: {
                  ...step.feedback,
                },
                presentation: {
                  ...step.presentation,
                  npc: step.presentation?.npc
                    ? {
                        ...step.presentation.npc,
                      }
                    : step.presentation?.npc,
                },
                validation:
                  step.validation?.type === "multiple_choice"
                    ? {
                        ...step.validation,
                        options: Array.isArray(step.validation.options)
                          ? step.validation.options.map((option) => ({
                              ...option,
                            }))
                          : [],
                      }
                    : step.validation,
              }))
            : [],
        }))
      : [],
  };

  translations.forEach((patch) => {
    if (!patch?.path || !patch.values || typeof patch.values !== "object") return;
    setByPath(next, patch.path, patch.values);
  });

  return next;
}
