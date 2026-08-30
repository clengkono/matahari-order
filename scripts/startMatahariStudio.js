/**
 * One-click Matahari Studio start: health, double-start protection, browser open.
 * LOCAL ONLY. Does not bind extra interfaces or install packages.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_PORT,
  explainApiFailure,
  explainForeignPort,
  explainFrontendFailure,
  explainStaleApi,
  formatReadyBanner,
  FRONTEND_PORT,
  inspectStudioPorts,
  STUDIO_URL,
} from "./studioHealth.js";

export function resolveProjectRoot(fromFileUrl = import.meta.url) {
  return join(dirname(fileURLToPath(fromFileUrl)), "..");
}

export function checkPrerequisites(root) {
  const issues = [];
  const packageJson = join(root, "package.json");
  const nodeModules = join(root, "node_modules");
  const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");

  if (!existsSync(packageJson)) {
    issues.push(
      "Could not find the Matahari project (package.json missing). Keep the launcher in the project folder."
    );
    return issues;
  }

  const major = Number.parseInt(process.versions.node, 10);
  if (!Number.isFinite(major) || major < 18) {
    issues.push(
      `Node.js 18 or newer is required (found ${process.version}). Install Node from https://nodejs.org then try again.`
    );
  }

  if (!existsSync(nodeModules)) {
    issues.push(
      "Project libraries are not installed yet. Open a terminal in this folder and run: npm install"
    );
  } else if (!existsSync(viteBin)) {
    issues.push(
      "Vite is missing. Open a terminal in this folder and run: npm install"
    );
  }

  return issues;
}

export function openStudioInBrowser(url = STUDIO_URL) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function waitForEnter(message) {
  if (!process.stdin.isTTY) {
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise((resolve) => {
    rl.question(message, () => resolve());
  });
  rl.close();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntilStudioReady({
  timeoutMs = 60000,
  intervalMs = 400,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await inspectStudioPorts();
    if (last.api === "matahari" && last.frontend === "matahari") {
      return last;
    }
    if (
      last.api === "foreign" ||
      last.frontend === "foreign" ||
      last.api === "stale"
    ) {
      return last;
    }
    await sleep(intervalMs);
  }

  return last ?? (await inspectStudioPorts());
}

function lockPathFor(root) {
  return join(root, "tmp", "matahari-studio.lock");
}

function processExists(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStartLock(root) {
  const lockPath = lockPathFor(root);
  if (!existsSync(lockPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function writeStartLock(root) {
  const dir = join(root, "tmp");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    lockPathFor(root),
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    "utf8"
  );
}

function clearStartLock(root) {
  try {
    unlinkSync(lockPathFor(root));
  } catch {
    // Ignore missing lock.
  }
}

function spawnNodeScript(root, relativeScript, children) {
  const child = spawn(process.execPath, [join(root, relativeScript)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    windowsHide: false,
  });
  children.push(child);
  return child;
}

function spawnVite(root, children) {
  const viteJs = join(root, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteJs], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    windowsHide: false,
  });
  children.push(child);
  return child;
}

function shutdownChildren(children) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

export async function startMatahariStudio(options = {}) {
  const root = options.root ?? resolveProjectRoot();
  const pauseOnIdle = options.pauseOnIdle ?? Boolean(process.stdin.isTTY);
  const children = [];
  let shuttingDown = false;

  const shutdown = (code = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    shutdownChildren(children);
    clearStartLock(root);
    setTimeout(() => {
      process.exit(code);
    }, 200);
  };

  console.log("Matahari Studio");
  console.log(`Project folder: ${root}`);
  console.log("");

  const issues = checkPrerequisites(root);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(issue);
    }
    if (pauseOnIdle) {
      await waitForEnter("Press Enter to close this window.");
    }
    return { ok: false, code: 1, reason: "prerequisites" };
  }

  let initial = await inspectStudioPorts();
  const lock = readStartLock(root);
  const otherLauncherAlive =
    Boolean(lock) && lock.pid !== process.pid && processExists(lock.pid);

  if (
    initial.api !== "matahari" ||
    initial.frontend !== "matahari" ||
    otherLauncherAlive
  ) {
    if (
      otherLauncherAlive ||
      initial.api === "pending" ||
      initial.frontend === "pending" ||
      initial.api === "matahari" ||
      initial.frontend === "matahari"
    ) {
      console.log("Waiting to see if Studio is already starting...");
      initial = await waitUntilStudioReady({ timeoutMs: 12000 });
    }
  }

  if (initial.api === "stale") {
    console.error(explainStaleApi());
    if (pauseOnIdle) {
      await waitForEnter("Press Enter to close this window.");
    }
    return { ok: false, code: 1, reason: "stale-api" };
  }

  if (initial.api === "foreign" || initial.api === "pending") {
    console.error(explainForeignPort(API_PORT, "catalogue service"));
    if (pauseOnIdle) {
      await waitForEnter("Press Enter to close this window.");
    }
    return { ok: false, code: 1, reason: "foreign-api" };
  }

  if (initial.frontend === "foreign" || initial.frontend === "pending") {
    console.error(explainForeignPort(FRONTEND_PORT, "frontend"));
    if (pauseOnIdle) {
      await waitForEnter("Press Enter to close this window.");
    }
    return { ok: false, code: 1, reason: "foreign-frontend" };
  }

  const alreadyRunning =
    initial.api === "matahari" && initial.frontend === "matahari";

  if (alreadyRunning) {
    console.log("Studio is already running.");
    console.log(formatReadyBanner());
    openStudioInBrowser(STUDIO_URL);
    console.log(`Studio URL: ${STUDIO_URL}`);
    console.log("Use the original Studio window and press Ctrl+C there to stop.");
    if (pauseOnIdle) {
      await waitForEnter("Press Enter to close this window.");
    }
    return { ok: true, code: 0, reason: "already-running" };
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  writeStartLock(root);

  if (initial.api === "closed" && initial.frontend === "closed") {
    console.log("Starting catalogue service and frontend...");
    spawnNodeScript(root, join("scripts", "studio.js"), children);
  } else if (initial.api === "closed") {
    console.log("Frontend is already Matahari. Starting catalogue service...");
    spawnNodeScript(root, join("scripts", "imageService.js"), children);
  } else if (initial.frontend === "closed") {
    console.log("Catalogue service is already Matahari. Starting frontend...");
    spawnVite(root, children);
  }

  for (const child of children) {
    child.on("exit", (code, signal) => {
      if (shuttingDown) {
        return;
      }
      if (code && code !== 0) {
        console.error(
          `A Studio process stopped (code=${code}, signal=${signal ?? "null"}).`
        );
        shutdown(code);
        return;
      }
      shutdown(0);
    });
  }

  const ready = await waitUntilStudioReady();

  if (ready.api === "stale") {
    console.error(explainStaleApi());
    shutdown(1);
    return { ok: false, code: 1, reason: "stale-api-after-start" };
  }
  if (ready.api === "foreign") {
    console.error(explainForeignPort(API_PORT, "catalogue service"));
    shutdown(1);
    return { ok: false, code: 1, reason: "foreign-api-after-start" };
  }
  if (ready.frontend === "foreign") {
    console.error(explainForeignPort(FRONTEND_PORT, "frontend"));
    shutdown(1);
    return { ok: false, code: 1, reason: "foreign-frontend-after-start" };
  }

  if (ready.frontend !== "matahari") {
    console.error(explainFrontendFailure(ready));
    shutdown(1);
    return { ok: false, code: 1, reason: "frontend-not-ready" };
  }
  if (ready.api !== "matahari") {
    console.error(explainApiFailure(ready));
    shutdown(1);
    return { ok: false, code: 1, reason: "api-not-ready" };
  }

  console.log("");
  console.log(formatReadyBanner());
  openStudioInBrowser(STUDIO_URL);
  console.log(`Studio URL: ${STUDIO_URL}`);
  console.log("Press Ctrl+C to stop Matahari Studio.");

  await new Promise((resolve) => {
    if (children.length === 0) {
      resolve();
      return;
    }
    for (const child of children) {
      child.on("exit", () => resolve());
    }
  });

  return { ok: true, code: 0, reason: "started" };
}

function isLaunchedDirectly() {
  const entry = process.argv[1] && resolve(process.argv[1]);
  return Boolean(entry) && resolve(fileURLToPath(import.meta.url)) === entry;
}

if (isLaunchedDirectly()) {
  startMatahariStudio().then((result) => {
    if (result && !result.ok) {
      process.exitCode = result.code || 1;
    }
  });
}
