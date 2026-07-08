import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const productionFrontendOrigin = "https://site.spono.tw";
const fastGeminiModel = "gemini-3.1-flash-lite";
const slowGeminiModels = new Set(["gemini-3.5-flash"]);

loadDotenv();
loadDotenv({ path: path.join(projectRoot, ".env") });

function resolveProjectPath(value, cwd) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(cwd, value);
}

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanFromEnv(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).trim().toLowerCase() === "true";
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeOrigin(value) {
  const normalized = trimTrailingSlash(value);
  if (!normalized) {
    return "";
  }
  try {
    return new URL(normalized).origin;
  } catch {
    return normalized;
  }
}

function originValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap(originValues);
  }
  return String(value || "")
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigins(value) {
  return [...new Set(originValues(value).map(normalizeOrigin).filter(Boolean))];
}

function normalizeBaseUrl(value) {
  return trimTrailingSlash(value);
}

function normalizePathPrefix(value) {
  const cleaned = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `/${cleaned}` : "";
}

function pathPrefixFromUrl(value) {
  try {
    return normalizePathPrefix(new URL(value).pathname);
  } catch {
    return "";
  }
}

function normalizeGeminiModel(value) {
  const model = String(value || fastGeminiModel).trim();
  return slowGeminiModels.has(model) ? fastGeminiModel : model;
}

export function loadConfig(overrides = {}) {
  const cwd = overrides.cwd ?? projectRoot;
  const port = numberFromEnv(overrides.port ?? process.env.BACKEND_PORT, 4000);
  const isProduction = overrides.isProduction ?? process.env.NODE_ENV === "production";
  const maxUploadMb = numberFromEnv(overrides.maxUploadMb ?? process.env.MAX_UPLOAD_MB, 50);
  const defaultFrontendOrigin = isProduction ? productionFrontendOrigin : "http://localhost:3000";
  const defaultPublicBaseUrl = isProduction ? "https://api.spono.tw/site" : `http://localhost:${port}`;
  const frontendOrigin = normalizeOrigin(overrides.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? defaultFrontendOrigin);
  const publicBaseUrl = normalizeBaseUrl(overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? defaultPublicBaseUrl);

  return {
    cwd,
    port,
    frontendOrigin,
    corsOrigins: normalizeOrigins([
      frontendOrigin,
      productionFrontendOrigin,
      overrides.corsOrigins ?? process.env.CORS_ORIGINS
    ]),
    publicBaseUrl,
    publicPathPrefix: normalizePathPrefix(
      overrides.publicPathPrefix ?? process.env.PUBLIC_PATH_PREFIX ?? pathPrefixFromUrl(publicBaseUrl)
    ),
    jwtSecret: overrides.jwtSecret ?? process.env.JWT_SECRET ?? "change-me",
    dbHost: overrides.dbHost ?? process.env.DB_HOST ?? "127.0.0.1",
    dbPort: numberFromEnv(overrides.dbPort ?? process.env.DB_PORT, 3306),
    dbUser: overrides.dbUser ?? process.env.DB_USER ?? "root",
    dbPassword: overrides.dbPassword ?? process.env.DB_PASSWORD ?? "",
    dbName: overrides.dbName ?? process.env.DB_NAME ?? "site_spono",
    dbPool: numberFromEnv(overrides.dbPool ?? process.env.DB_POOL, 10),
    uploadRoot: resolveProjectPath(overrides.uploadRoot ?? process.env.UPLOAD_ROOT ?? "./storage/sites", cwd),
    cnameTarget: normalizeTarget(overrides.cnameTarget ?? process.env.CNAME_TARGET ?? "sites.example.com"),
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    maxUnzippedBytes: numberFromEnv(overrides.maxUnzippedMb ?? process.env.MAX_UNZIPPED_MB, maxUploadMb * 4) * 1024 * 1024,
    maxZipEntries: numberFromEnv(overrides.maxZipEntries ?? process.env.MAX_ZIP_ENTRIES, 2000),
    geminiApiKey: overrides.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "",
    geminiModel: normalizeGeminiModel(overrides.geminiModel ?? process.env.GEMINI_MODEL ?? fastGeminiModel),
    geminiEndpoint: normalizeBaseUrl(overrides.geminiEndpoint ?? process.env.GEMINI_ENDPOINT ?? "https://generativelanguage.googleapis.com/v1beta/interactions"),
    geminiProxyUrl: normalizeBaseUrl(overrides.geminiProxyUrl ?? process.env.GEMINI_PROXY_URL ?? ""),
    geminiProxyToken: overrides.geminiProxyToken ?? process.env.GEMINI_PROXY_TOKEN ?? "",
    geminiThinkingLevel: overrides.geminiThinkingLevel ?? process.env.GEMINI_THINKING_LEVEL ?? "minimal",
    geminiTimeoutMs: numberFromEnv(overrides.geminiTimeoutMs ?? process.env.GEMINI_TIMEOUT_MS, 12000),
    demoMode: overrides.demoMode ?? booleanFromEnv(process.env.DEMO_MODE, false),
    isProduction
  };
}

export function normalizeTarget(value) {
  return String(value).trim().toLowerCase().replace(/\.$/, "");
}
