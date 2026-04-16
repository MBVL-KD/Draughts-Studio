import { z } from "zod";
import type { ValidationIssue } from "./types";
import { okResult, resultFromIssues, type ValidationResult } from "./types";

const PlaybackEventSchema = z.union([
  z.object({
    type: z.literal("pre_comment"),
    ply: z.number(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("post_comment"),
    ply: z.number(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("glyphs"),
    ply: z.number(),
    glyphs: z.array(z.string()),
  }),
  z.object({
    type: z.literal("overlay"),
    ply: z.number(),
    highlights: z.array(z.unknown()),
    arrows: z.array(z.unknown()),
    routes: z.array(z.unknown()),
  }),
]);

const PlaybackNodeSchema = z.object({
  id: z.string(),
  ply: z.number(),
  notation: z.string().optional(),
  fenAfter: z.string().optional(),
  parentId: z.string().nullable().optional(),
  childrenIds: z.array(z.string()),
});

const RuntimeStructuredMoveSchema = z.object({
  notation: z.string(),
  from: z.number(),
  to: z.number(),
  path: z.array(z.number()),
  captures: z.array(z.number()),
  resultFen: z.string(),
});

const RuntimeValidationSchema = z.union([
  z.object({
    runtimeKind: z.literal("line"),
    acceptMode: z.literal("exact"),
    acceptedLines: z.array(
      z.object({
        moves: z.array(RuntimeStructuredMoveSchema),
      })
    ),
    moveSource: z.enum(["notation_engine", "timeline_engine", "mixed"]),
  }),
  z.object({
    runtimeKind: z.literal("none"),
    acceptMode: z.literal("exact"),
  }),
  z.object({
    runtimeKind: z.literal("goal"),
    acceptMode: z.literal("exact"),
    goalType: z.string(),
    targetSquare: z.number().optional(),
    sideToTest: z.enum(["white", "black"]).optional(),
  }),
  z.object({
    runtimeKind: z.literal("authoring_only"),
    acceptMode: z.literal("exact"),
    authoring: z.record(z.string(), z.unknown()),
  }),
]);

const PuzzleScanPlaybackMetaSchema = z.object({
  scanFallbackEnabled: z.boolean(),
  strictAuthoredOnly: z.boolean(),
  puzzleSide: z.enum(["white", "black"]),
  baseline: z.object({
    evaluationCp: z.number().nullable(),
    band: z.enum([
      "winning",
      "large_advantage",
      "unclear",
      "equal",
      "losing",
    ]),
    source: z.enum(["stored", "missing"]),
  }),
  policy: z.object({
    evalTolerance: z.number(),
    winningThreshold: z.number(),
    equalBandMax: z.number(),
    scanDepth: z.number(),
    multiPv: z.number(),
  }),
  debug: z.array(z.string()),
});

const PlaybackNavigationSchema = z.object({
  bookId: z.string(),
  lessonId: z.string(),
  stepId: z.string(),
  stepIndex: z.number().int(),
  totalSteps: z.number().int(),
  previousStepId: z.string().nullable(),
  nextStepId: z.string().nullable(),
});

const PlaybackHintSchema = z.object({
  text: z.string().optional(),
  expectedFrom: z.number().int().optional(),
  expectedTo: z.number().int().optional(),
});

export const PlaybackPayloadSchema = z.object({
  payloadType: z.literal("lesson-step-playback"),
  payloadVersion: z.union([z.literal(1), z.literal(2)]),
  stepId: z.string(),
  lessonId: z.string().optional(),
  stepType: z.string(),
  title: z.string(),
  prompt: z.string(),
  initialFen: z.string(),
  sideToMove: z.enum(["white", "black"]),
  variantId: z.string().optional(),
  lineMode: z.enum(["mainline", "variation", "custom"]),
  sourceId: z.string().optional(),
  startNodeId: z.string().nullable().optional(),
  endNodeId: z.string().nullable().optional(),
  nodes: z.array(PlaybackNodeSchema),
  autoplayMoves: z.array(z.string()),
  events: z.array(PlaybackEventSchema),
  validation: RuntimeValidationSchema.optional(),
  puzzleScan: PuzzleScanPlaybackMetaSchema.optional(),
  navigation: PlaybackNavigationSchema.optional(),
  stepIndex: z.number().int().optional(),
  totalSteps: z.number().int().optional(),
  previousStepId: z.string().nullable().optional(),
  nextStepId: z.string().nullable().optional(),
  hint: PlaybackHintSchema.optional(),
});

type PlaybackPayloadShape = z.infer<typeof PlaybackPayloadSchema>;

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

export function parsePlaybackPayloadShape(input: unknown): ParseResult<PlaybackPayloadShape> {
  const parsed = PlaybackPayloadSchema.safeParse(input);
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

