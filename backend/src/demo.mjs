import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { nowIso, publicUser } from "./database.mjs";

const DEMO_USER_ID = "demo-user";
const DEMO_SITE_ID = "demo-site";
const DEMO_DEPLOYMENT_ID = "demo-deployment-v1";
const DEMO_DOMAIN_ID = "demo-domain";
const DEMO_EMAIL = "demo@site-spono.local";

async function writeDemoFiles(rootPath) {
  await fs.promises.mkdir(path.join(rootPath, "assets"), { recursive: true });
  await fs.promises.writeFile(path.join(rootPath, "index.html"), `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Site Spono Demo</title>
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <main>
      <p class="eyebrow">Site Spono Demo</p>
      <h1>一個可由使用者自行發布的靜態網站</h1>
      <p>這個頁面是 demo mode 自動建立的 active deployment，可透過 preview URL 或已驗證網域路由服務。</p>
      <a href="https://example.com">CNAME Ready</a>
    </main>
  </body>
</html>
`);
  await fs.promises.writeFile(path.join(rootPath, "assets", "style.css"), `:root {
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  background: #101312;
  color: #eef7f2;
}

main {
  width: min(720px, calc(100vw - 40px));
}

.eyebrow {
  color: #5eead4;
  font-weight: 700;
}

h1 {
  font-size: clamp(2rem, 6vw, 4.5rem);
  line-height: 1;
  margin: 0 0 1rem;
}

p {
  color: #b8c4bf;
  font-size: 1.1rem;
  line-height: 1.7;
}

a {
  color: #101312;
  background: #a7f3d0;
  display: inline-flex;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 700;
}
`);
}

export async function ensureDemoData(db, config) {
  const now = nowIso();
  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(DEMO_USER_ID);
  if (!user) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(DEMO_USER_ID, DEMO_EMAIL, bcrypt.hashSync("demo-password", 12), now);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(DEMO_USER_ID);
  }

  if (!db.prepare("SELECT id FROM sites WHERE id = ?").get(DEMO_SITE_ID)) {
    db.prepare(`
      INSERT INTO sites (id, user_id, name, slug, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(DEMO_SITE_ID, DEMO_USER_ID, "Demo 品牌展示站", "demo-brand-site", now, now);
  }

  const rootPath = path.join(config.uploadRoot, DEMO_SITE_ID, DEMO_DEPLOYMENT_ID);
  await writeDemoFiles(rootPath);

  if (!db.prepare("SELECT id FROM deployments WHERE id = ?").get(DEMO_DEPLOYMENT_ID)) {
    db.prepare(`
      INSERT INTO deployments (id, site_id, version, original_name, root_path, file_count, total_bytes, created_at)
      VALUES (?, ?, 1, ?, ?, 2, 3200, ?)
    `).run(DEMO_DEPLOYMENT_ID, DEMO_SITE_ID, "demo-site.zip", rootPath, now);
  }

  db.prepare("UPDATE sites SET active_deployment_id = ?, updated_at = ? WHERE id = ?")
    .run(DEMO_DEPLOYMENT_ID, now, DEMO_SITE_ID);

  if (!db.prepare("SELECT id FROM domains WHERE id = ?").get(DEMO_DOMAIN_ID)) {
    db.prepare(`
      INSERT INTO domains (id, site_id, hostname, status, cname_target, last_checked_at, verified_at, created_at)
      VALUES (?, ?, ?, 'verified', ?, ?, ?, ?)
    `).run(DEMO_DOMAIN_ID, DEMO_SITE_ID, "demo.example.com", config.cnameTarget, now, now, now);
  }

  return publicUser(user);
}
