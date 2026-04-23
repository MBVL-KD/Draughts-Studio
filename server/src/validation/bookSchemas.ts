import { z } from "zod";
import type { ValidationIssue } from "./types";
import { okResult, resultFromIssues, type ValidationResult } from "./types";

const LocalizedTextSchema = z.object({
  values: z.record(z.string(), z.string()),
});

export const BookSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  ownerType: z.enum(["user", "school", "org"]),
  ownerId: z.string(),
  schemaVersion: z.number(),
  revision: z.number(),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  accessModel: z.enum(["free", "paid"]).optional(),
  productId: z.string().optional(),
  shopTag: z.string().optional(),
  sequenceIndex: z.number().int().optional(),
  unlockRules: z
    .object({
      type: z.enum(["none", "requires_exams"]),
      requiredBookId: z.string().optional(),
      requiredExamLessonIds: z.array(z.string()).optional(),
      requiredPassMode: z.enum(["all", "any"]).optional(),
    })
    .optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  lessonIds: z.array(z.string()).default([]),
  archivedAt: z.string().nullable().optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

export const LessonSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  bookId: z.string(),
  ownerType: z.enum(["user", "school", "org"]),
  ownerId: z.string(),
  schemaVersion: z.number().default(1),
  revision: z.number().default(1),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  variantId: z.string(),
  rulesetId: z.string().nullable().optional(),
  difficulty: z.number().optional(),
  estimatedMinutes: z.number().optional(),
  isExam: z.boolean().optional(),
  examConfig: z
    .object({
      passScorePercent: z.number().optional(),
      minCorrect: z.number().optional(),
      maxAttempts: z.number().optional(),
      timeLimitSec: z.number().optional(),
    })
    .nullable()
    .optional(),
  rewards: z.array(z.unknown()).optional(),
  stepIds: z.array(z.string()).default([]),
  entryStepId: z.string().nullable().optional(),
  branchesById: z.record(z.string(), z.unknown()).optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

const StepInitialStateSchema = z.object({
  fen: z.string().optional(),
  sideToMove: z.enum(["white", "black"]).optional(),
  variantId: z.string().optional(),
  rulesetId: z.string().optional(),
  orientation: z.enum(["whiteBottom", "blackBottom", "auto"]).optional(),
  boardThemeId: z.string().optional(),
  pieceThemeId: z.string().optional(),
});

export const StepSchema = z.object({
  id: z.string(),
  stepId: z.string(),
  lessonId: z.string(),
  bookId: z.string(),
  ownerType: z.enum(["user", "school", "org"]),
  ownerId: z.string(),
  schemaVersion: z.number().default(1),
  revision: z.number().default(1),
  orderIndex: z.number(),
  kind: z.string(),
  title: LocalizedTextSchema.nullable().optional(),
  shortTitle: LocalizedTextSchema.nullable().optional(),
  goal: LocalizedTextSchema.nullable().optional(),
  summary: LocalizedTextSchema.nullable().optional(),
  initialState: StepInitialStateSchema,
  scene: z.unknown().optional(),
  timeline: z.array(z.unknown()).default([]),
  sourceRef: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  puzzleMeta: z
    .object({
      puzzleRating: z.number(),
      difficultyBand: z.enum(["beginner", "intermediate", "advanced"]),
      topicTags: z.array(z.string()),
      ratingSource: z.enum(["collection-default", "scan-heuristic", "manual"]),
    })
    .nullable()
    .optional(),
  runtimeHints: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  editorMeta: z.unknown().optional(),
  metadata: z.unknown().optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

type BookShape = z.infer<typeof BookSchema>;
type LessonShape = z.infer<typeof LessonSchema>;
type StepShape = z.infer<typeof StepSchema>;

export type ParseResult<T> = {
  result: ValidationResult;
  parsed?: T;
};

function issuesFromZod(err: z.ZodError): ValidationIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
    severity: "error" as const,
  }));
}

export function parseBookShape(input: unknown): ParseResult<BookShape> {
  const parsed = BookSchema.safeParse(input);
  if (parsed.success) return { result: okResult(), parsed: parsed.data };
  return { result: resultFromIssues(issuesFromZod(parsed.error)) };
}

export function parseLessonShape(input: unknown): ParseResult<LessonShape> {
  const parsed = LessonSchema.safeParse(input);
  if (parsed.success) return { result: okResult(), parsed: parsed.data };
  return { result: resultFromIssues(issuesFromZod(parsed.error)) };
}

export function parseStepShape(input: unknown): ParseResult<StepShape> {
  const parsed = StepSchema.safeParse(input);
  if (parsed.success) return { result: okResult(), parsed: parsed.data };
  return { result: resultFromIssues(issuesFromZod(parsed.error)) };
}
