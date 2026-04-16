import type { Book } from "../types/lessonTypes";
import type { AuthoringValidationResult } from "./persistedBookTypes";
import { normalizeBookForSave } from "./normalizePersistedBook";
import { validateBookAuthoringV2 } from "./validateAuthoringForSave";

export type PrepareBookForSaveResult = {
  document: Book;
  validation: AuthoringValidationResult;
};

/** Normalize + sanitize (via `normalizeBookForSave`) then validate the persisted-shaped book. */
export function prepareBookForPersistedSave(book: Book): PrepareBookForSaveResult {
  const document = normalizeBookForSave(book);
  const validation = validateBookAuthoringV2(document);
  return { document, validation };
}

export function authoringValidationBlocksSave(validation: AuthoringValidationResult): boolean {
  return validation.errors.length > 0;
}

export function formatAuthoringValidationIssues(
  validation: AuthoringValidationResult,
  max = 8
): string {
  const lines = [
    ...validation.errors.map((e) => `[error] ${e.path}: ${e.message}`),
    ...validation.warnings.map((w) => `[warning] ${w.path}: ${w.message}`),
  ];
  return lines.slice(0, max).join("\n");
}
