import type { StepMoment } from "../types/authoring/timelineTypes";
import { cloneStepMomentForAuthoringDuplicate } from "./cloneStepMomentForAuthoring";

export function insertMomentAfter(
  moments: StepMoment[],
  afterMomentId: string | null,
  moment: StepMoment
): StepMoment[] {
  if (afterMomentId == null) {
    return [...moments, moment];
  }
  const i = moments.findIndex((m) => m.id === afterMomentId);
  if (i < 0) return [...moments, moment];
  const next = [...moments];
  next.splice(i + 1, 0, moment);
  return next;
}

export function insertMomentBefore(
  moments: StepMoment[],
  beforeMomentId: string | null,
  moment: StepMoment
): StepMoment[] {
  if (beforeMomentId == null) {
    return [moment, ...moments];
  }
  const i = moments.findIndex((m) => m.id === beforeMomentId);
  if (i < 0) return [moment, ...moments];
  const next = [...moments];
  next.splice(i, 0, moment);
  return next;
}

export function deleteMoment(moments: StepMoment[], momentId: string): StepMoment[] {
  return moments.filter((m) => m.id !== momentId);
}

export function duplicateMoment(moments: StepMoment[], momentId: string): StepMoment[] {
  const i = moments.findIndex((m) => m.id === momentId);
  if (i < 0) return moments;
  const original = moments[i]!;
  const clone = cloneStepMomentForAuthoringDuplicate(original);
  return insertMomentAfter(moments, momentId, clone);
}

export function moveMomentUp(moments: StepMoment[], momentId: string): StepMoment[] {
  const i = moments.findIndex((m) => m.id === momentId);
  if (i <= 0) return moments;
  const next = [...moments];
  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
  return next;
}

export function moveMomentDown(moments: StepMoment[], momentId: string): StepMoment[] {
  const i = moments.findIndex((m) => m.id === momentId);
  if (i < 0 || i >= moments.length - 1) return moments;
  const next = [...moments];
  [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
  return next;
}
