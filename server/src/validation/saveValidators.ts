import { mergeValidationResults, resultFromIssues, type ValidationIssue, type ValidationResult } from "./types";
import { parseBookShape } from "./bookSchemas";
import { parseSourceShape } from "./sourceSchemas";
import {
  validateBookSemantics,
  validateFenParseable,
  validateSourceGraphSemantics,
  validateStepSourceRefSemantics,
} from "./semanticValidators";
import { validateLocalizedTextDraft, validateLocalizedTextRequired } from "./localizedTextValidators";
import type { AuthoringStepExportLike } from "../playback/runtimeExportPolicy";
import {
  allowsEmptyInitialFenForRuntimeExport,
  requiresLocalizedFeedbackForRuntimeExport,
} from "../playback/runtimeExportPolicy";

type RuntimeValidationOptions = {
  requiredLanguages?: string[];
  /** V2 authoring step (timeline); relaxes FEN / feedback rules for non-interactive flows. */
  authoringStep?: AuthoringStepExportLike;
};

type BookLike = {
  title?: unknown;
  description?: unknown;
  lessons?: Array<{
    title?: unknown;
    description?: unknown;
    steps?: Array<StepLike & { id?: string; stepId?: string }>;
    authoringV2?: { stepsById?: Record<string, AuthoringStepExportLike> };
  }>;
};

type SourceLike = {
  title?: unknown;
  description?: unknown;
  initialFen?: string;
  nodes?: Array<{
    comment?: unknown;
    preMoveComment?: unknown;
    fenAfter?: string;
  }>;
};

type StepLike = {
  title?: unknown;
  prompt?: unknown;
  hint?: unknown;
  explanation?: unknown;
  feedback?: {
    correct?: unknown;
    incorrect?: unknown;
  };
  presentation?: {
    npc?: {
      text?: unknown;
    };
    autoplay?: { moves?: unknown[] };
  };
  validation?: {
    type?: string;
    options?: Array<{
      label?: unknown;
    }>;
  };
  sourceRef?: {
    sourceId?: string;
    nodeTimeline?: Array<{ notation?: string; fenAfter?: string }>;
  };
  initialState?: {
    fen?: string;
    startFen?: string;
    boardFen?: string;
    snapshotFen?: string;
  };
};

function collectLocalizedDraftIssues(value: unknown, path: string): ValidationIssue[] {
  return validateLocalizedTextDraft(value, path).issues;
}

function collectLocalizedRequiredIssues(
  value: unknown,
  path: string,
  options?: RuntimeValidationOptions
): ValidationIssue[] {
  return validateLocalizedTextRequired(value, path, {
    requiredLanguages: options?.requiredLanguages,
  }).issues;
}

function resolveRuntimeStartFen(step: StepLike): string | undefined {
  const candidates = [
    step.initialState?.fen,
    step.initialState?.startFen,
    step.initialState?.boardFen,
    step.initialState?.snapshotFen,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim().length > 0);
}

export function validateBookForDraftSave(input: unknown): ValidationResult {
  const shape = parseBookShape(input);
  const semantic = validateBookSemantics(input as Record<string, unknown>);
  const issues: ValidationIssue[] = [...shape.result.issues, ...semantic.issues];

  const book = input as BookLike;
  issues.push(...collectLocalizedDraftIssues(book.title, "title"));
  issues.push(...collectLocalizedDraftIssues(book.description, "description"));

  (book.lessons ?? []).forEach((lesson, lessonIndex) => {
    issues.push(...collectLocalizedDraftIssues(lesson.title, `lessons.${lessonIndex}.title`));
    issues.push(
      ...collectLocalizedDraftIssues(lesson.description, `lessons.${lessonIndex}.description`)
    );

    (lesson.steps ?? []).forEach((step, stepIndex) => {
      issues.push(
        ...collectLocalizedDraftIssues(
          step.title,
          `lessons.${lessonIndex}.steps.${stepIndex}.title`
        )
      );
      issues.push(
        ...collectLocalizedDraftIssues(
          step.prompt,
          `lessons.${lessonIndex}.steps.${stepIndex}.prompt`
        )
      );
      issues.push(
        ...collectLocalizedDraftIssues(step.hint, `lessons.${lessonIndex}.steps.${stepIndex}.hint`)
      );
      issues.push(
        ...collectLocalizedDraftIssues(
          step.explanation,
          `lessons.${lessonIndex}.steps.${stepIndex}.explanation`
        )
      );
      issues.push(
        ...collectLocalizedDraftIssues(
          step.feedback?.correct,
          `lessons.${lessonIndex}.steps.${stepIndex}.feedback.correct`
        )
      );
      issues.push(
        ...collectLocalizedDraftIssues(
          step.feedback?.incorrect,
          `lessons.${lessonIndex}.steps.${stepIndex}.feedback.incorrect`
        )
      );
      issues.push(
        ...collectLocalizedDraftIssues(
          step.presentation?.npc?.text,
          `lessons.${lessonIndex}.steps.${stepIndex}.presentation.npc.text`
        )
      );

      (step.validation?.options ?? []).forEach((option, optionIndex) => {
        issues.push(
          ...collectLocalizedDraftIssues(
            option.label,
            `lessons.${lessonIndex}.steps.${stepIndex}.validation.options.${optionIndex}.label`
          )
        );
      });
    });
  });

  return resultFromIssues(issues);
}

export function validateSourceForDraftSave(input: unknown): ValidationResult {
  const shape = parseSourceShape(input);
  const semantic = validateSourceGraphSemantics(input as Record<string, unknown>);
  const issues: ValidationIssue[] = [...shape.result.issues, ...semantic.issues];

  const source = input as SourceLike;
  issues.push(...collectLocalizedDraftIssues(source.title, "title"));
  issues.push(...collectLocalizedDraftIssues(source.description, "description"));
  issues.push(...validateFenParseable(source.initialFen).issues.map((issue) => ({ ...issue, path: `initialFen` })));

  (source.nodes ?? []).forEach((node, nodeIndex) => {
    if (typeof node.preMoveComment !== "undefined") {
      issues.push(
        ...collectLocalizedDraftIssues(
          node.preMoveComment,
          `nodes.${nodeIndex}.preMoveComment`
        )
      );
    }
    if (typeof node.comment !== "undefined") {
      issues.push(
        ...collectLocalizedDraftIssues(node.comment, `nodes.${nodeIndex}.comment`)
      );
    }
    if (node.fenAfter) {
      issues.push(
        ...validateFenParseable(node.fenAfter).issues.map((issue) => ({
          ...issue,
          path: `nodes.${nodeIndex}.fenAfter`,
        }))
      );
    }
  });

  return resultFromIssues(issues);
}

export function validateStepForRuntimeExport(
  step: StepLike,
  source?: SourceLike,
  options?: RuntimeValidationOptions
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const authoringStep = options?.authoringStep;

  issues.push(...collectLocalizedRequiredIssues(step.title, "step.title", options));
  issues.push(...collectLocalizedRequiredIssues(step.prompt, "step.prompt", options));
  if (requiresLocalizedFeedbackForRuntimeExport({ step, authoringStep })) {
    issues.push(...collectLocalizedRequiredIssues(step.feedback?.correct, "step.feedback.correct", options));
    issues.push(...collectLocalizedRequiredIssues(step.feedback?.incorrect, "step.feedback.incorrect", options));
  }
  // Optional NPC copy must not block runtime playback export (Roblox / puzzle tests).

  (step.validation?.options ?? []).forEach((option, index) => {
    issues.push(
      ...collectLocalizedRequiredIssues(
        option.label,
        `step.validation.options.${index}.label`,
        options
      )
    );
  });

  const resolvedFen = resolveRuntimeStartFen(step);
  const fenOptional = allowsEmptyInitialFenForRuntimeExport({ step, authoringStep });
  if (!resolvedFen && !fenOptional) {
    issues.push({
      path: "step.initialState",
      code: "runtime.start_fen.unresolved",
      message: "Runtime start position/FEN is not resolvable",
      severity: "error",
    });
  } else if (resolvedFen) {
    issues.push(
      ...validateFenParseable(resolvedFen).issues.map((issue) => ({
        ...issue,
        path: `step.initialState.${issue.path}`,
      }))
    );
  }

  const sourceRefResult = validateStepSourceRefSemantics(step, source as Record<string, unknown>);
  issues.push(...sourceRefResult.issues);

  return resultFromIssues(issues);
}

export function validateBookForRuntimeExport(
  book: BookLike,
  sourceLookup?: (sourceId: string) => SourceLike | undefined,
  options?: RuntimeValidationOptions
): ValidationResult {
  const results: ValidationResult[] = [];

  (book.lessons ?? []).forEach((lesson) => {
    const stepsById = lesson.authoringV2?.stepsById;
    (lesson.steps ?? []).forEach((step) => {
      const sourceId = step.sourceRef?.sourceId;
      const source = sourceId && sourceLookup ? sourceLookup(sourceId) : undefined;
      const stepKey = typeof step.stepId === "string" && step.stepId.trim() ? step.stepId.trim() : step.id;
      const authoringFromBundle =
        typeof stepKey === "string" && stepsById && stepsById[stepKey] ? stepsById[stepKey] : undefined;
      results.push(
        validateStepForRuntimeExport(step, source, {
          ...options,
          authoringStep: authoringFromBundle,
        })
      );
    });
  });

  return mergeValidationResults(...results);
}

