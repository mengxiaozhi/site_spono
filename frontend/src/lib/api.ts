export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

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

export async function apiRequest<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;

  if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body,
    credentials: "include"
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
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
