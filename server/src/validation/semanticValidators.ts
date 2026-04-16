import type { ValidationIssue, ValidationResult } from "./types";
import { resultFromIssues } from "./types";

type SourceNode = {
  id?: string;
  childrenIds?: string[];
  fenAfter?: string;
};

type SourceLike = {
  id?: string;
  sourceId?: string;
  rootNodeId?: string;
  nodes?: SourceNode[];
};

type StepLike = {
  id?: string;
  stepId?: string;
  sourceRef?: {
    sourceId?: string;
    nodeId?: string | null;
    anchorNodeId?: string | null;
    startNodeId?: string | null;
    endNodeId?: string | null;
    focusNodeId?: string | null;
  };
  initialState?: {
    fen?: string;
  };
};

type LessonLike = {
  id?: string;
  lessonId?: string;
  steps?: StepLike[];
};

type BookLike = {
  id?: string;
  bookId?: string;
  lessons?: LessonLike[];
};

function pushIdMismatchIssue(
  issues: ValidationIssue[],
  path: string,
  legacyId: string | undefined,
  canonicalId: string | undefined,
  code: string
) {
  if (!legacyId || !canonicalId) return;
  if (legacyId === canonicalId) return;
  issues.push({
    path,
    code,
    message: `Legacy and canonical IDs differ: ${legacyId} !== ${canonicalId}`,
    severity: "error",
  });
}

export function validateFenParseable(fen: string | undefined): ValidationResult {
  const issues: ValidationIssue[] = [];
  const value = typeof fen === "string" ? fen.trim() : "";
  if (!value) {
    issues.push({
      path: "fen",
      code: "fen.empty",
      message: "FEN is empty",
      severity: "error",
    });
    return resultFromIssues(issues);
  }

  const parts = value.split(":");
  if (parts.length < 3) {
    issues.push({
      path: "fen",
      code: "fen.format",
      message: "FEN format is not parseable",
      severity: "error",
    });
    return resultFromIssues(issues);
  }

  const first = parts[0]?.trim();
  const second = parts[1]?.trim();
  const hasRecognizedSide =
    first === "W" || first === "B" || second === "W" || second === "B";
  if (!hasRecognizedSide) {
    issues.push({
      path: "fen",
      code: "fen.side",
      message: "FEN side-to-move must be W or B",
      severity: "error",
    });
  }

  return resultFromIssues(issues);
}

export function validateSourceGraphSemantics(source: SourceLike): ValidationResult {
  const issues: ValidationIssue[] = [];

  pushIdMismatchIssue(issues, "source", source.id, source.sourceId, "source.id_mismatch");

  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const nodeIds = new Set<string>();
  const duplicates = new Set<string>();

  for (const node of nodes) {
    if (!node.id) continue;
    if (nodeIds.has(node.id)) {
      duplicates.add(node.id);
    } else {
      nodeIds.add(node.id);
    }
  }

  for (const duplicateId of duplicates) {
    issues.push({
      path: "nodes",
      code: "source.node.duplicate_id",
      message: `Duplicate node id: ${duplicateId}`,
      severity: "error",
    });
  }

  if (!source.rootNodeId || !nodeIds.has(source.rootNodeId)) {
    issues.push({
      path: "rootNodeId",
      code: "source.root.missing",
      message: "rootNodeId does not exist in nodes",
      severity: "error",
    });
  }

  nodes.forEach((node, index) => {
    const children = Array.isArray(node.childrenIds) ? node.childrenIds : [];
    children.forEach((childId, childIndex) => {
      if (!nodeIds.has(childId)) {
        issues.push({
          path: `nodes.${index}.childrenIds.${childIndex}`,
          code: "source.child.missing",
          message: `Child node does not exist: ${childId}`,
          severity: "error",
        });
      }
    });
  });

  return resultFromIssues(issues);
}

export function validateBookSemantics(book: BookLike): ValidationResult {
  const issues: ValidationIssue[] = [];

  pushIdMismatchIssue(issues, "book", book.id, book.bookId, "book.id_mismatch");

  const lessons = Array.isArray(book.lessons) ? book.lessons : [];
  const lessonIds = new Set<string>();

  lessons.forEach((lesson, lessonIndex) => {
    pushIdMismatchIssue(
      issues,
      `lessons.${lessonIndex}`,
      lesson.id,
      lesson.lessonId,
      "lesson.id_mismatch"
    );

    const lessonId = lesson.lessonId ?? lesson.id;
    if (lessonId) {
      if (lessonIds.has(lessonId)) {
        issues.push({
          path: `lessons.${lessonIndex}`,
          code: "lesson.duplicate_id",
          message: `Duplicate lesson id: ${lessonId}`,
          severity: "error",
        });
      } else {
        lessonIds.add(lessonId);
      }
    }

    const stepIds = new Set<string>();
    const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
    steps.forEach((step, stepIndex) => {
      pushIdMismatchIssue(
        issues,
        `lessons.${lessonIndex}.steps.${stepIndex}`,
        step.id,
        step.stepId,
        "step.id_mismatch"
      );

      const stepId = step.stepId ?? step.id;
      if (stepId) {
        if (stepIds.has(stepId)) {
          issues.push({
            path: `lessons.${lessonIndex}.steps.${stepIndex}`,
            code: "step.duplicate_id",
            message: `Duplicate step id: ${stepId}`,
            severity: "error",
          });
        } else {
          stepIds.add(stepId);
        }
      }
    });
  });

  return resultFromIssues(issues);
}

export function validateStepSourceRefSemantics(
  step: StepLike,
  source?: SourceLike
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sourceRef = step.sourceRef;
  if (!sourceRef) {
    return resultFromIssues(issues);
  }

  if (!sourceRef.sourceId || !sourceRef.sourceId.trim()) {
    issues.push({
      path: "sourceRef.sourceId",
      code: "step.source_ref.missing_source",
      message: "sourceRef.sourceId is required when sourceRef exists",
      severity: "error",
    });
  }

  if (source) {
    const sourceNodeIds = new Set((source.nodes ?? []).map((node) => node.id).filter(Boolean) as string[]);
    const refs: Array<[string, string | null | undefined]> = [
      ["sourceRef.nodeId", sourceRef.nodeId],
      ["sourceRef.anchorNodeId", sourceRef.anchorNodeId],
      ["sourceRef.startNodeId", sourceRef.startNodeId],
      ["sourceRef.endNodeId", sourceRef.endNodeId],
      ["sourceRef.focusNodeId", sourceRef.focusNodeId],
    ];
    refs.forEach(([path, value]) => {
      if (value && !sourceNodeIds.has(value)) {
        issues.push({
          path,
          code: "step.source_ref.unknown_node",
          message: `Referenced node does not exist in source: ${value}`,
          severity: "error",
        });
      }
    });
  }

  if (step.initialState?.fen) {
    const fenResult = validateFenParseable(step.initialState.fen);
    fenResult.issues.forEach((issue) => {
      issues.push({
        ...issue,
        path: `initialState.${issue.path}`,
      });
    });
  }

  return resultFromIssues(issues);
}

