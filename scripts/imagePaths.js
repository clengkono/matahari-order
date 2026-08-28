/**
 * Canonical product-image paths. Product ID is the stable identity.
 * No category folders. No historical cigarettes/ bucket for new writes.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export const LEGACY_IMAGE_BUCKET = "cigarettes";
export const ORIGINAL_EXTENSIONS = Object.freeze(["png", "jpg", "jpeg", "webp"]);

const ORIGINAL_EXT_PATTERN = "(?:jpg|jpeg|png|webp)";

export function canonicalCardPublicUrl(productId) {
  return `/product-images/cards/${productId}.webp`;
}

export function canonicalDetailPublicUrl(productId) {
  return `/product-images/details/${productId}.webp`;
}

export function canonicalOriginalPublicUrl(productId, extension) {
  const ext = String(extension || "png").replace(/^\./, "").toLowerCase();
  return `/product-images/originals/${productId}-original.${ext}`;
}

export function canonicalImagePublicUrls(productId, originalExtension) {
  return {
    card: canonicalCardPublicUrl(productId),
    detail: canonicalDetailPublicUrl(productId),
    original: canonicalOriginalPublicUrl(productId, originalExtension),
  };
}

export function canonicalCardAbs(publicImages, productId) {
  return join(publicImages, "cards", `${productId}.webp`);
}

export function canonicalDetailAbs(publicImages, productId) {
  return join(publicImages, "details", `${productId}.webp`);
}

export function canonicalOriginalAbs(publicImages, productId, extension) {
  const ext = String(extension || "png").replace(/^\./, "").toLowerCase();
  return join(publicImages, "originals", `${productId}-original.${ext}`);
}

export function ensureCanonicalImageDirs(publicImages, mkdirSyncImpl) {
  mkdirSyncImpl(join(publicImages, "cards"), { recursive: true });
  mkdirSyncImpl(join(publicImages, "details"), { recursive: true });
  mkdirSyncImpl(join(publicImages, "originals"), { recursive: true });
}

export function isLegacyImagePublicUrl(value) {
  if (typeof value !== "string") {
    return false;
  }
  return (
    value.includes("/cigarettes/") ||
    value.includes("\\cigarettes\\") ||
    /\/product-images\/(?:cards|details|originals)\/cigarettes\//.test(value)
  );
}

export function originalExtensionFromPublicUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.toLowerCase().match(/-original\.(jpg|jpeg|png|webp)$/);
  return match ? match[1] : null;
}

export function isCanonicalCardPublicUrl(value, productId) {
  return value === canonicalCardPublicUrl(productId);
}

export function isCanonicalDetailPublicUrl(value, productId) {
  return value === canonicalDetailPublicUrl(productId);
}

export function isCanonicalOriginalPublicUrl(value, productId) {
  if (typeof value !== "string" || !productId) {
    return false;
  }
  const escaped = productId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^/product-images/originals/${escaped}-original\\.${ORIGINAL_EXT_PATTERN}$`,
    "i"
  ).test(value);
}

export function canonicalPathErrors(pathname, productId, field) {
  const label = `product "${productId}" image.${field}`;
  if (typeof pathname !== "string") {
    return [`${label} must be a string`];
  }
  if (isLegacyImagePublicUrl(pathname)) {
    return [
      `${label} must use the canonical product-id path, not the historical cigarettes/ folder`,
    ];
  }
  if (field === "card" && !isCanonicalCardPublicUrl(pathname, productId)) {
    return [`${label} must be "${canonicalCardPublicUrl(productId)}"`];
  }
  if (field === "detail" && !isCanonicalDetailPublicUrl(pathname, productId)) {
    return [`${label} must be "${canonicalDetailPublicUrl(productId)}"`];
  }
  if (field === "original" && !isCanonicalOriginalPublicUrl(pathname, productId)) {
    return [
      `${label} must be "/product-images/originals/${productId}-original.<jpg|jpeg|png|webp>"`,
    ];
  }
  return [];
}

export function findOriginalAbsolutePath(product, publicImages, fileExists = existsSync) {
  const fromMeta = publicUrlToAbs(product?.image?.original, publicImages);
  if (fromMeta && fileExists(fromMeta)) {
    return fromMeta;
  }

  if (!product?.id) {
    return null;
  }

  for (const ext of ORIGINAL_EXTENSIONS) {
    const canonical = canonicalOriginalAbs(publicImages, product.id, ext);
    if (fileExists(canonical)) {
      return canonical;
    }
  }

  for (const ext of ORIGINAL_EXTENSIONS) {
    const legacy = join(
      publicImages,
      "originals",
      LEGACY_IMAGE_BUCKET,
      `${product.id}-original.${ext}`
    );
    if (fileExists(legacy)) {
      return legacy;
    }
  }

  return null;
}

export function publicUrlToAbs(publicUrl, publicImages) {
  if (typeof publicUrl !== "string" || !publicUrl.startsWith("/product-images/")) {
    return null;
  }
  const relative = publicUrl.slice("/product-images/".length);
  if (!relative || relative.includes("..")) {
    return null;
  }
  return join(publicImages, ...relative.split("/").filter(Boolean));
}

export function plannedCanonicalImage(product) {
  if (!product?.id || !product.image) {
    return null;
  }
  const ext =
    originalExtensionFromPublicUrl(product.image.original) ||
    originalExtensionFromPublicUrl(product.image.card) ||
    "png";
  return canonicalImagePublicUrls(product.id, ext);
}
