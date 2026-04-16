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
    status: { type: String, default: "draft" },
    tags: { type: [String], default: [] },
    archivedAt: { type: String, default: null },
    lessons: { type: [Schema.Types.Mixed], default: [] },
    exams: { type: [Schema.Types.Mixed], default: [] },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
  },
  { timestamps: true }
);

BookSchema.index({ ownerType: 1, ownerId: 1, updatedAt: -1 });
BookSchema.index({ ownerType: 1, ownerId: 1, bookId: 1 }, { unique: true });
BookSchema.index({ ownerType: 1, ownerId: 1, isDeleted: 1 });

export type BookDoc = InferSchemaType<typeof BookSchema>;
export const BookModel = model<BookDoc>("Book", BookSchema);
