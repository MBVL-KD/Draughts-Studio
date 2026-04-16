import { z } from "zod";
import type { ValidationIssue } from "./types";
import { okResult, resultFromIssues, type ValidationResult } from "./types";

const LocalizedTextSchema = z.object({
  values: z.record(z.string(), z.string()),
});

const AnalysisMoveSchema = z.object({
  notation: z.string(),
  side: z.enum(["W", "B"]),
  from: z.number().optional(),
  to: z.number().optional(),
  path: z.array(z.number()).optional(),
  captures: z.array(z.number()).optional(),
  moveNumber: z.number().optional(),
});

const AnalysisNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  childrenIds: z.array(z.string()),
  variationOf: z.string().nullable().optional(),
  isMainline: z.boolean().optional(),
  plyIndex: z.number(),
  move: AnalysisMoveSchema.optional(),
  fenAfter: z.string(),
  comment: LocalizedTextSchema.optional(),
  preMoveComment: LocalizedTextSchema.optional(),
  glyphs: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  teaching: z.unknown().optional(),
  engine: z.unknown().optional(),
});

export const SourceSchema = z.object({
  id: z.string(),
  sourceId: z.string().optional(),
  ownerType: z.enum(["user", "school", "org"]),
  ownerId: z.string(),
  schemaVersion: z.number(),
  revision: z.number(),
  kind: z.string(),
  format: z.string(),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema.optional(),
  status: z.string().optional(),
  importMeta: z.unknown().optional(),
  variantId: z.string(),
  rulesetId: z.string().optional(),
  initialFen: z.string(),
  rootNodeId: z.string(),
  nodes: z.array(AnalysisNodeSchema),
  sourceMeta: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z.string().nullable().optional(),
});

type SourceShape = z.infer<typeof SourceSchema>;

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

export function parseSourceShape(input: unknown): ParseResult<SourceShape> {
  const parsed = SourceSchema.safeParse(input);
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

