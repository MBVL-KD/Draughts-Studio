import { fenToBoardState } from "../../features/board/fenUtils";
import type { BranchReturnPolicy } from "../types/authoring/branchTypes";
import type { PlacePiecesPieceCode } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { Book, Lesson, LessonAuthoringBundle } from "../types/lessonTypes";
import type { AuthoringValidationIssue, AuthoringValidationResult } from "./persistedBookTypes";

const VALID_PIECES = new Set<PlacePiecesPieceCode>(["wm", "wk", "bm", "bk"]);

function isValidSquare(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 50;
}

function validateFenOptional(fen: string | undefined, path: string, issues: AuthoringValidationIssue[]) {
  if (fen == null || typeof fen !== "string") return;
  const t = fen.trim();
  if (!t) return;
  try {
    fenToBoardState(t);
  } catch {
    issues.push({
      path,
      code: "fen.unparseable",
      message: "FEN cannot be parsed for this board format",
      severity: "error",
    });
  }
}

function validateReturnPolicy(
  policy: BranchReturnPolicy | undefined,
  path: string,
  stepIds: Set<string>,
  issues: AuthoringValidationIssue[]
) {
  if (!policy) return;
  if (policy.type === "jumpToStep" && policy.stepId) {
    if (!stepIds.has(policy.stepId)) {
      issues.push({
        path: `${path}.stepId`,
        code: "branch.return.step_missing",
        message: `jumpToStep references unknown step "${policy.stepId}"`,
        severity: "error",
      });
    }
  }
}

function validateMoments(
  moments: StepMoment[],
  pathPrefix: string,
  branchesById: Record<string, { id: string }> | undefined,
  stepIds: Set<string>,
  issues: AuthoringValidationIssue[],
  warnings: AuthoringValidationIssue[]
) {
  moments.forEach((m, mi) => {
    const p = `${pathPrefix}.${mi}`;
    if (m.branchAction) {
      const bid = m.branchAction.branchId;
      if (!bid || !branchesById?.[bid]) {
        issues.push({
          path: `${p}.branchAction.branchId`,
          code: "branch.missing_target",
          message: `Moment references unknown branch "${bid ?? ""}"`,
          severity: "error",
        });
      }
      validateReturnPolicy(m.branchAction.returnPolicy, `${p}.branchAction.returnPolicy`, stepIds, issues);
    }

    const ix = m.interaction;
    if (!ix) return;

    if (ix.kind === "askMove") {
      const em = ix.expectedMoves ?? [];
      if (em.length === 0) {
        issues.push({
          path: `${p}.interaction.expectedMoves`,
          code: "interaction.ask_move.empty",
          message: "askMove has no expectedMoves",
          severity: "error",
        });
      }
      for (let i = 0; i < em.length; i += 1) {
        const mv = em[i]!;
        if (!isValidSquare(mv.from) || !isValidSquare(mv.to)) {
          issues.push({
            path: `${p}.interaction.expectedMoves.${i}`,
            code: "interaction.square.invalid",
            message: "expectedMove from/to must be squares 1–50",
            severity: "error",
          });
        }
      }
    }

    if (ix.kind === "askSequence") {
      const seq = ix.expectedSequence ?? [];
      if (seq.length === 0) {
        issues.push({
          path: `${p}.interaction.expectedSequence`,
          code: "interaction.ask_sequence.empty",
          message: "askSequence has no expectedSequence",
          severity: "error",
        });
      }
      for (let i = 0; i < seq.length; i += 1) {
        const mv = seq[i]!;
        if (!isValidSquare(mv.from) || !isValidSquare(mv.to)) {
          issues.push({
            path: `${p}.interaction.expectedSequence.${i}`,
            code: "interaction.square.invalid",
            message: "sequence move from/to must be squares 1–50",
            severity: "error",
          });
        }
      }
      const plan = ix.hintPlan ?? [];
      const allowedHintTypes = new Set([
        "from",
        "to",
        "from_to",
        "path",
        "captures",
        "last_capture_leg",
      ]);
      for (let i = 0; i < plan.length; i += 1) {
        const step = plan[i]!;
        if (!allowedHintTypes.has(String(step.type))) {
          issues.push({
            path: `${p}.interaction.hintPlan.${i}.type`,
            code: "interaction.hint_plan.type_invalid",
            message: "hintPlan type is invalid",
            severity: "error",
          });
        }
        if (
          step.afterFailedAttempts != null &&
          (!Number.isFinite(step.afterFailedAttempts) || step.afterFailedAttempts < 1)
        ) {
          issues.push({
            path: `${p}.interaction.hintPlan.${i}.afterFailedAttempts`,
            code: "interaction.hint_plan.threshold_invalid",
            message: "afterFailedAttempts must be >= 1",
            severity: "error",
          });
        }
      }
    }

    if (ix.kind === "multipleChoice") {
      const opts = ix.options ?? [];
      if (opts.length === 0) {
        issues.push({
          path: `${p}.interaction.options`,
          code: "interaction.multiple_choice.empty",
          message: "multipleChoice has no options",
          severity: "error",
        });
      }
      const correct = opts.filter((o) => o.isCorrect);
      if (opts.length > 0 && correct.length === 0) {
        issues.push({
          path: `${p}.interaction.options`,
          code: "interaction.multiple_choice.no_correct",
          message: "multipleChoice has no correct option",
          severity: "error",
        });
      }
      const seen = new Set<string>();
      for (let i = 0; i < opts.length; i += 1) {
        const oid = opts[i]!.id;
        if (!oid || seen.has(oid)) {
          issues.push({
            path: `${p}.interaction.options.${i}.id`,
            code: "interaction.option.id_duplicate",
            message: "Duplicate or empty multipleChoice option id",
            severity: "error",
          });
        }
        seen.add(oid);
      }
    }

    if (ix.kind === "placePieces") {
      const slots = ix.expectedPlacement ?? [];
      if (slots.length === 0) {
        issues.push({
          path: `${p}.interaction.expectedPlacement`,
          code: "interaction.place_pieces.empty",
          message: "placePieces has no expectedPlacement",
          severity: "error",
        });
      }
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]!;
        if (!isValidSquare(slot.square)) {
          issues.push({
            path: `${p}.interaction.expectedPlacement.${i}.square`,
            code: "interaction.square.invalid",
            message: "placement square must be 1–50",
            severity: "error",
          });
        }
        if (!VALID_PIECES.has(slot.piece)) {
          issues.push({
            path: `${p}.interaction.expectedPlacement.${i}.piece`,
            code: "interaction.piece.invalid",
            message: "piece must be wm, wk, bm, or bk",
            severity: "error",
          });
        }
      }
    }

    if (ix.kind === "askSelectSquares" || ix.kind === "askSelectPieces") {
      const targets = ix.targetSquares ?? [];
      if (targets.length === 0) {
        issues.push({
          path: `${p}.interaction.targetSquares`,
          code: "interaction.targets.empty",
          message: `${ix.kind} has empty targetSquares`,
          severity: "error",
        });
      }
      for (let i = 0; i < targets.length; i += 1) {
        if (!isValidSquare(targets[i])) {
          issues.push({
            path: `${p}.interaction.targetSquares.${i}`,
            code: "interaction.square.invalid",
            message: "target square must be 1–50",
            severity: "error",
          });
        }
      }
    }

    if (m.positionRef?.type === "fen") {
      validateFenOptional(m.positionRef.fen, `${p}.positionRef.fen`, issues);
    }
  });

  if (moments.length === 0) {
    warnings.push({
      path: pathPrefix,
      code: "timeline.empty",
      message: "Timeline is empty",
      severity: "warning",
    });
  }
}

export function validateAuthoringBundle(bundle: LessonAuthoringBundle, lessonPath: string): AuthoringValidationResult {
  const errors: AuthoringValidationIssue[] = [];
  const warnings: AuthoringValidationIssue[] = [];
  const stepIds = new Set(bundle.authoringLesson.stepIds);
  const branches = bundle.branchesById;

  for (const sid of bundle.authoringLesson.stepIds) {
    if (!bundle.stepsById[sid]) {
      errors.push({
        path: `${lessonPath}.authoringV2.stepIds`,
        code: "lesson.step_id_orphan",
        message: `stepIds references missing step "${sid}"`,
        severity: "error",
      });
    }
  }

  for (const sid of Object.keys(bundle.stepsById)) {
    if (!stepIds.has(sid)) {
      warnings.push({
        path: `${lessonPath}.authoringV2.stepsById.${sid}`,
        code: "lesson.step_orphan",
        message: `Step "${sid}" is not in authoringLesson.stepIds (will be dropped on next normalize)`,
        severity: "warning",
      });
    }
  }

  for (const sid of bundle.authoringLesson.stepIds) {
    const step = bundle.stepsById[sid];
    if (!step) continue;
    const tl = step.timeline;
    if (!Array.isArray(tl)) {
      errors.push({
        path: `${lessonPath}.authoringV2.stepsById.${sid}.timeline`,
        code: "step.timeline.missing",
        message: "Step has no timeline array",
        severity: "error",
      });
      continue;
    }
    validateMoments(tl, `${lessonPath}.authoringV2.stepsById.${sid}.timeline`, branches, stepIds, errors, warnings);
    validateFenOptional(step.initialState?.fen, `${lessonPath}.authoringV2.stepsById.${sid}.initialState.fen`, errors);
  }

  if (branches) {
    for (const bid of Object.keys(branches)) {
      const br = branches[bid];
      if (!br) continue;
      validateReturnPolicy(br.authoringReturnPolicy, `${lessonPath}.authoringV2.branchesById.${bid}.authoringReturnPolicy`, stepIds, errors);
      validateMoments(
        br.timeline ?? [],
        `${lessonPath}.authoringV2.branchesById.${bid}.timeline`,
        branches,
        stepIds,
        errors,
        warnings
      );
      validateFenOptional(
        br.initialState?.fen,
        `${lessonPath}.authoringV2.branchesById.${bid}.initialState.fen`,
        errors
      );
    }
  }

  return { errors, warnings };
}

export function validateBookAuthoringV2(book: Book): AuthoringValidationResult {
  const errors: AuthoringValidationIssue[] = [];
  const warnings: AuthoringValidationIssue[] = [];
  (book.lessons ?? []).forEach((lesson: Lesson, li: number) => {
    if (!lesson.authoringV2) return;
    const r = validateAuthoringBundle(lesson.authoringV2, `lessons.${li}`);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  });
  return { errors, warnings };
}
