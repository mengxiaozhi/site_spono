# Site Spono

Next.js frontend and Node.js `.mjs` backend for uploading, publishing, previewing, and CNAME-verifying static websites.

## Requirements

- Node.js 24+
- npm 11+

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend/API: `http://localhost:4000`
- Preview URL pattern: `http://localhost:4000/s/:slug/`

`npm run dev` automatically picks the next available frontend/backend ports when `3000` or `4000` are already occupied. It also enables demo mode by default for local development.

## Core Flow

1. Register or log in with Email and password.
2. Create a site.
3. Upload a `.zip` containing a root-level `index.html`.
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
- Metadata is stored in SQLite at `data/app.db` by default.
- Static uploads are served as files only; uploaded JavaScript is never executed by the backend.
- Real custom-domain TLS should be handled by the deployment layer, such as Nginx, Caddy, Cloudflare, or a platform reverse proxy that forwards the original `Host` header.
