/**
 * Safe owner publish: classify, validate, confirm, commit, push.
 * Never force-pushes. Never stores GitHub credentials.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listStudioImageCatalog } from "./studioImageCatalog.js";
import {
  classifyChangedPaths,
  defaultCommitMessage,
  formatPathList,
  pathsFromPorcelain,
  summarizeImageChanges,
} from "./publishClassify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, "..");

const FAST_CHECKS = Object.freeze([
  { name: "Catalogue", script: "catalog:check" },
  { name: "Customer build", script: "catalog:customer-build" },
  { name: "Images", script: "catalog:studio-images:smoke" },
  { name: "Build", script: "build" },
  { name: "Lint", script: "lint" },
]);

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry"),
    yes: argv.includes("--yes"),
    allowCode: argv.includes("--allow-code"),
    skipValidate: argv.includes("--skip-validate"),
    skipFetch: argv.includes("--skip-fetch"),
  };
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function createGitRunner(root, spawnFn = spawnSync) {
  return {
    run(args, options = {}) {
      const result = spawnFn("git", args, {
        cwd: root,
        encoding: "utf8",
        input: options.input,
        env: { ...process.env, ...options.env },
        windowsHide: true,
      });
      return {
        code: result.status ?? 1,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      };
    },
  };
}

export function parseLeftRightCount(text) {
  const match = String(text || "").trim().match(/^(\d+)\s+(\d+)$/);
  if (!match) {
    return { behind: 0, ahead: 0, ok: false };
  }
  return {
    behind: Number(match[1]),
    ahead: Number(match[2]),
    ok: true,
  };
}

async function defaultPrompt(question) {
  if (!process.stdin.isTTY) {
    return "";
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(question, (value) => resolve(value));
  });
  rl.close();
  return answer;
}

function appendLog(root, line) {
  try {
    const dir = join(root, "tmp", "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "matahari-publish.log"),
      `${new Date().toISOString()} ${line}\n`,
      "utf8"
    );
  } catch {
    // Logging must never break publish.
  }
}

export function renderPublishSummary({
  summary,
  catalogStats,
  checks,
  files,
  branch,
  commitMessage,
}) {
  const lines = [
    "Matahari Publish",
    "----------------",
    `Branch: ${branch}`,
    `New/changed product images: ${formatCount(summary.imageFileCount)} files`,
    `Products with image metadata changed: ${formatCount(summary.assignmentCount)}`,
    `Catalogue products: ${formatCount(catalogStats.total)}`,
    `Completed images: ${formatCount(catalogStats.completed)}`,
    `Missing images: ${formatCount(catalogStats.missing)}`,
    "",
    "Validation:",
  ];

  for (const check of checks) {
    const mark = check.ok ? "✓" : "✗";
    lines.push(`${mark} ${check.name}`);
  }

  lines.push("", "Files to publish:");
  lines.push(formatPathList(files));
  lines.push("", `Commit message: ${commitMessage}`);
  return lines.join("\n");
}

function stagePaths(git, paths) {
  const chunkSize = 40;
  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const result = git.run(["add", "--", ...chunk]);
    if (result.code !== 0) {
      return result;
    }
  }
  return { code: 0, stdout: "", stderr: "" };
}

export async function runNpmChecks({
  root,
  spawnFn = spawnSync,
  checks = FAST_CHECKS,
  log = console.log,
}) {
  const results = [];

  for (const check of checks) {
    log(`Running ${check.name} (${check.script})...`);
    const result = spawnFn("npm", ["run", check.script], {
      cwd: root,
      encoding: "utf8",
      shell: true,
      stdio: "inherit",
      windowsHide: true,
    });
    const ok = (result.status ?? 1) === 0;
    results.push({ name: check.name, script: check.script, ok });
    if (!ok) {
      return { ok: false, failed: check, results };
    }
  }

  return { ok: true, failed: null, results };
}

function readCatalogStats(root) {
  const listed = listStudioImageCatalog({
    catalogDir: join(root, "src", "catalog"),
    publicDir: join(root, "public"),
  });
  return listed.stats;
}

export async function runPublish(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const dryRun = Boolean(options.dryRun);
  const yes = Boolean(options.yes);
  const allowCode = Boolean(options.allowCode);
  const skipValidate = Boolean(options.skipValidate);
  const skipFetch = Boolean(options.skipFetch);
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const prompt = options.prompt ?? defaultPrompt;
  const git = options.git ?? createGitRunner(root);
  const validate =
    options.validate ?? (() => runNpmChecks({ root, log }));
  const catalogStatsFn = options.catalogStats ?? (() => readCatalogStats(root));

  appendLog(root, `publish start dry=${dryRun} yes=${yes}`);

  const inside = git.run(["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    error("This folder is not a Git repository.");
    appendLog(root, "abort not-a-git-repo");
    return { ok: false, code: 1, reason: "not-git" };
  }

  const branchResult = git.run(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchResult.stdout.trim() || "(unknown)";
  if (branchResult.code !== 0 || branch === "HEAD") {
    error("Could not determine the current Git branch. Publish stopped.");
    return { ok: false, code: 1, reason: "no-branch" };
  }

  const upstreamResult = git.run(["rev-parse", "--abbrev-ref", "@{upstream}"]);
  if (upstreamResult.code !== 0) {
    error(
      `Branch "${branch}" has no GitHub upstream. Publish stopped.\nAsk a developer to set the upstream before using Publish Matahari Changes.`
    );
    appendLog(root, "abort no-upstream");
    return { ok: false, code: 1, reason: "no-upstream" };
  }

  if (!skipFetch) {
    const fetchResult = git.run(["fetch"]);
    if (fetchResult.code !== 0) {
      log(
        "Could not refresh GitHub status. Checking the last known remote instead."
      );
    }
  }

  const countResult = git.run([
    "rev-list",
    "--left-right",
    "--count",
    "@{upstream}...HEAD",
  ]);
  const counts = parseLeftRightCount(countResult.stdout);
  if (!counts.ok) {
    error("Could not compare this branch with GitHub. Publish stopped.");
    return { ok: false, code: 1, reason: "rev-count" };
  }

  if (counts.behind > 0) {
    error(
      [
        "GitHub has commits that this computer does not have yet.",
        "Publish stopped so nothing is overwritten.",
        "Sync this branch first (pull/merge), then run Publish Matahari Changes again.",
        "This tool will not rebase, merge, or force-push for you.",
      ].join("\n")
    );
    appendLog(root, `abort behind ${counts.behind}`);
    return { ok: false, code: 1, reason: "behind" };
  }

  const statusResult = git.run(["status", "--porcelain=v1", "-uall"]);
  if (statusResult.code !== 0) {
    error("Could not read git status. Publish stopped.");
    return { ok: false, code: 1, reason: "status" };
  }

  const changedPaths = pathsFromPorcelain(statusResult.stdout);
  const classification = classifyChangedPaths(changedPaths);

  if (classification.empty) {
    if (counts.ahead > 0) {
      log(
        `No new files to commit. ${formatCount(counts.ahead)} local commit(s) are not on GitHub yet.`
      );
      if (dryRun) {
        log("Dry run: would try to push existing local commit(s).");
        return { ok: true, code: 0, reason: "dry-unpushed" };
      }
      const pushAnswer = yes
        ? "Y"
        : await prompt("Push existing local commit(s) to GitHub? [Y/N] ");
      if (!/^y(es)?$/i.test(String(pushAnswer).trim())) {
        log("Push cancelled. Local commits are unchanged.");
        return { ok: true, code: 0, reason: "push-cancelled" };
      }
      const pushResult = git.run(["push"]);
      if (pushResult.code !== 0) {
        error(
          [
            "Your changes are safely committed locally but were not pushed.",
            "Run Publish Matahari Changes again after GitHub login works.",
            pushResult.stderr.trim() || "git push failed.",
          ].join("\n")
        );
        appendLog(root, "push-fail existing");
        return { ok: false, code: 1, reason: "push-fail" };
      }
      log("Pushed existing local commit(s) to GitHub.");
      return { ok: true, code: 0, reason: "pushed-existing" };
    }

    log("No Matahari changes to publish.");
    appendLog(root, "no-changes");
    return { ok: true, code: 0, reason: "no-changes" };
  }

  if (classification.hasDeveloper && !allowCode) {
    error(
      [
        "Publish stopped: source-code or other non-catalogue files changed.",
        "Everyday Publish only sends product images and catalogue data.",
        "This protects you from accidentally publishing unfinished Cursor work.",
        "",
        "Unexpected files:",
        formatPathList(classification.developer),
        "",
        "If you meant to publish owner images only, leave those files unchanged.",
        "A developer can publish code separately.",
      ].join("\n")
    );
    appendLog(root, `abort developer-files ${classification.developer.length}`);
    return { ok: false, code: 2, reason: "developer-files" };
  }

  if (classification.hasDeveloper && allowCode) {
    log("Developer/code files are included because --allow-code was set.");
    log(formatPathList(classification.developer));
    if (!yes) {
      const confirmCode = await prompt('Type PUBLISH CODE to include source-code files: ');
      if (String(confirmCode).trim() !== "PUBLISH CODE") {
        log("Publish cancelled. Nothing was committed.");
        return { ok: true, code: 0, reason: "code-cancelled" };
      }
    }
  }

  const filesToPublish = allowCode
    ? classification.all
    : classification.owner;
  const summary = summarizeImageChanges(filesToPublish);
  let catalogStats;
  try {
    catalogStats = catalogStatsFn();
  } catch (statsError) {
    error(
      `Could not read catalogue image counts: ${statsError.message || statsError}`
    );
    return { ok: false, code: 1, reason: "catalog-stats" };
  }

  let checks;
  if (!skipValidate && !dryRun) {
    const validated = await validate();
    checks = validated.results.map((item) => ({
      name: item.name,
      ok: item.ok,
    }));
    if (!validated.ok) {
      error(
        [
          `Validation failed: ${validated.failed.name} (${validated.failed.script}).`,
          "Nothing was staged, committed, or pushed.",
        ].join("\n")
      );
      appendLog(root, `abort validate ${validated.failed.script}`);
      return { ok: false, code: 1, reason: "validate", failed: validated.failed };
    }
  } else {
    checks = FAST_CHECKS.map((check) => ({
      name: check.name,
      ok: skipValidate || dryRun,
    }));
    if (dryRun) {
      log("Dry run: validation suite not executed.");
    }
  }

  const suggested = defaultCommitMessage(summary);
  let commitMessage = suggested;

  log("");
  log(
    renderPublishSummary({
      summary,
      catalogStats,
      checks,
      files: filesToPublish,
      branch,
      commitMessage,
    })
  );
  log("");

  if (!yes && !dryRun) {
    const typed = await prompt(`Commit message [${suggested}]: `);
    if (String(typed).trim()) {
      commitMessage = String(typed).trim();
    }
  }

  if (dryRun) {
    log("Dry run: no git add, commit, or push.");
    return { ok: true, code: 0, reason: "dry", classification, summary };
  }

  const confirm = yes
    ? "Y"
    : await prompt("Publish these changes to GitHub? [Y/N] ");
  if (!/^y(es)?$/i.test(String(confirm).trim())) {
    log("Publish cancelled. Files were not staged or committed.");
    appendLog(root, "cancelled-no");
    return { ok: true, code: 0, reason: "cancelled" };
  }

  const addResult = stagePaths(git, filesToPublish);
  if (addResult.code !== 0) {
    error(
      [
        "Could not stage files. Nothing was committed.",
        addResult.stderr.trim() || "git add failed.",
      ].join("\n")
    );
    return { ok: false, code: 1, reason: "add" };
  }

  const staged = git.run(["diff", "--cached", "--name-only"]);
  log("Staged files:");
  log(staged.stdout.trim() || "(none)");

  if (!staged.stdout.trim()) {
    log("No Matahari changes to publish.");
    return { ok: true, code: 0, reason: "no-staged" };
  }

  const commitResult = git.run(["commit", "-m", commitMessage]);
  if (commitResult.code !== 0) {
    error(
      [
        "Commit failed. Nothing was pushed.",
        commitResult.stderr.trim() || commitResult.stdout.trim() || "git commit failed.",
      ].join("\n")
    );
    appendLog(root, "commit-fail");
    return { ok: false, code: 1, reason: "commit" };
  }

  log("Committed locally.");
  appendLog(root, `commit ok ${commitMessage}`);

  const pushResult = git.run(["push"]);
  if (pushResult.code !== 0) {
    error(
      [
        "Your changes are safely committed locally but were not pushed.",
        "Run Publish Matahari Changes again after GitHub sign-in works.",
        "This tool does not retry destructively and will not force-push.",
        pushResult.stderr.trim() || "git push failed.",
      ].join("\n")
    );
    appendLog(root, "push-fail after-commit");
    return { ok: false, code: 1, reason: "push-fail", committed: true };
  }

  const finalStatus = git.run(["status", "--short", "--branch"]);
  log("Published to GitHub.");
  log(finalStatus.stdout.trim());
  appendLog(root, "publish ok");
  return { ok: true, code: 0, reason: "published" };
}

function isLaunchedDirectly() {
  const entry = process.argv[1] && resolve(process.argv[1]);
  return Boolean(entry) && resolve(fileURLToPath(import.meta.url)) === entry;
}

if (isLaunchedDirectly()) {
  const flags = parseArgs(process.argv.slice(2));
  runPublish(flags).then((result) => {
    if (result && !result.ok) {
      process.exitCode = result.code || 1;
    }
  });
}
