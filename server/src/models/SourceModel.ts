import { InferSchemaType, Schema, model } from "mongoose";

const SourceSchema = new Schema(
  {
    id: { type: String, required: true },
    sourceId: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 1 },
    kind: { type: String, required: true },
    format: { type: String, required: true },
    title: { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed },
    status: { type: String, default: "draft" },
    importMeta: { type: Schema.Types.Mixed },
    variantId: { type: String, required: true },
    rulesetId: { type: String },
    initialFen: { type: String, required: true },
    rootNodeId: { type: String, required: true },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    sourceMeta: { type: Schema.Types.Mixed },
    tags: { type: [String], default: [] },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

SourceSchema.index({ ownerType: 1, ownerId: 1, updatedAt: -1 });
SourceSchema.index({ ownerType: 1, ownerId: 1, sourceId: 1 }, { unique: true });
SourceSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });

export type SourceDoc = InferSchemaType<typeof SourceSchema>;
export const SourceModel = model<SourceDoc>("Source", SourceSchema);
