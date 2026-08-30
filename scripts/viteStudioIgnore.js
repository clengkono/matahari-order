/**
 * Vite must not watch or serve Studio image trash.
 * .trash is a local archive under public/product-images, not customer content.
 */

export const STUDIO_TRASH_WATCH_GLOBS = Object.freeze([
  "**/public/product-images/.trash/**",
]);

export function normalizeWatchPath(watchPath) {
  return String(watchPath ?? "").replace(/\\/g, "/");
}

export function shouldIgnoreStudioWatchPath(watchPath) {
  const normalized = normalizeWatchPath(watchPath);
  return /(?:^|\/)product-images\/\.trash(?:\/|$)/.test(normalized);
}

export function isStudioTrashRequestUrl(url) {
  if (typeof url !== "string" || !url) {
    return false;
  }
  const path = url.split("?")[0].replace(/\\/g, "/");
  return path.includes("/product-images/.trash");
}
