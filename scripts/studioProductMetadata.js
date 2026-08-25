/**
 * Catalogue Studio product metadata (name / category) helpers.
 *
 * Reads the full catalogue. Writes only through runCatalogTransaction().
 * LOCAL ONLY.
 */

import { CURATED_CATEGORY_IDS } from "../src/config/categories.js";
import { loadCatalog, runCatalogTransaction } from "./catalogTransaction.js";

const CIGARETTE_CATEGORY = "Rokok";
const PATCH_KEYS = new Set(["name", "category"]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function failInput(error, code = "INVALID_INPUT") {
  return {
    ok: false,
    error,
    code,
    validationErrors: [],
    changedFiles: [],
    backupId: null,
  };
}

/**
 * Allowed Studio categories: curated CATEGORY_CONFIG order, then any extra
 * values already present on products.json (A–Z). Does not create new ones.
 *
 * @param {Array<{ category?: unknown }>} products
 * @returns {string[]}
 */
export function getAllowedCategories(products = []) {
  const curated = CURATED_CATEGORY_IDS.filter(Boolean);
  const seen = new Set(curated);
  const extras = [];

  for (const product of products) {
    const category = product?.category;
    if (typeof category !== "string") {
      continue;
    }
    const trimmed = category.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    extras.push(trimmed);
  }

  extras.sort((left, right) => left.localeCompare(right, "id"));
  return [...curated, ...extras];
}

function posSummary(catalog, productId) {
  const rows = catalog.mappings.filter(
    (mapping) => mapping.productId === productId
  );

  if (rows.length === 0) {
    return { posName: null, posCode: null };
  }

  rows.sort(
    (left, right) => (left.sourceRowIndex ?? 0) - (right.sourceRowIndex ?? 0)
  );

  const first = rows[0];
  return {
    posName: typeof first.posName === "string" ? first.posName : null,
    posCode: typeof first.posCode === "string" ? first.posCode : null,
  };
}

function productAliases(catalog, productId) {
  return catalog.aliases
    .filter(
      (entry) =>
        entry.productId === productId &&
        typeof entry.alias === "string" &&
        entry.alias.trim()
    )
    .map((entry) => entry.alias.trim())
    .sort((left, right) => left.localeCompare(right, "id"));
}

function productVariantIds(catalog, productId) {
  return catalog.variants
    .filter((variant) => variant.productId === productId)
    .map((variant) => variant.id)
    .filter((id) => typeof id === "string" && id);
}

/**
 * Owner-facing product row for the Products tab.
 * Display fields only — no mapping identity, units, or writable extras.
 */
export function toStudioProduct(product, catalog) {
  const pos = posSummary(catalog, product.id);
  const variantIds = productVariantIds(catalog, product.id);

  return {
    id: product.id,
    name: product.name ?? "",
    category: product.category ?? "",
    image: product.image ?? null,
    aliases: productAliases(catalog, product.id),
    variantId: variantIds[0] ?? null,
    posName: pos.posName,
    posCode: pos.posCode,
  };
}

export function listStudioProducts(catalog) {
  return catalog.products
    .slice()
    .sort((left, right) =>
      String(left.name ?? "").localeCompare(String(right.name ?? ""), "id")
    )
    .map((product) => toStudioProduct(product, catalog));
}

export function getStudioProduct(catalog, productId) {
  const product = catalog.products.find((entry) => entry.id === productId);
  if (!product) {
    return null;
  }
  return toStudioProduct(product, catalog);
}

/**
 * Validate a Products-tab PATCH body. Only name and category are allowed.
 *
 * @param {unknown} body
 * @returns {{ ok: true, patch: { name?: unknown, category?: unknown } } | { ok: false, error: string, code: string }}
 */
export function parseProductMetadataPatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: "Expected JSON with name and/or category.",
      code: "INVALID_INPUT",
    };
  }

  const extra = Object.keys(body).filter((key) => !PATCH_KEYS.has(key));
  if (extra.length > 0) {
    return {
      ok: false,
      error: "Only name and category can be changed.",
      code: "INVALID_INPUT",
    };
  }

  const patch = {};
  if (hasOwn(body, "name")) {
    patch.name = body.name;
  }
  if (hasOwn(body, "category")) {
    patch.category = body.category;
  }
  return { ok: true, patch };
}

function buildSummary({
  previousName,
  nextName,
  previousCategory,
  nextCategory,
  nameChanged,
  categoryChanged,
}) {
  if (nameChanged && categoryChanged) {
    return `Updated ${previousName}: name and category`;
  }
  if (nameChanged) {
    return `Renamed ${previousName} → ${nextName}`;
  }
  if (categoryChanged) {
    return `Moved ${previousName}: ${previousCategory} → ${nextCategory}`;
  }
  return `No product metadata changes for ${previousName}`;
}

function ownerFacingTransactionError(transaction) {
  if (transaction.code === "BUSY") {
    return "Another catalogue save is already running. Try again.";
  }
  if (transaction.code === "VALIDATION_FAILED") {
    const first = transaction.validationErrors?.[0];
    return first
      ? `Could not save. ${first}`
      : "Could not save. The catalogue check failed.";
  }
  if (transaction.code === "NOT_FOUND") {
    return "Product not found.";
  }
  return transaction.error || "Could not save the product.";
}

/**
 * Update customer-facing name and/or category through the catalogue
 * transaction layer. Name changes also update matching variant names and
 * mapping.productName. POS fields, IDs, aliases, and images are not written.
 *
 * @param {{ productId: string, name?: unknown, category?: unknown }} input
 */
export function updateProductMetadata(input, options = {}) {
  const productId =
    typeof input?.productId === "string" ? input.productId.trim() : "";
  if (!productId) {
    return failInput("Product is required.");
  }

  if (hasOwn(input, "name") && typeof input.name !== "string") {
    return failInput("Product name must be text.");
  }
  if (hasOwn(input, "category") && typeof input.category !== "string") {
    return failInput("Category must be text.");
  }

  let catalog;
  try {
    catalog = loadCatalog(options);
  } catch (error) {
    return failInput(error.message || "Failed to read catalogue.", "LOAD_FAILED");
  }

  const product = catalog.products.find((entry) => entry.id === productId);
  if (!product) {
    return failInput("Product not found.", "NOT_FOUND");
  }

  const nextName = hasOwn(input, "name") ? input.name.trim() : product.name;
  const nextCategory = hasOwn(input, "category")
    ? input.category.trim()
    : product.category;

  if (typeof nextName !== "string" || !nextName) {
    return failInput("Enter a product name.");
  }
  if (typeof nextCategory !== "string" || !nextCategory) {
    return failInput("Choose a category.");
  }

  const allowed = getAllowedCategories(catalog.products);
  if (!allowed.includes(nextCategory)) {
    return failInput("That category is not in the allowed list.");
  }

  const previousName = product.name;
  const previousCategory = product.category;
  const nameChanged = nextName !== previousName;
  const categoryChanged = nextCategory !== previousCategory;
  const summary = buildSummary({
    previousName,
    nextName,
    previousCategory,
    nextCategory,
    nameChanged,
    categoryChanged,
  });

  const transaction = runCatalogTransaction({
    ...options,
    action: "update-product-metadata",
    productIds: [productId],
    summary,
    mutate(next) {
      const target = next.products.find((entry) => entry.id === productId);
      if (!target) {
        throw new Error("Product not found.");
      }

      const liveAllowed = getAllowedCategories(next.products);
      if (!liveAllowed.includes(nextCategory)) {
        throw new Error("That category is not in the allowed list.");
      }

      if (nameChanged) {
        target.name = nextName;
        for (const variant of next.variants) {
          if (variant.productId === productId) {
            variant.name = nextName;
          }
        }
        for (const mapping of next.mappings) {
          if (mapping.productId === productId) {
            mapping.productName = nextName;
          }
        }
      }

      if (categoryChanged) {
        target.category = nextCategory;
      }
    },
  });

  if (!transaction.ok) {
    return {
      ...transaction,
      error: ownerFacingTransactionError(transaction),
    };
  }

  const after = loadCatalog(options);
  return {
    ...transaction,
    product: getStudioProduct(after, productId),
    nameChanged,
    categoryChanged,
    previousName,
    previousCategory,
    name: nextName,
    category: nextCategory,
    leftCigaretteList:
      previousCategory === CIGARETTE_CATEGORY &&
      nextCategory !== CIGARETTE_CATEGORY,
  };
}

export { CIGARETTE_CATEGORY };
