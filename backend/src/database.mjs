import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export function createDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      active_deployment_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (active_deployment_id) REFERENCES deployments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      file_count INTEGER NOT NULL,
      total_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      hostname TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      cname_target TEXT NOT NULL,
      last_checked_at TEXT,
      last_error TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_site_id ON deployments(site_id);
    CREATE INDEX IF NOT EXISTS idx_domains_site_id ON domains(site_id);
    CREATE INDEX IF NOT EXISTS idx_domains_hostname ON domains(hostname);
  `);

  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function publicUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at
  };
}

export function publicSite(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    activeDeploymentId: row.active_deployment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function publicDeployment(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    siteId: row.site_id,
    version: row.version,
    originalName: row.original_name,
    fileCount: row.file_count,
    totalBytes: row.total_bytes,
    createdAt: row.created_at
  };
}

export function publicDomain(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    siteId: row.site_id,
    hostname: row.hostname,
    status: row.status,
    cnameTarget: row.cname_target,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    verifiedAt: row.verified_at,
    createdAt: row.created_at
  };
}
