/**
 * Catalogue Studio owner-default-unit helpers.
 *
 * Reads the full catalogue. Writes only through runCatalogTransaction().
 * LOCAL ONLY.
 */

import { resolveOwnerDefaultUnitName } from "./buildCatalog.js";
import { loadCatalog, runCatalogTransaction } from "./catalogTransaction.js";
import { rebuildCustomerCatalogAfterStudioWrite } from "./studioImageCatalog.js";
import { listStudioProducts } from "./studioProductMetadata.js";

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
    noop: false,
  };
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
  return transaction.error || "Could not save the default unit.";
}

function listedUnitsForProduct(catalog, productId) {
  const variant = (catalog.variants ?? []).find(
    (row) => row.productId === productId
  );
  if (!variant || !Array.isArray(variant.availableUnitIds)) {
    return [];
  }
  const unitById = new Map((catalog.units ?? []).map((unit) => [unit.id, unit]));
  return variant.availableUnitIds
    .map((unitId) => unitById.get(unitId))
    .filter(Boolean);
}

function ownerDefaultByProductId(productDefaults) {
  const byProduct = new Map();
  if (!Array.isArray(productDefaults)) {
    return byProduct;
  }
  for (const row of productDefaults) {
    if (typeof row?.productId === "string" && row.productId) {
      byProduct.set(row.productId, row);
    }
  }
  return byProduct;
}

function availableActiveUnitNames(catalog, productId) {
  return listedUnitsForProduct(catalog, productId)
    .filter((unit) => unit.active !== false)
    .map((unit) => unit.name);
}

function fallbackDefaultUnitName(catalog, productId) {
  const variant = (catalog.variants ?? []).find(
    (row) => row.productId === productId
  );
  if (!variant) {
    return null;
  }
  const unit = (catalog.units ?? []).find(
    (entry) => entry.id === variant.defaultUnitId
  );
  return unit?.name ?? null;
}

function toStudioDefaultRow(catalog, product, studio, ownerRow) {
  const availableUnits = availableActiveUnitNames(catalog, product.id);
  const fallbackUnit = fallbackDefaultUnitName(catalog, product.id);
  const ownerConfigured = Boolean(ownerRow);
  const resolvedOwner = ownerConfigured
    ? resolveOwnerDefaultUnitName(ownerRow.defaultUnitName, availableUnits)
    : { ok: false, name: null };
  const ownerDefaultUnit = ownerConfigured
    ? resolvedOwner.ok
      ? resolvedOwner.name
      : ownerRow.defaultUnitName ?? null
    : null;

  return {
    productId: product.id,
    name: studio?.name ?? product.name ?? "",
    category: studio?.category ?? product.category ?? "",
    aliases: studio?.aliases ?? [],
    posName: studio?.posName ?? null,
    posCode: studio?.posCode ?? null,
    availableUnits,
    currentDefaultUnit: resolvedOwner.ok ? resolvedOwner.name : fallbackUnit,
    ownerDefaultUnit,
    ownerConfigured,
  };
}

export function listStudioDefaults(catalog) {
  const studioById = new Map(
    listStudioProducts(catalog).map((product) => [product.id, product])
  );
  const overrides = ownerDefaultByProductId(catalog.productDefaults);

  const defaults = (catalog.products ?? [])
    .map((product) =>
      toStudioDefaultRow(
        catalog,
        product,
        studioById.get(product.id),
        overrides.get(product.id)
      )
    )
    .sort((left, right) => left.name.localeCompare(right.name, "id"));

  const configured = defaults.filter((row) => row.ownerConfigured).length;
  return {
    defaults,
    stats: {
      total: defaults.length,
      configured,
      needsReview: defaults.length - configured,
    },
  };
}

export function getStudioDefault(catalog, productId) {
  const listed = listStudioDefaults(catalog);
  return listed.defaults.find((row) => row.productId === productId) ?? null;
}

export function parseDefaultUnitPatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: "Expected JSON with defaultUnitName.",
      code: "INVALID_INPUT",
    };
  }

  const extra = Object.keys(body).filter((key) => key !== "defaultUnitName");
  if (extra.length > 0) {
    return {
      ok: false,
      error: "Only defaultUnitName can be changed.",
      code: "INVALID_INPUT",
    };
  }

  if (!hasOwn(body, "defaultUnitName")) {
    return {
      ok: false,
      error: "defaultUnitName is required.",
      code: "INVALID_INPUT",
    };
  }

  return { ok: true, defaultUnitName: body.defaultUnitName };
}

function resolveRequestedUnit(catalog, productId, defaultUnitName) {
  const listed = listedUnitsForProduct(catalog, productId);
  const activeNames = listed
    .filter((unit) => unit.active !== false)
    .map((unit) => unit.name);
  const inactiveNames = listed
    .filter((unit) => unit.active === false)
    .map((unit) => unit.name);

  const activeResolved = resolveOwnerDefaultUnitName(defaultUnitName, activeNames);
  if (activeResolved.ok) {
    return { ok: true, name: activeResolved.name, code: null };
  }

  const inactiveResolved = resolveOwnerDefaultUnitName(
    defaultUnitName,
    inactiveNames
  );
  if (inactiveResolved.ok) {
    return {
      ok: false,
      name: null,
      code: "UNIT_INACTIVE",
      error: `That unit is inactive for this product.`,
    };
  }

  return {
    ok: false,
    name: null,
    code: "UNIT_UNAVAILABLE",
    error: "That unit is not available for this product.",
  };
}

function rebuildAfterWrite(transaction, options) {
  if (transaction.noop) {
    return null;
  }
  try {
    if (typeof options.rebuildCustomerCatalog === "function") {
      return options.rebuildCustomerCatalog(options);
    }
    return rebuildCustomerCatalogAfterStudioWrite({
      catalogDir: options.catalogDir,
      outputPath: options.customerCatalogPath,
      validateOptions: options.validateOptions,
    });
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

/**
 * Confirm an owner default unit. Creates a sidecar row even when the chosen
 * unit matches the import fallback (Configured vs Needs review).
 */
export function setOwnerDefaultUnit(input, options = {}) {
  const productId =
    typeof input?.productId === "string" ? input.productId.trim() : "";
  if (!productId) {
    return failInput("Product is required.");
  }
  if (typeof input?.defaultUnitName !== "string") {
    return failInput("Default unit must be text.");
  }

  const requestedName = input.defaultUnitName.trim();
  if (!requestedName) {
    return failInput("Enter a default unit.");
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

  const resolved = resolveRequestedUnit(catalog, productId, requestedName);
  if (!resolved.ok) {
    return failInput(resolved.error, resolved.code);
  }

  const existing = (catalog.productDefaults ?? []).find(
    (row) => row.productId === productId
  );
  const alreadySame =
    existing && existing.defaultUnitName === resolved.name;

  const transaction = runCatalogTransaction({
    ...options,
    action: "set-product-default-unit",
    productIds: [productId],
    summary: alreadySame
      ? `Default unit unchanged for ${product.name}`
      : `Set default unit for ${product.name}: ${resolved.name}`,
    mutate(next) {
      if (!Array.isArray(next.productDefaults)) {
        next.productDefaults = [];
      }
      const index = next.productDefaults.findIndex(
        (row) => row.productId === productId
      );
      const row = {
        productId,
        defaultUnitName: resolved.name,
      };
      if (index === -1) {
        next.productDefaults.push(row);
      } else {
        next.productDefaults[index] = row;
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
    productId,
    defaultUnitName: resolved.name,
    created: !existing,
    updated: Boolean(existing) && !transaction.noop,
    default: getStudioDefault(after, productId),
    customerCatalog: rebuildAfterWrite(transaction, options),
  };
}

export function clearOwnerDefaultUnit(input, options = {}) {
  const productId =
    typeof input?.productId === "string" ? input.productId.trim() : "";
  if (!productId) {
    return failInput("Product is required.");
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

  const existing = (catalog.productDefaults ?? []).find(
    (row) => row.productId === productId
  );

  const transaction = runCatalogTransaction({
    ...options,
    action: "clear-product-default-unit",
    productIds: [productId],
    summary: existing
      ? `Cleared owner default unit for ${product.name}`
      : `No owner default unit for ${product.name}`,
    mutate(next) {
      if (!Array.isArray(next.productDefaults)) {
        next.productDefaults = [];
        return;
      }
      next.productDefaults = next.productDefaults.filter(
        (row) => row.productId !== productId
      );
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
    productId,
    cleared: Boolean(existing) && !transaction.noop,
    default: getStudioDefault(after, productId),
    customerCatalog: rebuildAfterWrite(transaction, options),
  };
}

export { ownerFacingTransactionError };
