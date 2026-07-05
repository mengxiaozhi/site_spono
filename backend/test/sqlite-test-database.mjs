import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

function normalizeSql(sql) {
  return String(sql).replace(/`/g, "");
}

class SqliteConnection {
  constructor(db) {
    this.db = db;
  }

  async query(sql, params = []) {
    const statement = normalizeSql(sql).trim();
    if (/^SELECT\b/i.test(statement)) {
      return [this.db.prepare(statement).all(...params)];
    }

    const result = this.db.prepare(statement).run(...params);
    return [{
      affectedRows: result.changes,
      insertId: Number(result.lastInsertRowid || 0)
    }];
  }

  async beginTransaction() {
    this.db.exec("BEGIN");
  }

  async commit() {
    this.db.exec("COMMIT");
  }

  async rollback() {
    this.db.exec("ROLLBACK");
  }

  release() {}
}

export function createSqliteTestDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE sites (
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

    CREATE TABLE deployments (
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

    CREATE TABLE domains (
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

    CREATE INDEX idx_sites_user_id ON sites(user_id);
    CREATE INDEX idx_deployments_site_id ON deployments(site_id);
    CREATE INDEX idx_domains_site_id ON domains(site_id);
    CREATE INDEX idx_domains_hostname ON domains(hostname);
  `);

  return {
    async query(sql, params = []) {
      return new SqliteConnection(db).query(sql, params);
    },
    async getConnection() {
      return new SqliteConnection(db);
    },
    close() {
      db.close();
    }
  };
}
