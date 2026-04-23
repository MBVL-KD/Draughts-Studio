import { InferSchemaType, Schema, model } from "mongoose";

const BookSchema = new Schema(
  {
    id: { type: String, required: true },
    bookId: { type: String, required: true },
    ownerType: { type: String, enum: ["user", "school", "org"], required: true },
    ownerId: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 1 },
    title: { type: Schema.Types.Mixed, required: true },
    description: { type: Schema.Types.Mixed, required: true },
    accessModel: { type: String, enum: ["free", "paid"], default: "free" },
    productId: { type: String, default: "" },
    shopTag: { type: String, default: "" },
    sequenceIndex: { type: Number, default: 1 },
    unlockRules: { type: Schema.Types.Mixed, default: { type: "none" } },
    status: { type: String, default: "draft" },
    tags: { type: [String], default: [] },
    /** Ordered references to lessons in the lessons collection. */
    lessonIds: { type: [String], default: [] },
    archivedAt: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

BookSchema.index({ ownerType: 1, ownerId: 1, updatedAt: -1 });
BookSchema.index({ ownerType: 1, ownerId: 1, bookId: 1 }, { unique: true });
BookSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });
BookSchema.index({ ownerType: 1, ownerId: 1, tags: 1 });

export type BookDoc = InferSchemaType<typeof BookSchema>;
export const BookModel = model<BookDoc>("Book", BookSchema);
