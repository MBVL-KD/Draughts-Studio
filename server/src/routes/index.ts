import type { Express } from "express";
import { booksRouter } from "./books";
import { importJobsRouter } from "./importJobs";
import { lessonsRouter } from "./lessons";
import { playbackRouter } from "./playback";
import { pdfAnalyzeRouter } from "./pdfAnalyze";
import { sourcesRouter } from "./sources";

export function registerApiRoutes(app: Express) {
  app.use("/api/books", booksRouter);
  app.use("/api/import-jobs", importJobsRouter);
  app.use("/api/lessons", lessonsRouter);
  app.use("/api/pdf-analyze", pdfAnalyzeRouter);
  app.use("/api/sources", sourcesRouter);
  app.use("/api/steps", playbackRouter);
}
