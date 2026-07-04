import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authenticateUser, clearSessionCookie, createUser, getSessionUser, requireAuth, setSessionCookie, signSession } from "./auth.mjs";
import { nowIso, publicDeployment, publicDomain, publicSite } from "./database.mjs";
import { ensureDemoData } from "./demo.mjs";
import { extractStaticSiteZip } from "./storage.mjs";
import { isValidHostname, normalizeHostname, verifyDomainRecord } from "./domains.mjs";

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "site";
}

function createUniqueSlug(db, requested) {
  const base = slugify(requested);
  let candidate = base;
  let suffix = 2;
  while (db.prepare("SELECT id FROM sites WHERE slug = ?").get(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function getOwnedSite(db, siteId, userId) {
  const site = db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(siteId, userId);
  if (!site) {
    throw createHttpError("找不到網站", 404);
  }
  return site;
}

function previewUrl(config, slug) {
  return `http://localhost:${config.port}/s/${slug}/`;
}

function serializeSite(row, config) {
  return {
    ...publicSite(row),
    previewUrl: previewUrl(config, row.slug)
  };
}

function createUpload(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1
    },
    fileFilter: (_req, file, callback) => {
      if (!file.originalname.toLowerCase().endsWith(".zip")) {
        callback(createHttpError("只接受 .zip 檔案"));
        return;
      }
      callback(null, true);
    }
  });
}

export function createApiRouter({ db, config, dnsResolver }) {
  const router = express.Router();
  const upload = createUpload(config);
  const requireSession = requireAuth(db, config);

  router.get("/demo/status", (_req, res) => {
    res.json({ enabled: config.demoMode });
  });

  router.post("/demo/login", asyncRoute(async (_req, res) => {
    if (!config.demoMode) {
      throw createHttpError("Demo mode is disabled", 404);
    }
    const user = await ensureDemoData(db, config);
    const token = signSession(user, config);
    setSessionCookie(res, token, config);
    res.json({ user });
  }));

  router.post("/auth/register", asyncRoute(async (req, res) => {
    const user = createUser(db, req.body.email, req.body.password);
    const token = signSession(user, config);
    setSessionCookie(res, token, config);
    res.status(201).json({ user });
  }));

  router.post("/auth/login", asyncRoute(async (req, res) => {
    const user = authenticateUser(db, req.body.email, req.body.password);
    const token = signSession(user, config);
    setSessionCookie(res, token, config);
    res.json({ user });
  }));

  router.post("/auth/logout", (req, res) => {
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  router.get("/auth/me", (req, res) => {
    res.json({ user: getSessionUser(req, db, config) });
  });

  router.get("/sites", requireSession, (req, res) => {
    const sites = db.prepare(`
      SELECT *
      FROM sites
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(req.user.id).map((site) => serializeSite(site, config));

    res.json({ sites });
  });

  router.post("/sites", requireSession, asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) {
      throw createHttpError("請輸入網站名稱");
    }

    const now = nowIso();
    const site = {
      id: randomUUID(),
      userId: req.user.id,
      name,
      slug: createUniqueSlug(db, req.body.slug || name),
      createdAt: now,
      updatedAt: now
    };

    db.prepare(`
      INSERT INTO sites (id, user_id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(site.id, site.userId, site.name, site.slug, site.createdAt, site.updatedAt);

    res.status(201).json({
      site: serializeSite(db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id), config)
    });
  }));

  router.get("/sites/:siteId", requireSession, (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    res.json({ site: serializeSite(site, config) });
  });

  router.patch("/sites/:siteId", requireSession, asyncRoute(async (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    const name = String(req.body.name || site.name).trim();
    if (!name) {
      throw createHttpError("請輸入網站名稱");
    }

    const now = nowIso();
    db.prepare("UPDATE sites SET name = ?, updated_at = ? WHERE id = ?").run(name, now, site.id);
    res.json({ site: serializeSite(db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id), config) });
  }));

  router.delete("/sites/:siteId", requireSession, asyncRoute(async (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    db.prepare("DELETE FROM sites WHERE id = ?").run(site.id);
    await fs.promises.rm(path.join(config.uploadRoot, site.id), { recursive: true, force: true });
    res.json({ ok: true });
  }));

  router.post("/sites/:siteId/upload", requireSession, upload.single("file"), asyncRoute(async (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    if (!req.file) {
      throw createHttpError("請選擇 zip 檔案");
    }

    const deploymentId = randomUUID();
    const versionRow = db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM deployments WHERE site_id = ?").get(site.id);
    const rootPath = path.join(config.uploadRoot, site.id, deploymentId);
    const extracted = await extractStaticSiteZip(req.file.buffer, rootPath, config);
    const now = nowIso();

    try {
      db.exec("BEGIN");
      db.prepare(`
        INSERT INTO deployments (id, site_id, version, original_name, root_path, file_count, total_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        deploymentId,
        site.id,
        versionRow.next_version,
        req.file.originalname,
        rootPath,
        extracted.fileCount,
        extracted.totalBytes,
        now
      );
      db.prepare("UPDATE sites SET active_deployment_id = ?, updated_at = ? WHERE id = ?").run(deploymentId, now, site.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      await fs.promises.rm(rootPath, { recursive: true, force: true });
      throw error;
    }

    res.status(201).json({
      deployment: publicDeployment(db.prepare("SELECT * FROM deployments WHERE id = ?").get(deploymentId)),
      site: serializeSite(db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id), config)
    });
  }));

  router.get("/sites/:siteId/deployments", requireSession, (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    const deployments = db.prepare(`
      SELECT *
      FROM deployments
      WHERE site_id = ?
      ORDER BY version DESC
    `).all(site.id).map(publicDeployment);
    res.json({ deployments });
  });

  router.post("/sites/:siteId/deployments/:deploymentId/activate", requireSession, asyncRoute(async (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    const deployment = db.prepare("SELECT * FROM deployments WHERE id = ? AND site_id = ?").get(req.params.deploymentId, site.id);
    if (!deployment) {
      throw createHttpError("找不到部署版本", 404);
    }

    const now = nowIso();
    db.prepare("UPDATE sites SET active_deployment_id = ?, updated_at = ? WHERE id = ?").run(deployment.id, now, site.id);
    res.json({
      site: serializeSite(db.prepare("SELECT * FROM sites WHERE id = ?").get(site.id), config),
      deployment: publicDeployment(deployment)
    });
  }));

  router.get("/sites/:siteId/domains", requireSession, (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    const domains = db.prepare(`
      SELECT *
      FROM domains
      WHERE site_id = ?
      ORDER BY created_at DESC
    `).all(site.id).map(publicDomain);
    res.json({ domains, cnameTarget: config.cnameTarget });
  });

  router.post("/sites/:siteId/domains", requireSession, asyncRoute(async (req, res) => {
    const site = getOwnedSite(db, req.params.siteId, req.user.id);
    const hostname = normalizeHostname(req.body.hostname);
    if (!isValidHostname(hostname)) {
      throw createHttpError("請輸入有效的網域，例如 www.example.com");
    }

    const now = nowIso();
    const domainId = randomUUID();
    try {
      db.prepare(`
        INSERT INTO domains (id, site_id, hostname, status, cname_target, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `).run(domainId, site.id, hostname, config.cnameTarget, now);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        throw createHttpError("此網域已經被使用", 409);
      }
      throw error;
    }

    res.status(201).json({
      domain: publicDomain(db.prepare("SELECT * FROM domains WHERE id = ?").get(domainId)),
      cnameTarget: config.cnameTarget
    });
  }));

  router.post("/domains/:domainId/verify", requireSession, asyncRoute(async (req, res) => {
    const domain = await verifyDomainRecord(db, req.params.domainId, req.user.id, config, dnsResolver);
    res.json({ domain, cnameTarget: config.cnameTarget });
  }));

  router.delete("/domains/:domainId", requireSession, asyncRoute(async (req, res) => {
    const result = db.prepare(`
      DELETE FROM domains
      WHERE id = ? AND site_id IN (SELECT id FROM sites WHERE user_id = ?)
    `).run(req.params.domainId, req.user.id);

    if (!result.changes) {
      throw createHttpError("找不到網域", 404);
    }
    res.json({ ok: true });
  }));

  return router;
}

export function errorHandler(error, _req, res, _next) {
  if (error?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "上傳檔案超過大小限制" });
    return;
  }

  const status = error.status || 500;
  res.status(status).json({
    error: status >= 500 ? "伺服器發生錯誤" : error.message
  });
}
