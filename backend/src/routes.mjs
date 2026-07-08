import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authenticateUser, clearSessionCookie, createUser, getSessionUser, requireAuth, setSessionCookie, signSession } from "./auth.mjs";
import { executeResult, isDatabaseOperationalError, isDuplicateEntry, nowIso, publicDeployment, publicDomain, publicSite, queryOne, queryRows, withTransaction } from "./database.mjs";
import { ensureDemoData } from "./demo.mjs";
import { extractStaticSiteZip } from "./storage.mjs";
import { isValidHostname, normalizeHostname, verifyDomainRecord } from "./domains.mjs";
import { generateSiteWithGemini, isGeminiUnavailableLocationError, writeGeneratedSiteFiles } from "./gemini-site-generator.mjs";

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

async function createUniqueSlug(db, requested) {
  const base = slugify(requested);
  let candidate = base;
  let suffix = 2;
  while (await queryOne(db, "SELECT id FROM sites WHERE slug = ?", [candidate])) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function getOwnedSite(db, siteId, userId) {
  const site = await queryOne(db, "SELECT * FROM sites WHERE id = ? AND user_id = ?", [siteId, userId]);
  if (!site) {
    throw createHttpError("找不到網站", 404);
  }
  return site;
}

function previewUrl(config, slug) {
  return `${config.publicBaseUrl}/s/${slug}/`;
}

function serializeSite(row, config) {
  return {
    ...publicSite(row),
    previewUrl: previewUrl(config, row.slug)
  };
}

function serializeGenerationJob(row) {
  return {
    id: row.id,
    status: row.status,
    error: row.error_message || null,
    requestedSiteId: row.requested_site_id || null,
    resultSiteId: row.result_site_id || null,
    resultDeploymentId: row.result_deployment_id || null,
    generated: {
      siteName: row.generated_site_name || null,
      summary: row.generated_summary || null
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null
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

function normalizeGenerationInput(body, fallbackName = "") {
  const name = String(body.name || fallbackName || "").trim();
  const brief = String(body.brief || body.prompt || "").trim();

  if (!name) {
    throw createHttpError("請輸入網站名稱");
  }
  if (brief.length < 10) {
    throw createHttpError("請描述想生成的網站內容，至少 10 個字");
  }

  return {
    name,
    brief,
    audience: String(body.audience || "").trim(),
    style: String(body.style || "").trim(),
    sections: String(body.sections || "").trim(),
    contact: String(body.contact || "").trim()
  };
}

function generatorErrorMessage(error) {
  return String(error?.message || "Gemini 生成失敗").slice(0, 512);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function getBackendEgressIp() {
  try {
    const response = await fetchWithTimeout("https://api.ipify.org?format=json");
    const data = await readJson(response);
    return {
      ok: response.ok,
      ip: data.ip || null,
      error: response.ok ? null : data.raw || `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      ip: null,
      error: error?.name === "AbortError" ? "egress IP lookup timed out" : error?.message || "egress IP lookup failed"
    };
  }
}

async function probeGeminiAccess(config) {
  const useProxy = Boolean(config.geminiProxyUrl);
  if (useProxy && !config.geminiProxyToken) {
    return {
      ok: false,
      status: 503,
      mode: "proxy",
      regionRestricted: false,
      error: "Gemini proxy token 尚未設定"
    };
  }
  if (!useProxy && !config.geminiApiKey) {
    return {
      ok: false,
      status: 503,
      mode: "direct",
      regionRestricted: false,
      error: "Gemini API key 尚未設定"
    };
  }

  try {
    const response = await fetchWithTimeout(useProxy ? config.geminiProxyUrl : config.geminiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useProxy
          ? { Authorization: `Bearer ${config.geminiProxyToken}` }
          : { "x-goog-api-key": config.geminiApiKey })
      },
      body: JSON.stringify({
        model: config.geminiModel,
        store: false,
        input: "Return OK.",
        generation_config: {
          temperature: 0,
          thinking_level: config.geminiThinkingLevel || "minimal"
        }
      })
    }, 8000);
    const data = await readJson(response);
    const error = typeof data?.error === "string" ? data.error : data?.error?.message || null;

    return {
      ok: response.ok,
      status: response.status,
      mode: useProxy ? "proxy" : "direct",
      regionRestricted: isGeminiUnavailableLocationError(error),
      error
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      mode: useProxy ? "proxy" : "direct",
      regionRestricted: false,
      error: error?.name === "AbortError" ? "Gemini probe timed out" : error?.message || "Gemini probe failed"
    };
  }
}

async function markGenerationJob(db, jobId, status, fields = {}) {
  const now = nowIso();
  await executeResult(db, `
    UPDATE generation_jobs
    SET status = ?,
        error_message = ?,
        result_site_id = ?,
        result_deployment_id = ?,
        generated_site_name = ?,
        generated_summary = ?,
        updated_at = ?,
        completed_at = ?
    WHERE id = ?
  `, [
    status,
    fields.errorMessage ?? null,
    fields.resultSiteId ?? null,
    fields.resultDeploymentId ?? null,
    fields.generatedSiteName ?? null,
    fields.generatedSummary ?? null,
    now,
    status === "succeeded" || status === "failed" ? now : null,
    jobId
  ]);
}

async function processGenerationJob({ db, config, jobId, userId, existingSite, generationInput, siteGenerator }) {
  let rootPath;
  try {
    await markGenerationJob(db, jobId, "running");
    const generatedSite = await siteGenerator({ config, input: generationInput });
    const now = nowIso();
    const site = existingSite || {
      id: randomUUID(),
      userId,
      name: generationInput.name,
      slug: await createUniqueSlug(db, generationInput.name),
      createdAt: now,
      updatedAt: now
    };
    const deploymentId = randomUUID();
    rootPath = path.join(config.uploadRoot, site.id, deploymentId);
    const fileStats = await writeGeneratedSiteFiles(generatedSite, rootPath);

    await withTransaction(db, async (connection) => {
      if (!existingSite) {
        await executeResult(connection, `
          INSERT INTO sites (id, user_id, name, slug, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [site.id, site.userId, site.name, site.slug, site.createdAt, site.updatedAt]);
      }

      const versionRow = await queryOne(
        connection,
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM deployments WHERE site_id = ?",
        [site.id]
      );
      await executeResult(
        connection,
        `
          INSERT INTO deployments (id, site_id, version, original_name, root_path, file_count, total_bytes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          deploymentId,
          site.id,
          versionRow.next_version,
          "gemini-generated-site",
          rootPath,
          fileStats.fileCount,
          fileStats.totalBytes,
          now
        ]
      );
      await executeResult(
        connection,
        "UPDATE sites SET active_deployment_id = ?, updated_at = ? WHERE id = ?",
        [deploymentId, now, site.id]
      );
      await markGenerationJob(connection, jobId, "succeeded", {
        resultSiteId: site.id,
        resultDeploymentId: deploymentId,
        generatedSiteName: generatedSite.siteName,
        generatedSummary: generatedSite.summary
      });
    });
  } catch (error) {
    if (rootPath) {
      await fs.promises.rm(rootPath, { recursive: true, force: true });
    }
    const message = isDuplicateEntry(error)
      ? "網站名稱產生的 slug 已被使用，請換一個名稱"
      : generatorErrorMessage(error);
    try {
      await markGenerationJob(db, jobId, "failed", { errorMessage: message });
    } catch (markError) {
      console.error("[site-spono] Failed to mark generation job", {
        jobId,
        message: markError?.message
      });
    }
    console.error("[site-spono] Generation job failed", {
      jobId,
      message: error?.message
    });
  }
}

export function createApiRouter({ db, config, dnsResolver, siteGenerator = generateSiteWithGemini }) {
  const router = express.Router();
  const upload = createUpload(config);
  const requireSession = requireAuth(db, config);

  router.get("/demo/status", (_req, res) => {
    res.json({ enabled: config.demoMode });
  });

  router.get("/health", asyncRoute(async (_req, res) => {
    await queryOne(db, "SELECT 1 AS ok");
    res.json({
      ok: true,
      database: "ok",
      generator: {
        model: config.geminiModel,
        timeoutMs: config.geminiTimeoutMs
      }
    });
  }));

  router.get("/gemini/diagnostics", requireSession, asyncRoute(async (_req, res) => {
    const [egress, gemini] = await Promise.all([
      getBackendEgressIp(),
      probeGeminiAccess(config)
    ]);

    res.json({
      egress,
      gemini,
      config: {
        mode: config.geminiProxyUrl ? "proxy" : "direct",
        model: config.geminiModel,
        endpointHost: new URL(config.geminiProxyUrl || config.geminiEndpoint).host,
        timeoutMs: config.geminiTimeoutMs
      }
    });
  }));

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
    const user = await createUser(db, req.body.email, req.body.password);
    const token = signSession(user, config);
    setSessionCookie(res, token, config);
    res.status(201).json({ user });
  }));

  router.post("/auth/login", asyncRoute(async (req, res) => {
    const user = await authenticateUser(db, req.body.email, req.body.password);
    const token = signSession(user, config);
    setSessionCookie(res, token, config);
    res.json({ user });
  }));

  router.post("/auth/logout", (req, res) => {
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  router.get("/auth/me", asyncRoute(async (req, res) => {
    res.json({ user: await getSessionUser(req, db, config) });
  }));

  router.get("/sites", requireSession, asyncRoute(async (req, res) => {
    const sites = await queryRows(db, `
      SELECT *
      FROM sites
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `, [req.user.id]);

    res.json({ sites: sites.map((site) => serializeSite(site, config)) });
  }));

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
      slug: await createUniqueSlug(db, req.body.slug || name),
      createdAt: now,
      updatedAt: now
    };

    await executeResult(db, `
      INSERT INTO sites (id, user_id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [site.id, site.userId, site.name, site.slug, site.createdAt, site.updatedAt]);

    res.status(201).json({
      site: serializeSite(await queryOne(db, "SELECT * FROM sites WHERE id = ?", [site.id]), config)
    });
  }));

  router.post("/sites/generate", requireSession, asyncRoute(async (req, res) => {
    const requestedSiteId = String(req.body.siteId || "").trim();
    const existingSite = requestedSiteId ? await getOwnedSite(db, requestedSiteId, req.user.id) : null;
    const generationInput = normalizeGenerationInput(req.body, existingSite?.name);
    const now = nowIso();
    const jobId = randomUUID();

    await executeResult(db, `
      INSERT INTO generation_jobs (id, user_id, requested_site_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'queued', ?, ?)
    `, [jobId, req.user.id, existingSite?.id || null, now, now]);

    processGenerationJob({
      db,
      config,
      jobId,
      userId: req.user.id,
      existingSite,
      generationInput,
      siteGenerator
    });

    res.status(202).json({
      job: serializeGenerationJob(await queryOne(db, "SELECT * FROM generation_jobs WHERE id = ?", [jobId]))
    });
  }));

  router.get("/generation-jobs/:jobId", requireSession, asyncRoute(async (req, res) => {
    const job = await queryOne(db, "SELECT * FROM generation_jobs WHERE id = ? AND user_id = ?", [req.params.jobId, req.user.id]);
    if (!job) {
      throw createHttpError("找不到生成工作", 404);
    }

    const payload = { job: serializeGenerationJob(job) };
    if (job.status === "succeeded" && job.result_site_id && job.result_deployment_id) {
      payload.site = serializeSite(await queryOne(db, "SELECT * FROM sites WHERE id = ?", [job.result_site_id]), config);
      payload.deployment = publicDeployment(await queryOne(db, "SELECT * FROM deployments WHERE id = ?", [job.result_deployment_id]));
      payload.generated = {
        siteName: job.generated_site_name,
        summary: job.generated_summary
      };
    }
    res.json(payload);
  }));

  router.get("/sites/:siteId", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    res.json({ site: serializeSite(site, config) });
  }));

  router.patch("/sites/:siteId", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    const name = String(req.body.name || site.name).trim();
    if (!name) {
      throw createHttpError("請輸入網站名稱");
    }

    const now = nowIso();
    await executeResult(db, "UPDATE sites SET name = ?, updated_at = ? WHERE id = ?", [name, now, site.id]);
    res.json({ site: serializeSite(await queryOne(db, "SELECT * FROM sites WHERE id = ?", [site.id]), config) });
  }));

  router.delete("/sites/:siteId", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    await executeResult(db, "DELETE FROM sites WHERE id = ?", [site.id]);
    await fs.promises.rm(path.join(config.uploadRoot, site.id), { recursive: true, force: true });
    res.json({ ok: true });
  }));

  router.post("/sites/:siteId/upload", requireSession, upload.single("file"), asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    if (!req.file) {
      throw createHttpError("請選擇 zip 檔案");
    }

    const deploymentId = randomUUID();
    const rootPath = path.join(config.uploadRoot, site.id, deploymentId);
    const extracted = await extractStaticSiteZip(req.file.buffer, rootPath, config);
    const now = nowIso();

    try {
      await withTransaction(db, async (connection) => {
        const versionRow = await queryOne(
          connection,
          "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM deployments WHERE site_id = ?",
          [site.id]
        );
        await executeResult(
          connection,
          `
            INSERT INTO deployments (id, site_id, version, original_name, root_path, file_count, total_bytes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            deploymentId,
            site.id,
            versionRow.next_version,
            req.file.originalname,
            rootPath,
            extracted.fileCount,
            extracted.totalBytes,
            now
          ]
        );
        await executeResult(
          connection,
          "UPDATE sites SET active_deployment_id = ?, updated_at = ? WHERE id = ?",
          [deploymentId, now, site.id]
        );
      });
    } catch (error) {
      await fs.promises.rm(rootPath, { recursive: true, force: true });
      throw error;
    }

    res.status(201).json({
      deployment: publicDeployment(await queryOne(db, "SELECT * FROM deployments WHERE id = ?", [deploymentId])),
      site: serializeSite(await queryOne(db, "SELECT * FROM sites WHERE id = ?", [site.id]), config)
    });
  }));

  router.get("/sites/:siteId/deployments", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    const deployments = await queryRows(db, `
      SELECT *
      FROM deployments
      WHERE site_id = ?
      ORDER BY version DESC
    `, [site.id]);
    res.json({ deployments: deployments.map(publicDeployment) });
  }));

  router.post("/sites/:siteId/deployments/:deploymentId/activate", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    const deployment = await queryOne(db, "SELECT * FROM deployments WHERE id = ? AND site_id = ?", [req.params.deploymentId, site.id]);
    if (!deployment) {
      throw createHttpError("找不到部署版本", 404);
    }

    const now = nowIso();
    await executeResult(db, "UPDATE sites SET active_deployment_id = ?, updated_at = ? WHERE id = ?", [deployment.id, now, site.id]);
    res.json({
      site: serializeSite(await queryOne(db, "SELECT * FROM sites WHERE id = ?", [site.id]), config),
      deployment: publicDeployment(deployment)
    });
  }));

  router.get("/sites/:siteId/domains", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    const domains = await queryRows(db, `
      SELECT *
      FROM domains
      WHERE site_id = ?
      ORDER BY created_at DESC
    `, [site.id]);
    res.json({ domains: domains.map(publicDomain), cnameTarget: config.cnameTarget });
  }));

  router.post("/sites/:siteId/domains", requireSession, asyncRoute(async (req, res) => {
    const site = await getOwnedSite(db, req.params.siteId, req.user.id);
    const hostname = normalizeHostname(req.body.hostname);
    if (!isValidHostname(hostname)) {
      throw createHttpError("請輸入有效的網域，例如 www.example.com");
    }

    const now = nowIso();
    const domainId = randomUUID();
    try {
      await executeResult(db, `
        INSERT INTO domains (id, site_id, hostname, status, cname_target, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `, [domainId, site.id, hostname, config.cnameTarget, now]);
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw createHttpError("此網域已經被使用", 409);
      }
      throw error;
    }

    res.status(201).json({
      domain: publicDomain(await queryOne(db, "SELECT * FROM domains WHERE id = ?", [domainId])),
      cnameTarget: config.cnameTarget
    });
  }));

  router.post("/domains/:domainId/verify", requireSession, asyncRoute(async (req, res) => {
    const domain = await verifyDomainRecord(db, req.params.domainId, req.user.id, config, dnsResolver);
    res.json({ domain, cnameTarget: config.cnameTarget });
  }));

  router.delete("/domains/:domainId", requireSession, asyncRoute(async (req, res) => {
    const result = await executeResult(db, `
      DELETE FROM domains
      WHERE id = ? AND site_id IN (SELECT id FROM sites WHERE user_id = ?)
    `, [req.params.domainId, req.user.id]);

    if (!result.affectedRows) {
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

  const status = error.status || (isDatabaseOperationalError(error) ? 503 : 500);
  if (status >= 500 && !error.expose) {
    console.error("[site-spono] API error", {
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      message: error?.message,
      stack: error?.stack
    });
  }

  res.status(status).json({
    error: error.expose || status < 500
      ? error.message
      : status >= 500
      ? (isDatabaseOperationalError(error) ? "資料庫暫時無法使用，請稍後再試" : "伺服器發生錯誤")
      : error.message
  });
}
