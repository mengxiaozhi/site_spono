import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import JSZip from "jszip";
import { createApp } from "../src/app.mjs";
import { loadConfig } from "../src/config.mjs";
import { createSqliteTestDatabase } from "./sqlite-test-database.mjs";

async function createZip(entries, options = {}) {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.content, entry.options || {});
  }
  return zip.generateAsync({
    type: "nodebuffer",
    platform: options.platform || "UNIX"
  });
}

async function createHarness(options = {}) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "site-spono-"));
  const config = loadConfig({
    cwd: root,
    uploadRoot: path.join(root, "sites"),
    jwtSecret: "test-secret",
    cnameTarget: "sites.example.com",
    frontendOrigin: "http://localhost:3000",
    maxUploadMb: 2,
    maxUnzippedMb: 4,
    maxZipEntries: 20,
    ...options.config
  });
  const db = options.db || createSqliteTestDatabase(path.join(root, "app.db"));
  const app = createApp({
    config,
    db,
    dnsResolver: options.dnsResolver
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  function client() {
    let cookie = "";

    async function request(route, init = {}) {
      const headers = new Headers(init.headers);
      let body = init.body;
      if (cookie) {
        headers.set("Cookie", cookie);
      }
      if (body && !(body instanceof FormData) && !(body instanceof Blob)) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(body);
      }

      const response = await fetch(`${baseUrl}${route}`, {
        ...init,
        headers,
        body
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        cookie = setCookie.split(";")[0];
      }
      const text = await response.text();
      return {
        response,
        text,
        data: text && response.headers.get("content-type")?.includes("application/json")
          ? JSON.parse(text)
          : null
      };
    }

    return { request };
  }

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close?.();
    await fs.promises.rm(root, { recursive: true, force: true });
  }

  return { baseUrl, client, close, root };
}

function requestWithHost(baseUrl, host, route = "/") {
  const url = new URL(route, baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "GET",
      headers: { Host: host }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({ statusCode: response.statusCode, body });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function registerAndCreateSite(api, name = "Demo Site") {
  const register = await api.request("/api/auth/register", {
    method: "POST",
    body: { email: `${crypto.randomUUID()}@example.com`, password: "password123" }
  });
  assert.equal(register.response.status, 201);

  const created = await api.request("/api/sites", {
    method: "POST",
    body: { name }
  });
  assert.equal(created.response.status, 201);
  return created.data.site;
}

test("auth protects sites across users", async () => {
  const harness = await createHarness();
  try {
    const alice = harness.client();
    const site = await registerAndCreateSite(alice, "Alice Site");

    const bob = harness.client();
    const bobRegister = await bob.request("/api/auth/register", {
      method: "POST",
      body: { email: "bob@example.com", password: "password123" }
    });
    assert.equal(bobRegister.response.status, 201);

    const blocked = await bob.request(`/api/sites/${site.id}`);
    assert.equal(blocked.response.status, 404);
  } finally {
    await harness.close();
  }
});

test("reports database health", async () => {
  const harness = await createHarness();
  try {
    const api = harness.client();
    const health = await api.request("/api/health");
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.data, { ok: true, database: "ok" });
  } finally {
    await harness.close();
  }
});

test("maps database startup drift to a service error", async () => {
  const originalError = console.error;
  console.error = () => {};

  const harness = await createHarness({
    db: {
      async query() {
        const error = new Error("Table 'site_spono.users' doesn't exist");
        error.code = "ER_NO_SUCH_TABLE";
        throw error;
      }
    }
  });

  try {
    const api = harness.client();
    const health = await api.request("/api/health", {
      headers: {
        Origin: "https://site.spono.tw"
      }
    });
    assert.equal(health.response.status, 503);
    assert.equal(health.response.headers.get("access-control-allow-origin"), "https://site.spono.tw");
    assert.equal(health.response.headers.get("access-control-allow-credentials"), "true");
    assert.equal(health.data.error, "資料庫暫時無法使用，請稍後再試");
  } finally {
    console.error = originalError;
    await harness.close();
  }
});

test("normalizes proxied public URLs and frontend origins", async () => {
  const harness = await createHarness({
    config: {
      frontendOrigin: "https://site.spono.tw/",
      corsOrigins: "https://site.spono.tw, https://admin.spono.tw/",
      publicBaseUrl: "https://api.spono.tw/site/"
    }
  });

  try {
    const api = harness.client();
    const site = await registerAndCreateSite(api, "Proxy Site");
    assert.equal(site.previewUrl, "https://api.spono.tw/site/s/proxy-site/");

    const response = await fetch(`${harness.baseUrl}/api/demo/status`, {
      headers: {
        Origin: "https://site.spono.tw"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://site.spono.tw");
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");

    const preflight = await fetch(`${harness.baseUrl}/api/auth/me`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://admin.spono.tw",
        "Access-Control-Request-Method": "GET"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://admin.spono.tw");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  } finally {
    await harness.close();
  }
});

test("uploads a valid static site zip and serves preview assets", async () => {
  const harness = await createHarness();
  try {
    const api = harness.client();
    const site = await registerAndCreateSite(api, "Preview Site");
    const zip = await createZip([
      { name: "index.html", content: "<!doctype html><h1>Hello static site</h1>" },
      { name: "assets/app.css", content: "body{color:green}" }
    ]);
    const form = new FormData();
    form.append("file", new Blob([zip], { type: "application/zip" }), "site.zip");

    const upload = await api.request(`/api/sites/${site.id}/upload`, {
      method: "POST",
      body: form
    });
    assert.equal(upload.response.status, 201);
    assert.equal(upload.data.deployment.version, 1);
    assert.equal(upload.data.deployment.fileCount, 2);

    const html = await fetch(`${harness.baseUrl}/s/${site.slug}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Hello static site/);

    const css = await fetch(`${harness.baseUrl}/s/${site.slug}/assets/app.css`);
    assert.equal(css.status, 200);
    assert.match(await css.text(), /color:green/);
  } finally {
    await harness.close();
  }
});

test("rejects zips without root index and unsafe paths", async () => {
  const harness = await createHarness();
  try {
    const api = harness.client();
    const site = await registerAndCreateSite(api, "Rejected Site");

    const noIndexZip = await createZip([{ name: "nested/index.html", content: "Nested" }]);
    const noIndexForm = new FormData();
    noIndexForm.append("file", new Blob([noIndexZip], { type: "application/zip" }), "missing-index.zip");
    const noIndex = await api.request(`/api/sites/${site.id}/upload`, {
      method: "POST",
      body: noIndexForm
    });
    assert.equal(noIndex.response.status, 400);
    assert.match(noIndex.data.error, /index\.html/);

    const unsafeZip = await createZip([
      { name: "index.html", content: "OK" },
      { name: "../evil.txt", content: "bad" }
    ]);
    const unsafeForm = new FormData();
    unsafeForm.append("file", new Blob([unsafeZip], { type: "application/zip" }), "unsafe.zip");
    const unsafe = await api.request(`/api/sites/${site.id}/upload`, {
      method: "POST",
      body: unsafeForm
    });
    assert.equal(unsafe.response.status, 400);
  } finally {
    await harness.close();
  }
});

test("verifies CNAME and serves the active deployment by Host header", async () => {
  const harness = await createHarness({
    dnsResolver: async (hostname) => {
      assert.equal(hostname, "www.example.com");
      return ["sites.example.com."];
    }
  });

  try {
    const api = harness.client();
    const site = await registerAndCreateSite(api, "Domain Site");
    const zip = await createZip([{ name: "index.html", content: "<h1>Domain works</h1>" }]);
    const form = new FormData();
    form.append("file", new Blob([zip], { type: "application/zip" }), "domain.zip");
    const upload = await api.request(`/api/sites/${site.id}/upload`, { method: "POST", body: form });
    assert.equal(upload.response.status, 201);

    const added = await api.request(`/api/sites/${site.id}/domains`, {
      method: "POST",
      body: { hostname: "www.example.com" }
    });
    assert.equal(added.response.status, 201);

    const verified = await api.request(`/api/domains/${added.data.domain.id}/verify`, { method: "POST" });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.data.domain.status, "verified");

    const customHost = await requestWithHost(harness.baseUrl, "www.example.com");
    assert.equal(customHost.statusCode, 200);
    assert.match(customHost.body, /Domain works/);
  } finally {
    await harness.close();
  }
});

test("demo mode logs in and seeds a published demo site", async () => {
  const harness = await createHarness({
    config: {
      demoMode: true
    }
  });

  try {
    const api = harness.client();
    const status = await api.request("/api/demo/status");
    assert.equal(status.response.status, 200);
    assert.equal(status.data.enabled, true);

    const login = await api.request("/api/demo/login", { method: "POST" });
    assert.equal(login.response.status, 200);
    assert.equal(login.data.user.email, "demo@site-spono.local");

    const sites = await api.request("/api/sites");
    assert.equal(sites.response.status, 200);
    assert.equal(sites.data.sites.length, 1);
    assert.equal(sites.data.sites[0].slug, "demo-brand-site");
    assert.ok(sites.data.sites[0].activeDeploymentId);

    const html = await fetch(`${harness.baseUrl}/s/demo-brand-site/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Site Spono Demo/);
  } finally {
    await harness.close();
  }
});
