import type { Book } from "../types/lessonTypes";
import type { LocalizedText } from "../types/i18nTypes";

export type MissingLocalizedTextEntry = {
  path: string;
  languagesMissing: string[];
};

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function toLocalizedText(value: unknown): LocalizedText | null {
  if (!value || typeof value !== "object") return null;
  if (!("values" in value)) return null;
  const maybeValues = (value as { values?: unknown }).values;
  if (!maybeValues || typeof maybeValues !== "object") return null;
  return value as LocalizedText;
}

function missingLanguages(value: unknown, requiredLanguages: string[]): string[] {
  const localized = toLocalizedText(value);
  if (!localized) return [...requiredLanguages];
  return requiredLanguages.filter((language) => {
    const text = localized.values?.[language as keyof typeof localized.values];
    return isBlank(text);
  });
}

function pushIfMissing(
  result: MissingLocalizedTextEntry[],
  path: string,
  value: unknown,
  requiredLanguages: string[]
) {
  const languagesMissing = missingLanguages(value, requiredLanguages);
  if (languagesMissing.length > 0) {
    result.push({ path, languagesMissing });
  }
}

export function findMissingLocalizedTexts(
  input: Book,
  requiredLanguages: string[]
): MissingLocalizedTextEntry[] {
  const result: MissingLocalizedTextEntry[] = [];
  pushIfMissing(result, "book.title", input.title, requiredLanguages);
  pushIfMissing(result, "book.description", input.description, requiredLanguages);
  const lessons = Array.isArray(input.lessons) ? input.lessons : [];

  lessons.forEach((lesson, lessonIndex) => {
    const lessonBase = `lessons[${lessonIndex}]`;
    pushIfMissing(result, `${lessonBase}.title`, lesson.title, requiredLanguages);
    pushIfMissing(
      result,
      `${lessonBase}.description`,
      lesson.description,
      requiredLanguages
    );
    const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
    steps.forEach((step, stepIndex) => {
      const base = `lessons[${lessonIndex}].steps[${stepIndex}]`;
      pushIfMissing(result, `${base}.title`, step.title, requiredLanguages);
      pushIfMissing(result, `${base}.prompt`, step.prompt, requiredLanguages);
      pushIfMissing(result, `${base}.hint`, step.hint, requiredLanguages);
      pushIfMissing(result, `${base}.explanation`, step.explanation, requiredLanguages);
      pushIfMissing(
        result,
        `${base}.feedback.correct`,
        step.feedback?.correct,
        requiredLanguages
      );
      pushIfMissing(
        result,
        `${base}.feedback.incorrect`,
        step.feedback?.incorrect,
        requiredLanguages
      );
      pushIfMissing(
        result,
        `${base}.presentation.npc.text`,
        step.presentation?.npc?.text,
        requiredLanguages
      );

      if (step.validation?.type === "multiple_choice") {
        const options = Array.isArray(step.validation.options)
          ? step.validation.options
          : [];
        options.forEach((option, optionIndex) => {
          pushIfMissing(
            result,
            `${base}.validation.options[${optionIndex}].label`,
            option?.label,
            requiredLanguages
          );
        });
      }
    });
  });

  return result;
}
