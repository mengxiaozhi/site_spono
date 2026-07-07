import mysql from "mysql2/promise";

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}

export function createDatabase(config) {
  return mysql.createPool({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
    connectionLimit: config.dbPool,
    waitForConnections: true,
    queueLimit: 0,
    namedPlaceholders: false,
    charset: "utf8mb4_unicode_ci"
  });
}

async function ensureDatabaseExists(config) {
  const bootstrap = mysql.createPool({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    connectionLimit: 1,
    waitForConnections: true,
    queueLimit: 0,
    namedPlaceholders: false,
    charset: "utf8mb4_unicode_ci"
  });

  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(config.dbName)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrap.end();
  }
}

export async function ensureDatabaseSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sites (
      id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(180) NOT NULL,
      active_deployment_id CHAR(36) DEFAULT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_sites_slug (slug),
      KEY idx_sites_user_id (user_id),
      KEY idx_sites_updated_at (updated_at),
      CONSTRAINT fk_sites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS deployments (
      id CHAR(36) NOT NULL,
      site_id CHAR(36) NOT NULL,
      version INT UNSIGNED NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      root_path VARCHAR(1024) NOT NULL,
      file_count INT UNSIGNED NOT NULL,
      total_bytes BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_deployments_site_version (site_id, version),
      KEY idx_deployments_site_id (site_id),
      KEY idx_deployments_created_at (created_at),
      CONSTRAINT fk_deployments_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS domains (
      id CHAR(36) NOT NULL,
      site_id CHAR(36) NOT NULL,
      hostname VARCHAR(253) NOT NULL,
      status ENUM('pending', 'verified', 'failed') NOT NULL DEFAULT 'pending',
      cname_target VARCHAR(253) NOT NULL,
      last_checked_at DATETIME DEFAULT NULL,
      last_error VARCHAR(512) DEFAULT NULL,
      verified_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_domains_hostname (hostname),
      KEY idx_domains_site_id (site_id),
      KEY idx_domains_status (status),
      CONSTRAINT fk_domains_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      requested_site_id CHAR(36) DEFAULT NULL,
      status ENUM('queued', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'queued',
      error_message VARCHAR(512) DEFAULT NULL,
      result_site_id CHAR(36) DEFAULT NULL,
      result_deployment_id CHAR(36) DEFAULT NULL,
      generated_site_name VARCHAR(160) DEFAULT NULL,
      generated_summary VARCHAR(500) DEFAULT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_generation_jobs_user_id (user_id),
      KEY idx_generation_jobs_status (status),
      KEY idx_generation_jobs_created_at (created_at),
      CONSTRAINT fk_generation_jobs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function initializeDatabase(config) {
  const db = createDatabase(config);
  try {
    await ensureDatabaseSchema(db);
    return db;
  } catch (error) {
    await db.end();
    if (error?.code !== "ER_BAD_DB_ERROR") {
      throw error;
    }
  }

  await ensureDatabaseExists(config);
  const initializedDb = createDatabase(config);
  try {
    await ensureDatabaseSchema(initializedDb);
    return initializedDb;
  } catch (error) {
    await initializedDb.end();
    throw error;
  }
}

export async function queryRows(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

export async function queryOne(db, sql, params = []) {
  const rows = await queryRows(db, sql, params);
  return rows[0] || null;
}

export async function executeResult(db, sql, params = []) {
  const [result] = await db.query(sql, params);
  return result;
}

export async function withTransaction(db, handler) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function isDuplicateEntry(error) {
  return error?.code === "ER_DUP_ENTRY" || String(error?.message || "").includes("UNIQUE");
}

export function isDatabaseOperationalError(error) {
  return [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ER_ACCESS_DENIED_ERROR",
    "ER_BAD_DB_ERROR",
    "ER_CANT_CREATE_DB",
    "ER_CANT_CREATE_TABLE",
    "ER_DBACCESS_DENIED_ERROR",
    "ER_NO_SUCH_TABLE",
    "ER_SPECIFIC_ACCESS_DENIED_ERROR",
    "ER_TABLEACCESS_DENIED_ERROR",
    "ETIMEDOUT",
    "PROTOCOL_CONNECTION_LOST"
  ].includes(error?.code);
}

function publicDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return `${value.replace(" ", "T").replace(/\.\d+$/, "")}Z`;
  }
  return value;
}

export function publicUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    createdAt: publicDate(row.created_at)
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
    createdAt: publicDate(row.created_at),
    updatedAt: publicDate(row.updated_at)
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
    createdAt: publicDate(row.created_at)
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
    lastCheckedAt: publicDate(row.last_checked_at),
    lastError: row.last_error,
    verifiedAt: publicDate(row.verified_at),
    createdAt: publicDate(row.created_at)
  };
}
