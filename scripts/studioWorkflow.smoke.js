/**
 * Stage 5E smoke: publish classification, launcher root, git safety.
 * Uses temp dirs and fake git. Does not push. Does not write the live catalogue.
 */

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyChangedPaths,
  defaultCommitMessage,
  isSafeOwnerPath,
  parseGitStatusPorcelain,
  pathsFromPorcelain,
  summarizeImageChanges,
} from "./publishClassify.js";
import {
  createGitRunner,
  parseLeftRightCount,
  renderPublishSummary,
  runPublish,
} from "./publishMatahari.js";
import {
  checkPrerequisites,
  resolveProjectRoot,
} from "./startMatahariStudio.js";
import {
  explainApiFailure,
  formatReadyBanner,
  looksLikeStudioApi,
  looksLikeStudioFrontend,
} from "./studioHealth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, condition, detail = "") {
  record(name, Boolean(condition), condition ? "" : detail);
  if (!condition) {
    throw new Error(`Assertion failed: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function fakeGit({
  porcelain = "",
  behind = 0,
  ahead = 0,
  pushCode = 0,
} = {}) {
  const calls = [];
  return {
    calls,
    run(args) {
      calls.push(args.slice());
      const head = args[0];
      if (head === "rev-parse" && args.includes("--is-inside-work-tree")) {
        return { code: 0, stdout: "true\n", stderr: "" };
      }
      if (head === "rev-parse" && args.includes("@{upstream}")) {
        return {
          code: 0,
          stdout: "origin/feature/product-bottom-sheet\n",
          stderr: "",
        };
      }
      if (head === "rev-parse" && args.includes("HEAD")) {
        return {
          code: 0,
          stdout: "feature/product-bottom-sheet\n",
          stderr: "",
        };
      }
      if (head === "fetch") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (head === "rev-list") {
        return { code: 0, stdout: `${behind}\t${ahead}\n`, stderr: "" };
      }
      if (head === "status") {
        return { code: 0, stdout: porcelain, stderr: "" };
      }
      if (head === "add") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (head === "diff") {
        const names = pathsFromPorcelain(porcelain).join("\n");
        return { code: 0, stdout: names ? `${names}\n` : "", stderr: "" };
      }
      if (head === "commit") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (head === "push") {
        return {
          code: pushCode,
          stdout: "",
          stderr: pushCode ? "simulated push failure" : "",
        };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  };
}

function gitAt(dir, args) {
  return spawnSync(
    "git",
    [
      "-c",
      "user.name=Matahari Smoke",
      "-c",
      "user.email=smoke@localhost",
      ...args,
    ],
    { cwd: dir, encoding: "utf8", windowsHide: true }
  );
}

function called(git, command) {
  return git.calls.some((args) => args[0] === command);
}

const catalogStats = () => ({
  total: 2256,
  completed: 16,
  missing: 2240,
});

const tempDirs = [];

try {
  const projectRoot = resolveProjectRoot();
  const packageJson = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8")
  );
  assert(
    "launcher resolves the project directory from the script location",
    projectRoot === ROOT && packageJson.name === "matahari-order"
  );
  assert(
    "launcher does not require a hard-coded user path",
    !String(resolveProjectRoot.toString()).includes("C:\\Users\\")
  );

  const missingDepsRoot = mkdtempSync(join(tmpdir(), "matahari-prereq-"));
  tempDirs.push(missingDepsRoot);
  writeFileSync(
    join(missingDepsRoot, "package.json"),
    JSON.stringify({ name: "fixture" }),
    "utf8"
  );
  const prereqIssues = checkPrerequisites(missingDepsRoot);
  assert(
    "prerequisites warn when node_modules is missing",
    prereqIssues.some((issue) => issue.includes("npm install"))
  );

  const spaceRoot = mkdtempSync(join(tmpdir(), "Matahari Order "));
  tempDirs.push(spaceRoot);
  writeFileSync(
    join(spaceRoot, "package.json"),
    JSON.stringify({ name: "fixture" }),
    "utf8"
  );
  assert(
    "prerequisite check accepts a project path with spaces",
    checkPrerequisites(spaceRoot).some((issue) => issue.includes("npm install"))
  );

  assert(
    "safe owner image path",
    isSafeOwnerPath("public/product-images/cards/prod-aqua-botol-600ml.webp")
  );
  assert(
    "canonical originals are safe owner data",
    isSafeOwnerPath("public/product-images/originals/prod-aqua-botol-600ml-original.png")
  );
  assert(
    "safe owner path with spaces",
    isSafeOwnerPath("public/product-images/cards/prod aqua botol.webp")
  );
  assert(
    "products.json is a safe owner path",
    isSafeOwnerPath("src/catalog/products.json")
  );
  assert(
    "customer catalog is a safe owner path",
    isSafeOwnerPath("src/catalog/generated/customerCatalog.json")
  );
  assert(
    "productFamilies.json is a safe owner path",
    isSafeOwnerPath("src/catalog/productFamilies.json")
  );
  assert(
    "trash images are not safe to publish",
    isSafeOwnerPath("public/product-images/.trash/cards/x.webp") === false
  );
  assert(
    "component source is developer/code",
    isSafeOwnerPath("src/components/CatalogueStudio.jsx") === false
  );
  assert(
    "scripts are developer/code",
    isSafeOwnerPath("scripts/imageService.js") === false
  );
  assert(
    "package.json is developer/code",
    isSafeOwnerPath("package.json") === false
  );

  const mixed = classifyChangedPaths([
    "public/product-images/cards/prod-aqua-botol-600ml.webp",
    "src/components/CatalogueStudio.jsx",
  ]);
  assert("mixed image + component is flagged", mixed.mixed && mixed.hasDeveloper);

  const quoted = parseGitStatusPorcelain(
    '?? "public/product-images/cards/prod aqua.webp"\n'
  );
  assert(
    "porcelain quoted path with spaces is parsed",
    quoted[0]?.path === "public/product-images/cards/prod aqua.webp"
  );

  const twelve = Array.from({ length: 12 }, (_, index) => ({
    path: `public/product-images/cards/x/prod-item-${index}.webp`,
  }));
  const summary12 = summarizeImageChanges(twelve.map((item) => item.path));
  assert(
    "image-count summary uses unique product ids",
    summary12.imageFileCount === 12 && summary12.assignmentCount === 12
  );
  assert(
    "commit message for 12 assignments",
    defaultCommitMessage(summary12) === "Add 12 product images"
  );
  assert(
    "commit message for catalogue-only",
    defaultCommitMessage(
      summarizeImageChanges(["src/catalog/products.json"])
    ) === "Update catalogue"
  );

  const banner = formatReadyBanner();
  assert(
    "health banner lists frontend and catalogue service",
    banner.includes("✓ Customer/Studio frontend ready") &&
      banner.includes("✓ Catalogue service ready")
  );
  assert(
    "studio API fingerprint accepts service field",
    looksLikeStudioApi(200, {
      ok: true,
      service: "matahari-studio",
      warning: "LOCAL ONLY",
    })
  );
  assert(
    "studio frontend fingerprint accepts index.html",
    looksLikeStudioFrontend(
      200,
      '<div id="root"></div><title>matahari-order</title>'
    )
  );
  const apiFail = explainApiFailure({ apiProbe: { error: "connection-refused" } });
  assert(
    "API failure text is friendly",
    apiFail.includes("Likely causes") && !apiFail.includes("ECONNREFUSED")
  );

  const counts = parseLeftRightCount("3\t1\n");
  assert("left-right count parses behind/ahead", counts.behind === 3 && counts.ahead === 1);

  const summaryText = renderPublishSummary({
    summary: summary12,
    catalogStats: catalogStats(),
    checks: FAST_CHECK_NAMES(),
    files: twelve.map((item) => item.path),
    branch: "feature/product-bottom-sheet",
    commitMessage: "Add 12 product images",
  });
  assert(
    "publish summary is owner-readable",
    summaryText.includes("New/changed product images: 12 files") &&
      summaryText.includes("Completed images: 16")
  );

  const noChangeRoot = mkdtempSync(join(tmpdir(), "matahari-publish-none-"));
  tempDirs.push(noChangeRoot);
  const noChange = await runPublish({
    root: noChangeRoot,
    git: fakeGit({ porcelain: "" }),
    skipValidate: true,
    skipFetch: true,
    yes: true,
    catalogStats,
    log() {},
    error() {},
    prompt: async () => "n",
  });
  assert("no-change publish exits normally", noChange.reason === "no-changes" && noChange.ok);

  const behindGit = fakeGit({
    porcelain: "?? public/product-images/cards/x/prod-a.webp\n",
    behind: 2,
  });
  const behind = await runPublish({
    root: noChangeRoot,
    git: behindGit,
    skipValidate: true,
    skipFetch: true,
    yes: true,
    catalogStats,
    log() {},
    error() {},
  });
  assert("branch-behind aborts before staging", behind.reason === "behind" && !behind.ok);
  assert("branch-behind does not commit", called(behindGit, "commit") === false);

  const codeGit = fakeGit({
    porcelain: " M src/components/CatalogueStudio.jsx\n",
  });
  const codeStop = await runPublish({
    root: noChangeRoot,
    git: codeGit,
    skipValidate: true,
    skipFetch: true,
    yes: true,
    catalogStats,
    log() {},
    error() {},
  });
  assert("developer files abort owner publish", codeStop.reason === "developer-files");
  assert("developer files are not committed", called(codeGit, "commit") === false);

  const validateGit = fakeGit({
    porcelain: "?? public/product-images/cards/x/prod-a.webp\n",
  });
  const validateFail = await runPublish({
    root: noChangeRoot,
    git: validateGit,
    skipFetch: true,
    yes: true,
    catalogStats,
    log() {},
    error() {},
    validate: async () => ({
      ok: false,
      failed: { name: "Lint", script: "lint" },
      results: [{ name: "Lint", ok: false }],
    }),
  });
  assert("validation failure aborts", validateFail.reason === "validate");
  assert("validation failure does not stage", called(validateGit, "add") === false);
  assert("validation failure does not commit", called(validateGit, "commit") === false);

  const cancelGit = fakeGit({
    porcelain: "?? public/product-images/cards/x/prod-a.webp\n",
  });
  const cancelled = await runPublish({
    root: noChangeRoot,
    git: cancelGit,
    skipValidate: true,
    skipFetch: true,
    catalogStats,
    log() {},
    error() {},
    prompt: async () => "n",
  });
  assert("saying No leaves files unstaged", cancelled.reason === "cancelled");
  assert("saying No does not git add", called(cancelGit, "add") === false);

  const pushFailGit = fakeGit({
    porcelain: "?? public/product-images/cards/x/prod-a.webp\n",
    pushCode: 1,
  });
  const pushFail = await runPublish({
    root: noChangeRoot,
    git: pushFailGit,
    skipValidate: true,
    skipFetch: true,
    yes: true,
    catalogStats,
    log() {},
    error() {},
  });
  assert("simulated push failure keeps the local commit", pushFail.reason === "push-fail" && pushFail.committed);
  assert("simulated push failure did commit", called(pushFailGit, "commit"));
  assert("git add . is never used", pushFailGit.calls.every((args) => args.join(" ") !== "add ."));

  const repo = mkdtempSync(join(tmpdir(), "matahari-git-space-"));
  tempDirs.push(repo);
  assert("temp git init", gitAt(repo, ["init", "-b", "main"]).status === 0);
  writeFileSync(join(repo, "README.md"), "seed\n");
  gitAt(repo, ["add", "README.md"]);
  assert("temp git seed commit", gitAt(repo, ["commit", "-m", "seed"]).status === 0);
  gitAt(repo, ["checkout", "-b", "owner"]);
  gitAt(repo, ["checkout", "main"]);
  writeFileSync(join(repo, "README.md"), "seed\nmain ahead\n");
  gitAt(repo, ["commit", "-am", "main ahead"]);
  gitAt(repo, ["checkout", "owner"]);
  gitAt(repo, ["branch", "--set-upstream-to=main"]);
  mkdirSync(join(repo, "public", "product-images", "cards", "x"), { recursive: true });
  writeFileSync(
    join(repo, "public", "product-images", "cards", "x", "prod space.webp"),
    "fake"
  );

  const realGit = createGitRunner(repo);
  const behindReal = await runPublish({
    root: repo,
    git: realGit,
    skipValidate: true,
    skipFetch: true,
    yes: true,
    catalogStats,
    log() {},
    error() {},
  });
  assert(
    "real temp repo behind-remote aborts",
    behindReal.reason === "behind"
  );
  const statusAfterBehind = gitAt(repo, ["status", "--porcelain=v1", "-uall"]);
  const cachedAfterBehind = gitAt(repo, ["diff", "--cached", "--name-only"]);
  assert(
    "behind abort does not stage the space-path image",
    String(statusAfterBehind.stdout).includes("prod space.webp") &&
      !String(cachedAfterBehind.stdout).trim()
  );

  const liveProducts = JSON.parse(
    readFileSync(join(ROOT, "src", "catalog", "products.json"), "utf8")
  );
  assert(
    "smoke did not shrink the live catalogue",
    Array.isArray(liveProducts) && liveProducts.length === 2256
  );
} catch (error) {
  console.error(error);
  record("smoke crashed", false, error.message);
} finally {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function FAST_CHECK_NAMES() {
  return [
    { name: "Catalogue", ok: true },
    { name: "Images", ok: true },
    { name: "Customer build", ok: true },
    { name: "Build", ok: true },
    { name: "Lint", ok: true },
  ];
}

const failed = results.filter((item) => !item.passed).length;
console.log("");
console.log(
  `Studio workflow smoke: ${results.filter((item) => item.passed).length}/${results.length} passed`
);
if (failed > 0) {
  process.exitCode = 1;
}
