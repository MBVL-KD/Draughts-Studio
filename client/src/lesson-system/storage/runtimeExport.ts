import type { Lesson } from "../types/lessonTypes";
import { RUNTIME_LESSON_EXPORT_SCHEMA_VERSION } from "./authoringStorageConstants";

/** Minimal runtime-facing lesson summary (player / Roblox TBD). */
export type RuntimeLessonExportV1 = {
  schemaVersion: typeof RUNTIME_LESSON_EXPORT_SCHEMA_VERSION;
  lessonId: string;
  title?: unknown;
  summary: { stepCount: number; branchCount: number };
  runtimeSteps: Array<{ orderIndex: number; kind: string; id: string }>;
};

/** Skeleton exporter — expand with moment graph + interaction contracts later. */
export function exportAuthoringLessonToRuntime(lesson: Lesson): RuntimeLessonExportV1 {
  const bundle = lesson.authoringV2;
  const stepIds = bundle?.authoringLesson.stepIds ?? [];
  const runtimeSteps = stepIds.map((id, orderIndex) => {
    const s = bundle?.stepsById[id];
    return { orderIndex, kind: s?.kind ?? "unknown", id };
  });
  return {
    schemaVersion: RUNTIME_LESSON_EXPORT_SCHEMA_VERSION,
    lessonId: lesson.lessonId ?? lesson.id,
    title: lesson.title,
    summary: {
      stepCount: runtimeSteps.length,
      branchCount: Object.keys(bundle?.branchesById ?? {}).length,
    },
    runtimeSteps,
  };
}
