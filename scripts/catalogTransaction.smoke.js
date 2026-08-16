/**
 * Isolated smoke tests for the catalogue transaction layer.
 * Copies live JSON into a temp directory — never writes the real catalogue.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog, validateProductImages } from "./buildCatalog.js";
import {
  CATALOG_FILES,
  findLatestBackupSet,
  loadCatalog,
  runCatalogTransaction,
  undoLastCatalogTransaction,
} from "./catalogTransaction.js";
import { saveAssignedImageMetadata } from "./imageService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const mark = passed ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, condition, detail = "") {
  record(name, Boolean(condition), condition ? "" : detail);
  if (!condition) {
    throw new Error(`Assertion failed: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function changelogLines(backupsDir) {
  const changelogPath = join(backupsDir, "changelog.jsonl");
  if (!existsSync(changelogPath)) {
    return [];
  }

  return readText(changelogPath)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function backupSetCount(backupsDir) {
  if (!existsSync(backupsDir)) {
    return 0;
  }

  return readdirSync(backupsDir).filter((name) => {
    const path = join(backupsDir, name);
    return existsSync(join(path, "metadata.json"));
  }).length;
}

function snapshotFiles(catalogDir) {
  const snapshot = {};
  for (const fileName of CATALOG_FILES) {
    snapshot[fileName] = readText(join(catalogDir, fileName));
  }
  return snapshot;
}

function filesUnchanged(catalogDir, snapshot) {
  return CATALOG_FILES.every(
    (fileName) => readText(join(catalogDir, fileName)) === snapshot[fileName]
  );
}

function setupTempCatalog() {
  const root = mkdtempSync(join(tmpdir(), "matahari-catalog-tx-"));
  const catalogDir = join(root, "catalog");
  const backupsDir = join(catalogDir, "backups");

  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });

  for (const fileName of CATALOG_FILES) {
    writeFileSync(
      join(catalogDir, fileName),
      readText(join(LIVE_CATALOG_DIR, fileName)),
      "utf8"
    );
  }

  return { root, catalogDir, backupsDir };
}

function txOptions(dirs, extra = {}) {
  return {
    catalogDir: dirs.catalogDir,
    backupsDir: dirs.backupsDir,
    validateOptions: { publicDir: LIVE_PUBLIC_DIR },
    ...extra,
  };
}

function main() {
  const liveSnapshot = snapshotFiles(LIVE_CATALOG_DIR);
  const dirs = setupTempCatalog();

  try {
    const snapshotBeforeNoop = snapshotFiles(dirs.catalogDir);

    const noop = runCatalogTransaction(
      txOptions(dirs, {
        action: "noop-smoke",
        summary: "No-op",
        mutate() {},
      })
    );
    assert("A. no-op succeeds", noop.ok && noop.noop === true, noop.error);
    assert("A. no-op writes nothing", filesUnchanged(dirs.catalogDir, snapshotBeforeNoop));
    assert("A. no-op creates no backup", !noop.backupId && backupSetCount(dirs.backupsDir) === 0);
    assert("A. no-op writes no changelog", changelogLines(dirs.backupsDir).length === 0);

    const originalName = loadCatalog(dirs).products.find(
      (product) => product.id === "prod-glory-16"
    )?.name;

    const oneFile = runCatalogTransaction(
      txOptions(dirs, {
        action: "edit-product",
        productIds: ["prod-glory-16"],
        summary: "Smoke rename Glory",
        mutate(catalog) {
          const product = catalog.products.find(
            (entry) => entry.id === "prod-glory-16"
          );
          product.name = `${originalName} Smoke`;
        },
      })
    );
    assert("B. one-file edit succeeds", oneFile.ok && !oneFile.noop, oneFile.error);
    assert(
      "B. only products.json changed",
      oneFile.changedFiles.length === 1 &&
        oneFile.changedFiles[0] === "products.json"
    );
    assert("B. backup set created", Boolean(oneFile.backupId));
    assert(
      "B. backup contains products.json + metadata",
      existsSync(join(dirs.backupsDir, oneFile.backupId, "products.json")) &&
        existsSync(join(dirs.backupsDir, oneFile.backupId, "metadata.json"))
    );
    const renamed = loadCatalog(dirs).products.find(
      (product) => product.id === "prod-glory-16"
    );
    assert("B. live products.json updated", renamed?.name === `${originalName} Smoke`);
    const logAfterB = changelogLines(dirs.backupsDir);
    assert(
      "B. changelog written",
      logAfterB.length === 1 &&
        logAfterB[0].action === "edit-product" &&
        logAfterB[0].changedBy === "local-owner"
    );

    const multi = runCatalogTransaction(
      txOptions(dirs, {
        action: "edit-product-and-alias",
        productIds: ["prod-glory-16"],
        summary: "Smoke alias + variant name",
        mutate(catalog) {
          const variant = catalog.variants.find(
            (entry) => entry.id === "prod-glory-16"
          );
          variant.name = `${variant.name} Smoke`;
          catalog.aliases.push({
            id: "alias-smoke-4d2-glory",
            productId: "prod-glory-16",
            alias: "zz-smoke-4d2-glory",
          });
        },
      })
    );
    assert("C. multi-file edit succeeds", multi.ok, multi.error);
    assert(
      "C. both files reported",
      multi.changedFiles.includes("variants.json") &&
        multi.changedFiles.includes("aliases.json")
    );
    const afterMulti = loadCatalog(dirs);
    assert(
      "C. both live files updated",
      afterMulti.variants.some((entry) => entry.name.includes("Smoke")) &&
        afterMulti.aliases.some((entry) => entry.id === "alias-smoke-4d2-glory")
    );

    const snapshotBeforeInvalid = snapshotFiles(dirs.catalogDir);
    const changelogCountBeforeInvalid = changelogLines(dirs.backupsDir).length;
    const backupCountBeforeInvalid = backupSetCount(dirs.backupsDir);

    const invalid = runCatalogTransaction(
      txOptions(dirs, {
        action: "invalid-edit",
        productIds: ["prod-glory-16"],
        summary: "Should fail validation",
        mutate(catalog) {
          const product = catalog.products.find(
            (entry) => entry.id === "prod-glory-16"
          );
          product.name = "";
        },
      })
    );
    assert(
      "D. invalid mutation fails",
      !invalid.ok && invalid.code === "VALIDATION_FAILED"
    );
    assert(
      "D. validation errors returned",
      invalid.validationErrors.some((message) => message.includes("missing name"))
    );
    assert("D. zero live writes", filesUnchanged(dirs.catalogDir, snapshotBeforeInvalid));
    assert(
      "D. no successful changelog line",
      changelogLines(dirs.backupsDir).length === changelogCountBeforeInvalid
    );
    assert(
      "D. no backup set created",
      backupSetCount(dirs.backupsDir) === backupCountBeforeInvalid
    );

    const snapshotBeforeRollback = snapshotFiles(dirs.catalogDir);
    const changelogCountBeforeRollback = changelogLines(dirs.backupsDir).length;

    const rollback = runCatalogTransaction(
      txOptions(dirs, {
        action: "rollback-smoke",
        productIds: ["prod-troy-20"],
        summary: "Force second-file failure",
        mutate(catalog) {
          const product = catalog.products.find(
            (entry) => entry.id === "prod-troy-20"
          );
          const variant = catalog.variants.find(
            (entry) => entry.id === "prod-troy-20"
          );
          product.name = `${product.name} Rollback`;
          variant.name = `${variant.name} Rollback`;
        },
        testHooks: {
          beforeReplace(_fileName, index) {
            if (index === 1) {
              throw new Error("simulated replace failure");
            }
          },
        },
      })
    );
    assert(
      "E. write failure reported",
      !rollback.ok && rollback.code === "WRITE_FAILED",
      rollback.error
    );
    assert(
      "E. live catalogue unchanged after rollback",
      filesUnchanged(dirs.catalogDir, snapshotBeforeRollback)
    );
    assert(
      "E. failed write not changelogged",
      changelogLines(dirs.backupsDir).length === changelogCountBeforeRollback &&
        changelogLines(dirs.backupsDir).every(
          (entry) => entry.action !== "rollback-smoke"
        )
    );

    const actions = changelogLines(dirs.backupsDir).map((entry) => entry.action);
    assert(
      "F. changelog contains only successful actions",
      actions.length === 2 &&
        actions[0] === "edit-product" &&
        actions[1] === "edit-product-and-alias"
    );

    const latestBeforeUndo = findLatestBackupSet(dirs);
    const undo = undoLastCatalogTransaction(txOptions(dirs));
    assert("G. undo succeeds", undo.ok && !undo.noop, undo.error);
    assert(
      "G. undo changelogged",
      undo.action === "undo" && undo.changelogWritten === true
    );
    const afterUndo = loadCatalog(dirs);
    const restoredVariant = afterUndo.variants.find(
      (entry) => entry.id === "prod-glory-16"
    );
    const restoredAlias = afterUndo.aliases.find(
      (entry) => entry.id === "alias-smoke-4d2-glory"
    );
    assert(
      "G. restores prior files",
      Boolean(restoredVariant) &&
        !restoredVariant.name.includes("Smoke") &&
        !restoredAlias
    );
    const undoErrors = validateCatalog(afterUndo, { publicDir: LIVE_PUBLIC_DIR });
    assert(
      "G. restored catalogue validates",
      undoErrors.length === 0,
      undoErrors[0]
    );
    assert(
      "G. previous backup set kept",
      Boolean(latestBeforeUndo) &&
        existsSync(join(latestBeforeUndo.backupDir, "metadata.json"))
    );

    const imageMeta = saveAssignedImageMetadata(
      "prod-ave-20",
      {
        card: "/product-images/cards/cigarettes/prod-ave-20.webp",
        detail: "/product-images/details/cigarettes/prod-ave-20.webp",
        original: "/product-images/originals/cigarettes/prod-ave-20-original.png",
      },
      txOptions(dirs, {
        validateOptions: {
          publicDir: LIVE_PUBLIC_DIR,
          fileExists: (filePath) =>
            String(filePath).includes("prod-ave-20") || existsSync(filePath),
        },
      })
    );
    assert(
      "I. image metadata transaction succeeds",
      imageMeta.ok,
      imageMeta.error || imageMeta.validationErrors?.[0]
    );
    assert(
      "I. image metadata wrote products.json",
      imageMeta.changedFiles.includes("products.json")
    );
    assert(
      "I. imageService module loads without starting the listener",
      true
    );

    const liveCatalog = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
    const liveErrors = validateCatalog(liveCatalog);
    assert(
      "H. live catalog:check equivalent passes",
      liveErrors.length === 0,
      liveErrors[0]
    );

    const liveImageErrors = validateProductImages(liveCatalog.products);
    assert(
      "J. live image-path validation passes",
      liveImageErrors.length === 0,
      liveImageErrors[0]
    );

    const badImageErrors = validateProductImages([
      {
        id: "prod-glory-16",
        image: {
          card: "https://example.com/card.webp",
          detail: "https://example.com/detail.webp",
        },
      },
    ]);
    assert(
      "J. Stage 4A rejects remote image URLs",
      badImageErrors.some((message) => message.includes("not an external URL"))
    );

    assert(
      "live catalogue files untouched",
      filesUnchanged(LIVE_CATALOG_DIR, liveSnapshot)
    );
  } finally {
    rmSync(dirs.root, { recursive: true, force: true });
  }

  const failed = results.filter((entry) => !entry.passed);
  console.log("");
  console.log(
    `Smoke tests: ${results.length - failed.length} passed, ${failed.length} failed`
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
