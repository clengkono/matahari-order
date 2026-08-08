/**
 * Starts the local image service and Vite for Catalogue Studio.
 * LOCAL ONLY.
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const children = [];

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(
      `[studio] ${label} exited (code=${code ?? "null"}, signal=${signal ?? "null"}). Stopping.`
    );
    shutdown(code && code !== 0 ? code : 0);
  });

  children.push(child);
  return child;
}

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting Matahari Catalogue Studio…");
console.log("Studio URL: http://127.0.0.1:5173/studio");
console.log("Customer app: http://127.0.0.1:5173/");
console.log("Image service: http://127.0.0.1:8787 (bound to localhost only)");
console.log("");

start("node", [join("scripts", "imageService.js")], "image service");
start("npx", ["vite"], "vite");
