/**
 * One-time Windows desktop shortcuts for Studio and Publish.
 * Not run during npm install.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsDesktopPath() {
  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Environment]::GetFolderPath('Desktop')",
    ],
    { encoding: "utf8", windowsHide: true }
  );
  return output.trim();
}

function createShortcut(desktop, name, target) {
  const destination = join(desktop, `${name}.lnk`);
  const script = [
    `$ws = New-Object -ComObject WScript.Shell`,
    `$lnk = $ws.CreateShortcut((Join-Path ${psQuote(desktop)} ${psQuote(`${name}.lnk`)}))`,
    `$lnk.TargetPath = ${psQuote(target)}`,
    `$lnk.WorkingDirectory = ${psQuote(ROOT)}`,
    `$lnk.WindowStyle = 1`,
    `$lnk.Description = ${psQuote(name)}`,
    `$lnk.Save()`,
  ].join("; ");

  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true }
  );

  return destination;
}

export function createMatahariDesktopShortcuts(root = ROOT) {
  if (process.platform !== "win32") {
    return { ok: false, reason: "not-windows" };
  }

  const studio = join(root, "Start Matahari Studio.cmd");
  const publish = join(root, "Publish Matahari Changes.cmd");
  if (!existsSync(studio) || !existsSync(publish)) {
    return { ok: false, reason: "missing-launchers" };
  }

  const desktop = windowsDesktopPath();
  if (!desktop) {
    return { ok: false, reason: "no-desktop" };
  }

  const created = [
    createShortcut(desktop, "Matahari Studio", studio),
    createShortcut(desktop, "Publish Matahari Changes", publish),
  ];

  return { ok: true, desktop, created };
}

function isLaunchedDirectly() {
  const entry = process.argv[1] && resolve(process.argv[1]);
  return Boolean(entry) && resolve(fileURLToPath(import.meta.url)) === entry;
}

if (isLaunchedDirectly()) {
  const result = createMatahariDesktopShortcuts();
  if (!result.ok) {
    if (result.reason === "not-windows") {
      console.error("Desktop shortcuts are only created on Windows.");
    } else if (result.reason === "missing-launchers") {
      console.error("Could not find the Start / Publish launcher files.");
    } else {
      console.error("Could not find your Desktop folder.");
    }
    process.exitCode = 1;
  } else {
    console.log(`Desktop: ${result.desktop}`);
    for (const file of result.created) {
      console.log(`Created ${file}`);
    }
    console.log("You can double-click those shortcuts from now on.");
  }
}
