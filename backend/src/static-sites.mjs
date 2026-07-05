import fs from "node:fs";
import path from "node:path";
import mime from "mime-types";
import { queryOne } from "./database.mjs";

export function hostWithoutPort(host) {
  const value = String(host || "").split(",")[0].trim().toLowerCase();
  if (!value) {
    return "";
  }
  if (value.startsWith("[")) {
    return value.replace(/^\[/, "").replace(/\].*$/, "");
  }
  return value.replace(/:\d+$/, "").replace(/\.$/, "");
}

function safeJoin(rootPath, requestPath) {
  const relativePath = requestPath.replace(/^\/+/, "") || "index.html";
  const target = path.resolve(rootPath, relativePath);
  const root = path.resolve(rootPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    const error = new Error("Invalid static path");
    error.status = 400;
    throw error;
  }
  return target;
}

async function fileExists(filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function resolveStaticFile(rootPath, requestPath) {
  const normalized = decodeURIComponent(requestPath.split("?")[0] || "/");
  const withIndex = normalized.endsWith("/") ? `${normalized}index.html` : normalized;
  let candidate = safeJoin(rootPath, withIndex);

  try {
    const stats = await fs.promises.stat(candidate);
    if (stats.isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }
    if (await fileExists(candidate)) {
      return candidate;
    }
  } catch {
    // Fall through to SPA-style fallback for extensionless routes.
  }

  if (!path.extname(withIndex)) {
    const fallback = path.join(rootPath, "index.html");
    if (await fileExists(fallback)) {
      return fallback;
    }
  }

  return null;
}

export async function serveStaticSite(req, res, rootPath, requestPath) {
  let filePath;
  try {
    filePath = await resolveStaticFile(rootPath, requestPath || req.path || "/");
  } catch {
    res.status(400).send("Invalid static path");
    return;
  }

  if (!filePath) {
    res.status(404).send("Not found");
    return;
  }

  const contentType = mime.lookup(filePath) || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", contentType === "text/html" ? "no-cache" : "public, max-age=60");
  fs.createReadStream(filePath).pipe(res);
}

export function createPreviewMiddleware(db) {
  return async (req, res, next) => {
    try {
      const site = await queryOne(db, "SELECT * FROM sites WHERE slug = ?", [req.params.slug]);
      if (!site?.active_deployment_id) {
        res.status(404).send("Site not published");
        return;
      }

      const deployment = await queryOne(db, "SELECT * FROM deployments WHERE id = ?", [site.active_deployment_id]);
      if (!deployment) {
        res.status(404).send("Deployment not found");
        return;
      }

      await serveStaticSite(req, res, deployment.root_path, req.path || "/");
    } catch (error) {
      next(error);
    }
  };
}

export function createDomainMiddleware(db) {
  return async (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/s/")) {
      next();
      return;
    }

    const hostname = hostWithoutPort(req.headers.host);
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      next();
      return;
    }

    let row;
    try {
      row = await queryOne(db, `
        SELECT deployments.root_path
        FROM domains
        INNER JOIN sites ON sites.id = domains.site_id
        INNER JOIN deployments ON deployments.id = sites.active_deployment_id
        WHERE domains.hostname = ? AND domains.status = 'verified'
      `, [hostname]);
    } catch (error) {
      next(error);
      return;
    }

    if (!row) {
      next();
      return;
    }

    await serveStaticSite(req, res, row.root_path, req.path || "/");
  };
}
