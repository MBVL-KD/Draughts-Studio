import { load } from "cheerio";
import type {
  CollectionScraperAdapter,
  NormalizedCollectionIndex,
  NormalizedCollectionIndexItem,
  NormalizedCollectionItem,
} from "./types";

const FRAGMENT_PATH_TOKEN = "/collection-fragment/";

function normalizeWhitespace(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function toNullableText(value?: string | null): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function looksLikeBoard50(text?: string | null): boolean {
  if (!text) return false;
  const compact = normalizeWhitespace(text).replace(/\s+/g, "");
  const parts = compact.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 50) return false;
  return parts.every((part) => /^(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|w|b|W|B|wk|bk|x|-|\.|_)$/.test(part));
}

function absoluteUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

/** Certificate covers slagzet.com but not www.slagzet.com — normalize for HTTPS. */
function normalizeSlagzetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.slagzet.com") {
      parsed.hostname = "slagzet.com";
      return parsed.toString();
    }
  } catch {
    /* keep raw */
  }
  return url;
}

async function fetchHtml(
  url: string,
  options?: { allowFailure?: boolean }
): Promise<string | null> {
  const resolved = normalizeSlagzetUrl(url);
  const response = await fetch(resolved, {
    method: "GET",
    headers: {
      "accept-language": "en,nl;q=0.9,*;q=0.5",
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Draughts4All-Importer/1.0 (+server)",
    },
  });

  if (!response.ok) {
    if (options?.allowFailure) {
      return null;
    }
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/** Slug segment from `/collection/{slug}/…` → readable lesson title when the page H1 is generic. */
function collectionTitleFromSlug(slug: string): string {
  const s = slug.trim();
  if (!s || s === "unknown") return s || "unknown";
  return s
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.length <= 1 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

function isGenericCollectionHeading(text: string | null): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  if (/^slagzet\.com$/i.test(t)) return true;
  if (/^collection$/i.test(t)) return true;
  return false;
}

function extractCollectionSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const collectionIndex = parts.findIndex((part) => part === "collection");
    if (collectionIndex >= 0) {
      const slug = parts[collectionIndex + 1];
      if (slug) return slug;
    }
    if (parts.length > 0) return parts[parts.length - 1] ?? "unknown";
    return "unknown";
  } catch {
    const match = url.match(/\/collection\/([^/?#]+)/i);
    return match?.[1] ?? "unknown";
  }
}

function extractPagination(text: string): { currentPage: number | null; totalPages: number | null } {
  const normalized = normalizeWhitespace(text);
  const pagesMatch = normalized.match(/page\s*(\d+)\s*(?:\/|of)\s*(\d+)/i);
  if (pagesMatch) {
    return {
      currentPage: Number(pagesMatch[1]) || null,
      totalPages: Number(pagesMatch[2]) || null,
    };
  }

  const currentOnly = normalized.match(/\bpage\s*(\d+)\b/i);
  if (currentOnly) {
    return {
      currentPage: Number(currentOnly[1]) || null,
      totalPages: null,
    };
  }

  return { currentPage: null, totalPages: null };
}

function extractLikelyBoard50FromTextBlocks(blocks: string[]): string | null {
  for (const block of blocks) {
    if (looksLikeBoard50(block)) return normalizeWhitespace(block);
    const boardMatch = block.match(/(\d[\d,\s]{80,})/);
    if (!boardMatch) continue;
    const candidate = normalizeWhitespace(boardMatch[1]);
    if (looksLikeBoard50(candidate)) return candidate;
  }
  return null;
}

function parseItemCard(
  cardText: string
): Pick<NormalizedCollectionIndexItem, "board50" | "resultText" | "sourceText"> {
  const lines = cardText
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const board50 = extractLikelyBoard50FromTextBlocks(lines);
  let resultText: string | null = null;
  let sourceText: string | null = null;

  for (const line of lines) {
    if (!resultText && /^(result|uitkomst|stand)\s*[:\-]/i.test(line)) {
      resultText = normalizeWhitespace(line.replace(/^(result|uitkomst|stand)\s*[:\-]\s*/i, ""));
    }
    if (!sourceText && /^(source|bron|partij)\s*[:\-]/i.test(line)) {
      sourceText = normalizeWhitespace(line.replace(/^(source|bron|partij)\s*[:\-]\s*/i, ""));
    }
  }

  return {
    board50,
    resultText,
    sourceText,
  };
}

function buildCollectionPageUrl(url: string, page?: number): string {
  if (!page || page <= 1) return url;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length > 0 && /^\d+$/.test(parts[parts.length - 1] ?? "")) {
      parts[parts.length - 1] = String(page);
    } else {
      parts.push(String(page));
    }
    parsed.pathname = `/${parts.join("/")}`;
    return parsed.toString();
  } catch {
    return `${url.replace(/\/+$/, "")}/${page}`;
  }
}

async function scrapeCollectionIndex(
  url: string,
  page?: number
): Promise<NormalizedCollectionIndex> {
  const baseUrl = normalizeSlagzetUrl(url);
  const targetUrl = buildCollectionPageUrl(baseUrl, page);
  const isFollowUpPage = typeof page === "number" && page > 1;
  const html = await fetchHtml(targetUrl, { allowFailure: isFollowUpPage });
  if (html === null) {
    const slug = extractCollectionSlug(targetUrl);
    const titleFromPath = collectionTitleFromSlug(slug);
    return {
      sourceType: "slagzet",
      sourceUrl: targetUrl,
      collectionTitle: titleFromPath,
      collectionDescription: null,
      collectionSlug: slug,
      totalPages: null,
      currentPage: page ?? null,
      items: [],
    };
  }
  const $ = load(html);
  const bodyText = normalizeWhitespace($("body").text());
  const slug = extractCollectionSlug(targetUrl);

  const h1 = toNullableText($("h1").first().text());
  const docTitle = toNullableText($("title").first().text());
  const titleFromPath = collectionTitleFromSlug(slug);
  const title = !isGenericCollectionHeading(h1)
    ? h1
    : titleFromPath !== "unknown"
      ? titleFromPath
      : docTitle ?? slug;

  const description =
    toNullableText($("meta[name='description']").attr("content")) ??
    toNullableText($(".collection-description").first().text()) ??
    null;

  const paginationInfo = extractPagination(bodyText);
  const seen = new Set<string>();
  const items: NormalizedCollectionIndexItem[] = [];

  $(`a[href*='${FRAGMENT_PATH_TOKEN}']`).each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const fragmentUrl = absoluteUrl(targetUrl, href);
    if (seen.has(fragmentUrl)) return;
    seen.add(fragmentUrl);

    const card = $(element).closest("article, li, .card, .item, .row, div");
    const cardText = card.length > 0 ? card.text() : $(element).parent().text();
    const parsed = parseItemCard(cardText);

    items.push({
      index: items.length,
      fragmentUrl,
      board50: parsed.board50 ?? null,
      resultText: parsed.resultText ?? null,
      sourceText: parsed.sourceText ?? null,
    });
  });

  return {
    sourceType: "slagzet",
    sourceUrl: targetUrl,
    collectionTitle: title,
    collectionDescription: description,
    collectionSlug: slug,
    totalPages: paginationInfo.totalPages,
    currentPage: paginationInfo.currentPage ?? (page ?? null),
    items,
  };
}

function extractMetadataFromText(rawText: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  const lines = rawText
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(players?|tournament|round|date|event)\s*[:\-]\s*(.+)$/i);
    if (!match) continue;
    const key = normalizeWhitespace(match[1]).toLowerCase();
    const value = normalizeWhitespace(match[2]);
    if (key && value) metadata[key] = value;
  }

  return metadata;
}

const BOARD_IMAGE_CODE_RE = /\/api\/image\/([a-zA-Z]{50})/;

function inferSideToMoveFromAss(assText: string): "W" | "B" {
  if (/wit\s+begint|white\s+starts/i.test(assText)) return "W";
  if (/zwart\s+begint|black\s+starts/i.test(assText)) return "B";
  return "W";
}

/** Slagzet `og:image` URLs end with a 50-letter board code (e,w,W,b,B). */
function boardImageCodeToPdFen(code: string, side: "W" | "B"): string | null {
  if (code.length !== 50) return null;
  const wm: number[] = [];
  const wk: number[] = [];
  const bm: number[] = [];
  const bk: number[] = [];
  for (let i = 0; i < 50; i += 1) {
    const sq = i + 1;
    const ch = code[i] ?? "";
    if (ch === "e" || ch === "E") continue;
    if (ch === "w") wm.push(sq);
    else if (ch === "W") wk.push(sq);
    else if (ch === "b") bm.push(sq);
    else if (ch === "B") bk.push(sq);
    else return null;
  }
  const wParts = [...wm.map(String), ...wk.map((s) => `K${s}`)];
  const bParts = [...bm.map(String), ...bk.map((s) => `K${s}`)];
  const whiteSection = `W${wParts.length ? wParts.join(",") : ""}`;
  const blackSection = `B${bParts.length ? bParts.join(",") : ""}`;
  return `${side}:${whiteSection}:${blackSection}`;
}

function extractBoardImageCode($: ReturnType<typeof load>): string | null {
  const metaContent =
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="og:image"]').attr("content");
  if (metaContent) {
    const m = metaContent.match(BOARD_IMAGE_CODE_RE);
    if (m?.[1]) return m[1];
  }
  const html = $.html();
  const m2 = html.match(BOARD_IMAGE_CODE_RE);
  return m2?.[1] ?? null;
}

async function scrapeCollectionItem(fragmentUrl: string): Promise<NormalizedCollectionItem> {
  const html = await fetchHtml(fragmentUrl);
  if (html === null) {
    throw new Error(`Failed to fetch ${fragmentUrl}`);
  }
  const $ = load(html);
  const bodyText = $("body").text();
  const normalizedBodyText = normalizeWhitespace(bodyText);

  const textBlocks = $("main, article, .content, .container, body")
    .first()
    .text()
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const assText = normalizeWhitespace($("#ass").first().text());
  const side = inferSideToMoveFromAss(assText);
  const imageCode = extractBoardImageCode($);
  const fenFromImage = imageCode ? boardImageCodeToPdFen(imageCode, side) : null;

  const board50 =
    (fenFromImage ? fenFromImage : null) ??
    toNullableText($("[data-board50]").first().attr("data-board50")) ??
    extractLikelyBoard50FromTextBlocks(textBlocks);

  let resultText =
    toNullableText($("[data-result]").first().attr("data-result")) ??
    toNullableText($(".result").first().text()) ??
    null;

  let sourceText =
    toNullableText($("[data-source]").first().attr("data-source")) ??
    toNullableText($(".source").first().text()) ??
    null;

  if (!resultText || !sourceText) {
    for (const line of textBlocks) {
      if (!resultText && /^(result|uitkomst|stand)\s*[:\-]/i.test(line)) {
        resultText = normalizeWhitespace(line.replace(/^(result|uitkomst|stand)\s*[:\-]\s*/i, ""));
      }
      if (!sourceText && /^(source|bron|partij)\s*[:\-]/i.test(line)) {
        sourceText = normalizeWhitespace(line.replace(/^(source|bron|partij)\s*[:\-]\s*/i, ""));
      }
    }
  }

  const title =
    toNullableText($("h1").first().text()) ??
    toNullableText($("title").first().text()) ??
    null;

  const metadata = extractMetadataFromText(bodyText);

  return {
    sourceType: "slagzet",
    fragmentUrl,
    board50,
    resultText,
    sourceText,
    title,
    metadata,
    rawText: normalizedBodyText || null,
  };
}

export const slagzetAdapter: CollectionScraperAdapter = {
  scrapeCollectionIndex,
  scrapeCollectionItem,
};
