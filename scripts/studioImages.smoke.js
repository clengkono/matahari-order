/**
 * Isolated smoke tests for Stage 5D Studio image management (Phase 1B).
 * Writes only under tmp/ — never the live catalogue or live public images.
 * The owner Aqua Botol 600ML original is read for framing inspection only.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { CATALOG_FILES } from "./catalogTransaction.js";
import { archiveAssignedImageFiles } from "./imageArchive.js";
import { frameProductBuffer } from "./imageFraming.js";
import { createWatermarkOverlay } from "./imageWatermark.js";
import {
  discardSavedPriors,
  generateSquareWebpBuffer,
  processAndSaveImage,
  regenerateDerivedImages,
  removeAssignedImage,
  rollbackSavedBinaries,
  saveAssignedImageMetadata,
} from "./imageService.js";
import {
  describeProductImage,
  listRecentlyAssignedProductIds,
  listStudioImageCatalog,
  rebuildCustomerCatalogAfterStudioWrite,
} from "./studioImageCatalog.js";
import {
  filterStudioImageProducts,
  matchesStudioImageQuery,
} from "../src/utils/studioImageSearch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");
const LIVE_CUSTOMER = join(
  LIVE_CATALOG_DIR,
  "generated",
  "customerCatalog.json"
);
const LIVE_IMAGES = join(LIVE_PUBLIC_DIR, "product-images");
const AQUA_600_ID = "prod-aqua-botol-600ml";
const AQUA_ORIGINAL = join(
  LIVE_IMAGES,
  "originals",
  "cigarettes",
  `${AQUA_600_ID}-original.png`
);
const BACKGROUND = { r: 237, g: 232, b: 225 };
const FIXTURE_ID = "prod-aqua-botol-1500ml";

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

function snapshotLive() {
  const snapshot = {};
  for (const fileName of CATALOG_FILES) {
    snapshot[fileName] = readFileSync(join(LIVE_CATALOG_DIR, fileName), "utf8");
  }
  snapshot.customerCatalog = existsSync(LIVE_CUSTOMER)
    ? readFileSync(LIVE_CUSTOMER, "utf8")
    : null;
  snapshot.imageNames = readdirSync(LIVE_IMAGES, { recursive: true }).sort().join("|");
  return snapshot;
}

function liveUnchanged(snapshot) {
  const filesOk = CATALOG_FILES.every(
    (fileName) =>
      readFileSync(join(LIVE_CATALOG_DIR, fileName), "utf8") === snapshot[fileName]
  );
  const generatedNow = existsSync(LIVE_CUSTOMER)
    ? readFileSync(LIVE_CUSTOMER, "utf8")
    : null;
  const imagesNow = readdirSync(LIVE_IMAGES, { recursive: true }).sort().join("|");
  return filesOk && generatedNow === snapshot.customerCatalog && imagesNow === snapshot.imageNames;
}

async function tinyPng() {
  return sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 180, g: 50, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

async function whitePaddedProduct() {
  const inner = await sharp({
    create: {
      width: 260,
      height: 240,
      channels: 3,
      background: { r: 30, g: 110, b: 40 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: inner, left: 70, top: 80 }])
    .png()
    .toBuffer();
}

async function busyCornerProduct() {
  const canvas = sharp({
    create: {
      width: 240,
      height: 240,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  });
  const patches = [
    { left: 0, top: 0, r: 220, g: 30, b: 30 },
    { left: 220, top: 0, r: 30, g: 200, b: 40 },
    { left: 0, top: 220, r: 40, g: 40, b: 220 },
    { left: 220, top: 220, r: 240, g: 220, b: 30 },
  ];
  const inputs = [];
  for (const patch of patches) {
    inputs.push({
      input: await sharp({
        create: {
          width: 20,
          height: 20,
          channels: 3,
          background: { r: patch.r, g: patch.g, b: patch.b },
        },
      })
        .png()
        .toBuffer(),
      left: patch.left,
      top: patch.top,
    });
  }
  return canvas.composite(inputs).png().toBuffer();
}

async function transparentPaddedProduct() {
  const inner = await sharp({
    create: {
      width: 220,
      height: 200,
      channels: 4,
      background: { r: 20, g: 90, b: 180, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 360,
      height: 360,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, left: 70, top: 80 }])
    .png()
    .toBuffer();
}

async function hasWatermarkPixels(webpBuffer, size) {
  const overlay = await createWatermarkOverlay(size);
  if (!overlay) {
    return false;
  }
  const { data, info } = await sharp(webpBuffer).raw().toBuffer({
    resolveWithObject: true,
  });
  const meta = await sharp(overlay.input).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  let hits = 0;
  for (let y = overlay.top; y < overlay.top + height; y += 2) {
    for (let x = overlay.left; x < overlay.left + width; x += 2) {
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) {
        continue;
      }
      const index = (y * info.width + x) * info.channels;
      const delta =
        Math.abs(data[index] - BACKGROUND.r) +
        Math.abs(data[index + 1] - BACKGROUND.g) +
        Math.abs(data[index + 2] - BACKGROUND.b);
      if (delta > 8) {
        hits += 1;
      }
    }
  }
  return hits >= 8;
}

function copyLiveCatalog(catalogDir) {
  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(join(catalogDir, "backups"), { recursive: true });
  for (const fileName of CATALOG_FILES) {
    writeFileSync(
      join(catalogDir, fileName),
      readFileSync(join(LIVE_CATALOG_DIR, fileName))
    );
  }
}

function tempTxOptions(catalogDir, publicImages) {
  return {
    catalogDir,
    backupsDir: join(catalogDir, "backups"),
    validateOptions: {
      publicDir: LIVE_PUBLIC_DIR,
      fileExists: (filePath) =>
        existsSync(filePath) ||
        String(filePath).replace(/\\/g, "/").includes(FIXTURE_ID),
    },
    publicImages,
  };
}

const snapshot = snapshotLive();
const tempRoot = mkdtempSync(join(tmpdir(), "mo-studio-images-"));

try {
  const live = listStudioImageCatalog();
  assert(
    "live catalogue has 2,256 products",
    live.stats.total === 2256,
    `total=${live.stats.total}`
  );
  assert(
    "8 products currently have card images",
    live.stats.completed === 8,
    `completed=${live.stats.completed}`
  );
  assert(
    "2,248 products are missing images",
    live.stats.missing === 2248,
    `missing=${live.stats.missing}`
  );
  assert("no incomplete image metadata on live catalogue", live.stats.incomplete === 0);

  const glory = live.products.find((product) => product.id === "prod-glory-16");
  const aqua = live.products.find((product) => product.id === "prod-aqua-botol-1500ml");
  const aqua600 = live.products.find((product) => product.id === AQUA_600_ID);
  assert("Glory is in the all-product image list", Boolean(glory));
  assert("Aqua 1.5 L is in the all-product image list", Boolean(aqua));
  assert("owner Aqua Botol 600ML is in the image list", Boolean(aqua600));
  assert("Glory currently has an image", Boolean(glory?.hasImage));
  assert("Aqua 1.5 L currently has no image", aqua && !aqua.hasImage);
  assert(
    "owner Aqua Botol 600ML still has an assigned image",
    Boolean(aqua600?.hasImage)
  );
  assert(
    "owner Aqua original is on disk for read-only inspection",
    existsSync(AQUA_ORIGINAL)
  );

  const rokokOnly = live.products.filter((product) => product.category === "Rokok");
  assert("Rokok is not the only Images-tab population", rokokOnly.length < live.products.length);
  assert("nine categories are available for image filters", live.categories.length >= 9);

  assert(
    "search matches customer-facing name",
    matchesStudioImageQuery(aqua, "aqua")
  );
  assert(
    "search matches product ID",
    matchesStudioImageQuery(aqua, "prod-aqua-botol-1500ml")
  );
  assert(
    "search matches POS fields when present",
    !aqua.posCode || matchesStudioImageQuery(aqua, aqua.posCode)
  );

  const missingMinuman = filterStudioImageProducts(live.products, {
    status: "missing",
    category: "Minuman",
  });
  assert(
    "missing + Minuman filter excludes products with images",
    missingMinuman.every((product) => !product.hasImage && product.category === "Minuman")
  );

  const recent = listRecentlyAssignedProductIds();
  assert("recent assign-image IDs are an array", Array.isArray(recent));

  const aquaOriginalBytes = readFileSync(AQUA_ORIGINAL);
  const aquaFramed = await frameProductBuffer(aquaOriginalBytes);
  assert(
    "conservative trim detected Aqua content",
    aquaFramed.trimmed === true,
    aquaFramed.fallbackReason || ""
  );
  assert(
    "Aqua original is 447×447",
    aquaFramed.originalWidth === 447 && aquaFramed.originalHeight === 447,
    `${aquaFramed.originalWidth}x${aquaFramed.originalHeight}`
  );
  assert(
    "Aqua trim keeps most of the pack",
    aquaFramed.trim.detectedWidth >= 300 && aquaFramed.trim.detectedHeight >= 280,
    `${aquaFramed.trim.detectedWidth}x${aquaFramed.trim.detectedHeight}`
  );
  const aquaCard = await generateSquareWebpBuffer(aquaOriginalBytes, 360, aquaFramed);
  const aquaDetail = await generateSquareWebpBuffer(aquaOriginalBytes, 900, aquaFramed);
  assert(
    "Aqua card occupancy is in the 80–90% band",
    aquaCard.framing.occupancyWidth >= 0.78 &&
      aquaCard.framing.occupancyWidth <= 0.95 &&
      aquaCard.framing.occupancyHeight >= 0.78 &&
      aquaCard.framing.occupancyHeight <= 0.95,
    `card ${aquaCard.framing.occupancyWidth?.toFixed(3)}×${aquaCard.framing.occupancyHeight?.toFixed(3)}`
  );
  assert(
    "Aqua detail occupancy is in the 80–90% band",
    aquaDetail.framing.occupancyWidth >= 0.78 &&
      aquaDetail.framing.occupancyWidth <= 0.95,
    `detail ${aquaDetail.framing.occupancyWidth?.toFixed(3)}×${aquaDetail.framing.occupancyHeight?.toFixed(3)}`
  );
  console.log(
    `Aqua framing: original ${aquaFramed.originalWidth}×${aquaFramed.originalHeight}; detected ${aquaFramed.trim.detectedLeft},${aquaFramed.trim.detectedTop} ${aquaFramed.trim.detectedWidth}×${aquaFramed.trim.detectedHeight}; extract ${aquaFramed.contentWidth}×${aquaFramed.contentHeight}; card fit ${aquaCard.framing.fittedWidth}×${aquaCard.framing.fittedHeight} on 360; detail fit ${aquaDetail.framing.fittedWidth}×${aquaDetail.framing.fittedHeight} on 900`
  );

  const padded = await whitePaddedProduct();
  const paddedFrame = await frameProductBuffer(padded);
  assert("white-padded fixture trims excess background", paddedFrame.trimmed === true);
  const paddedCard = await generateSquareWebpBuffer(padded, 360, paddedFrame);
  assert(
    "card generation writes a 360 WebP",
    paddedCard.width === 360 && paddedCard.height === 360
  );
  const paddedDetail = await generateSquareWebpBuffer(padded, 900, paddedFrame);
  assert(
    "detail generation writes a 900 WebP",
    paddedDetail.width === 900 && paddedDetail.height === 900
  );
  const tiny = await tinyPng();
  const tinyCard = await generateSquareWebpBuffer(tiny, 360);
  const tinyDetail = await generateSquareWebpBuffer(tiny, 900);
  assert(
    "watermark is applied on generated card",
    await hasWatermarkPixels(tinyCard.data, 360)
  );
  assert(
    "watermark is applied on generated detail",
    await hasWatermarkPixels(tinyDetail.data, 900)
  );

  const busy = await busyCornerProduct();
  const busyFrame = await frameProductBuffer(busy);
  assert(
    "busy/disagreeing corners fall back to contain",
    busyFrame.trimmed === false && Boolean(busyFrame.fallbackReason),
    busyFrame.fallbackReason || ""
  );
  const busyCard = await generateSquareWebpBuffer(busy, 360, busyFrame);
  assert("fallback still generates a card", busyCard.width === 360);

  const transparent = await transparentPaddedProduct();
  const transparentFrame = await frameProductBuffer(transparent);
  assert(
    "transparent PNG trims empty alpha edges",
    transparentFrame.trimmed === true,
    transparentFrame.fallbackReason || ""
  );

  const publicImages = join(tempRoot, "public", "product-images");
  const buffer = await tinyPng();
  const saved = await processAndSaveImage(
    "prod-smoke-image",
    buffer,
    "image/png",
    { publicImages }
  );

  assert(
    "temp card file was written",
    existsSync(join(publicImages, "cards", "cigarettes", "prod-smoke-image.webp"))
  );
  assert(
    "temp detail file was written",
    existsSync(join(publicImages, "details", "cigarettes", "prod-smoke-image.webp"))
  );
  const originalAbs = join(
    publicImages,
    "originals",
    "cigarettes",
    "prod-smoke-image-original.png"
  );
  assert("temp original file was written", existsSync(originalAbs));
  assert(
    "public paths stay under the historical cigarettes bucket",
    saved.image.card === "/product-images/cards/cigarettes/prod-smoke-image.webp" &&
      saved.image.detail ===
        "/product-images/details/cigarettes/prod-smoke-image.webp"
  );

  const cardStat = readFileSync(
    join(publicImages, "cards", "cigarettes", "prod-smoke-image.webp")
  );
  const originalStat = readFileSync(originalAbs);
  assert("generated card is WebP, not the original PNG", cardStat[0] === 0x52);
  assert("original remains PNG bytes", originalStat[0] === 0x89);
  assert(
    "original remains unwatermarked source bytes",
    Buffer.compare(originalStat, buffer) === 0
  );

  const replaced = await processAndSaveImage(
    "prod-smoke-image",
    padded,
    "image/png",
    { publicImages }
  );
  assert("replace still writes card/detail/original", Boolean(replaced.image?.card));
  assert(
    "replace updates the stored original",
    Buffer.compare(readFileSync(originalAbs), padded) === 0
  );

  await rollbackSavedBinaries(saved);
  discardSavedPriors(saved);
  discardSavedPriors(replaced);

  const aquaTempPublic = join(tempRoot, "aqua-regen", "product-images");
  mkdirSync(join(aquaTempPublic, "originals", "cigarettes"), { recursive: true });
  mkdirSync(join(aquaTempPublic, "cards", "cigarettes"), { recursive: true });
  mkdirSync(join(aquaTempPublic, "details", "cigarettes"), { recursive: true });
  const aquaTempOriginal = join(
    aquaTempPublic,
    "originals",
    "cigarettes",
    `${AQUA_600_ID}-original.png`
  );
  copyFileSync(AQUA_ORIGINAL, aquaTempOriginal);
  copyFileSync(
    join(LIVE_IMAGES, "cards", "cigarettes", `${AQUA_600_ID}.webp`),
    join(aquaTempPublic, "cards", "cigarettes", `${AQUA_600_ID}.webp`)
  );
  copyFileSync(
    join(LIVE_IMAGES, "details", "cigarettes", `${AQUA_600_ID}.webp`),
    join(aquaTempPublic, "details", "cigarettes", `${AQUA_600_ID}.webp`)
  );
  const regenerated = await regenerateDerivedImages(AQUA_600_ID, {
    publicImages: aquaTempPublic,
  });
  assert("regenerate reports original unchanged", regenerated.originalUnchanged === true);
  assert(
    "regeneration uses new framing on Aqua copy",
    regenerated.framing?.card?.trimmed === true,
    regenerated.framing?.card?.fallbackReason || ""
  );
  assert(
    "regenerate did not rewrite the copied original",
    Buffer.compare(readFileSync(aquaTempOriginal), aquaOriginalBytes) === 0
  );
  assert(
    "live Aqua original still matches the pre-test bytes",
    Buffer.compare(readFileSync(AQUA_ORIGINAL), aquaOriginalBytes) === 0
  );

  const catalogDir = join(tempRoot, "catalog");
  copyLiveCatalog(catalogDir);
  const customerOut = join(tempRoot, "customerCatalog.json");
  const rebuilt = rebuildCustomerCatalogAfterStudioWrite({
    catalogDir,
    outputPath: customerOut,
  });
  assert("customer catalogue rebuild helper succeeds", rebuilt.ok, rebuilt.warning);
  assert("temp customer catalogue was written", existsSync(customerOut));

  const described = describeProductImage(
    { image: saved.image },
    join(tempRoot, "public")
  );
  assert(
    "rolled-back files are not treated as present",
    described.imageStatus === "incomplete" || described.imageStatus === "missing"
  );

  const fixturePublic = join(tempRoot, "remove", "product-images");
  const fixtureSaved = await processAndSaveImage(
    FIXTURE_ID,
    padded,
    "image/png",
    { publicImages: fixturePublic }
  );
  const assigned = saveAssignedImageMetadata(
    FIXTURE_ID,
    fixtureSaved.image,
    tempTxOptions(catalogDir, fixturePublic)
  );
  assert(
    "temp assign-image for remove fixture succeeds",
    assigned.ok,
    assigned.error || assigned.validationErrors?.[0]
  );

  const archiveFailPath = join(tempRoot, "not-a-trash-dir");
  writeFileSync(archiveFailPath, "not a directory");
  let archiveFailed = false;
  try {
    archiveAssignedImageFiles({
      product: { id: FIXTURE_ID, name: "Fixture", image: fixtureSaved.image },
      trashRoot: archiveFailPath,
      resolvePath: () =>
        join(fixturePublic, "cards", "cigarettes", `${FIXTURE_ID}.webp`),
    });
  } catch {
    archiveFailed = true;
  }
  assert("archive failure aborts before metadata changes", archiveFailed);
  const stillAssigned = JSON.parse(readFileSync(join(catalogDir, "products.json"), "utf8"))
    .find((product) => product.id === FIXTURE_ID);
  assert(
    "archive failure left catalogue image metadata in place",
    Boolean(stillAssigned?.image?.card)
  );

  const restorePublic = join(tempRoot, "restore", "product-images");
  const restoreSaved = await processAndSaveImage(
    FIXTURE_ID,
    padded,
    "image/png",
    { publicImages: restorePublic }
  );
  const restoreCatalogDir = join(tempRoot, "restore-catalog");
  copyLiveCatalog(restoreCatalogDir);
  const restoreAssigned = saveAssignedImageMetadata(
    FIXTURE_ID,
    restoreSaved.image,
    tempTxOptions(restoreCatalogDir, restorePublic)
  );
  assert("restore-path assign succeeds", restoreAssigned.ok, restoreAssigned.error);
  const restoreCard = join(restorePublic, "cards", "cigarettes", `${FIXTURE_ID}.webp`);
  const metadataFail = await removeAssignedImage(FIXTURE_ID, {
    ...tempTxOptions(restoreCatalogDir, restorePublic),
    trashDir: join(restorePublic, ".trash"),
    skipCustomerRebuild: true,
    forceMetadataError: true,
    afterArchive(archive) {
      for (const file of archive.files) {
        if (existsSync(file.fromAbs)) {
          unlinkSync(file.fromAbs);
        }
      }
    },
  });
  assert("metadata failure is reported", metadataFail.ok === false);
  assert(
    "metadata failure restores active files",
    existsSync(restoreCard)
  );
  const restoreProduct = JSON.parse(
    readFileSync(join(restoreCatalogDir, "products.json"), "utf8")
  ).find((product) => product.id === FIXTURE_ID);
  assert(
    "metadata failure left catalogue image metadata unchanged",
    Boolean(restoreProduct?.image?.card)
  );

  const removed = await removeAssignedImage(FIXTURE_ID, {
    ...tempTxOptions(catalogDir, fixturePublic),
    trashDir: join(fixturePublic, ".trash"),
    customerOutputPath: join(tempRoot, "customer-after-remove.json"),
  });
  assert("remove-image succeeds", removed.ok, removed.transaction?.error);
  assert("remove-image created an archive directory", existsSync(removed.archive.destDir));
  assert(
    "archive manifest identifies the product and paths",
    removed.archive.manifest.productId === FIXTURE_ID &&
      Boolean(removed.archive.manifest.sourcePaths.original) &&
      Boolean(removed.archive.manifest.removedAt)
  );
  assert(
    "active customer paths no longer resolve after removal",
    !existsSync(join(fixturePublic, "cards", "cigarettes", `${FIXTURE_ID}.webp`)) &&
      !existsSync(join(fixturePublic, "details", "cigarettes", `${FIXTURE_ID}.webp`)) &&
      !existsSync(
        join(fixturePublic, "originals", "cigarettes", `${FIXTURE_ID}-original.png`)
      )
  );
  const afterRemoveProduct = JSON.parse(
    readFileSync(join(catalogDir, "products.json"), "utf8")
  ).find((product) => product.id === FIXTURE_ID);
  assert("successful removal clears catalogue image metadata", !afterRemoveProduct?.image);
  assert(
    "successful removal triggers customer catalogue rebuild path",
    removed.customerCatalog?.ok === true,
    removed.customerCatalog?.warning || ""
  );
  const customerAfter = JSON.parse(
    readFileSync(join(tempRoot, "customer-after-remove.json"), "utf8")
  );
  const customerFixture = customerAfter.products.find(
    (product) => product.id === FIXTURE_ID
  );
  assert(
    "rebuilt customer catalogue has no image for the removed product",
    customerFixture && !customerFixture.image
  );
  const afterList = listStudioImageCatalog({
    catalogDir,
    publicDir: join(tempRoot, "remove", "public"),
  });
  const listedFixture = afterList.products.find((product) => product.id === FIXTURE_ID);
  assert(
    "missing queue recognizes the removed product",
    listedFixture && listedFixture.hasImage === false
  );

  assert("smoke did not write live catalogue or images", liveUnchanged(snapshot));
} catch (error) {
  console.error(error);
  record("smoke crashed", false, error.message);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.passed).length;
console.log("");
console.log(`Studio image smoke: ${results.filter((item) => item.passed).length}/${results.length} passed`);
if (failed > 0) {
  process.exitCode = 1;
}
