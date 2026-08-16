/**
 * Rasterize the Matahari Langowan watermark for a generated square canvas.
 * Used only for card/detail outputs — never for originals.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { WATERMARK } from "./watermarkConfig.js";

const overlayCache = new Map();

function cacheKey(canvasSize) {
  let assetStamp = "missing";
  if (existsSync(WATERMARK.assetPath)) {
    assetStamp = String(statSync(WATERMARK.assetPath).mtimeMs);
  }

  return [
    canvasSize,
    WATERMARK.enabled,
    WATERMARK.relativeWidth,
    WATERMARK.opacity,
    WATERMARK.inset,
    WATERMARK.position,
    assetStamp,
  ].join(":");
}

function fail(message) {
  const error = new Error(message);
  error.status = 500;
  error.userSafe = true;
  return error;
}

async function applyOpacity(imageBuffer, opacity) {
  const alpha = Math.max(0, Math.min(255, Math.round(255 * opacity)));
  return sharp(imageBuffer)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, alpha]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer({ resolveWithObject: true });
}

/**
 * @param {number} canvasSize
 * @returns {Promise<null | { input: Buffer, left: number, top: number }>}
 */
export async function createWatermarkOverlay(canvasSize) {
  if (!WATERMARK.enabled) {
    return null;
  }

  const key = cacheKey(canvasSize);
  const cached = overlayCache.get(key);
  if (cached) {
    return cached;
  }

  if (!existsSync(WATERMARK.assetPath)) {
    throw fail("Watermark asset is missing. Card and detail were not saved.");
  }

  const insetPx = Math.max(0, Math.round(canvasSize * WATERMARK.inset));
  const maxWidth = Math.max(1, canvasSize - insetPx * 2);
  const maxHeight = Math.max(1, canvasSize - insetPx * 2);
  const targetWidth = Math.max(
    1,
    Math.min(maxWidth, Math.round(canvasSize * WATERMARK.relativeWidth))
  );

  const svgBuffer = readFileSync(WATERMARK.assetPath);
  let raster;
  try {
    raster = await sharp(svgBuffer)
      .resize({
        width: targetWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: false,
      })
      .ensureAlpha()
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    console.error("[studio] watermark raster failed:", error.message);
    throw fail("Watermark processing failed. Card and detail were not saved.");
  }

  const faded = await applyOpacity(raster.data, WATERMARK.opacity);
  const width = faded.info.width;
  const height = faded.info.height;

  if (width < 1 || height < 1) {
    throw fail("Watermark processing failed. Card and detail were not saved.");
  }

  const left = Math.max(0, canvasSize - width - insetPx);
  const top = Math.min(insetPx, Math.max(0, canvasSize - height));

  if (left + width > canvasSize || top + height > canvasSize) {
    throw fail("Watermark would clip the generated image. Check watermark size and inset.");
  }

  const overlay = {
    input: faded.data,
    left,
    top,
  };
  overlayCache.set(key, overlay);
  return overlay;
}

export function getWatermarkLabel() {
  return WATERMARK.label;
}
