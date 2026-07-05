import express from "express";
import cookieParser from "cookie-parser";
import dns from "node:dns/promises";
import { loadConfig } from "./config.mjs";
import { createCorsMiddleware } from "./cors.mjs";
import { createDatabase } from "./database.mjs";
import { createApiRouter, errorHandler } from "./routes.mjs";
import { createDomainMiddleware, createPreviewMiddleware } from "./static-sites.mjs";

function routePrefixes(config) {
  return [...new Set(["", config.publicPathPrefix].filter((prefix) => prefix !== undefined && prefix !== null))];
}

function withPrefix(prefix, routePath) {
  return `${prefix || ""}${routePath}`;
}

function pathStartsWithBase(requestPath, basePath) {
  return requestPath === basePath || requestPath.startsWith(`${basePath}/`);
}

export function createApp({ config = loadConfig(), db = createDatabase(config), dnsResolver = dns.resolveCname, siteGenerator } = {}) {
  const app = express();
  const prefixes = routePrefixes(config);
  const apiBasePaths = prefixes.map((prefix) => withPrefix(prefix, "/api"));
  const previewBasePaths = prefixes.map((prefix) => withPrefix(prefix, "/s"));

  app.set("trust proxy", true);
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  const apiRouter = createApiRouter({ db, config, dnsResolver, siteGenerator });
  const previewMiddleware = createPreviewMiddleware(db);
  for (const prefix of prefixes) {
    app.use(withPrefix(prefix, "/api"), apiRouter);
    app.use(withPrefix(prefix, "/s/:slug"), previewMiddleware);
  }
  app.use(createDomainMiddleware(db, { reservedPathBases: [...apiBasePaths, ...previewBasePaths] }));

  app.use((req, res) => {
    if (apiBasePaths.some((apiBasePath) => pathStartsWithBase(req.path, apiBasePath))) {
      res.status(404).json({ error: "找不到 API" });
      return;
    }
    res.status(404).send("Not found");
  });

  app.use(errorHandler);

  return app;
}
