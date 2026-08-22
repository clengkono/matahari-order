/**
 * Matahari Catalogue Studio — local image service
 *
 * LOCAL ONLY. Binds to 127.0.0.1. Do not deploy publicly.
 */

import { createServer } from "node:http";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { loadCatalog, runCatalogTransaction } from "./catalogTransaction.js";
import { createWatermarkOverlay } from "./imageWatermark.js";
import {
  getAllowedCategories,
  getStudioProduct,
  listStudioProducts,
  parseProductMetadataPatch,
  updateProductMetadata,
} from "./studioProductMetadata.js";

sharp.cache(false);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HOST = "127.0.0.1";
const PORT = 8787;
const MAX_BYTES = 15 * 1024 * 1024;
const METADATA_MAX_BYTES = 64 * 1024;
const CIGARETTE_CATEGORY = "Rokok";
const BACKGROUND = { r: 237, g: 232, b: 225, alpha: 1 }; // #EDE8E1
const WEBP_QUALITY = 82;
const CARD_SIZE = 360;
const DETAIL_SIZE = 900;
const PRODUCT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const REPLACE_MAX_ATTEMPTS = 8;
const REPLACE_RETRY_MS = [25, 50, 100, 200, 400, 800, 1200, 2000];
const WINDOWS_LOCK_CODES = new Set([
  "EPERM",
  "EBUSY",
  "EACCES",
  "EAGAIN",
  "UNKNOWN",
  "EINVAL",
]);

const PRODUCTS_PATH = join(ROOT, "src", "catalog", "products.json");
const BACKUPS_DIR = join(ROOT, "src", "catalog", "backups");
const PUBLIC_IMAGES = join(ROOT, "public", "product-images");

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ACCEPTED_FORMATS = new Set(["jpeg", "jpg", "png", "webp"]);

function ensureDirs() {
  const dirs = [
    join(PUBLIC_IMAGES, "originals", "cigarettes"),
    join(PUBLIC_IMAGES, "cards", "cigarettes"),
    join(PUBLIC_IMAGES, "details", "cigarettes"),
    BACKUPS_DIR,
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(Object.assign(new Error("File exceeds 15 MB limit."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolveBody(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function loadProducts() {
  const raw = readFileSync(PRODUCTS_PATH, "utf8");
  const products = JSON.parse(raw);
  if (!Array.isArray(products)) {
    throw new Error("products.json must contain an array.");
  }
  return products;
}

function isCigaretteProduct(product) {
  return product && product.category === CIGARETTE_CATEGORY;
}

function hasCardImage(product) {
  return Boolean(product?.image?.card);
}

function validateProductId(productId) {
  if (typeof productId !== "string" || !PRODUCT_ID_PATTERN.test(productId)) {
    return "Invalid product ID.";
  }
  if (productId.includes("..") || productId.includes("/") || productId.includes("\\")) {
    return "Invalid product ID.";
  }
  return null;
}

function publicPath(relativeFromPublic) {
  return `/${relativeFromPublic.replace(/\\/g, "/")}`;
}

function resolvePublicImagePath(publicUrl) {
  if (typeof publicUrl !== "string" || !publicUrl.startsWith("/product-images/")) {
    return null;
  }

  const segments = publicUrl.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return null;
  }

  const absolute = resolve(join(ROOT, "public", ...segments));
  const imagesRoot = resolve(PUBLIC_IMAGES);
  const prefix = imagesRoot.endsWith(sep) ? imagesRoot : imagesRoot + sep;
  if (absolute !== imagesRoot && !absolute.startsWith(prefix)) {
    return null;
  }
  return absolute;
}

function findOriginalAbsolutePath(product) {
  const fromMeta = resolvePublicImagePath(product?.image?.original);
  if (fromMeta) {
    return existsSync(fromMeta) ? fromMeta : null;
  }

  if (!product?.id) {
    return null;
  }

  for (const ext of Object.keys(EXT_TO_MIME)) {
    const candidate = join(
      PUBLIC_IMAGES,
      "originals",
      "cigarettes",
      `${product.id}-original.${ext}`
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function cigaretteSummary(products) {
  const cigarettes = products
    .filter(isCigaretteProduct)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "id"));

  const completed = cigarettes.filter(hasCardImage).length;
  const total = cigarettes.length;
  const missing = total - completed;

  return {
    stats: { total, completed, missing },
    products: cigarettes.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      hasImage: hasCardImage(product),
      image: product.image ?? null,
    })),
  };
}

/**
 * Persist image metadata through the catalogue transaction layer.
 * Binary card/detail/original files must already be on disk so catalog:check
 * image-path validation can pass.
 *
 * Remaining limitation: if this JSON write fails after processAndSaveImage
 * succeeded, derived/original files may already have been replaced. The
 * binary pipeline keeps its own prior/restore; it is not one atomic
 * binary+JSON transaction.
 */
export function saveAssignedImageMetadata(productId, image, options = {}) {
  return runCatalogTransaction({
    action: "assign-image",
    productIds: [productId],
    summary: `Assigned image metadata for ${productId}`,
    mutate(catalog) {
      const product = catalog.products.find((entry) => entry.id === productId);
      if (!product) {
        throw new Error("Product ID not found in catalogue.");
      }

      product.image = {
        card: image.card,
        detail: image.detail,
        original: image.original,
      };
    },
    ...options,
  });
}

let tempSeq = 0;

function uniqueTempPath(dir, baseName, suffix) {
  tempSeq += 1;
  return join(dir, `${baseName}.${process.pid}.${Date.now()}.${tempSeq}.${suffix}`);
}

function basenameSafe(filePath) {
  return filePath.split(/[/\\]/).pop() || "file";
}

function dropTemp(temps, filePath) {
  const index = temps.indexOf(filePath);
  if (index >= 0) {
    temps.splice(index, 1);
  }
}

function safeUnlink(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return;
  }
  try {
    unlinkSync(filePath);
  } catch (error) {
    console.error("[studio] cleanup failed:", basenameSafe(filePath), error.message);
  }
}

function isTransientWindowsLock(error) {
  if (!error) {
    return false;
  }
  if (WINDOWS_LOCK_CODES.has(error.code) || error.code === "EINVAL") {
    return true;
  }
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("ebusy") ||
    message.includes("eperm") ||
    message.includes("eacces") ||
    message.includes("EINVAL".toLowerCase()) ||
    message.includes("resource busy") ||
    message.includes("being used by another process") ||
    message.includes("user-mapped section") ||
    message.includes("unable to open for write") ||
    message.includes("invalid argument") ||
    message.includes("permission denied")
  );
}

function userFacingImageError(error) {
  const message = String(error?.message || "");
  const lower = message.toLowerCase();

  if (error?.userSafe && message) {
    return message;
  }

  // Never return raw Windows paths to the Studio UI.
  if (/[A-Za-z]:[\\/]/.test(message) || message.includes("product-images")) {
    console.error("[studio] sanitized filesystem error:", message);
    if (lower.includes("unable to open for write") || isTransientWindowsLock(error)) {
      return "Could not replace the image file. Close programs that may be using it and try again.";
    }
    return "Image processing failed. Please try again.";
  }

  if (
    error?.status === 415 ||
    lower.includes("unsupported") ||
    lower.includes("invalid image contents")
  ) {
    return message || "Invalid image.";
  }
  if (lower.includes("unable to open for write") || isTransientWindowsLock(error)) {
    return "Could not replace the image file. Close programs that may be using it and try again.";
  }
  if (lower.includes("failed to generate") || lower.includes("invalid processed")) {
    return "Image processing failed. Please try another file.";
  }
  if (lower.includes("previous image was kept") || lower.includes("replacement failed")) {
    return "Image replacement failed. The previous image was kept.";
  }
  if (message && message.length < 160) {
    return message;
  }
  return "Image processing failed. Please try again.";
}

async function withReplaceRetry(label, operation) {
  let lastError;
  for (let attempt = 0; attempt < REPLACE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = isTransientWindowsLock(error);
      console.error(
        `[studio] ${label} attempt ${attempt + 1}/${REPLACE_MAX_ATTEMPTS} failed:`,
        error.code || "",
        error.message
      );
      if (!retryable || attempt === REPLACE_MAX_ATTEMPTS - 1) {
        break;
      }
      await delay(REPLACE_RETRY_MS[attempt] ?? 400);
    }
  }
  throw lastError;
}

/**
 * Windows-safe destination replace:
 * temp ready → remove/rename existing destination → rename temp to final.
 * Never writes Sharp output directly onto the final path.
 */
async function replaceDestination(tempPath, destPath) {
  if (!existsSync(tempPath)) {
    throw new Error("Temporary image file is missing.");
  }

  await withReplaceRetry(`replace ${basenameSafe(destPath)}`, async () => {
    if (!existsSync(tempPath)) {
      throw new Error("Temporary image file is missing.");
    }

    const backupPath = uniqueTempPath(
      dirname(destPath),
      `${basenameSafe(destPath)}.bak`,
      "tmp"
    );
    let movedAside = false;

    try {
      if (existsSync(destPath)) {
        try {
          renameSync(destPath, backupPath);
          movedAside = true;
        } catch (renameError) {
          // Fallback when rename-away is blocked: delete destination with retries.
          try {
            rmSync(destPath, { force: true, maxRetries: 5, retryDelay: 50 });
          } catch {
            try {
              unlinkSync(destPath);
            } catch {
              throw renameError;
            }
          }
        }
      }

      renameSync(tempPath, destPath);
    } catch (error) {
      if (movedAside && existsSync(backupPath) && !existsSync(destPath)) {
        try {
          renameSync(backupPath, destPath);
        } catch (restoreError) {
          console.error(
            "[studio] restore after rename failure:",
            basenameSafe(destPath),
            restoreError.message
          );
        }
      }
      throw error;
    }

    safeUnlink(backupPath);
  });
}

async function restoreDestination(priorPath, destPath, label) {
  if (!priorPath || !existsSync(priorPath)) {
    return;
  }

  await withReplaceRetry(`restore ${label}`, async () => {
    if (existsSync(destPath)) {
      const stalePath = uniqueTempPath(
        dirname(destPath),
        `${basenameSafe(destPath)}.stale`,
        "tmp"
      );
      try {
        renameSync(destPath, stalePath);
        safeUnlink(stalePath);
      } catch {
        try {
          rmSync(destPath, { force: true, maxRetries: 5, retryDelay: 50 });
        } catch {
          unlinkSync(destPath);
        }
      }
    }
    copyFileSync(priorPath, destPath);
  });
}

async function generateSquareWebpBuffer(sourceBuffer, size) {
  const resized = await sharp(sourceBuffer)
    .rotate()
    .resize(size, size, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer({ resolveWithObject: true });

  const layers = [
    {
      input: resized.data,
      gravity: "centre",
    },
  ];

  const watermark = await createWatermarkOverlay(size);
  if (watermark) {
    layers.push(watermark);
  }

  const output = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite(layers)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
  };
}

async function writeProcessedTemp(dir, baseName, imageBuffer, expectedWidth) {
  // Validate from the in-memory buffer so Sharp does not lock the temp file on Windows.
  let meta;
  try {
    meta = await sharp(imageBuffer).metadata();
  } catch {
    throw new Error("Invalid processed image.");
  }

  if (
    meta.format !== "webp" ||
    meta.width !== expectedWidth ||
    meta.height !== expectedWidth
  ) {
    throw new Error("Invalid processed image.");
  }

  const tempPath = uniqueTempPath(dir, baseName, "webp.tmp");
  writeFileSync(tempPath, imageBuffer);

  if (!existsSync(tempPath) || statSync(tempPath).size < 32) {
    safeUnlink(tempPath);
    throw new Error("Failed to generate temporary image file.");
  }

  return {
    tempPath,
    width: meta.width,
    height: meta.height,
  };
}

async function processAndSaveImage(productId, buffer, mimeType) {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    const error = new Error("Unsupported file type. Use JPEG, PNG, or WebP.");
    error.status = 415;
    throw error;
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    const error = new Error("Invalid image contents.");
    error.status = 415;
    throw error;
  }

  const format = (metadata.format || "").toLowerCase();
  if (!ACCEPTED_FORMATS.has(format)) {
    const error = new Error("Unsupported file type. Use JPEG, PNG, or WebP.");
    error.status = 415;
    throw error;
  }

  ensureDirs();

  const originalsDir = join(PUBLIC_IMAGES, "originals", "cigarettes");
  const cardsDir = join(PUBLIC_IMAGES, "cards", "cigarettes");
  const detailsDir = join(PUBLIC_IMAGES, "details", "cigarettes");

  const originalName = `${productId}-original.${ext}`;
  const cardName = `${productId}.webp`;
  const detailName = `${productId}.webp`;

  const originalAbs = join(originalsDir, originalName);
  const cardAbs = join(cardsDir, cardName);
  const detailAbs = join(detailsDir, detailName);

  // Guard against unexpected path escape even after ID validation.
  const resolvedOriginal = resolve(originalAbs);
  if (!resolvedOriginal.startsWith(resolve(originalsDir))) {
    const error = new Error("Invalid product ID.");
    error.status = 400;
    throw error;
  }

  const temps = [];
  const priors = [];
  let cardTemp;
  let detailTemp;
  let originalTemp;
  let cardReplaced = false;
  let detailReplaced = false;
  let originalReplaced = false;
  let priorCard = null;
  let priorDetail = null;
  let priorOriginal = null;

  try {
    // Fully await Sharp into buffers first — never write onto final paths.
    const cardProcessed = await generateSquareWebpBuffer(buffer, CARD_SIZE);
    const detailProcessed = await generateSquareWebpBuffer(buffer, DETAIL_SIZE);

    cardTemp = await writeProcessedTemp(
      cardsDir,
      cardName,
      cardProcessed.data,
      CARD_SIZE
    );
    temps.push(cardTemp.tempPath);

    detailTemp = await writeProcessedTemp(
      detailsDir,
      detailName,
      detailProcessed.data,
      DETAIL_SIZE
    );
    temps.push(detailTemp.tempPath);

    originalTemp = uniqueTempPath(originalsDir, originalName, "orig.tmp");
    writeFileSync(originalTemp, buffer);
    temps.push(originalTemp);

    if (!existsSync(originalTemp) || statSync(originalTemp).size === 0) {
      throw new Error("Failed to generate temporary original file.");
    }

    // Snapshot existing finals only after both processed images are ready.
    if (existsSync(cardAbs)) {
      priorCard = uniqueTempPath(cardsDir, `${cardName}.prior`, "bak");
      copyFileSync(cardAbs, priorCard);
      priors.push(priorCard);
    }
    if (existsSync(detailAbs)) {
      priorDetail = uniqueTempPath(detailsDir, `${detailName}.prior`, "bak");
      copyFileSync(detailAbs, priorDetail);
      priors.push(priorDetail);
    }
    if (existsSync(originalAbs)) {
      priorOriginal = uniqueTempPath(originalsDir, `${originalName}.prior`, "bak");
      copyFileSync(originalAbs, priorOriginal);
      priors.push(priorOriginal);
    }

    const otherOriginals = [];
    for (const oldExt of Object.keys(EXT_TO_MIME)) {
      const candidate = join(originalsDir, `${productId}-original.${oldExt}`);
      if (candidate !== originalAbs && existsSync(candidate)) {
        otherOriginals.push(candidate);
      }
    }

    await replaceDestination(cardTemp.tempPath, cardAbs);
    cardReplaced = true;
    dropTemp(temps, cardTemp.tempPath);

    await replaceDestination(detailTemp.tempPath, detailAbs);
    detailReplaced = true;
    dropTemp(temps, detailTemp.tempPath);

    await replaceDestination(originalTemp, originalAbs);
    originalReplaced = true;
    dropTemp(temps, originalTemp);

    for (const stale of otherOriginals) {
      safeUnlink(stale);
    }

    for (const prior of priors) {
      safeUnlink(prior);
    }
    priors.length = 0;

    const image = {
      card: publicPath(`product-images/cards/cigarettes/${cardName}`),
      detail: publicPath(`product-images/details/cigarettes/${detailName}`),
      original: publicPath(`product-images/originals/cigarettes/${originalName}`),
    };

    return {
      image,
      cardInfo: { width: cardTemp.width, height: cardTemp.height },
      detailInfo: { width: detailTemp.width, height: detailTemp.height },
    };
  } catch (error) {
    console.error("[studio] image save/replace failed:", error);

    try {
      if (cardReplaced) {
        await restoreDestination(priorCard, cardAbs, "card");
      }
      if (detailReplaced) {
        await restoreDestination(priorDetail, detailAbs, "detail");
      }
      if (originalReplaced) {
        await restoreDestination(priorOriginal, originalAbs, "original");
      }
    } catch (restoreError) {
      console.error("[studio] restore after failure also failed:", restoreError);
      const wrapped = new Error(
        "Image replacement failed. The previous image was kept."
      );
      wrapped.status = 500;
      wrapped.userSafe = true;
      throw wrapped;
    }

    if (error.status) {
      error.userSafe = true;
      throw error;
    }

    const wrapped = new Error(userFacingImageError(error));
    wrapped.status = 500;
    wrapped.userSafe = true;
    throw wrapped;
  } finally {
    for (const tempPath of temps) {
      safeUnlink(tempPath);
    }
    for (const prior of priors) {
      safeUnlink(prior);
    }
  }
}

async function regenerateDerivedImages(productId) {
  const idError = validateProductId(productId);
  if (idError) {
    const error = new Error(idError);
    error.status = 400;
    error.userSafe = true;
    throw error;
  }

  let products;
  try {
    products = loadProducts();
  } catch (error) {
    const wrapped = new Error(error.message || "Failed to read catalogue.");
    wrapped.status = 500;
    wrapped.userSafe = true;
    throw wrapped;
  }

  const product = products.find((entry) => entry.id === productId);
  if (!product) {
    const error = new Error("Product ID not found in catalogue.");
    error.status = 404;
    error.userSafe = true;
    throw error;
  }

  if (!isCigaretteProduct(product)) {
    const error = new Error("Studio Version 1 only accepts cigarette products.");
    error.status = 400;
    error.userSafe = true;
    throw error;
  }

  if (!product.image?.original && !hasCardImage(product)) {
    const error = new Error("This product has no image to regenerate.");
    error.status = 400;
    error.userSafe = true;
    throw error;
  }

  const originalAbs = findOriginalAbsolutePath(product);
  if (!originalAbs) {
    const error = new Error(
      "Cannot regenerate: the original image file is missing. Card and detail were left unchanged."
    );
    error.status = 404;
    error.userSafe = true;
    throw error;
  }

  let buffer;
  try {
    buffer = readFileSync(originalAbs);
  } catch {
    const error = new Error(
      "Cannot regenerate: the original image file is missing. Card and detail were left unchanged."
    );
    error.status = 404;
    error.userSafe = true;
    throw error;
  }

  if (!buffer.length) {
    const error = new Error(
      "Cannot regenerate: the original image file is empty. Card and detail were left unchanged."
    );
    error.status = 400;
    error.userSafe = true;
    throw error;
  }

  ensureDirs();

  const cardsDir = join(PUBLIC_IMAGES, "cards", "cigarettes");
  const detailsDir = join(PUBLIC_IMAGES, "details", "cigarettes");
  const cardName = `${productId}.webp`;
  const detailName = `${productId}.webp`;
  const cardAbs = join(cardsDir, cardName);
  const detailAbs = join(detailsDir, detailName);

  const temps = [];
  const priors = [];
  let cardTemp;
  let detailTemp;
  let cardReplaced = false;
  let detailReplaced = false;
  let priorCard = null;
  let priorDetail = null;

  try {
    const cardProcessed = await generateSquareWebpBuffer(buffer, CARD_SIZE);
    const detailProcessed = await generateSquareWebpBuffer(buffer, DETAIL_SIZE);

    cardTemp = await writeProcessedTemp(
      cardsDir,
      cardName,
      cardProcessed.data,
      CARD_SIZE
    );
    temps.push(cardTemp.tempPath);

    detailTemp = await writeProcessedTemp(
      detailsDir,
      detailName,
      detailProcessed.data,
      DETAIL_SIZE
    );
    temps.push(detailTemp.tempPath);

    if (existsSync(cardAbs)) {
      priorCard = uniqueTempPath(cardsDir, `${cardName}.prior`, "bak");
      copyFileSync(cardAbs, priorCard);
      priors.push(priorCard);
    }
    if (existsSync(detailAbs)) {
      priorDetail = uniqueTempPath(detailsDir, `${detailName}.prior`, "bak");
      copyFileSync(detailAbs, priorDetail);
      priors.push(priorDetail);
    }

    await replaceDestination(cardTemp.tempPath, cardAbs);
    cardReplaced = true;
    dropTemp(temps, cardTemp.tempPath);

    await replaceDestination(detailTemp.tempPath, detailAbs);
    detailReplaced = true;
    dropTemp(temps, detailTemp.tempPath);

    for (const prior of priors) {
      safeUnlink(prior);
    }
    priors.length = 0;

    const image = {
      card: product.image?.card ?? publicPath(`product-images/cards/cigarettes/${cardName}`),
      detail:
        product.image?.detail ??
        publicPath(`product-images/details/cigarettes/${detailName}`),
      original: product.image?.original ?? publicPath(
        `product-images/originals/cigarettes/${basenameSafe(originalAbs)}`
      ),
    };

    return {
      productId,
      name: product.name,
      image,
      originalUnchanged: true,
      cardInfo: { width: cardTemp.width, height: cardTemp.height },
      detailInfo: { width: detailTemp.width, height: detailTemp.height },
    };
  } catch (error) {
    console.error("[studio] regenerate derived images failed:", error);

    try {
      if (cardReplaced) {
        await restoreDestination(priorCard, cardAbs, "card");
      }
      if (detailReplaced) {
        await restoreDestination(priorDetail, detailAbs, "detail");
      }
    } catch (restoreError) {
      console.error("[studio] restore after regenerate failure also failed:", restoreError);
      const wrapped = new Error(
        "Image replacement failed. The previous image was kept."
      );
      wrapped.status = 500;
      wrapped.userSafe = true;
      throw wrapped;
    }

    if (error.status) {
      error.userSafe = true;
      throw error;
    }

    const wrapped = new Error(userFacingImageError(error));
    wrapped.status = 500;
    wrapped.userSafe = true;
    throw wrapped;
  } finally {
    for (const tempPath of temps) {
      safeUnlink(tempPath);
    }
    for (const prior of priors) {
      safeUnlink(prior);
    }
  }
}

async function handleAssignImage(req, res, productId) {
  const idError = validateProductId(productId);
  if (idError) {
    sendJson(res, 400, { error: idError });
    return;
  }

  let body;
  try {
    body = await readBody(req, MAX_BYTES + 1024);
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message || "Upload failed." });
    return;
  }

  if (body.length === 0) {
    sendJson(res, 400, { error: "Empty upload." });
    return;
  }

  if (body.length > MAX_BYTES) {
    sendJson(res, 413, { error: "File exceeds 15 MB limit." });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "Expected JSON body with base64 image data." });
    return;
  }

  const mimeType = payload.mimeType;
  const data = payload.data;
  const replaceConfirmed = Boolean(payload.replaceConfirmed);

  if (typeof data !== "string" || data.length === 0) {
    sendJson(res, 400, { error: "Missing image data." });
    return;
  }

  if (!MIME_TO_EXT[mimeType]) {
    sendJson(res, 415, { error: "Unsupported file type. Use JPEG, PNG, or WebP." });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(data, "base64");
  } catch {
    sendJson(res, 400, { error: "Invalid image data." });
    return;
  }

  if (buffer.length === 0) {
    sendJson(res, 400, { error: "Invalid image data." });
    return;
  }

  if (buffer.length > MAX_BYTES) {
    sendJson(res, 413, { error: "File exceeds 15 MB limit." });
    return;
  }

  let products;
  try {
    products = loadProducts();
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to read catalogue." });
    return;
  }

  const index = products.findIndex((product) => product.id === productId);
  if (index === -1) {
    sendJson(res, 404, { error: "Product ID not found in catalogue." });
    return;
  }

  const product = products[index];
  if (!isCigaretteProduct(product)) {
    sendJson(res, 400, { error: "Studio Version 1 only accepts cigarette products." });
    return;
  }

  const replacing = hasCardImage(product);
  if (replacing && !replaceConfirmed) {
    sendJson(res, 409, {
      error: "Replace confirmation required for an existing image.",
      code: "REPLACE_CONFIRMATION_REQUIRED",
    });
    return;
  }

  try {
    const { image, cardInfo, detailInfo } = await processAndSaveImage(
      productId,
      buffer,
      mimeType
    );

    const transaction = saveAssignedImageMetadata(productId, image);
    if (!transaction.ok) {
      sendJson(res, transaction.code === "VALIDATION_FAILED" ? 400 : 500, {
        error:
          transaction.error ||
          "Image files were saved, but catalogue metadata could not be updated.",
        validationErrors: transaction.validationErrors,
        code: transaction.code || "CATALOG_WRITE_FAILED",
      });
      return;
    }

    const nextProducts = loadProducts();

    sendJson(res, 200, {
      ok: true,
      productId,
      name: product.name,
      image,
      replaced: replacing,
      backupId: transaction.backupId,
      backupPath: transaction.backupId
        ? `/src/catalog/backups/${transaction.backupId}`
        : "",
      dimensions: {
        card: cardInfo,
        detail: detailInfo,
      },
      stats: cigaretteSummary(nextProducts).stats,
    });
  } catch (error) {
    console.error("[studio] assign image failed:", error);
    sendJson(res, error.status || 500, {
      error: userFacingImageError(error),
    });
  }
}

function handleList(res) {
  try {
    const products = loadProducts();
    const summary = cigaretteSummary(products);
    sendJson(res, 200, {
      ...summary,
      warning:
        "LOCAL ONLY — This image service binds to 127.0.0.1 and must not be publicly deployed as-is.",
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to read catalogue." });
  }
}

function studioWarning() {
  return "LOCAL ONLY — This image service binds to 127.0.0.1 and must not be publicly deployed as-is.";
}

function handleListStudioProducts(res) {
  try {
    const catalog = loadCatalog();
    sendJson(res, 200, {
      products: listStudioProducts(catalog),
      categories: getAllowedCategories(catalog.products),
      warning: studioWarning(),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to read catalogue." });
  }
}

function handleStudioCategories(res) {
  try {
    const catalog = loadCatalog();
    sendJson(res, 200, {
      categories: getAllowedCategories(catalog.products),
      warning: studioWarning(),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to read catalogue." });
  }
}

function handleGetStudioProduct(res, productId) {
  const idError = validateProductId(productId);
  if (idError) {
    sendJson(res, 400, { error: idError });
    return;
  }

  try {
    const catalog = loadCatalog();
    const product = getStudioProduct(catalog, productId);
    if (!product) {
      sendJson(res, 404, { error: "Product not found.", code: "NOT_FOUND" });
      return;
    }

    sendJson(res, 200, {
      product,
      categories: getAllowedCategories(catalog.products),
      warning: studioWarning(),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to read catalogue." });
  }
}

function metadataStatus(result) {
  if (result.code === "BUSY") {
    return 409;
  }
  if (result.code === "NOT_FOUND") {
    return 404;
  }
  if (result.code === "INVALID_INPUT" || result.code === "VALIDATION_FAILED") {
    return 400;
  }
  return 500;
}

async function handleUpdateStudioProduct(req, res, productId) {
  const idError = validateProductId(productId);
  if (idError) {
    sendJson(res, 400, { error: idError });
    return;
  }

  let raw;
  try {
    raw = await readBody(req, METADATA_MAX_BYTES);
  } catch (error) {
    sendJson(res, error.status || 400, {
      error: error.message || "Could not read the save request.",
    });
    return;
  }

  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    sendJson(res, 400, {
      error: "Expected JSON with name and/or category.",
      code: "INVALID_INPUT",
    });
    return;
  }

  const parsed = parseProductMetadataPatch(body);
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error, code: parsed.code });
    return;
  }

  const result = updateProductMetadata({
    productId,
    ...parsed.patch,
  });

  if (!result.ok) {
    sendJson(res, metadataStatus(result), {
      error: result.error || "Could not save the product.",
      code: result.code,
      validationErrors: result.validationErrors,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    noop: Boolean(result.noop),
    product: result.product,
    nameChanged: result.nameChanged,
    categoryChanged: result.categoryChanged,
    previousName: result.previousName,
    previousCategory: result.previousCategory,
    name: result.name,
    category: result.category,
    summary: result.summary,
    changedFiles: result.changedFiles,
    backupId: result.backupId,
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found." });
}

ensureDirs();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const { pathname } = url;

  if (req.method === "GET" && pathname === "/api/studio/health") {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      warning:
        "LOCAL ONLY — Do not expose this service on public network interfaces.",
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/studio/cigarettes") {
    handleList(res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/studio/products") {
    handleListStudioProducts(res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/studio/categories") {
    handleStudioCategories(res);
    return;
  }

  const studioProductMatch = pathname.match(
    /^\/api\/studio\/products\/([^/]+)$/
  );
  if (req.method === "GET" && studioProductMatch) {
    handleGetStudioProduct(res, decodeURIComponent(studioProductMatch[1]));
    return;
  }
  if (req.method === "PATCH" && studioProductMatch) {
    await handleUpdateStudioProduct(
      req,
      res,
      decodeURIComponent(studioProductMatch[1])
    );
    return;
  }

  const assignMatch = pathname.match(
    /^\/api\/studio\/cigarettes\/([^/]+)\/image$/
  );
  if (req.method === "POST" && assignMatch) {
    const productId = decodeURIComponent(assignMatch[1]);
    await handleAssignImage(req, res, productId);
    return;
  }

  const regenerateMatch = pathname.match(
    /^\/api\/studio\/cigarettes\/([^/]+)\/image\/regenerate$/
  );
  if (req.method === "POST" && regenerateMatch) {
    const productId = decodeURIComponent(regenerateMatch[1]);
    await handleRegenerateImage(res, productId);
    return;
  }

  notFound(res);
});

async function handleRegenerateImage(res, productId) {
  try {
    const result = await regenerateDerivedImages(productId);
    let stats;
    try {
      stats = cigaretteSummary(loadProducts()).stats;
    } catch {
      stats = null;
    }

    sendJson(res, 200, {
      ok: true,
      productId: result.productId,
      name: result.name,
      image: result.image,
      regenerated: true,
      originalUnchanged: true,
      dimensions: {
        card: result.cardInfo,
        detail: result.detailInfo,
      },
      stats,
    });
  } catch (error) {
    console.error("[studio] regenerate image failed:", error);
    sendJson(res, error.status || 500, {
      error: userFacingImageError(error),
    });
  }
}

function isLaunchedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return resolve(fileURLToPath(import.meta.url)) === resolve(entry);
}

if (isLaunchedDirectly()) {
  server.listen(PORT, HOST, () => {
    console.log("Matahari Catalogue Studio — image service");
    console.log(`Listening on http://${HOST}:${PORT}`);
    console.log("LOCAL ONLY — do not deploy publicly.");
  });
}

export { regenerateDerivedImages, processAndSaveImage };
