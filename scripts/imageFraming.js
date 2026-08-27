/**
 * Conservative product framing for generated card/detail images.
 *
 * Pipeline: oriented source → optional excess-background trim → safety margin
 * → contain onto the generated canvas. Originals are never trimmed here.
 *
 * LOCAL ONLY. Sharp only — no extra computer-vision dependency.
 */

import sharp from "sharp";

/** Extract occupies this fraction of the generated square when the source permits. */
export const CANVAS_FIT_RATIO = 0.9;

/** Expand the detected trim box by this fraction of its size (split across opposite edges). */
export const SAFETY_MARGIN_RATIO = 0.06;

/** Sharp trim threshold against the sampled corner colour. Keep low to avoid eating product edges. */
export const TRIM_THRESHOLD = 10;

/** Reject a trim that would keep less than this fraction of either original dimension. */
export const MIN_KEEP_RATIO = 0.5;

const CORNER_PATCH = 10;
const MAX_CORNER_DELTA = 28;
const MAX_CORNER_STD = 20;
const LIGHT_LUMA_MIN = 200;
const TRANSPARENT_ALPHA_MAX = 28;
const NO_TRIM_KEEP_RATIO = 0.98;

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function trimOrigin(offset) {
  if (offset == null || Number.isNaN(offset)) {
    return 0;
  }
  return Math.abs(offset);
}

async function sampleCorners(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({
    resolveWithObject: true,
  });
  const { width, height, channels } = info;
  const patch = Math.max(
    1,
    Math.min(CORNER_PATCH, Math.floor(width / 8), Math.floor(height / 8))
  );
  const ch = channels || 3;

  function stats(x0, y0) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    let count = 0;
    const lumas = [];

    for (let y = y0; y < y0 + patch; y += 1) {
      for (let x = x0; x < x0 + patch; x += 1) {
        const index = (y * width + x) * ch;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        sumR += r;
        sumG += g;
        sumB += b;
        if (ch >= 4) {
          sumA += data[index + 3];
        }
        lumas.push(luma(r, g, b));
        count += 1;
      }
    }

    const mean = {
      r: sumR / count,
      g: sumG / count,
      b: sumB / count,
      a: ch >= 4 ? sumA / count : 255,
    };
    const meanLuma = luma(mean.r, mean.g, mean.b);
    const variance =
      lumas.reduce((sum, value) => sum + (value - meanLuma) ** 2, 0) / count;

    return {
      mean,
      meanLuma,
      std: Math.sqrt(variance),
      alpha: mean.a,
    };
  }

  return {
    width,
    height,
    channels: ch,
    hasAlpha: ch >= 4,
    patch,
    corners: [
      stats(0, 0),
      stats(width - patch, 0),
      stats(0, height - patch),
      stats(width - patch, height - patch),
    ],
  };
}

function decideTrim(sample) {
  const { corners, hasAlpha } = sample;
  const transparent =
    hasAlpha && corners.every((corner) => corner.alpha <= TRANSPARENT_ALPHA_MAX);
  if (transparent) {
    return { ok: true, mode: "transparent" };
  }

  const maxStd = Math.max(...corners.map((corner) => corner.std));
  if (maxStd > MAX_CORNER_STD) {
    return { ok: false, reason: "busy-corners" };
  }

  let maxDelta = 0;
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      const delta = Math.hypot(
        corners[i].mean.r - corners[j].mean.r,
        corners[i].mean.g - corners[j].mean.g,
        corners[i].mean.b - corners[j].mean.b
      );
      maxDelta = Math.max(maxDelta, delta);
    }
  }
  if (maxDelta > MAX_CORNER_DELTA) {
    return { ok: false, reason: "corners-disagree" };
  }

  const averageLuma =
    corners.reduce((sum, corner) => sum + corner.meanLuma, 0) / corners.length;
  if (averageLuma < LIGHT_LUMA_MIN) {
    return { ok: false, reason: "background-not-light" };
  }

  return { ok: true, mode: "light" };
}

function fallbackResult(oriented, reason) {
  return {
    buffer: oriented.data,
    width: oriented.info.width,
    height: oriented.info.height,
    originalWidth: oriented.info.width,
    originalHeight: oriented.info.height,
    trimmed: false,
    trim: null,
    contentWidth: oriented.info.width,
    contentHeight: oriented.info.height,
    fallbackReason: reason,
  };
}

/**
 * Orient a source buffer and, when confident, trim excess light/transparent
 * edge background with a small safety margin. Never touches the stored original.
 */
export async function frameProductBuffer(sourceBuffer) {
  const oriented = await sharp(sourceBuffer).rotate().toBuffer({
    resolveWithObject: true,
  });
  const originalWidth = oriented.info.width;
  const originalHeight = oriented.info.height;

  if (originalWidth < 16 || originalHeight < 16) {
    return fallbackResult(oriented, "too-small");
  }

  let sample;
  try {
    sample = await sampleCorners(oriented.data);
  } catch {
    return fallbackResult(oriented, "corner-sample-failed");
  }

  const decision = decideTrim(sample);
  if (!decision.ok) {
    return fallbackResult(oriented, decision.reason);
  }

  let trimmed;
  try {
    const trimOptions =
      decision.mode === "transparent"
        ? {
            threshold: TRIM_THRESHOLD,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          }
        : { threshold: TRIM_THRESHOLD };
    trimmed = await sharp(oriented.data)
      .trim(trimOptions)
      .toBuffer({ resolveWithObject: true });
  } catch {
    return fallbackResult(oriented, "trim-failed");
  }

  const detectedWidth = trimmed.info.width;
  const detectedHeight = trimmed.info.height;
  const detectedLeft = trimOrigin(trimmed.info.trimOffsetLeft);
  const detectedTop = trimOrigin(trimmed.info.trimOffsetTop);

  if (
    detectedWidth >= originalWidth * NO_TRIM_KEEP_RATIO &&
    detectedHeight >= originalHeight * NO_TRIM_KEEP_RATIO
  ) {
    return fallbackResult(oriented, "no-excess-margin");
  }

  if (
    detectedWidth < originalWidth * MIN_KEEP_RATIO ||
    detectedHeight < originalHeight * MIN_KEEP_RATIO
  ) {
    return fallbackResult(oriented, "trim-too-aggressive");
  }

  const marginX = Math.max(
    2,
    Math.round((detectedWidth * SAFETY_MARGIN_RATIO) / 2)
  );
  const marginY = Math.max(
    2,
    Math.round((detectedHeight * SAFETY_MARGIN_RATIO) / 2)
  );
  const extractLeft = Math.max(0, detectedLeft - marginX);
  const extractTop = Math.max(0, detectedTop - marginY);
  const extractRight = Math.min(
    originalWidth,
    detectedLeft + detectedWidth + marginX
  );
  const extractBottom = Math.min(
    originalHeight,
    detectedTop + detectedHeight + marginY
  );
  const extractWidth = extractRight - extractLeft;
  const extractHeight = extractBottom - extractTop;

  if (extractWidth < 8 || extractHeight < 8) {
    return fallbackResult(oriented, "extract-too-small");
  }

  const extracted = await sharp(oriented.data)
    .extract({
      left: extractLeft,
      top: extractTop,
      width: extractWidth,
      height: extractHeight,
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: extracted.data,
    width: extracted.info.width,
    height: extracted.info.height,
    originalWidth,
    originalHeight,
    trimmed: true,
    trim: {
      left: extractLeft,
      top: extractTop,
      width: extractWidth,
      height: extractHeight,
      detectedLeft,
      detectedTop,
      detectedWidth,
      detectedHeight,
    },
    contentWidth: extractWidth,
    contentHeight: extractHeight,
    fallbackReason: null,
  };
}

export function framingSummary(framed, extras = {}) {
  return {
    originalWidth: framed.originalWidth,
    originalHeight: framed.originalHeight,
    trimmed: framed.trimmed,
    fallbackReason: framed.fallbackReason,
    trim: framed.trim,
    contentWidth: framed.contentWidth,
    contentHeight: framed.contentHeight,
    fittedWidth: extras.fittedWidth ?? null,
    fittedHeight: extras.fittedHeight ?? null,
    canvasSize: extras.canvasSize ?? null,
    occupancyWidth:
      extras.fittedWidth && extras.canvasSize
        ? extras.fittedWidth / extras.canvasSize
        : null,
    occupancyHeight:
      extras.fittedHeight && extras.canvasSize
        ? extras.fittedHeight / extras.canvasSize
        : null,
  };
}

export function fitBoxSize(canvasSize) {
  return Math.max(1, Math.round(canvasSize * CANVAS_FIT_RATIO));
}
