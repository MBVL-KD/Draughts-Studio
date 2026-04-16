export type NormalizedCollectionIndexItem = {
  index: number;
  fragmentUrl: string;
  board50?: string | null;
  resultText?: string | null;
  sourceText?: string | null;
};

export type NormalizedCollectionIndex = {
  sourceType: "slagzet";
  sourceUrl: string;
  collectionTitle: string;
  collectionDescription?: string | null;
  collectionSlug: string;
  totalPages?: number | null;
  currentPage?: number | null;
  items: NormalizedCollectionIndexItem[];
};

export type NormalizedCollectionItem = {
  sourceType: "slagzet";
  fragmentUrl: string;
  board50?: string | null;
  resultText?: string | null;
  sourceText?: string | null;
  title?: string | null;
  metadata?: Record<string, string>;
  rawText?: string | null;
};

export type CollectionScraperAdapter = {
  scrapeCollectionIndex(
    url: string,
    page?: number
  ): Promise<NormalizedCollectionIndex>;
  scrapeCollectionItem(fragmentUrl: string): Promise<NormalizedCollectionItem>;
};
