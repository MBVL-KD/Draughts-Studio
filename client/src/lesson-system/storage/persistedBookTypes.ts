import type { Book } from "../types/lessonTypes";

/** PATCH /api/books/:id */
export type SaveBookPatchBody = {
  expectedRevision: number;
  document: Book;
};

/** POST /api/books */
export type SaveBookCreateBody = {
  document: Book;
};

export type BookItemResponse = {
  item: Book;
};

export type AuthoringValidationSeverity = "error" | "warning";

export type AuthoringValidationIssue = {
  path: string;
  code: string;
  message: string;
  severity: AuthoringValidationSeverity;
};

export type AuthoringValidationResult = {
  errors: AuthoringValidationIssue[];
  warnings: AuthoringValidationIssue[];
};

export type CurriculumSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";
