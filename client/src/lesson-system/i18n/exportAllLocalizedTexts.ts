import type { Book } from "../types/lessonTypes";
import type { LocalizedText } from "../types/i18nTypes";

export type FullTextExportEntry = {
  path: string;
  values: Record<string, string>;
};

export type FullBookTextExport = {
  bookId: string;
  title: string;
  entries: FullTextExportEntry[];
};

export type FullBooksTextExportPayload = {
  schemaVersion: "studio-i18n-all-books.v1";
  books: FullBookTextExport[];
};

function toLocalizedText(value: unknown): LocalizedText | null {
  if (!value || typeof value !== "object") return null;
  if (!("values" in value)) return null;
  const maybeValues = (value as { values?: unknown }).values;
  if (!maybeValues || typeof maybeValues !== "object") return null;
  return value as LocalizedText;
}

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

function readByPath(input: unknown, path: string): unknown {
  let cursor: unknown = input;
  for (const token of tokenizePath(path)) {
    if (typeof token === "number") {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[token];
      continue;
    }
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return cursor;
}

function allLocalizedPaths(book: Book): string[] {
  const out: string[] = [];
  out.push("title");
  out.push("description");
  const lessons = Array.isArray(book.lessons) ? book.lessons : [];
  lessons.forEach((lesson, lessonIndex) => {
    const lessonBase = `lessons[${lessonIndex}]`;
    out.push(`${lessonBase}.title`);
    out.push(`${lessonBase}.description`);
    const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
    steps.forEach((step, stepIndex) => {
      const base = `${lessonBase}.steps[${stepIndex}]`;
      out.push(`${base}.title`);
      out.push(`${base}.prompt`);
      out.push(`${base}.hint`);
      out.push(`${base}.explanation`);
      out.push(`${base}.feedback.correct`);
      out.push(`${base}.feedback.incorrect`);
      out.push(`${base}.presentation.npc.text`);
      if (step.validation?.type === "multiple_choice") {
        const options = Array.isArray(step.validation.options) ? step.validation.options : [];
        options.forEach((_, optionIndex) => {
          out.push(`${base}.validation.options[${optionIndex}].label`);
        });
      }
    });

    const authoring = lesson.authoringV2;
    const stepsById =
      authoring && typeof authoring === "object" && authoring.stepsById && typeof authoring.stepsById === "object"
        ? (authoring.stepsById as Record<string, unknown>)
        : {};
    out.push(`${lessonBase}.authoringV2.authoringLesson.title`);
    out.push(`${lessonBase}.authoringV2.authoringLesson.description`);
    Object.entries(stepsById).forEach(([authoringStepId, stepNode]) => {
      const stepPath = `${lessonBase}.authoringV2.stepsById.${authoringStepId}`;
      out.push(`${stepPath}.title`);
      const timeline =
        stepNode && typeof stepNode === "object" && Array.isArray((stepNode as { timeline?: unknown[] }).timeline)
          ? ((stepNode as { timeline: unknown[] }).timeline ?? [])
          : [];
      timeline.forEach((moment, momentIndex) => {
        const momentBase = `${stepPath}.timeline[${momentIndex}]`;
        out.push(`${momentBase}.title`);
        out.push(`${momentBase}.body`);
        out.push(`${momentBase}.caption`);
        const coaches =
          moment && typeof moment === "object" && Array.isArray((moment as { coach?: unknown[] }).coach)
            ? ((moment as { coach: unknown[] }).coach ?? [])
            : [];
        coaches.forEach((_, coachIndex) => {
          out.push(`${momentBase}.coach[${coachIndex}].text`);
        });
      });
    });
  });
  return out;
}

export function exportAllLocalizedTextsFromBook(book: Book): FullBookTextExport {
  const bookId = book.bookId ?? book.id;
  const title =
    toLocalizedText(book.title)?.values?.en?.trim() ||
    toLocalizedText(book.title)?.values?.nl?.trim() ||
    bookId;
  const entries: FullTextExportEntry[] = [];
  for (const path of allLocalizedPaths(book)) {
    const localized = toLocalizedText(readByPath(book, path));
    const values: Record<string, string> = {};
    if (localized?.values && typeof localized.values === "object") {
      Object.entries(localized.values).forEach(([language, value]) => {
        values[language] = typeof value === "string" ? value : "";
      });
    }
    entries.push({ path, values });
  }
  return { bookId, title, entries };
}

export function exportAllLocalizedTextsFromBooks(books: Book[]): FullBooksTextExportPayload {
  return {
    schemaVersion: "studio-i18n-all-books.v1",
    books: (Array.isArray(books) ? books : []).map(exportAllLocalizedTextsFromBook),
  };
}

