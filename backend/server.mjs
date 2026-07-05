import { createApp } from "./src/app.mjs";
import { loadConfig } from "./src/config.mjs";
import { createDatabase, initializeDatabase } from "./src/database.mjs";

const config = loadConfig();
let db;

try {
  db = await initializeDatabase(config);
} catch (error) {
  console.error("[site-spono] Database initialization failed; starting API in degraded mode", {
    code: error?.code,
    errno: error?.errno,
    sqlState: error?.sqlState,
    message: error?.message
  });
  db = createDatabase(config);
}

const app = createApp({ config, db });

app.listen(config.port, () => {
  console.log(`Site Spono backend listening on http://localhost:${config.port}`);
});
