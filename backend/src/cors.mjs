import cors from "cors";

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function normalizeCorsOrigin(value) {
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

export function createCorsMiddleware(config) {
  const allowedOrigins = new Set([
    config.frontendOrigin,
    ...(config.corsOrigins || [])
  ].map(normalizeCorsOrigin).filter(Boolean));

  return cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeCorsOrigin(origin);
      callback(null, allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
    optionsSuccessStatus: 204
  });
}
