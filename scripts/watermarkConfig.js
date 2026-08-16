/**
 * Global Matahari Langowan watermark settings for Catalogue Studio.
 *
 * Change these values and regenerate card/detail from originals.
 * Do not bake watermarks into original uploads.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const WATERMARK = {
  enabled: true,
  position: "upper-right",
  /** Fraction of generated image width. */
  relativeWidth: 0.19,
  /** 0–1 alpha applied when compositing. */
  opacity: 0.32,
  /** Fraction of generated image size, applied from the top and right edges. */
  inset: 0.055,
  label: "Matahari Langowan",
  assetPath: join(__dirname, "assets", "matahari-langowan-watermark.svg"),
};
