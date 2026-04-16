import type { CollectionScraperAdapter } from "./types";
import { slagzetAdapter } from "./slagzetAdapter";

export { slagzetAdapter };

export function getImportAdapter(sourceType: string): CollectionScraperAdapter {
  if (sourceType === "slagzet") return slagzetAdapter;
  throw new Error(`Unsupported import adapter sourceType: ${sourceType}`);
}
