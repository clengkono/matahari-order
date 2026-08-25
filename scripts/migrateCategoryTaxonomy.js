/**
 * One-time live taxonomy migration (Stage 5B.2A).
 *
 * Moves three grocery products from "Bahan & Bumbu Masak" to "Bahan Makanan".
 * Idempotent: a second run is a no-op. Does not rewrite the generated
 * customer catalogue — run catalog:customer-build afterwards.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runCatalogTransaction } from "./catalogTransaction.js";

const FROM_CATEGORY = "Bahan & Bumbu Masak";
const TO_CATEGORY = "Bahan Makanan";
const PRODUCT_IDS = Object.freeze([
  "prod-masako-ayam",
  "prod-masako-sapi",
  "prod-indomie-goreng",
]);

export const MIGRATE_CATEGORY_TAXONOMY_ACTION = "migrate-category-taxonomy";

export function migrateCategoryTaxonomy(options = {}) {
  return runCatalogTransaction({
    ...options,
    action: MIGRATE_CATEGORY_TAXONOMY_ACTION,
    productIds: [...PRODUCT_IDS],
    summary:
      "Move Masako Ayam, Masako Sapi, Indomie Goreng: Bahan & Bumbu Masak → Bahan Makanan",
    mutate(catalog) {
      for (const productId of PRODUCT_IDS) {
        const product = catalog.products.find((entry) => entry.id === productId);
        if (!product) {
          throw new Error(`Product ${productId} not found.`);
        }

        if (product.category === TO_CATEGORY) {
          continue;
        }

        if (product.category !== FROM_CATEGORY) {
          throw new Error(
            `Product ${productId} has unexpected category "${product.category}".`
          );
        }

        product.category = TO_CATEGORY;
      }
    },
  });
}

function main() {
  const result = migrateCategoryTaxonomy();

  if (!result.ok) {
    console.error(result.error || "Category taxonomy migration failed.");
    if (Array.isArray(result.validationErrors)) {
      for (const message of result.validationErrors.slice(0, 20)) {
        console.error(`  - ${message}`);
      }
    }
    process.exitCode = 1;
    return result;
  }

  if (result.noop) {
    console.log("Category taxonomy migration: no-op (already applied).");
    return result;
  }

  console.log(
    `Category taxonomy migration: ${result.changedFiles.join(", ")} (backup ${result.backupId})`
  );
  return result;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}

export { FROM_CATEGORY, PRODUCT_IDS, TO_CATEGORY, main };
