import type { LessonBranch } from "../types/authoring/branchTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import {
  deleteMoment,
  duplicateMoment,
  moveMomentDown,
  moveMomentUp,
} from "./timelineMomentSequence";

export function branchTimelineOrEmpty(branch: LessonBranch): StepMoment[] {
  return branch.timeline ?? [];
}

export function setBranchTimeline(branch: LessonBranch, timeline: StepMoment[]): LessonBranch {
  return { ...branch, timeline };
}

export function appendMomentToBranch(branch: LessonBranch, moment: StepMoment): LessonBranch {
  return setBranchTimeline(branch, [...branchTimelineOrEmpty(branch), moment]);
}

export function deleteBranchTimelineMoment(
  branch: LessonBranch,
  momentId: string
): LessonBranch {
  return setBranchTimeline(branch, deleteMoment(branchTimelineOrEmpty(branch), momentId));
}

export function duplicateBranchTimelineMoment(
  branch: LessonBranch,
  momentId: string
): LessonBranch {
  return setBranchTimeline(branch, duplicateMoment(branchTimelineOrEmpty(branch), momentId));
}

export function moveBranchTimelineMomentUp(
  branch: LessonBranch,
  momentId: string
): LessonBranch {
  return setBranchTimeline(branch, moveMomentUp(branchTimelineOrEmpty(branch), momentId));
}

export function moveBranchTimelineMomentDown(
  branch: LessonBranch,
  momentId: string
): LessonBranch {
  return setBranchTimeline(branch, moveMomentDown(branchTimelineOrEmpty(branch), momentId));
}
