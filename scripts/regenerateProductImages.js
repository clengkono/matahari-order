/**
 * Recreate card/detail images from an existing clean original.
 *
 * Usage:
 *   node scripts/regenerateProductImages.js prod-troy-20
 *
 * Single product only. Does not rewrite the original or products.json.
 */

import { regenerateDerivedImages } from "./imageService.js";

const productId = process.argv[2];

if (!productId) {
  console.error("Usage: node scripts/regenerateProductImages.js <productId>");
  console.error("Example: node scripts/regenerateProductImages.js prod-troy-20");
  process.exit(1);
}

if (productId === "--all" || productId === "*") {
  console.error("Refusing to regenerate all products. Pass a single product ID.");
  process.exit(1);
}

try {
  const result = await regenerateDerivedImages(productId);
  console.log(`Regenerated card and detail for ${result.name} (${result.productId}).`);
  console.log("Original left unchanged.");
  console.log(`card:    ${result.image.card}`);
  console.log(`detail:  ${result.image.detail}`);
  console.log(`original:${result.image.original}`);
} catch (error) {
  console.error(error.message || "Regeneration failed.");
  process.exit(1);
}
