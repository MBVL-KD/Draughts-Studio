import { z } from "zod";
import type { ValidationIssue } from "./types";
import { okResult, resultFromIssues, type ValidationResult } from "./types";

const LocalizedTextSchema = z.object({
  values: z.record(z.string(), z.string()),
});

const StepSourceNodeSnapshotSchema = z.object({
  nodeId: z.string(),
  plyIndex: z.number(),
  notation: z.string().optional(),
  fenAfter: z.string().optional(),
  glyphs: z.array(z.string()).optional(),
  preMoveComment: LocalizedTextSchema.optional(),
  comment: LocalizedTextSchema.optional(),
});

const StepSourceRefSchema = z.object({
  sourceId: z.string(),
  nodeId: z.string().nullable().optional(),
  anchorNodeId: z.string().nullable().optional(),
  startNodeId: z.string().nullable().optional(),
  endNodeId: z.string().nullable().optional(),
  focusNodeId: z.string().nullable().optional(),
  lineMode: z.enum(["mainline", "variation", "custom"]).optional(),
  linePath: z.array(z.string()).optional(),
  snapshotFen: z.string().nullable().optional(),
  importedAt: z.string().optional(),
  nodeTimeline: z.array(StepSourceNodeSnapshotSchema).optional(),
});

const LessonStepSchema = z.object({
  id: z.string(),
  stepId: z.string().optional(),
  type: z.string(),
  title: LocalizedTextSchema,
  prompt: LocalizedTextSchema,
  hint: LocalizedTextSchema,
  explanation: LocalizedTextSchema,
  initialState: z.object({
    fen: z.string(),
    sideToMove: z.enum(["white", "black"]),
  }),
  sourceRef: StepSourceRefSchema.optional(),
  presentation: z.unknown(),
  validation: z.unknown(),
  feedback: z.unknown(),
  orderIndex: z.number().optional(),
  tags: z.array(z.string()).optional(),
  runtimeHints: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const LessonSchema = z.object({
  id: z.string(),
  lessonId: z.string().optional(),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  steps: z.array(LessonStepSchema),
  /** Authoring v2 bundle (timeline-first); validated in depth on the client before save. */
  authoringV2: z.unknown().optional(),
  variantId: z.string(),
  rulesetId: z.string().optional(),
  difficulty: z.number().optional(),
  estimatedMinutes: z.number().optional(),
  estimatedDurationMin: z.number().optional(),
  rewards: z.array(z.unknown()).optional(),
  orderIndex: z.number().optional(),
  prerequisites: z.array(z.string()).optional(),
  topicTags: z.array(z.string()).optional(),
});

export const BookSchema = z.object({
  id: z.string(),
  bookId: z.string().optional(),
  ownerType: z.enum(["user", "school", "org"]),
  ownerId: z.string(),
  schemaVersion: z.number(),
  revision: z.number(),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  archivedAt: z.string().nullable().optional(),
  lessons: z.array(LessonSchema),
  exams: z.array(z.unknown()),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

type BookShape = z.infer<typeof BookSchema>;

export type ParseResult<T> = {
  result: ValidationResult;
  parsed?: T;
};

function issuesFromZod(err: z.ZodError): ValidationIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
    severity: "error",
  }));
}

export function parseBookShape(input: unknown): ParseResult<BookShape> {
  const parsed = BookSchema.safeParse(input);
  if (parsed.success) {
    return {
      result: okResult(),
      parsed: parsed.data,
    };
  }
  return {
    result: resultFromIssues(issuesFromZod(parsed.error)),
  };
}

