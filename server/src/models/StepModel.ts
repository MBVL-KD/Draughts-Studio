import { InferSchemaType, Schema, model } from "mongoose";

const StepSchema = new Schema(
  {
    id: { type: String, required: true },
    stepId: { type: String, required: true },
    lessonId: { type: String, required: true },
    bookId: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 1 },
    orderIndex: { type: Number, required: true, default: 0 },
    kind: { type: String, required: true },
    title: { type: Schema.Types.Mixed, default: null },
    shortTitle: { type: Schema.Types.Mixed, default: null },
    goal: { type: Schema.Types.Mixed, default: null },
    summary: { type: Schema.Types.Mixed, default: null },
    initialState: { type: Schema.Types.Mixed, required: true },
    scene: { type: Schema.Types.Mixed, default: null },
    /** Timeline/ministeps embedded in step — small enough, tightly coupled. */
    timeline: { type: [Schema.Types.Mixed], default: [] },
    sourceRef: { type: Schema.Types.Mixed, default: null },
    tags: { type: [String], default: [] },
    puzzleMeta: { type: Schema.Types.Mixed, default: null },
    runtimeHints: { type: Schema.Types.Mixed, default: null },
    editorMeta: { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

StepSchema.index({ ownerType: 1, ownerId: 1, stepId: 1 }, { unique: true });
StepSchema.index({ ownerType: 1, ownerId: 1, lessonId: 1, orderIndex: 1 });
StepSchema.index({ ownerType: 1, ownerId: 1, bookId: 1 });
StepSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });

export type StepDoc = InferSchemaType<typeof StepSchema>;
export const StepModel = model<StepDoc>("Step", StepSchema, "steps");
