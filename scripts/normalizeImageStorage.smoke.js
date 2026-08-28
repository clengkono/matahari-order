/**
 * Isolated smoke tests for Stage 5F image-path normalization.
 * Copies live files into tmp/ — never writes the live catalogue or live images.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "./buildCatalog.js";
import { CATALOG_FILES, loadCatalog } from "./catalogTransaction.js";
import {
  canonicalCardPublicUrl,
  canonicalDetailPublicUrl,
  isCanonicalOriginalPublicUrl,
  originalExtensionFromPublicUrl,
  publicUrlToAbs,
} from "./imagePaths.js";
import { processAndSaveImage } from "./imageService.js";
import {
  applyNormalizeImageStorage,
  planNormalizeImageStorage,
} from "./normalizeImageStorage.js";
import { isSafeOwnerPath } from "./publishClassify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");
const LIVE_IMAGES = join(LIVE_PUBLIC_DIR, "product-images");
const LIVE_PRODUCTS = join(LIVE_CATALOG_DIR, "products.json");

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

function forceLegacyImageMetadata(products) {
  for (const product of products) {
    if (!product.image) {
      continue;
    }
    const ext = originalExtensionFromPublicUrl(product.image.original) || "png";
    product.image = {
      card: `/product-images/cards/cigarettes/${product.id}.webp`,
      detail: `/product-images/details/cigarettes/${product.id}.webp`,
      original: `/product-images/originals/cigarettes/${product.id}-original.${ext}`,
    };
  }
}

function seedLegacyImages(publicDir, products) {
  for (const product of products) {
    if (!product.image) {
      continue;
    }
    const ext = originalExtensionFromPublicUrl(product.image.original) || "png";
    const copies = [
      {
        from: publicUrlToAbs(product.image.card, LIVE_IMAGES),
        to: join(
          publicDir,
          "product-images",
          "cards",
          "cigarettes",
          `${product.id}.webp`
        ),
      },
      {
        from: publicUrlToAbs(product.image.detail, LIVE_IMAGES),
        to: join(
          publicDir,
          "product-images",
          "details",
          "cigarettes",
          `${product.id}.webp`
        ),
      },
      {
        from: publicUrlToAbs(product.image.original, LIVE_IMAGES),
        to: join(
          publicDir,
          "product-images",
          "originals",
          "cigarettes",
          `${product.id}-original.${ext}`
        ),
      },
    ];
    for (const copy of copies) {
      if (!copy.from || !existsSync(copy.from)) {
        throw new Error(`Missing live image for ${product.id}: ${copy.from}`);
      }
      mkdirSync(dirname(copy.to), { recursive: true });
      copyFileSync(copy.from, copy.to);
    }
  }
}

function setupTempWorld(label) {
  const root = mkdtempSync(join(tmpdir(), `mo-normalize-${label}-`));
  const catalogDir = join(root, "catalog");
  const publicDir = join(root, "public");
  const backupsDir = join(catalogDir, "backups");
  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });
  for (const fileName of CATALOG_FILES) {
    copyFileSync(join(LIVE_CATALOG_DIR, fileName), join(catalogDir, fileName));
  }

  const liveCatalog = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
  seedLegacyImages(publicDir, liveCatalog.products);
  const products = JSON.parse(readFileSync(join(catalogDir, "products.json"), "utf8"));
  forceLegacyImageMetadata(products);
  writeFileSync(
    join(catalogDir, "products.json"),
    `${JSON.stringify(products, null, 2)}\n`,
    "utf8"
  );

  return {
    root,
    catalogDir,
    publicDir,
    backupsDir,
    productsSnapshot: readFileSync(join(catalogDir, "products.json")),
  };
}

function loadTempCatalog(catalogDir) {
  return {
    products: JSON.parse(readFileSync(join(catalogDir, "products.json"), "utf8")),
    variants: JSON.parse(readFileSync(join(catalogDir, "variants.json"), "utf8")),
    units: JSON.parse(readFileSync(join(catalogDir, "units.json"), "utf8")),
    aliases: JSON.parse(readFileSync(join(catalogDir, "aliases.json"), "utf8")),
    mappings: JSON.parse(readFileSync(join(catalogDir, "mappings.json"), "utf8")),
    recommendations: JSON.parse(
      readFileSync(join(catalogDir, "recommendations.json"), "utf8")
    ),
  };
}

const liveBefore = readFileSync(LIVE_PRODUCTS);
const tempDirs = [];

try {
  assert(
    "publish classifier accepts canonical image files",
    isSafeOwnerPath("public/product-images/cards/prod-glory-16.webp") &&
      isSafeOwnerPath("public/product-images/details/prod-glory-16.webp") &&
      isSafeOwnerPath(
        "public/product-images/originals/prod-aqua-botol-600ml-original.png"
      )
  );
  assert(
    "publish classifier still excludes trash",
    isSafeOwnerPath("public/product-images/.trash/x/prod-a.webp") === false
  );

  const world = setupTempWorld("main");
  tempDirs.push(world.root);

  const dry = applyNormalizeImageStorage({
    catalogDir: world.catalogDir,
    publicDir: world.publicDir,
    backupsDir: world.backupsDir,
    dryRun: true,
    skipCustomerRebuild: true,
  });
  assert("legacy → canonical dry-run is READY", dry.ok && dry.dryRun && dry.plan.ready);
  assert(
    "dry-run does not write catalogue",
    Buffer.compare(
      readFileSync(join(world.catalogDir, "products.json")),
      world.productsSnapshot
    ) === 0
  );
  assert(
    "dry-run found imaged products to migrate",
    dry.plan.migrate.length > 0 && dry.plan.conflicts.length === 0
  );

  const firstSource = dry.plan.migrate[0].files.find((file) => file.kind === "card");
  const sourceBytes = readFileSync(firstSource.fromAbs);

  const applied = applyNormalizeImageStorage({
    catalogDir: world.catalogDir,
    publicDir: world.publicDir,
    backupsDir: world.backupsDir,
    apply: true,
    dryRun: false,
    customerOutputPath: join(world.root, "customerCatalog.json"),
  });
  assert("apply succeeds", applied.ok && applied.transaction?.ok, applied.error);
  assert(
    "metadata update wrote products.json",
    applied.transaction.changedFiles.includes("products.json")
  );
  assert("byte-preserving copy", applied.copied.length > 0);
  assert(
    "copied card bytes match the legacy source",
    Buffer.compare(readFileSync(firstSource.toAbs), sourceBytes) === 0
  );

  const afterCatalog = loadTempCatalog(world.catalogDir);
  const imaged = afterCatalog.products.filter((product) => product.image);
  assert(
    "validation after migration",
    validateCatalog(afterCatalog, { publicDir: world.publicDir }).length === 0
  );
  assert(
    "migrated metadata is canonical",
    imaged.length === dry.plan.totalImaged &&
      imaged.every(
        (product) =>
          product.image.card === canonicalCardPublicUrl(product.id) &&
          product.image.detail === canonicalDetailPublicUrl(product.id) &&
          isCanonicalOriginalPublicUrl(product.image.original, product.id)
      )
  );
  assert(
    "no new legacy directory remains in temp active folders",
    !existsSync(join(world.publicDir, "product-images", "cards", "cigarettes")) &&
      !existsSync(join(world.publicDir, "product-images", "details", "cigarettes")) &&
      !existsSync(join(world.publicDir, "product-images", "originals", "cigarettes"))
  );

  const customer = JSON.parse(
    readFileSync(join(world.root, "customerCatalog.json"), "utf8")
  );
  const customerImaged = customer.products.filter((product) => product.image);
  assert(
    "customerCatalog emits canonical card/detail only",
    customerImaged.length === imaged.length &&
      customerImaged.every(
        (product) =>
          product.image.card === canonicalCardPublicUrl(product.id) &&
          product.image.detail === canonicalDetailPublicUrl(product.id) &&
          product.image.original === undefined &&
          !JSON.stringify(product.image).includes("cigarettes")
      )
  );

  const second = applyNormalizeImageStorage({
    catalogDir: world.catalogDir,
    publicDir: world.publicDir,
    backupsDir: world.backupsDir,
    apply: true,
    dryRun: false,
    skipCustomerRebuild: true,
  });
  assert("second run is a no-op", second.ok && second.noop === true);

  const conflictWorld = setupTempWorld("conflict");
  tempDirs.push(conflictWorld.root);
  const conflictPlan = planNormalizeImageStorage({
    catalogDir: conflictWorld.catalogDir,
    publicDir: conflictWorld.publicDir,
  });
  const conflictFile = conflictPlan.migrate[0].files.find((file) => file.kind === "card");
  mkdirSync(dirname(conflictFile.toAbs), { recursive: true });
  writeFileSync(conflictFile.toAbs, "not-the-source-bytes");
  const conflictResult = applyNormalizeImageStorage({
    catalogDir: conflictWorld.catalogDir,
    publicDir: conflictWorld.publicDir,
    backupsDir: conflictWorld.backupsDir,
    apply: true,
    dryRun: false,
    skipCustomerRebuild: true,
  });
  assert("conflict detection stops apply", conflictResult.ok === false);
  assert(
    "conflict does not rewrite products.json",
    Buffer.compare(
      readFileSync(join(conflictWorld.catalogDir, "products.json")),
      conflictWorld.productsSnapshot
    ) === 0
  );

  const metaWorld = setupTempWorld("meta");
  tempDirs.push(metaWorld.root);
  const metaFail = applyNormalizeImageStorage({
    catalogDir: metaWorld.catalogDir,
    publicDir: metaWorld.publicDir,
    backupsDir: metaWorld.backupsDir,
    apply: true,
    dryRun: false,
    skipCustomerRebuild: true,
    forceMetadataError: true,
  });
  assert("metadata failure aborts", metaFail.ok === false && metaFail.rolledBackCopies);
  const metaPlan = planNormalizeImageStorage({
    catalogDir: metaWorld.catalogDir,
    publicDir: metaWorld.publicDir,
  });
  const metaCard = metaPlan.migrate[0].files.find((file) => file.kind === "card");
  assert(
    "metadata failure rollback removes prepared destinations",
    !existsSync(metaCard.toAbs)
  );
  assert(
    "metadata failure leaves temp catalogue on legacy paths",
    JSON.parse(readFileSync(join(metaWorld.catalogDir, "products.json"), "utf8"))
      .find((product) => product.id === metaPlan.migrate[0].productId)
      .image.card.includes("cigarettes")
  );

  const destWorld = setupTempWorld("dest");
  tempDirs.push(destWorld.root);
  const destPlan = planNormalizeImageStorage({
    catalogDir: destWorld.catalogDir,
    publicDir: destWorld.publicDir,
  });
  const destFile = destPlan.migrate[0].files.find((file) => file.kind === "card");
  mkdirSync(destFile.toAbs, { recursive: true });
  const destFail = applyNormalizeImageStorage({
    catalogDir: destWorld.catalogDir,
    publicDir: destWorld.publicDir,
    backupsDir: destWorld.backupsDir,
    apply: true,
    dryRun: false,
    skipCustomerRebuild: true,
  });
  assert("destination failure aborts", destFail.ok === false);

  const liveCatalog = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
  const glory = liveCatalog.products.find((product) => product.id === "prod-glory-16");
  const gloryOriginal = publicUrlToAbs(glory.image.original, LIVE_IMAGES);
  const uploadDir = join(world.root, "future-upload", "product-images");
  const saved = await processAndSaveImage(
    "prod-future-upload",
    readFileSync(gloryOriginal),
    "image/png",
    { publicImages: uploadDir }
  );
  assert(
    "future upload writes canonical path",
    saved.image.card === "/product-images/cards/prod-future-upload.webp" &&
      existsSync(join(uploadDir, "cards", "prod-future-upload.webp"))
  );
  assert(
    "future upload does not recreate cigarettes folders",
    !existsSync(join(uploadDir, "cards", "cigarettes")) &&
      !existsSync(join(uploadDir, "details", "cigarettes")) &&
      !existsSync(join(uploadDir, "originals", "cigarettes"))
  );

  const replaced = await processAndSaveImage(
    "prod-future-upload",
    readFileSync(gloryOriginal),
    "image/png",
    { publicImages: uploadDir }
  );
  assert(
    "replace writes canonical path",
    replaced.image.card === "/product-images/cards/prod-future-upload.webp"
  );

  assert(
    "smoke did not change live products.json",
    Buffer.compare(readFileSync(LIVE_PRODUCTS), liveBefore) === 0
  );
} catch (error) {
  console.error(error);
  record("smoke crashed", false, error.message);
} finally {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

const failed = results.filter((item) => !item.passed).length;
console.log("");
console.log(
  `Image storage normalize smoke: ${results.filter((item) => item.passed).length}/${results.length} passed`
);
if (failed > 0) {
  process.exitCode = 1;
}
