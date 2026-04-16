import type { LessonBranch } from "../types/authoring/branchTypes";
import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type { InteractionSpec } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LessonAuthoringBundle } from "../types/lessonTypes";
import { normalizeAuthoringBundleForLesson } from "../utils/authoringLessonSequence";
import { sortUniqueSquares } from "../utils/selectionSquareSetHelpers";

function normalizeInteractionSquares(ix: InteractionSpec): InteractionSpec {
  switch (ix.kind) {
    case "askMove":
      return {
        ...ix,
        maxAttempts: 1,
        allowRetry: false,
        successPolicy: "exactOne",
        wrongHintHighlightSquares: ix.wrongHintHighlightSquares?.length
          ? sortUniqueSquares(ix.wrongHintHighlightSquares)
          : ix.wrongHintHighlightSquares,
      };
    case "askSequence":
      const allowedHintTypes = new Set([
        "from",
        "to",
        "from_to",
        "path",
        "captures",
        "last_capture_leg",
      ]);
      return {
        ...ix,
        wrongHintHighlightSquares: ix.wrongHintHighlightSquares?.length
          ? sortUniqueSquares(ix.wrongHintHighlightSquares)
          : ix.wrongHintHighlightSquares,
        hintPlan: (ix.hintPlan ?? [])
          .filter((step) => allowedHintTypes.has(String(step.type)))
          .map((step, index) => ({
            type: step.type,
            afterFailedAttempts:
              step.afterFailedAttempts != null && Number.isFinite(step.afterFailedAttempts)
                ? Math.max(1, Math.floor(step.afterFailedAttempts))
                : index + 1,
          })),
      };
    case "askSelectSquares":
    case "askSelectPieces":
      return {
        ...ix,
        targetSquares: sortUniqueSquares(ix.targetSquares ?? []),
        hintSquares: ix.hintSquares?.length ? sortUniqueSquares(ix.hintSquares) : ix.hintSquares,
      };
    default:
      return ix;
  }
}

function normalizeRoutePath(path: number[]): number[] {
  return path.filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
}

function normalizeOverlaySquares(moment: StepMoment): StepMoment {
  const overlays = moment.overlays?.map((o) => {
    if (o.type === "highlight") {
      return { ...o, squares: sortUniqueSquares(o.squares ?? []) };
    }
    if (o.type === "route") {
      return { ...o, path: normalizeRoutePath(o.path ?? []) };
    }
    return o;
  });
  return overlays ? { ...moment, overlays } : moment;
}

function normalizeMomentForSave(moment: StepMoment): StepMoment {
  let m = normalizeOverlaySquares(moment);
  if (m.interaction) {
    m = { ...m, interaction: normalizeInteractionSquares(m.interaction) };
  }
  return m;
}

function collectBranchIdsFromMoments(moments: StepMoment[], into: Set<string>) {
  for (const m of moments) {
    const bid = m.branchAction?.branchId;
    if (typeof bid === "string" && bid.trim()) into.add(bid);
  }
}

/**
 * Keeps only branches reachable from step timelines (and nested branch timelines).
 */
export function pruneUnreachableBranches(bundle: LessonAuthoringBundle): LessonAuthoringBundle {
  const refs = new Set<string>();
  const stepIds = bundle.authoringLesson.stepIds;
  for (const sid of stepIds) {
    const step = bundle.stepsById[sid];
    collectBranchIdsFromMoments(step?.timeline ?? [], refs);
  }

  let prev = -1;
  while (refs.size !== prev) {
    prev = refs.size;
    for (const bid of [...refs]) {
      const br = bundle.branchesById?.[bid];
      collectBranchIdsFromMoments(br?.timeline ?? [], refs);
    }
  }

  if (!bundle.branchesById) return bundle;
  const nextBranches: Record<string, LessonBranch> = {};
  for (const id of refs) {
    const b = bundle.branchesById[id];
    if (b) nextBranches[id] = b;
  }
  return { ...bundle, branchesById: Object.keys(nextBranches).length ? nextBranches : undefined };
}

function normalizeAllTimelines(bundle: LessonAuthoringBundle): LessonAuthoringBundle {
  const stepsById: Record<string, AuthoringLessonStep> = {};
  for (const id of Object.keys(bundle.stepsById)) {
    const s = bundle.stepsById[id];
    if (!s) continue;
    stepsById[id] = {
      ...s,
      timeline: (s.timeline ?? []).map(normalizeMomentForSave),
    };
  }
  let branchesById = bundle.branchesById;
  if (branchesById) {
    const next: Record<string, LessonBranch> = {};
    for (const bid of Object.keys(branchesById)) {
      const b = branchesById[bid];
      if (!b) continue;
      next[bid] = {
        ...b,
        timeline: (b.timeline ?? []).map(normalizeMomentForSave),
      };
    }
    branchesById = Object.keys(next).length ? next : undefined;
  }
  return { ...bundle, stepsById, branchesById };
}

/**
 * Deterministic normalization for authoring-v2 before validate/sanitize/persist.
 * Builds on `normalizeAuthoringBundleForLesson` (step order, ids) and adds branch + placement hygiene.
 */
export function normalizeAuthoringBundleForPersist(
  bundle: LessonAuthoringBundle,
  lessonId: string,
  bookId: string
): LessonAuthoringBundle {
  const base = normalizeAuthoringBundleForLesson(bundle, lessonId, bookId);
  const pruned = pruneUnreachableBranches(base);
  return normalizeAllTimelines(pruned);
}
