import { InferSchemaType, Schema, model } from "mongoose";

const ImportJobSchema = new Schema(
  {
    id: { type: String, required: true },
    jobId: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 1 },
    sourceType: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    collectionSlug: { type: String, required: true },
    collectionTitle: { type: String, default: null },
    baseDifficultyBand: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: null,
    },
    basePuzzleRating: { type: Number, default: null },
    status: {
      type: String,
      enum: ["idle", "running", "paused", "completed", "failed"],
      required: true,
      default: "idle",
    },
    totalItems: { type: Number, required: true, default: 0 },
    processedItems: { type: Number, required: true, default: 0 },
    successfulItems: { type: Number, required: true, default: 0 },
    failedItems: { type: Number, required: true, default: 0 },
    currentIndex: { type: Number, required: true, default: 0 },
    targetBookId: { type: String, default: null },
    targetLessonId: { type: String, default: null },
    scanConfig: {
      enabled: { type: Boolean, required: true, default: false },
      depth: { type: Number },
      multiPv: { type: Number },
    },
    lastError: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

ImportJobSchema.index({ ownerType: 1, ownerId: 1, updatedAt: -1 });
ImportJobSchema.index({ ownerType: 1, ownerId: 1, jobId: 1 }, { unique: true });
ImportJobSchema.index({ ownerType: 1, ownerId: 1, status: 1 });
ImportJobSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });

export type ImportJobDoc = InferSchemaType<typeof ImportJobSchema>;
export const ImportJobModel = model<ImportJobDoc>("ImportJob", ImportJobSchema, "import_jobs");
