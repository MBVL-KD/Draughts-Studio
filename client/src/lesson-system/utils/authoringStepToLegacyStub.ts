import type { AuthoringLessonStep } from "../types/authoring/lessonStepTypes";
import type { LessonStep } from "../types/stepTypes";
import { createStep } from "./lessonFactory";
import { createLocalizedText } from "./i18nHelpers";
import type { MoveReference, StepMoment } from "../types/authoring/timelineTypes";

/**
 * Minimal legacy `LessonStep` for board / Scan / animation until those subsystems
 * consume `AuthoringLessonStep` directly.
 */
function legacySourceRefFromAuthoring(step: AuthoringLessonStep): LessonStep["sourceRef"] {
  const sid = step.sourceRef?.sourceId?.trim();
  const imp = step.metadata?.slagzetImport;
  if (!sid && !imp?.importedAt && !imp?.snapshotFen) return undefined;
  return {
    sourceId: sid ?? "",
    lineMode: "custom",
    ...(imp?.importedAt ? { importedAt: imp.importedAt } : {}),
    ...(imp?.snapshotFen ? { snapshotFen: imp.snapshotFen } : {}),
  };
}

function moveRefToNotation(ref: MoveReference | undefined): string | null {
  if (!ref || ref.type !== "inline") return null;
  if (typeof ref.from !== "number" || typeof ref.to !== "number") return null;
  const isCapture = (ref.captures?.length ?? 0) > 0;
  const sep = isCapture ? "x" : "-";
  const path =
    ref.path && ref.path.length >= 2
      ? ref.path
      : [ref.from, ref.to];
  if (path.length >= 2) {
    return path.join(sep);
  }
  return `${ref.from}${sep}${ref.to}`;
}

function deriveAutoplayMovesFromTimeline(timeline: StepMoment[]): string[] {
  const out: string[] = [];
  for (const m of timeline) {
    if (m.type === "showMove") {
      const n = moveRefToNotation(m.moveRef);
      if (n) out.push(n);
      continue;
    }
    if (m.type === "showLine" && m.lineRef?.type === "inline") {
      for (const mv of m.lineRef.moves ?? []) {
        const n = moveRefToNotation(mv);
        if (n) out.push(n);
      }
    }
  }
  return out;
}

export function authoringLessonStepToLegacyStub(step: AuthoringLessonStep): LessonStep {
  const base = createStep("explain");
  const fen = step.initialState.fen?.trim() ?? "";
  const title = step.shortTitle ?? step.title;
  const autoplayMoves = deriveAutoplayMovesFromTimeline(step.timeline ?? []);
  return {
    ...base,
    id: step.id,
    stepId: step.id,
    title: title ?? createLocalizedText("Step", ""),
    initialState: {
      fen,
      sideToMove: step.initialState.sideToMove ?? "white",
    },
    tags: step.tags,
    puzzleMeta: step.puzzleMeta,
    runtimeHints: step.runtimeHints,
    sourceRef: legacySourceRefFromAuthoring(step),
    presentation:
      autoplayMoves.length > 0
        ? {
            ...base.presentation,
            autoplay: {
              ...base.presentation.autoplay,
              moves: autoplayMoves,
            },
          }
        : base.presentation,
    orderIndex: step.orderIndex,
  };
}
