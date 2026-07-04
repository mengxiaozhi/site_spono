import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveProjectPath(value, cwd) {
  if (value === ":memory:" || path.isAbsolute(value)) {
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

export function loadConfig(overrides = {}) {
  const cwd = overrides.cwd ?? projectRoot;
  const maxUploadMb = numberFromEnv(overrides.maxUploadMb ?? process.env.MAX_UPLOAD_MB, 50);

  return {
    cwd,
    port: numberFromEnv(overrides.port ?? process.env.BACKEND_PORT, 4000),
    frontendOrigin: overrides.frontendOrigin ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    jwtSecret: overrides.jwtSecret ?? process.env.JWT_SECRET ?? "change-me",
    databasePath: resolveProjectPath(overrides.databasePath ?? process.env.DATABASE_PATH ?? "./data/app.db", cwd),
    uploadRoot: resolveProjectPath(overrides.uploadRoot ?? process.env.UPLOAD_ROOT ?? "./storage/sites", cwd),
    cnameTarget: normalizeTarget(overrides.cnameTarget ?? process.env.CNAME_TARGET ?? "sites.example.com"),
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    maxUnzippedBytes: numberFromEnv(overrides.maxUnzippedMb ?? process.env.MAX_UNZIPPED_MB, maxUploadMb * 4) * 1024 * 1024,
    maxZipEntries: numberFromEnv(overrides.maxZipEntries ?? process.env.MAX_ZIP_ENTRIES, 2000),
    demoMode: overrides.demoMode ?? booleanFromEnv(process.env.DEMO_MODE, false),
    isProduction: overrides.isProduction ?? process.env.NODE_ENV === "production"
  };
}

export function normalizeTarget(value) {
  return String(value).trim().toLowerCase().replace(/\.$/, "");
}
