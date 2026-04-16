import type { Express } from "express";
import { booksRouter } from "./books";
import { importJobsRouter } from "./importJobs";
import { playbackRouter } from "./playback";
import { sourcesRouter } from "./sources";

export function registerApiRoutes(app: Express) {
  app.use("/api/books", booksRouter);
  app.use("/api/import-jobs", importJobsRouter);
  app.use("/api/sources", sourcesRouter);
  app.use("/api/steps", playbackRouter);
}

