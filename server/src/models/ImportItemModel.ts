import { InferSchemaType, Schema, model } from "mongoose";

const ImportItemSchema = new Schema(
  {
    id: { type: String, required: true },
    itemId: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 1 },
    jobId: { type: String, required: true },
    index: { type: Number, required: true },
    fragmentUrl: { type: String, required: true },
    board50: { type: String, required: true },
    resultText: { type: String, default: null },
    sourceText: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed", "skipped"],
      required: true,
      default: "pending",
    },
    retries: { type: Number, required: true, default: 0 },
    errorMessage: { type: String, default: null },
    importedStepId: { type: String, default: null },
    importedLessonId: { type: String, default: null },
    scanResult: {
      bestMove: { type: String },
      ponder: { type: String },
      evaluation: { type: Number },
      pv: { type: [String], default: undefined },
      depthUsed: { type: Number },
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

ImportItemSchema.index({ ownerType: 1, ownerId: 1, jobId: 1, index: 1 }, { unique: true });
ImportItemSchema.index({ ownerType: 1, ownerId: 1, jobId: 1, status: 1, index: 1 });
ImportItemSchema.index({ ownerType: 1, ownerId: 1, updatedAt: -1 });
ImportItemSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });

export type ImportItemDoc = InferSchemaType<typeof ImportItemSchema>;
export const ImportItemModel = model<ImportItemDoc>("ImportItem", ImportItemSchema, "import_items");
