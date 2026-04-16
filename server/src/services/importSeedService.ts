import { getImportAdapter } from "../import/adapters";
import type {
  NormalizedCollectionIndex,
  NormalizedCollectionIndexItem,
} from "../import/adapters/types";
import { createItemsBulk } from "../repositories/importItemRepository";
import { getImportJobById } from "../repositories/importJobRepository";
import { ConflictError, NotFoundError, ValidationError } from "../utils/httpErrors";
import type { ImportItem } from "../types/importTypes";
import { ImportJobModel } from "../models/ImportJobModel";

const MAX_COLLECTION_PAGES = 500;

function mergeIndexItemsDeduped(
  pages: NormalizedCollectionIndexItem[][]
): NormalizedCollectionIndexItem[] {
  const seen = new Set<string>();
  const out: NormalizedCollectionIndexItem[] = [];
  for (const pageItems of pages) {
    for (const row of pageItems) {
      if (seen.has(row.fragmentUrl)) continue;
      seen.add(row.fragmentUrl);
      out.push({ ...row, index: out.length });
    }
  }
  return out;
}

async function scrapeCollectionPagesForSeed(
  scrapeCollectionIndex: (
    url: string,
    page?: number
  ) => Promise<NormalizedCollectionIndex>,
  baseUrl: string,
  firstPage: NormalizedCollectionIndex,
  maxPages?: number,
  onPageScraped?: (info: { page: number; expectedTotalPages: number | null; items: number }) => void
): Promise<{
  mergedItems: NormalizedCollectionIndexItem[];
  pagesFetched: number;
  totalPagesHint: number | null;
}> {
  const pageLimit =
    typeof maxPages === "number" && Number.isFinite(maxPages)
      ? Math.min(Math.max(1, Math.floor(maxPages)), MAX_COLLECTION_PAGES)
      : MAX_COLLECTION_PAGES;

  const pageBatches: NormalizedCollectionIndexItem[][] = [firstPage.items];
  let pagesFetched = 1;
  const totalPages = firstPage.totalPages;

  if (pageLimit <= 1) {
    return {
      mergedItems: mergeIndexItemsDeduped(pageBatches),
      pagesFetched: 1,
      totalPagesHint:
        typeof totalPages === "number" && Number.isFinite(totalPages)
          ? Math.floor(totalPages)
          : null,
    };
  }

  if (typeof totalPages === "number" && totalPages > 1 && Number.isFinite(totalPages)) {
    const cap = Math.min(Math.floor(totalPages), pageLimit, MAX_COLLECTION_PAGES);
    for (let p = 2; p <= cap; p += 1) {
      const idx = await scrapeCollectionIndex(baseUrl, p);
      onPageScraped?.({ page: p, expectedTotalPages: cap, items: idx.items.length });
      pagesFetched += 1;
      pageBatches.push(idx.items);
      if (!idx.items.length) break;
    }
  } else {
    for (let p = 2; p <= pageLimit; p += 1) {
      const idx = await scrapeCollectionIndex(baseUrl, p);
      onPageScraped?.({ page: p, expectedTotalPages: null, items: idx.items.length });
      pagesFetched += 1;
      if (!idx.items.length) break;
      pageBatches.push(idx.items);
    }
  }

  return {
    mergedItems: mergeIndexItemsDeduped(pageBatches),
    pagesFetched,
    totalPagesHint:
      typeof totalPages === "number" && Number.isFinite(totalPages)
        ? Math.floor(totalPages)
        : null,
  };
}

type OwnerContext = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

function withOwnerFilter(owner: OwnerContext) {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    isDeleted: false,
  };
}

export async function seedImportJobFromCollectionIndex(
  owner: OwnerContext,
  jobId: string,
  options?: {
    page?: number;
    allPages?: boolean;
    /** When set with allPages, fetch at most this many index pages (1 = first page only). */
    maxPages?: number;
    expectedRevision?: number;
  }
) {
  const job = await getImportJobById(owner, jobId);
  const revision = Number(job.revision ?? 1);
  if (
    options?.expectedRevision !== undefined &&
    options.expectedRevision !== revision
  ) {
    throw new ConflictError("Import job revision conflict");
  }

  if (Number(job.totalItems ?? 0) > 0) {
    throw new ValidationError("Job already has items; clear or use a new job.", [
      {
        path: "totalItems",
        code: "already_seeded",
        message: "totalItems must be 0 before seeding",
        severity: "error",
      },
    ]);
  }

  const adapter = getImportAdapter(job.sourceType);
  const allPages = options?.allPages === true;
  const page = typeof options?.page === "number" && Number.isFinite(options.page)
    ? Math.max(1, Math.floor(options.page))
    : 1;

  const baseUrl = typeof job.sourceUrl === "string" ? job.sourceUrl : "";
  const scrapeIndex = async (url: string, p?: number) => {
    try {
      return await adapter.scrapeCollectionIndex(url, p);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const pageHint = p != null ? ` (pagina ${p})` : "";
      throw new ValidationError(
        `Collectie-index ophalen mislukt${pageHint}: ${msg}. Controleer Source URL (juiste pad en hoofdletters, bijv. …/collection/Beginner).`,
        [
          {
            path: "sourceUrl",
            code: "index_fetch_failed",
            message: msg,
            severity: "error",
          },
        ]
      );
    }
  };

  const index = await scrapeIndex(baseUrl, page);

  if (!index.items.length) {
    throw new ValidationError("No puzzles found on this collection page.", [
      {
        path: "items",
        code: "index_empty",
        message: "Scraper found zero fragment links; page structure may have changed.",
        severity: "error",
      },
    ]);
  }

  let indexItems: NormalizedCollectionIndexItem[] = index.items;
  let pagesFetched = 1;
  let totalPagesHint: number | null =
    typeof index.totalPages === "number" && Number.isFinite(index.totalPages)
      ? Math.floor(index.totalPages)
      : null;

  if (allPages) {
    if (page !== 1) {
      throw new ValidationError("allPages requires page 1 (omit page or set page: 1).", [
        {
          path: "page",
          code: "all_pages_requires_page_one",
          message: "When allPages is true, seed from the collection root / page 1 only.",
          severity: "error",
        },
      ]);
    }
    console.info(
      `[seed] job=${jobId} start allPages basePage=1 initialItems=${index.items.length} maxPages=${
        typeof options?.maxPages === "number" ? Math.floor(options.maxPages) : "auto"
      }`
    );
    const multi = await scrapeCollectionPagesForSeed(
      scrapeIndex,
      baseUrl,
      index,
      options?.maxPages,
      ({ page: scannedPage, expectedTotalPages, items }) => {
        console.info(
          `[seed] job=${jobId} page=${scannedPage}${
            expectedTotalPages ? `/${expectedTotalPages}` : ""
          } items=${items}`
        );
      }
    );
    indexItems = multi.mergedItems;
    pagesFetched = multi.pagesFetched;
    totalPagesHint = multi.totalPagesHint ?? totalPagesHint;

    if (!indexItems.length) {
      throw new ValidationError("No puzzles found after fetching collection pages.", [
        {
          path: "items",
          code: "index_empty",
          message: "Merged index is empty.",
          severity: "error",
        },
      ]);
    }
  }

  const items: ImportItem[] = indexItems.map((row) => {
    const fragmentUrl = String(row.fragmentUrl ?? "").trim();
    if (!fragmentUrl) {
      throw new ValidationError("Index bevat een item zonder geldige puzzel-URL.", [
        {
          path: "items",
          code: "empty_fragment_url",
          message: `index ${row.index}`,
          severity: "error",
        },
      ]);
    }
    return {
      jobId,
      index: row.index,
      fragmentUrl,
      board50:
        typeof row.board50 === "string" && row.board50.trim().length > 0
          ? row.board50.trim()
          : "pending",
      resultText: row.resultText ?? null,
      sourceText: row.sourceText ?? null,
      status: "pending" as const,
      retries: 0,
      errorMessage: null,
      importedStepId: null,
      importedLessonId: null,
    };
  });

  await createItemsBulk(owner, items);

  const updated = await ImportJobModel.findOneAndUpdate(
    {
      ...withOwnerFilter(owner),
      jobId,
      revision,
    },
    {
      $set: {
        totalItems: items.length,
        sourceUrl: index.sourceUrl,
        collectionSlug: index.collectionSlug || job.collectionSlug,
        collectionTitle: index.collectionTitle ?? null,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after" }
  ).lean();

  if (!updated) {
    const exists = await ImportJobModel.exists({ ...withOwnerFilter(owner), jobId });
    if (!exists) throw new NotFoundError("Import job not found");
    throw new ConflictError("Import job revision conflict");
  }

  return {
    job: updated,
    seededCount: items.length,
    collectionTitle: index.collectionTitle,
    currentPage: index.currentPage,
    totalPages: totalPagesHint ?? index.totalPages,
    pagesFetched: allPages ? pagesFetched : undefined,
  };
}
