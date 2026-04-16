export type StepFlow = {
  groupId?: string;
  dependsOnStepId?: string;
  unlockCondition?: "always" | "after_correct";
  branchKey?: string;
};