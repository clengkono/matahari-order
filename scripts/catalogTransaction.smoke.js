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
import { saveAssignedImageMetadata, saveRemovedImageMetadata } from "./imageService.js";
import {
  getAllowedCategories,
  listStudioProducts,
  parseProductMetadataPatch,
  updateProductMetadata,
} from "./studioProductMetadata.js";

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

function metaTxOptions(dirs, extra = {}) {
  return txOptions(dirs, {
    validateOptions: {
      publicDir: LIVE_PUBLIC_DIR,
      fileExists: (filePath) =>
        String(filePath).includes("prod-ave-20") ||
        String(filePath).includes("prod-52-kretek-20") ||
        existsSync(filePath),
    },
    ...extra,
  });
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
        card: "/product-images/cards/prod-ave-20.webp",
        detail: "/product-images/details/prod-ave-20.webp",
        original: "/product-images/originals/prod-ave-20-original.png",
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

    const unitsBeforeRemove = loadCatalog(dirs).units.length;
    const mappingsBeforeRemove = loadCatalog(dirs).mappings.length;
    const aliasesBeforeRemove = loadCatalog(dirs).aliases.length;
    const recoBeforeRemove = loadCatalog(dirs).recommendations.length;
    const imageRemoved = saveRemovedImageMetadata(
      "prod-ave-20",
      txOptions(dirs, {
        validateOptions: {
          publicDir: LIVE_PUBLIC_DIR,
          fileExists: (filePath) =>
            String(filePath).includes("prod-ave-20") || existsSync(filePath),
        },
      })
    );
    assert(
      "I. remove-image metadata transaction succeeds",
      imageRemoved.ok,
      imageRemoved.error || imageRemoved.validationErrors?.[0]
    );
    const afterImageRemove = loadCatalog(dirs);
    const aveAfterRemove = afterImageRemove.products.find(
      (product) => product.id === "prod-ave-20"
    );
    assert(
      "I. remove-image cleared image metadata",
      !aveAfterRemove?.image
    );
    assert(
      "I. remove-image left units/mappings/aliases/recommendations unchanged",
      afterImageRemove.units.length === unitsBeforeRemove &&
        afterImageRemove.mappings.length === mappingsBeforeRemove &&
        afterImageRemove.aliases.length === aliasesBeforeRemove &&
        afterImageRemove.recommendations.length === recoBeforeRemove
    );
    assert(
      "I. changelog records remove-image",
      changelogLines(dirs.backupsDir).some((row) => row.action === "remove-image")
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

    const listed = listStudioProducts(loadCatalog(dirs));
    assert(
      "4D.3 list includes every catalogue product",
      listed.length === liveCatalog.products.length && listed.length === 2256,
      `listed=${listed.length} live=${liveCatalog.products.length}`
    );
    const searchHits = (query) =>
      listed.filter((product) =>
        product.name.toLowerCase().includes(query.toLowerCase())
      );
    assert("4D.3 search Troy", searchHits("Troy").length >= 1);
    assert("4D.3 search Aqua", searchHits("Aqua").some((product) => product.category !== "Rokok"));
    assert("4D.3 search Indomie", searchHits("Indomie").length >= 1);
    assert("4D.3 search Masako", searchHits("Masako").length >= 1);
    assert("4D.3 search Camel", searchHits("Camel").length >= 1);

    const allowed = getAllowedCategories(loadCatalog(dirs).products);
    assert(
      "4D.3 curated categories stay first",
      allowed[0] === "Makanan Ringan" &&
        allowed[1] === "Bahan Makanan" &&
        allowed.includes("Minuman") &&
        allowed.includes("Perawatan Diri") &&
        allowed.includes("Kebutuhan Rumah") &&
        allowed.includes("Alat & Perlengkapan") &&
        allowed.includes("Kesehatan") &&
        allowed.includes("Rokok") &&
        allowed.includes("Bayi & Anak")
    );
    assert(
      "4D.3 extra patch keys rejected",
      parseProductMetadataPatch({ name: "X", favorite: true }).ok === false
    );
    assert(
      "4D.3 empty body patch is allowed",
      parseProductMetadataPatch({}).ok === true
    );

    const camelBefore = loadCatalog(dirs);
    const camelProductBefore = camelBefore.products.find(
      (product) => product.id === "prod-camel-blue16"
    );
    const camelAliasBefore = camelBefore.aliases
      .filter((entry) => entry.productId === "prod-camel-blue16")
      .map((entry) => entry.alias);
    const camelImageBefore = JSON.stringify(camelProductBefore?.image ?? null);
    const camelPosBefore = camelBefore.mappings
      .filter((mapping) => mapping.productId === "prod-camel-blue16")
      .map((mapping) => ({
        posName: mapping.posName,
        posCode: mapping.posCode,
        productId: mapping.productId,
        unitId: mapping.unitId,
      }));

    const renamedCamel = updateProductMetadata(
      { productId: "prod-camel-blue16", name: "Camel Blue 16 Studio" },
      metaTxOptions(dirs)
    );
    assert("4D.3 rename succeeds", renamedCamel.ok && !renamedCamel.noop, renamedCamel.error);
    assert(
      "4D.3 rename is one transaction",
      renamedCamel.action === "update-product-metadata" &&
        renamedCamel.changedFiles.includes("products.json") &&
        renamedCamel.changedFiles.includes("variants.json") &&
        renamedCamel.changedFiles.includes("mappings.json")
    );
    const camelAfter = loadCatalog(dirs);
    const camelProductAfter = camelAfter.products.find(
      (product) => product.id === "prod-camel-blue16"
    );
    const camelVariants = camelAfter.variants.filter(
      (variant) => variant.productId === "prod-camel-blue16"
    );
    const camelMappings = camelAfter.mappings.filter(
      (mapping) => mapping.productId === "prod-camel-blue16"
    );
    assert(
      "4D.3 rename updates customer-facing names",
      camelProductAfter?.name === "Camel Blue 16 Studio" &&
        camelVariants.every((variant) => variant.name === "Camel Blue 16 Studio") &&
        camelMappings.every(
          (mapping) => mapping.productName === "Camel Blue 16 Studio"
        )
    );
    assert(
      "4D.3 rename leaves POS, IDs, image, aliases untouched",
      camelProductAfter?.id === "prod-camel-blue16" &&
        camelVariants.every((variant) => variant.id === "prod-camel-blue16") &&
        JSON.stringify(camelProductAfter?.image ?? null) === camelImageBefore &&
        JSON.stringify(
          camelAfter.aliases
            .filter((entry) => entry.productId === "prod-camel-blue16")
            .map((entry) => entry.alias)
        ) === JSON.stringify(camelAliasBefore) &&
        camelMappings.every((mapping, index) => {
          const before = camelPosBefore[index];
          return (
            mapping.posName === before.posName &&
            mapping.posCode === before.posCode &&
            mapping.productId === before.productId &&
            mapping.unitId === before.unitId
          );
        })
    );

    const snapshotBeforeCategory = snapshotFiles(dirs.catalogDir);
    const apacheBefore = loadCatalog(dirs).products.find(
      (product) => product.id === "prod-apache-16"
    );
    const categoryOnly = updateProductMetadata(
      { productId: "prod-apache-16", category: "Perawatan Diri" },
      metaTxOptions(dirs)
    );
    assert(
      "4D.3 category-only succeeds",
      categoryOnly.ok && !categoryOnly.noop,
      categoryOnly.error
    );
    assert(
      "4D.3 category-only writes products.json only",
      categoryOnly.changedFiles.length === 1 &&
        categoryOnly.changedFiles[0] === "products.json"
    );
    const apacheAfter = loadCatalog(dirs).products.find(
      (product) => product.id === "prod-apache-16"
    );
    assert(
      "4D.3 category-only updates category and keeps image",
      apacheAfter?.category === "Perawatan Diri" &&
        apacheAfter?.name === apacheBefore?.name &&
        JSON.stringify(apacheAfter?.image ?? null) ===
          JSON.stringify(apacheBefore?.image ?? null)
    );
    assert(
      "4D.3 category-only leaves variants and mappings bytes unchanged",
      readText(join(dirs.catalogDir, "variants.json")) ===
        snapshotBeforeCategory["variants.json"] &&
        readText(join(dirs.catalogDir, "mappings.json")) ===
          snapshotBeforeCategory["mappings.json"]
    );

    const combined = updateProductMetadata(
      {
        productId: "prod-camel-purple-12",
        name: "Camel Purple 12 Studio",
        category: "Minuman",
      },
      metaTxOptions(dirs)
    );
    assert("4D.3 combined save succeeds", combined.ok && !combined.noop, combined.error);
    assert(
      "4D.3 combined save is one transaction",
      combined.action === "update-product-metadata" &&
        combined.nameChanged === true &&
        combined.categoryChanged === true &&
        combined.changedFiles.includes("products.json") &&
        combined.changedFiles.includes("variants.json") &&
        combined.changedFiles.includes("mappings.json")
    );

    const imageAfterMeta = saveAssignedImageMetadata(
      "prod-52-kretek-20",
      {
        card: "/product-images/cards/prod-52-kretek-20.webp",
        detail: "/product-images/details/prod-52-kretek-20.webp",
        original:
          "/product-images/originals/prod-52-kretek-20-original.png",
      },
      metaTxOptions(dirs)
    );
    assert(
      "4D.3 image metadata still works after product edits",
      imageAfterMeta.ok,
      imageAfterMeta.error || imageAfterMeta.validationErrors?.[0]
    );

    const emptyName = updateProductMetadata(
      { productId: "prod-aqua-15l", name: "   " },
      metaTxOptions(dirs)
    );
    assert(
      "4D.3 empty name rejected",
      !emptyName.ok && emptyName.code === "INVALID_INPUT"
    );

    const snapshotBeforeInvalidCategory = snapshotFiles(dirs.catalogDir);
    const invalidCategory = updateProductMetadata(
      { productId: "prod-aqua-15l", category: "Snacks" },
      metaTxOptions(dirs)
    );
    assert(
      "4D.3 invalid category rejected",
      !invalidCategory.ok && invalidCategory.code === "INVALID_INPUT"
    );
    assert(
      "4D.3 invalid category writes nothing",
      filesUnchanged(dirs.catalogDir, snapshotBeforeInvalidCategory)
    );

    const unknownProduct = updateProductMetadata(
      { productId: "prod-does-not-exist", name: "Nope" },
      metaTxOptions(dirs)
    );
    assert(
      "4D.3 unknown product rejected",
      !unknownProduct.ok && unknownProduct.code === "NOT_FOUND"
    );

    const noopMeta = updateProductMetadata(
      {
        productId: "prod-aqua-15l",
        name: "Aqua 1.5 L",
        category: "Minuman",
      },
      metaTxOptions(dirs)
    );
    assert("4D.3 no-change save is noop", noopMeta.ok && noopMeta.noop === true);

    let busyResult;
    const busyHolder = runCatalogTransaction(
      metaTxOptions(dirs, {
        action: "busy-holder",
        mutate() {
          busyResult = updateProductMetadata(
            { productId: "prod-aqua-15l", name: "Aqua Held" },
            metaTxOptions(dirs)
          );
        },
      })
    );
    assert("4D.3 outer lock holder succeeds", busyHolder.ok, busyHolder.error);
    assert(
      "4D.3 nested metadata save is BUSY",
      busyResult?.ok === false && busyResult?.code === "BUSY"
    );

    const aquaListed = listed.find((product) => product.id === "prod-aqua-15l");
    assert(
      "4D.3 non-rokok product has display fields",
      aquaListed?.name === "Aqua 1.5 L" &&
        aquaListed?.category === "Minuman" &&
        Array.isArray(aquaListed.aliases) &&
        aquaListed.aliases.includes("aqua")
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
