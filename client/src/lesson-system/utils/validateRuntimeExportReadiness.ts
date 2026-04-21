import { fenToBoardState } from "../../features/board/fenUtils";
import type { Book, Lesson } from "../types/lessonTypes";
import type { LanguageCode } from "../types/i18nTypes";
import type { LocalizedText } from "../types/i18nTypes";
import type { LessonStep } from "../types/stepTypes";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type { AuthoringValidationIssue, AuthoringValidationResult } from "../storage/persistedBookTypes";
import { PLAYBACK_EXPORT_REQUIRED_LANGUAGES } from "../config/playbackExportLanguages";
import {
  allowsEmptyInitialFenForRuntimeExport,
  requiresLocalizedFeedbackForRuntimeExport,
} from "./runtimeExportPolicy";

type MinimalSource = {
  nodes?: Array<{ id?: string }>;
};

function pushRequiredLocalized(
  value: LocalizedText | undefined,
  basePath: string,
  langs: readonly LanguageCode[],
  errors: AuthoringValidationIssue[]
) {
  if (!value || typeof value !== "object" || !value.values || typeof value.values !== "object") {
    for (const lang of langs) {
      errors.push({
        path: `${basePath}.values.${lang}`,
        code: "localized.required_language.missing",
        message: `Required language is missing: ${lang}`,
        severity: "error",
      });
    }
    return;
  }
  for (const lang of langs) {
    const raw = value.values[lang];
    if (typeof raw !== "string") {
      errors.push({
        path: `${basePath}.values.${lang}`,
        code: "localized.required_language.missing",
        message: `Required language is missing: ${lang}`,
        severity: "error",
      });
      continue;
    }
    if (!raw.trim()) {
      errors.push({
        path: `${basePath}.values.${lang}`,
        code: "localized.required_language.empty",
        message: `Required language text is empty: ${lang} (use a short placeholder if needed)`,
        severity: "error",
      });
    }
  }
}

function resolveRuntimeStartFen(step: LessonStep): string | undefined {
  const s = step.initialState as { fen?: string; startFen?: string; boardFen?: string; snapshotFen?: string };
  const candidates = [s?.fen, s?.startFen, s?.boardFen, s?.snapshotFen];
  return candidates.find((v) => typeof v === "string" && v.trim().length > 0)?.trim();
}

function validateSourceRefSemantics(
  step: LessonStep,
  basePath: string,
  source: MinimalSource | undefined,
  errors: AuthoringValidationIssue[],
  warnings: AuthoringValidationIssue[]
) {
  const ref = step.sourceRef;
  if (!ref) return;

  if (!ref.sourceId || !String(ref.sourceId).trim()) {
    errors.push({
      path: `${basePath}.sourceRef.sourceId`,
      code: "step.source_ref.missing_source",
      message: "sourceRef.sourceId is required when sourceRef exists",
      severity: "error",
    });
    return;
  }

  if (!source?.nodes?.length) {
    warnings.push({
      path: `${basePath}.sourceRef`,
      code: "runtimeExport.source_not_loaded",
      message:
        "Step has a sourceRef; server playback still validates node ids against the source. Ensure start/end/anchor ids exist in that source.",
      severity: "warning",
    });
    return;
  }

  const ids = new Set(source.nodes.map((n) => n.id).filter(Boolean) as string[]);
  const refs: Array<[string, string | null | undefined]> = [
    ["sourceRef.anchorNodeId", ref.anchorNodeId ?? undefined],
    ["sourceRef.startNodeId", ref.startNodeId ?? undefined],
    ["sourceRef.endNodeId", ref.endNodeId ?? undefined],
    ["sourceRef.focusNodeId", ref.focusNodeId ?? undefined],
  ];
  for (const [p, value] of refs) {
    if (value && !ids.has(value)) {
      errors.push({
        path: `${basePath}.${p}`,
        code: "step.source_ref.unknown_node",
        message: `Referenced node does not exist in source: ${value}`,
        severity: "error",
      });
    }
  }
}

export function validateLessonStepRuntimeExportReadiness(
  step: LessonStep,
  pathPrefix: string,
  langs: readonly LanguageCode[] = PLAYBACK_EXPORT_REQUIRED_LANGUAGES,
  source?: MinimalSource,
  authoringStep?: AuthoringLessonStep
): AuthoringValidationResult {
  const errors: AuthoringValidationIssue[] = [];
  const warnings: AuthoringValidationIssue[] = [];

  pushRequiredLocalized(step.title, `${pathPrefix}.title`, langs, errors);
  if (requiresLocalizedFeedbackForRuntimeExport({ step, authoringStep })) {
    pushRequiredLocalized(step.feedback?.correct, `${pathPrefix}.feedback.correct`, langs, errors);
    pushRequiredLocalized(step.feedback?.incorrect, `${pathPrefix}.feedback.incorrect`, langs, errors);
  }

  if (step.validation?.type === "multiple_choice") {
    step.validation.options.forEach((opt, i) => {
      pushRequiredLocalized(opt.label, `${pathPrefix}.validation.options.${i}.label`, langs, errors);
    });
  }

  const fen = resolveRuntimeStartFen(step);
  const fenOptional = allowsEmptyInitialFenForRuntimeExport({ step, authoringStep });
  if (!fen && !fenOptional) {
    errors.push({
      path: `${pathPrefix}.initialState`,
      code: "runtime.start_fen.unresolved",
      message: "Runtime start position/FEN is not resolvable",
      severity: "error",
    });
  } else if (fen) {
    try {
      fenToBoardState(fen);
    } catch {
      errors.push({
        path: `${pathPrefix}.initialState.fen`,
        code: "fen.unparseable",
        message: "FEN cannot be parsed for this board format",
        severity: "error",
      });
    }
  }

  validateSourceRefSemantics(step, pathPrefix, source, errors, warnings);

  return { errors, warnings };
}

/**
 * Every legacy `lesson.steps[]` entry is checked for server playback export rules
 * (same fields as `validateStepForRuntimeExport` localized + FEN + sourceRef when source known).
 */
export function validateBookRuntimeExportReadiness(
  book: Book,
  langs: readonly LanguageCode[] = PLAYBACK_EXPORT_REQUIRED_LANGUAGES,
  sourceLookup?: (sourceId: string) => MinimalSource | undefined
): AuthoringValidationResult {
  const errors: AuthoringValidationIssue[] = [];
  const warnings: AuthoringValidationIssue[] = [];

  (book.lessons ?? []).forEach((lesson: Lesson, li: number) => {
    const stepsById = lesson.authoringV2?.stepsById;
    (lesson.steps ?? []).forEach((step, si: number) => {
      const pathPrefix = `lessons.${li}.steps.${si}`;
      const sourceId = step.sourceRef?.sourceId;
      const source =
        typeof sourceId === "string" && sourceId.trim() && sourceLookup
          ? sourceLookup(sourceId.trim())
          : undefined;
      const stepKey = step.stepId?.trim() || step.id;
      const authoringStep = stepKey && stepsById ? stepsById[stepKey] : undefined;
      const r = validateLessonStepRuntimeExportReadiness(step, pathPrefix, langs, source, authoringStep);
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    });
  });

  return { errors, warnings };
}
