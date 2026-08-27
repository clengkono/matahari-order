/**
 * Catalogue Studio image-management helpers.
 * Lists all products, never writes live catalogue JSON itself.
 * LOCAL ONLY.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCustomerCatalog } from "./buildCustomerCatalog.js";
import { loadCatalog } from "./catalogTransaction.js";
import {
  getAllowedCategories,
  listStudioProducts,
} from "./studioProductMetadata.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEFAULT_PUBLIC_DIR = join(ROOT, "public");
const DEFAULT_CHANGELOG = join(
  ROOT,
  "src",
  "catalog",
  "backups",
  "changelog.jsonl"
);

export function resolveStudioImageAbsolutePath(publicUrl, publicDir = DEFAULT_PUBLIC_DIR) {
  if (typeof publicUrl !== "string" || !publicUrl.startsWith("/product-images/")) {
    return null;
  }

  const segments = publicUrl.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return null;
  }

  const absolute = resolve(join(publicDir, ...segments));
  const imagesRoot = resolve(join(publicDir, "product-images"));
  const prefix = imagesRoot.endsWith(sep) ? imagesRoot : imagesRoot + sep;
  if (absolute !== imagesRoot && !absolute.startsWith(prefix)) {
    return null;
  }
  return absolute;
}

export function studioImageFileExists(publicUrl, publicDir = DEFAULT_PUBLIC_DIR) {
  const absolute = resolveStudioImageAbsolutePath(publicUrl, publicDir);
  return absolute ? existsSync(absolute) : false;
}

export function describeProductImage(product, publicDir = DEFAULT_PUBLIC_DIR) {
  const image = product?.image ?? null;
  const hasCard = Boolean(image?.card);
  const hasDetail = Boolean(image?.detail);
  const hasOriginal = Boolean(image?.original);
  const cardFileExists = hasCard
    ? studioImageFileExists(image.card, publicDir)
    : false;
  const detailFileExists = hasDetail
    ? studioImageFileExists(image.detail, publicDir)
    : false;
  const originalFileExists = hasOriginal
    ? studioImageFileExists(image.original, publicDir)
    : false;

  let imageStatus = "missing";
  if (hasCard || hasDetail || hasOriginal) {
    imageStatus =
      hasCard &&
      hasDetail &&
      hasOriginal &&
      cardFileExists &&
      detailFileExists &&
      originalFileExists
        ? "complete"
        : "incomplete";
  }

  return {
    hasImage: hasCard,
    hasCard,
    hasDetail,
    hasOriginal,
    cardFileExists,
    detailFileExists,
    originalFileExists,
    originalStored: hasOriginal && originalFileExists,
    imageStatus,
    image,
  };
}

export function listRecentlyAssignedProductIds({
  changelogPath = DEFAULT_CHANGELOG,
  limit = 40,
} = {}) {
  if (!existsSync(changelogPath)) {
    return [];
  }

  const text = readFileSync(changelogPath, "utf8");
  const ids = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line || !line.includes('"assign-image"')) {
      continue;
    }

    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    if (row?.action !== "assign-image") {
      continue;
    }

    for (const productId of row.productIds || []) {
      if (typeof productId !== "string" || seen.has(productId)) {
        continue;
      }
      seen.add(productId);
      ids.push(productId);
      if (ids.length >= limit) {
        return ids;
      }
    }
  }

  return ids;
}

export function listStudioImageCatalog(options = {}) {
  const catalog = options.catalog ?? loadCatalog({ catalogDir: options.catalogDir });
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR;
  const products = listStudioProducts(catalog).map((product) => ({
    ...product,
    ...describeProductImage(product, publicDir),
  }));

  const completed = products.filter((product) => product.hasImage).length;
  const incomplete = products.filter(
    (product) => product.imageStatus === "incomplete"
  ).length;

  return {
    stats: {
      total: products.length,
      completed,
      missing: products.length - completed,
      incomplete,
    },
    categories: getAllowedCategories(catalog.products),
    recentProductIds: listRecentlyAssignedProductIds({
      changelogPath: options.changelogPath,
    }),
    products,
  };
}

/**
 * Rebuild the generated customer catalogue after a successful source write.
 * Never invoked from the transaction mutate() itself.
 */
export function rebuildCustomerCatalogAfterStudioWrite(options = {}) {
  try {
    const result = buildCustomerCatalog(options);
    if (!result.ok) {
      return {
        ok: false,
        unchanged: false,
        warning:
          result.error ||
          "Customer catalogue could not be rebuilt. Run npm run catalog:customer-build.",
        code: result.code || "REBUILD_FAILED",
      };
    }

    return {
      ok: true,
      unchanged: Boolean(result.unchanged),
      warning: null,
      productCount: result.productCount,
      bytes: result.bytes,
    };
  } catch (error) {
    return {
      ok: false,
      unchanged: false,
      warning:
        error.message ||
        "Customer catalogue could not be rebuilt. Run npm run catalog:customer-build.",
      code: "REBUILD_FAILED",
    };
  }
}
