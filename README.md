# Site Spono

Next.js frontend and Node.js `.mjs` backend for uploading, publishing, previewing, and CNAME-verifying static websites.

## Requirements

- Node.js 24+
- npm 11+
- MySQL 8+

## Setup

```bash
npm install
cp .env.example .env
mysql -u root -p < database/init.sql
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend/API: `http://localhost:4000`
- Preview URL pattern: `http://localhost:4000/s/:slug/`

`npm run dev` automatically picks the next available frontend/backend ports when `3000` or `4000` are already occupied. It also enables demo mode by default for local development.

## Production API Proxy

For the `api.spono.tw/site/` reverse proxy, run the backend on `3501` and use the proxied base URL without a trailing slash:

```bash
BACKEND_PORT=3501
FRONTEND_ORIGIN=https://site.spono.tw
CORS_ORIGINS=https://site.spono.tw
PUBLIC_BASE_URL=https://api.spono.tw/site
NEXT_PUBLIC_API_BASE_URL=https://api.spono.tw/site
```

With this setup, frontend requests to `https://api.spono.tw/site/api/...` are proxied to backend routes under `/api/...`, credentialed CORS echoes `https://site.spono.tw`, and preview links use `https://api.spono.tw/site/s/:slug/`.

## Gemini Site Generation

Set `GEMINI_API_KEY` on the backend to enable the dashboard's AI website generator. `GEMINI_MODEL` defaults to `gemini-3.5-flash`.

The generator creates a static deployment from two files: `index.html` and `assets/style.css`. Generated output is rejected when it contains script tags, inline event handlers, `javascript:` URLs, forms, iframes, or external CSS/link resources.

On startup, the backend verifies the configured MySQL database and creates the required tables when they are missing. If the database user cannot create the database or tables, startup fails with a logged MySQL error code. After deployment, verify the backend and database path with:

```bash
curl https://api.spono.tw/site/api/health
```

If the browser reports a CORS failure but this command returns a Cloudflare `502`, the backend process is not reachable. Check the backend startup log for the printed MySQL error code.

## Core Flow

1. Register or log in with Email and password.
2. Generate the first version with Gemini, or create an empty site manually.
3. Upload a `.zip` containing a root-level `index.html` when you already have site files.
4. Preview the active deployment from the backend preview URL.
5. Add a custom domain and point its CNAME to `CNAME_TARGET`.
6. Run verification from the dashboard.

## Demo Mode

Local `npm run dev` starts with `DEMO_MODE=true` unless you override it. The login screen shows `進入 Demo 模式`; clicking it creates a demo account, a published demo site, a sample deployment, and a verified sample domain.

To disable it:

```bash
DEMO_MODE=false npm run dev
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
node --check backend/server.mjs
```

## Notes

- Uploaded static files are stored under `storage/sites`.
- Metadata is stored in MySQL. Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_POOL` in `.env`.
- Static uploads are served as files only; uploaded JavaScript is never executed by the backend.
- Real custom-domain TLS should be handled by the deployment layer, such as Nginx, Caddy, Cloudflare, or a platform reverse proxy that forwards the original `Host` header.
