const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production" ? "https://api.spono.tw/site" : "http://localhost:4000";

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL);

export type User = {
  id: string;
  email: string;
  createdAt: string;
};

export type Site = {
  id: string;
  name: string;
  slug: string;
  activeDeploymentId: string | null;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
};

export type Deployment = {
  id: string;
  siteId: string;
  version: number;
  originalName: string;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
};

export type GenerationJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  requestedSiteId: string | null;
  resultSiteId: string | null;
  resultDeploymentId: string | null;
  generated: {
    siteName: string | null;
    summary: string | null;
  };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type Domain = {
  id: string;
  siteId: string;
  hostname: string;
  status: "pending" | "verified" | "failed";
  cnameTarget: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

type ApiInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown>;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;

  if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body,
      credentials: "include"
    });
  } catch {
    throw new ApiError("無法連線到 API，請重新整理後再試", 0);
  }

  const text = await response.text();
  let data: { error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new ApiError(data.error || "Request failed", response.status);
  }

  return data as T;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
