import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dns from "node:dns/promises";
import { loadConfig } from "./config.mjs";
import { createDatabase } from "./database.mjs";
import { createApiRouter, errorHandler } from "./routes.mjs";
import { createDomainMiddleware, createPreviewMiddleware } from "./static-sites.mjs";

export function createApp({ config = loadConfig(), db = createDatabase(config), dnsResolver = dns.resolveCname } = {}) {
  const app = express();
  const corsOrigins = new Set(config.corsOrigins || [config.frontendOrigin]);

  app.set("trust proxy", true);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api", createApiRouter({ db, config, dnsResolver }));
  app.use("/s/:slug", createPreviewMiddleware(db));
  app.use(createDomainMiddleware(db));

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "找不到 API" });
      return;
    }
    res.status(404).send("Not found");
  });

  app.use(errorHandler);

  return app;
}
