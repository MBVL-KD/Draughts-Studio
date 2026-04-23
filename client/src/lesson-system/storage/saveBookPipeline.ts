import type { Book } from "../types/lessonTypes";
import type { AuthoringValidationResult } from "./persistedBookTypes";
import { normalizeBookForSave } from "./normalizePersistedBook";
import { validateBookAuthoringV2 } from "./validateAuthoringForSave";
import { validateBookRuntimeExportReadiness } from "../utils/validateRuntimeExportReadiness";

export type PrepareBookForSaveResult = {
  document: Book;
  validation: AuthoringValidationResult;
};

/** Normalize + sanitize (via `normalizeBookForSave`) then validate the persisted-shaped book. */
export function prepareBookForPersistedSave(book: Book): PrepareBookForSaveResult {
  const document = normalizeBookForSave(book);
  const authoring = validateBookAuthoringV2(document);
  const runtimeExport = validateBookRuntimeExportReadiness(document);
  const validation: AuthoringValidationResult = {
    errors: [...authoring.errors],
    // Runtime export readiness remains visible, but should not block structure-first authoring saves.
    warnings: [
      ...authoring.warnings,
      ...runtimeExport.warnings,
      ...runtimeExport.errors.map((issue) => ({ ...issue, severity: "warning" as const })),
    ],
  };
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
