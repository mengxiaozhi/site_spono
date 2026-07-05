import net from "node:net";
import { spawn } from "node:child_process";

const preferredFrontendPort = Number(process.env.FRONTEND_PORT || 3000);
const preferredBackendPort = Number(process.env.BACKEND_PORT || 4000);

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port found from ${startPort} to ${startPort + 49}`);
}

function startProcess(label, command, args, env) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error(`[${label}] ${error.message}`);
  });

  return child;
}

const frontendPort = await findAvailablePort(preferredFrontendPort);
const backendPort = await findAvailablePort(preferredBackendPort);
const frontendOrigin = `http://localhost:${frontendPort}`;
const backendOrigin = `http://localhost:${backendPort}`;
const env = {
  ...process.env,
  BACKEND_PORT: String(backendPort),
  FRONTEND_ORIGIN: frontendOrigin,
  PUBLIC_BASE_URL: backendOrigin,
  NEXT_PUBLIC_API_BASE_URL: backendOrigin,
  DEMO_MODE: process.env.DEMO_MODE ?? "true"
};

console.log(`Site Spono dev mode`);
console.log(`- Frontend: ${frontendOrigin}`);
console.log(`- Backend:  ${backendOrigin}`);
console.log(`- Demo:     ${env.DEMO_MODE === "true" ? "enabled" : "disabled"}`);

const backend = startProcess("backend", "npm", ["run", "dev", "--workspace", "backend"], env);
const frontend = startProcess("frontend", "npm", ["exec", "--workspace", "frontend", "--", "next", "dev", "--port", String(frontendPort)], env);

const children = [backend, frontend];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Dev process exited with ${signal || `code ${code}`}`);
      shutdown(code || 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
