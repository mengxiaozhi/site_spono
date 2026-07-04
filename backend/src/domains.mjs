import dns from "node:dns/promises";
import { normalizeTarget } from "./config.mjs";
import { nowIso, publicDomain } from "./database.mjs";

export function normalizeHostname(hostname) {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");

  if (normalized.startsWith("www.")) {
    return normalized;
  }
  return normalized;
}

export function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253 || hostname.includes("..")) {
    return false;
  }
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return false;
  }
  return hostname.split(".").every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export async function verifyDomainRecord(db, domainId, userId, config, resolver = dns.resolveCname) {
  const row = db.prepare(`
    SELECT domains.*
    FROM domains
    INNER JOIN sites ON sites.id = domains.site_id
    WHERE domains.id = ? AND sites.user_id = ?
  `).get(domainId, userId);

  if (!row) {
    const error = new Error("找不到網域");
    error.status = 404;
    throw error;
  }

  const checkedAt = nowIso();
  try {
    const records = await resolver(row.hostname);
    const normalizedRecords = records.map(normalizeTarget);
    const expected = normalizeTarget(config.cnameTarget);

    if (!normalizedRecords.includes(expected)) {
      const errorMessage = `目前 CNAME 為 ${records.join(", ") || "空"}，尚未指向 ${expected}`;
      db.prepare(`
        UPDATE domains
        SET status = 'failed', last_checked_at = ?, last_error = ?
        WHERE id = ?
      `).run(checkedAt, errorMessage, row.id);
      return publicDomain(db.prepare("SELECT * FROM domains WHERE id = ?").get(row.id));
    }

    db.prepare(`
      UPDATE domains
      SET status = 'verified', last_checked_at = ?, last_error = NULL, verified_at = ?
      WHERE id = ?
    `).run(checkedAt, checkedAt, row.id);
    return publicDomain(db.prepare("SELECT * FROM domains WHERE id = ?").get(row.id));
  } catch (error) {
    const message = error.code === "ENODATA" || error.code === "ENOTFOUND"
      ? `找不到 ${row.hostname} 的 CNAME 紀錄`
      : error.message;

    db.prepare(`
      UPDATE domains
      SET status = 'failed', last_checked_at = ?, last_error = ?
      WHERE id = ?
    `).run(checkedAt, message, row.id);
    return publicDomain(db.prepare("SELECT * FROM domains WHERE id = ?").get(row.id));
  }
}
