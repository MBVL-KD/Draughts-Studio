import { InferSchemaType, Schema, model } from "mongoose";

const PlaybackStepSchema = new Schema(
  {
    id: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    bookId: { type: String, required: true },
    lessonId: { type: String, required: true },
    stepId: { type: String, required: true },
    bookRevision: { type: Number, required: true, default: 1 },
    variantId: { type: String, default: null },
    step: { type: Schema.Types.Mixed, required: true },
    authoringStep: { type: Schema.Types.Mixed, default: null },
    orderedStepIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

PlaybackStepSchema.index(
  { ownerType: 1, ownerId: 1, bookId: 1, lessonId: 1, stepId: 1 },
  { unique: true }
);
PlaybackStepSchema.index({ ownerType: 1, ownerId: 1, stepId: 1 });
PlaybackStepSchema.index({ ownerType: 1, ownerId: 1, bookId: 1, lessonId: 1 });

export type PlaybackStepDoc = InferSchemaType<typeof PlaybackStepSchema>;
export const PlaybackStepModel = model<PlaybackStepDoc>(
  "PlaybackStep",
  PlaybackStepSchema,
  "playback_steps"
);
