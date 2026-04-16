export type ImportJobStatus =
  | "idle"
  | "running"
  /** Some API responses still use this synonym for `running`. */
  | "processing"
  | "paused"
  | "completed"
  | "failed";

export type ImportItemStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "skipped";

export type ImportScanConfig = {
  enabled: boolean;
  depth?: number;
  multiPv?: number;
};

export type ImportScanResult = {
  bestMove?: string;
  ponder?: string;
  evaluation?: number | null;
  pv?: string[];
  depthUsed?: number;
};

export type ImportJob = {
  id?: string;
  jobId?: string;
  sourceType: string;
  sourceUrl: string;
  collectionSlug: string;
  collectionTitle?: string | null;
  baseDifficultyBand?: "beginner" | "intermediate" | "advanced" | null;
  basePuzzleRating?: number | null;
  status: ImportJobStatus;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  currentIndex: number;
  targetBookId?: string | null;
  targetLessonId?: string | null;
  scanConfig: ImportScanConfig;
  lastError?: string | null;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ImportItem = {
  id?: string;
  itemId?: string;
  jobId: string;
  index: number;
  fragmentUrl: string;
  board50: string;
  resultText?: string | null;
  sourceText?: string | null;
  status: ImportItemStatus;
  retries: number;
  errorMessage?: string | null;
  importedStepId?: string | null;
  importedLessonId?: string | null;
  scanResult?: ImportScanResult;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ItemResponse<T> = {
  item: T;
};

export type ListResponse<T> = {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
};
