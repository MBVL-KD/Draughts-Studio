import type { SourceDocument } from "../types/analysisTypes";
import { apiDelete, apiGet, apiPatch, apiPost } from "./httpClient";

type ItemResponse<T> = {
  item: T;
};

type ListResponse<T> = {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
};

export function listSources(params?: {
  search?: string;
  status?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  sort?: "updatedAt_desc" | "updatedAt_asc";
}) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  if (params?.tag) qs.set("tag", params.tag);
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number") qs.set("offset", String(params.offset));
  if (params?.sort) qs.set("sort", params.sort);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet<ListResponse<SourceDocument>>(`/api/sources${suffix}`);
}

export function getSource(sourceId: string) {
  return apiGet<ItemResponse<SourceDocument>>(
    `/api/sources/${encodeURIComponent(sourceId)}`
  );
}

export function createSource(document: SourceDocument) {
  return apiPost<ItemResponse<SourceDocument>>("/api/sources", { document });
}

export function patchSource(
  sourceId: string,
  expectedRevision: number,
  document: SourceDocument
) {
  return apiPatch<ItemResponse<SourceDocument>>(
    `/api/sources/${encodeURIComponent(sourceId)}`,
    {
      expectedRevision,
      document,
    }
  );
}

export function deleteSource(sourceId: string) {
  return apiDelete<ItemResponse<SourceDocument>>(
    `/api/sources/${encodeURIComponent(sourceId)}`
  );
}

