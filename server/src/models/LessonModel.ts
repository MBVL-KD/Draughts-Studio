import { InferSchemaType, Schema, model } from "mongoose";

const LessonSchema = new Schema(
  {
    id: { type: String, required: true },
    lessonId: { type: String, required: true },
    bookId: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 1 },
    title: { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed, required: true },
    variantId: { type: String, required: true },
    rulesetId: { type: String, default: null },
    difficulty: { type: Number, default: 1 },
    estimatedMinutes: { type: Number, default: 5 },
    isExam: { type: Boolean, default: false },
    examConfig: { type: Schema.Types.Mixed, default: null },
    rewards: { type: [Schema.Types.Mixed], default: [] },
    /** Canonical ordered step references — source of truth for step order. */
    stepIds: { type: [String], default: [] },
    entryStepId: { type: String, default: null },
    /** Branches embedded on lesson (small, tightly coupled). */
    branchesById: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

LessonSchema.index({ ownerType: 1, ownerId: 1, lessonId: 1 }, { unique: true });
LessonSchema.index({ ownerType: 1, ownerId: 1, bookId: 1, updatedAt: -1 });
LessonSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });

export type LessonDoc = InferSchemaType<typeof LessonSchema>;
export const LessonModel = model<LessonDoc>("Lesson", LessonSchema, "lessons");
