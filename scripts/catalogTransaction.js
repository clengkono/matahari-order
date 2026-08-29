/**
 * Catalogue write transaction for Catalogue Studio.
 * Writes identity/POS files plus owner-curated productFamilies.json and
 * productDefaults.json.
 *
 * Load → mutate in memory → validate (same catalog:check rules) →
 * backup changed files → temp write → replace → rollback on failure.
 *
 * LOCAL ONLY. Does not start a server or touch the customer UI.
 */

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "./buildCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const CATALOG_FILES = Object.freeze([
  "products.json",
  "variants.json",
  "units.json",
  "aliases.json",
  "mappings.json",
  "recommendations.json",
  "productFamilies.json",
  "productDefaults.json",
]);

const FILE_TO_KEY = Object.freeze({
  "products.json": "products",
  "variants.json": "variants",
  "units.json": "units",
  "aliases.json": "aliases",
  "mappings.json": "mappings",
  "recommendations.json": "recommendations",
  "productFamilies.json": "productFamilies",
  "productDefaults.json": "productDefaults",
});

const KEY_TO_FILE = Object.freeze(
  Object.fromEntries(
    Object.entries(FILE_TO_KEY).map(([fileName, key]) => [key, fileName])
  )
);

export const CATALOG_KEYS = Object.freeze(CATALOG_FILES.map((fileName) => FILE_TO_KEY[fileName]));

const DEFAULT_CATALOG_DIR = join(ROOT, "src", "catalog");
const DEFAULT_BACKUPS_DIR = join(DEFAULT_CATALOG_DIR, "backups");
const CHANGELOG_NAME = "changelog.jsonl";
const METADATA_NAME = "metadata.json";
const BACKUP_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?$/;
const DEFAULT_CHANGED_BY = "local-owner";

let writeLock = false;
let backupSeq = 0;

function resolveDirs(options = {}) {
  const catalogDir = options.catalogDir ?? DEFAULT_CATALOG_DIR;
  const backupsDir = options.backupsDir ?? join(catalogDir, "backups");
  return { catalogDir, backupsDir };
}

function fail(error, extra = {}) {
  return {
    ok: false,
    error,
    validationErrors: extra.validationErrors ?? [],
    changedFiles: extra.changedFiles ?? [],
    backupId: extra.backupId ?? null,
    ...extra,
  };
}

function success(extra = {}) {
  return {
    ok: true,
    error: null,
    validationErrors: [],
    changedFiles: extra.changedFiles ?? [],
    backupId: extra.backupId ?? null,
    ...extra,
  };
}

function readJsonFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function serializeCatalogJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneCatalog(catalog) {
  return structuredClone(catalog);
}

function assertCatalogShape(catalog, label) {
  if (!catalog || typeof catalog !== "object") {
    throw new Error(`${label} must be an object.`);
  }

  for (const key of CATALOG_KEYS) {
    if (!Array.isArray(catalog[key])) {
      throw new Error(`${label} ${key} must be an array.`);
    }
  }
}

export function loadCatalog(options = {}) {
  const { catalogDir } = resolveDirs(options);
  const catalog = {};

  for (const fileName of CATALOG_FILES) {
    const filePath = join(catalogDir, fileName);
    if (!existsSync(filePath)) {
      throw new Error(`Missing catalogue file: ${fileName}`);
    }

    const parsed = readJsonFile(filePath);
    const key = FILE_TO_KEY[fileName];
    if (!Array.isArray(parsed)) {
      throw new Error(`${fileName} must contain an array.`);
    }
    catalog[key] = parsed;
  }

  return catalog;
}

function detectChangedFiles(before, after) {
  const changed = [];

  for (const key of CATALOG_KEYS) {
    if (!jsonEqual(before[key], after[key])) {
      changed.push(KEY_TO_FILE[key]);
    }
  }

  return changed;
}

function createBackupId(now = new Date()) {
  backupSeq += 1;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return backupSeq === 1 ? stamp : `${stamp}-${backupSeq}`;
}

function uniqueBackupDir(backupsDir) {
  mkdirSync(backupsDir, { recursive: true });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const backupId = createBackupId();
    const backupDir = join(backupsDir, backupId);
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
      return { backupId, backupDir };
    }
  }

  throw new Error("Could not allocate a unique backup directory.");
}

function writeMetadata(backupDir, metadata) {
  writeFileSync(
    join(backupDir, METADATA_NAME),
    serializeCatalogJson(metadata),
    "utf8"
  );
}

function createBackupSet({
  catalogDir,
  backupsDir,
  changedFiles,
  action,
  productIds,
  summary,
  changedBy,
  timestamp,
}) {
  const { backupId, backupDir } = uniqueBackupDir(backupsDir);

  for (const fileName of changedFiles) {
    copyFileSync(join(catalogDir, fileName), join(backupDir, fileName));
  }

  writeMetadata(backupDir, {
    timestamp,
    action,
    productIds,
    changedFiles,
    summary,
    changedBy,
  });

  return { backupId, backupDir };
}

function uniqueTempPath(dir, fileName) {
  backupSeq += 1;
  return join(
    dir,
    `${fileName}.${process.pid}.${Date.now()}.${backupSeq}.tmp.json`
  );
}

function safeUnlink(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return;
  }

  try {
    unlinkSync(filePath);
  } catch {
    // Best-effort cleanup.
  }
}

function replaceLiveFile(tempPath, destPath) {
  if (!existsSync(tempPath)) {
    throw new Error("Temporary catalogue file is missing.");
  }

  try {
    renameSync(tempPath, destPath);
  } catch {
    copyFileSync(tempPath, destPath);
    safeUnlink(tempPath);
  }
}

function restoreFilesFromBackup(backupDir, catalogDir, fileNames) {
  const errors = [];

  for (const fileName of fileNames) {
    const backupPath = join(backupDir, fileName);
    const livePath = join(catalogDir, fileName);

    if (!existsSync(backupPath)) {
      errors.push(`backup missing ${fileName}`);
      continue;
    }

    const tempPath = uniqueTempPath(catalogDir, fileName);

    try {
      copyFileSync(backupPath, tempPath);
      replaceLiveFile(tempPath, livePath);
    } catch (error) {
      safeUnlink(tempPath);
      errors.push(`${fileName}: ${error.message}`);
    }
  }

  return errors;
}

function removeBackupSet(backupDir) {
  if (!backupDir || !existsSync(backupDir)) {
    return;
  }

  try {
    rmSync(backupDir, { recursive: true, force: true });
  } catch {
    // Leave a leftover directory rather than failing the caller twice.
  }
}

function appendChangelog(backupsDir, entry) {
  mkdirSync(backupsDir, { recursive: true });
  appendFileSync(
    join(backupsDir, CHANGELOG_NAME),
    `${JSON.stringify(entry)}\n`,
    "utf8"
  );
}

function normalizeProductIds(productIds) {
  if (productIds == null) {
    return [];
  }

  if (!Array.isArray(productIds)) {
    throw new Error("productIds must be an array.");
  }

  return productIds.map((id) => String(id));
}

function runUnlocked(options) {
  const action = typeof options?.action === "string" ? options.action.trim() : "";
  if (!action) {
    return fail("Transaction action is required.", { code: "INVALID_ACTION" });
  }

  if (typeof options.mutate !== "function") {
    return fail("Transaction mutate() is required.", { code: "INVALID_MUTATE" });
  }

  let productIds;
  try {
    productIds = normalizeProductIds(options.productIds);
  } catch (error) {
    return fail(error.message, { code: "INVALID_PRODUCT_IDS" });
  }

  const summary =
    typeof options.summary === "string" ? options.summary : "";
  const changedBy =
    typeof options.changedBy === "string" && options.changedBy.trim()
      ? options.changedBy.trim()
      : DEFAULT_CHANGED_BY;
  const { catalogDir, backupsDir } = resolveDirs(options);
  const testHooks = options.testHooks ?? {};
  const timestamp = new Date().toISOString();

  let before;
  try {
    before = loadCatalog({ catalogDir });
  } catch (error) {
    return fail(error.message, { code: "LOAD_FAILED" });
  }

  const next = cloneCatalog(before);

  try {
    const returned = options.mutate(next);
    if (
      returned &&
      typeof returned === "object" &&
      Array.isArray(returned.products)
    ) {
      Object.assign(next, returned);
    }
  } catch (error) {
    return fail(error.message || "Mutation failed.", { code: "MUTATE_FAILED" });
  }

  try {
    assertCatalogShape(next, "mutated catalogue");
  } catch (error) {
    return fail(error.message, { code: "INVALID_CATALOGUE" });
  }

  const validationErrors = validateCatalog(next, options.validateOptions ?? {});
  if (validationErrors.length > 0) {
    return fail("Catalogue validation failed.", {
      code: "VALIDATION_FAILED",
      validationErrors,
    });
  }

  const changedFiles = detectChangedFiles(before, next);
  if (changedFiles.length === 0) {
    return success({
      noop: true,
      changedFiles: [],
      backupId: null,
      action,
      productIds,
      summary,
    });
  }

  let backup;
  try {
    backup = createBackupSet({
      catalogDir,
      backupsDir,
      changedFiles,
      action,
      productIds,
      summary,
      changedBy,
      timestamp,
    });
  } catch (error) {
    return fail(error.message || "Failed to create catalogue backup.", {
      code: "BACKUP_FAILED",
    });
  }

  const { backupId, backupDir } = backup;

  const temps = [];
  const replaced = [];

  try {
    for (const fileName of changedFiles) {
      const key = FILE_TO_KEY[fileName];
      const tempPath = uniqueTempPath(catalogDir, fileName);
      writeFileSync(tempPath, serializeCatalogJson(next[key]), "utf8");

      if (!existsSync(tempPath) || statSync(tempPath).size < 2) {
        safeUnlink(tempPath);
        throw new Error(`Failed to write temporary ${fileName}.`);
      }

      temps.push(tempPath);
    }

    for (let index = 0; index < changedFiles.length; index += 1) {
      const fileName = changedFiles[index];
      if (typeof testHooks.beforeReplace === "function") {
        testHooks.beforeReplace(fileName, index, changedFiles.length);
      }

      replaceLiveFile(temps[index], join(catalogDir, fileName));
      replaced.push(fileName);
    }
  } catch (error) {
    const rollbackErrors = restoreFilesFromBackup(
      backupDir,
      catalogDir,
      replaced
    );

    for (const tempPath of temps) {
      safeUnlink(tempPath);
    }

    removeBackupSet(backupDir);

    if (rollbackErrors.length > 0) {
      return fail(
        "Catalogue write failed and rollback was incomplete. Check backups.",
        {
          code: "ROLLBACK_FAILED",
          writeError: error.message,
          rollbackErrors,
          changedFiles,
        }
      );
    }

    return fail(error.message || "Catalogue write failed. Previous files restored.", {
      code: "WRITE_FAILED",
      changedFiles,
    });
  }

  try {
    appendChangelog(backupsDir, {
      timestamp,
      action,
      productIds,
      files: changedFiles,
      summary,
      changedBy,
    });
  } catch (error) {
    return success({
      changedFiles,
      backupId,
      action,
      productIds,
      summary,
      changelogWritten: false,
      changelogError: error.message,
    });
  }

  return success({
    changedFiles,
    backupId,
    action,
    productIds,
    summary,
    changelogWritten: true,
  });
}

/**
 * Apply an in-memory catalogue mutation, validate, then write only changed files.
 *
 * @param {object} options
 * @param {string} options.action
 * @param {string[]} [options.productIds]
 * @param {string} [options.summary]
 * @param {string} [options.changedBy]
 * @param {(catalog: object) => void | object} options.mutate
 * @param {string} [options.catalogDir]
 * @param {string} [options.backupsDir]
 * @param {object} [options.validateOptions] passed to validateCatalog
 * @param {{ beforeReplace?: Function }} [options.testHooks]
 */
export function runCatalogTransaction(options) {
  if (writeLock) {
    return fail("Another catalogue write is in progress.", { code: "BUSY" });
  }

  writeLock = true;
  try {
    return runUnlocked(options);
  } finally {
    writeLock = false;
  }
}

export function listBackupSets(options = {}) {
  const { backupsDir } = resolveDirs(options);
  if (!existsSync(backupsDir)) {
    return [];
  }

  return readdirSync(backupsDir)
    .filter((name) => BACKUP_ID_PATTERN.test(name))
    .map((backupId) => {
      const backupDir = join(backupsDir, backupId);
      try {
        if (!statSync(backupDir).isDirectory()) {
          return null;
        }
      } catch {
        return null;
      }

      const metadataPath = join(backupDir, METADATA_NAME);
      if (!existsSync(metadataPath)) {
        return null;
      }

      let metadata;
      try {
        metadata = readJsonFile(metadataPath);
      } catch {
        return null;
      }

      const changedFiles = Array.isArray(metadata.changedFiles)
        ? metadata.changedFiles.filter((fileName) => CATALOG_FILES.includes(fileName))
        : CATALOG_FILES.filter((fileName) => existsSync(join(backupDir, fileName)));

      if (changedFiles.length === 0) {
        return null;
      }

      const missing = changedFiles.some(
        (fileName) => !existsSync(join(backupDir, fileName))
      );
      if (missing) {
        return null;
      }

      return { backupId, backupDir, metadata, changedFiles };
    })
    .filter(Boolean)
    .sort((a, b) => b.backupId.localeCompare(a.backupId));
}

export function findLatestBackupSet(options = {}) {
  return listBackupSets(options)[0] ?? null;
}

/**
 * Restore files from the most recent successful backup set.
 * Creates a new backup of the current files first (via runCatalogTransaction).
 * Does not delete the restored backup set.
 */
export function undoLastCatalogTransaction(options = {}) {
  const latest = findLatestBackupSet(options);
  if (!latest) {
    return fail("No catalogue backup set to undo.", { code: "NO_BACKUP" });
  }

  const previousAction = latest.metadata?.action || "transaction";
  const previousSummary = latest.metadata?.summary || latest.backupId;

  return runCatalogTransaction({
    ...options,
    action: "undo",
    productIds: Array.isArray(latest.metadata?.productIds)
      ? latest.metadata.productIds
      : [],
    summary: `Undo ${previousAction}: ${previousSummary}`,
    mutate(catalog) {
      for (const fileName of latest.changedFiles) {
        const key = FILE_TO_KEY[fileName];
        catalog[key] = readJsonFile(join(latest.backupDir, fileName));
      }
    },
  });
}

export { DEFAULT_BACKUPS_DIR, DEFAULT_CATALOG_DIR };
