export type ApiError = {
  status: number;
  message: string;
  issues?: Array<{
    path: string;
    code: string;
    message: string;
    severity: "error" | "warning";
  }>;
  raw?: unknown;
};

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(status: number, raw: unknown): ApiError {
  const message =
    typeof raw === "object" &&
    raw !== null &&
    "message" in raw &&
    typeof (raw as { message?: unknown }).message === "string"
      ? ((raw as { message: string }).message ?? "Request failed")
      : "Request failed";

  const issues =
    typeof raw === "object" &&
    raw !== null &&
    "issues" in raw &&
    Array.isArray((raw as { issues?: unknown[] }).issues)
      ? ((raw as { issues: ApiError["issues"] }).issues ?? undefined)
      : undefined;

  return { status, message, issues, raw };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const baseUrl =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE_URL === "string"
      ? import.meta.env.VITE_API_BASE_URL
      : "";
  const resolvedUrl =
    baseUrl && url.startsWith("/")
      ? `${baseUrl.replace(/\/+$/, "")}${url}`
      : url;

  const response = await fetch(resolvedUrl, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const raw = await parseJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response.status, raw);
  }
  return raw as T;
}

export function apiGet<T>(url: string, init?: RequestInit) {
  return request<T>(url, { method: "GET", ...init });
}

export function apiPost<T>(url: string, body: unknown, init?: RequestInit) {
  const { headers: extraHeaders, ...rest } = init ?? {};
  return request<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders ?? {}),
    },
  });
}

export function apiPatch<T>(url: string, body: unknown, init?: RequestInit) {
  const { headers: extraHeaders, ...rest } = init ?? {};
  return request<T>(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders ?? {}),
    },
  });
}

export function apiDelete<T>(url: string, init?: RequestInit) {
  return request<T>(url, { method: "DELETE", ...init });
}

