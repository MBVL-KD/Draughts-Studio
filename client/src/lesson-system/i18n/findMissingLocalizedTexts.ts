import type { Book } from "../types/lessonTypes";
import type { LocalizedText } from "../types/i18nTypes";

export type MissingLocalizedTextEntry = {
  path: string;
  languagesMissing: string[];
};

function isBlank(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  const placeholderValues = new Set([
    "new book",
    "new lesson",
    "new step",
    "coach text",
    "intro",
    "checkpoint",
    "option a",
    "option b",
  ]);
  return placeholderValues.has(normalized);
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
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const isPuzzelsImportBook = tags.includes("puzzels-import");
  pushIfMissing(result, "book.title", input.title, requiredLanguages);
  if (!isPuzzelsImportBook) {
    pushIfMissing(result, "book.description", input.description, requiredLanguages);
  }
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
      if (!isPuzzelsImportBook) {
        pushIfMissing(result, `${base}.prompt`, step.prompt, requiredLanguages);
        pushIfMissing(result, `${base}.hint`, step.hint, requiredLanguages);
        pushIfMissing(result, `${base}.explanation`, step.explanation, requiredLanguages);
      }
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
      if (!isPuzzelsImportBook) {
        pushIfMissing(
          result,
          `${base}.presentation.npc.text`,
          step.presentation?.npc?.text,
          requiredLanguages
        );
      }

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

    const authoring = lesson.authoringV2;
    if (authoring && typeof authoring === "object") {
      pushIfMissing(
        result,
        `${lessonBase}.authoringV2.authoringLesson.title`,
        (authoring as { authoringLesson?: { title?: unknown } }).authoringLesson?.title,
        requiredLanguages
      );
      pushIfMissing(
        result,
        `${lessonBase}.authoringV2.authoringLesson.description`,
        (authoring as { authoringLesson?: { description?: unknown } }).authoringLesson?.description,
        requiredLanguages
      );

      const stepsById =
        (authoring as { stepsById?: unknown }).stepsById &&
        typeof (authoring as { stepsById?: unknown }).stepsById === "object"
          ? ((authoring as { stepsById: Record<string, unknown> }).stepsById ?? {})
          : {};

      Object.entries(stepsById).forEach(([authoringStepId, stepNode]) => {
        const base = `${lessonBase}.authoringV2.stepsById.${authoringStepId}`;
        pushIfMissing(
          result,
          `${base}.title`,
          (stepNode as { title?: unknown })?.title,
          requiredLanguages
        );

        const timeline = Array.isArray((stepNode as { timeline?: unknown[] })?.timeline)
          ? (((stepNode as { timeline: unknown[] }).timeline ?? []) as unknown[])
          : [];
        timeline.forEach((moment, momentIndex) => {
          const momentBase = `${base}.timeline[${momentIndex}]`;
          pushIfMissing(
            result,
            `${momentBase}.title`,
            (moment as { title?: unknown })?.title,
            requiredLanguages
          );
          pushIfMissing(
            result,
            `${momentBase}.body`,
            (moment as { body?: unknown })?.body,
            requiredLanguages
          );
          pushIfMissing(
            result,
            `${momentBase}.caption`,
            (moment as { caption?: unknown })?.caption,
            requiredLanguages
          );

          const coaches = Array.isArray((moment as { coach?: unknown[] })?.coach)
            ? (((moment as { coach: unknown[] }).coach ?? []) as unknown[])
            : [];
          coaches.forEach((coach, coachIndex) => {
            pushIfMissing(
              result,
              `${momentBase}.coach[${coachIndex}].text`,
              (coach as { text?: unknown })?.text,
              requiredLanguages
            );
          });
        });
      });
    }
  });

  return result;
}
