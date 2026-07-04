import { createApp } from "./src/app.mjs";
import { loadConfig } from "./src/config.mjs";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`Site Spono backend listening on http://localhost:${config.port}`);
});
