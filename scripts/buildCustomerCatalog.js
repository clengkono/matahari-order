/**
 * Build the compact customer catalogue artefact from the catalogue source.
 *
 * Authoritative: src/catalog/{products,variants,units,aliases,mappings,recommendations,productFamilies,productDefaults}.json
 * Generated:     src/catalog/generated/customerCatalog.json
 *
 * Does not change the source schema. Does not write POS mappings into the
 * customer artefact. Catalogue transactions must not call this against the
 * live artefact from smoke tests — pass an explicit outputPath instead.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assembleProducts } from "../src/catalog/assembleProducts.js";
import { deriveSimilarProductIds } from "../src/utils/productFamilies.js";
import {
  resolveOwnerDefaultUnitName,
  validateCatalog,
} from "./buildCatalog.js";
import {
  DEFAULT_CATALOG_DIR,
  loadCatalog,
} from "./catalogTransaction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const DEFAULT_CUSTOMER_CATALOG_PATH = join(
  ROOT,
  "src",
  "catalog",
  "generated",
  "customerCatalog.json"
);

const DEFAULT_PUBLIC_DIR = join(ROOT, "public");

export function isLiveCatalogDir(catalogDir) {
  return resolve(catalogDir ?? DEFAULT_CATALOG_DIR) === resolve(DEFAULT_CATALOG_DIR);
}

export function isLiveCustomerCatalogPath(outputPath) {
  return (
    resolve(outputPath ?? DEFAULT_CUSTOMER_CATALOG_PATH) ===
    resolve(DEFAULT_CUSTOMER_CATALOG_PATH)
  );
}

function compactImage(image) {
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    return undefined;
  }

  const next = {};
  if (typeof image.card === "string" && image.card) {
    next.card = image.card;
  }
  if (typeof image.detail === "string" && image.detail) {
    next.detail = image.detail;
  }

  if (!next.card && !next.detail) {
    return undefined;
  }

  return next;
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

function toCustomerProduct(assembled, similarByProduct, ownerDefaultName) {
  const product = {
    id: assembled.id,
    name: assembled.name,
    category: assembled.category,
    availableUnits: assembled.availableUnits,
    defaultUnit: ownerDefaultName ?? assembled.defaultUnit,
    defaultQuantity: assembled.defaultQuantity,
  };

  const image = compactImage(assembled.image);
  if (image) {
    product.image = image;
  }

  if (
    Array.isArray(assembled.customerUnitHints) &&
    assembled.customerUnitHints.length > 0
  ) {
    product.customerUnitHints = assembled.customerUnitHints;
  }

  const similarProductIds = similarByProduct.get(assembled.id);
  if (Array.isArray(similarProductIds) && similarProductIds.length > 0) {
    product.similarProductIds = similarProductIds;
  }

  return product;
}

function toCustomerAlias(record) {
  const next = {};

  if (record?.productId) {
    next.productId = record.productId;
  }

  if (record?.variantId && record.variantId !== record.productId) {
    next.variantId = record.variantId;
  }

  next.alias = record?.alias ?? "";
  return next;
}

function toCustomerRecommendation(record) {
  return {
    sourceProductId: record.sourceProductId,
    targetProductId: record.targetProductId,
    weight: record.weight,
    source: record.source,
  };
}

export function assembleCustomerCatalog(catalog) {
  const assembled = assembleProducts({
    products: catalog.products,
    variants: catalog.variants,
    units: catalog.units,
  });
  const similarByProduct = deriveSimilarProductIds(catalog.productFamilies);
  const ownerDefaults = ownerDefaultByProductId(catalog.productDefaults);

  return {
    products: assembled.map((product) => {
      const override = ownerDefaults.get(product.id);
      let ownerDefaultName;
      if (override) {
        const resolved = resolveOwnerDefaultUnitName(
          override.defaultUnitName,
          product.availableUnits
        );
        if (resolved.ok) {
          ownerDefaultName = resolved.name;
        }
      }
      return toCustomerProduct(product, similarByProduct, ownerDefaultName);
    }),
    aliases: (catalog.aliases ?? []).map(toCustomerAlias),
    recommendations: (catalog.recommendations ?? []).map(
      toCustomerRecommendation
    ),
  };
}

export function serializeCustomerCatalog(customerCatalog) {
  return `${JSON.stringify(customerCatalog)}\n`;
}

function uniqueTempPath(filePath) {
  return `${filePath}.${process.pid}.${Date.now()}.tmp.json`;
}

function safeUnlink(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return;
  }

  try {
    unlinkSync(filePath);
  } catch {
    // Best-effort cleanup.
  }
}

export function writeFileIfChanged(filePath, contents) {
  mkdirSync(dirname(filePath), { recursive: true });

  if (existsSync(filePath) && readFileSync(filePath, "utf8") === contents) {
    return { written: false, unchanged: true };
  }

  const tempPath = uniqueTempPath(filePath);

  try {
    writeFileSync(tempPath, contents, "utf8");
    try {
      renameSync(tempPath, filePath);
    } catch {
      copyFileSync(tempPath, filePath);
      safeUnlink(tempPath);
    }
  } catch (error) {
    safeUnlink(tempPath);
    throw error;
  }

  return { written: true, unchanged: false };
}

/**
 * Validate, assemble, strip unused fields, and write the customer artefact.
 *
 * @param {object} [options]
 * @param {string} [options.catalogDir]
 * @param {object} [options.catalog] preloaded six-file catalogue
 * @param {string} [options.outputPath]
 * @param {object} [options.validateOptions] passed to validateCatalog
 * @param {boolean} [options.skipValidate]
 */
export function buildCustomerCatalog(options = {}) {
  const catalogDir = options.catalogDir ?? DEFAULT_CATALOG_DIR;
  const outputPath = options.outputPath ?? DEFAULT_CUSTOMER_CATALOG_PATH;

  let catalog;
  try {
    catalog = options.catalog ?? loadCatalog({ catalogDir });
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to load catalogue.",
      code: "LOAD_FAILED",
      outputPath,
      bytes: 0,
      unchanged: false,
      productCount: 0,
    };
  }

  if (!options.skipValidate) {
    const validationErrors = validateCatalog(
      catalog,
      options.validateOptions ?? { publicDir: DEFAULT_PUBLIC_DIR }
    );
    if (validationErrors.length > 0) {
      return {
        ok: false,
        error: "Catalogue validation failed.",
        code: "VALIDATION_FAILED",
        validationErrors,
        outputPath,
        bytes: 0,
        unchanged: false,
        productCount: 0,
      };
    }
  }

  const customerCatalog = assembleCustomerCatalog(catalog);
  const serialized = serializeCustomerCatalog(customerCatalog);

  let writeResult;
  try {
    writeResult = writeFileIfChanged(outputPath, serialized);
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to write customer catalogue.",
      code: "WRITE_FAILED",
      outputPath,
      bytes: 0,
      unchanged: false,
      productCount: customerCatalog.products.length,
    };
  }

  return {
    ok: true,
    error: null,
    code: null,
    outputPath,
    bytes: Buffer.byteLength(serialized, "utf8"),
    unchanged: writeResult.unchanged,
    written: writeResult.written,
    productCount: customerCatalog.products.length,
    aliasCount: customerCatalog.aliases.length,
    recommendationCount: customerCatalog.recommendations.length,
    familyCount: Array.isArray(catalog.productFamilies)
      ? catalog.productFamilies.length
      : 0,
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--catalog-dir") {
      options.catalogDir = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = argv[index + 1];
      index += 1;
    } else if (arg === "--skip-validate") {
      options.skipValidate = true;
    }
  }

  return options;
}

function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv);
  const result = buildCustomerCatalog({
    catalogDir: parsed.catalogDir,
    outputPath: parsed.outputPath,
    skipValidate: parsed.skipValidate,
  });

  if (!result.ok) {
    console.error(result.error);
    if (Array.isArray(result.validationErrors)) {
      for (const message of result.validationErrors.slice(0, 40)) {
        console.error(`  - ${message}`);
      }
    }
    process.exitCode = 1;
    return result;
  }

  const relative = result.outputPath.startsWith(ROOT)
    ? result.outputPath.slice(ROOT.length + 1).replaceAll("\\", "/")
    : result.outputPath;
  const state = result.unchanged ? "unchanged" : "wrote";
  console.log(
    `Customer catalogue ${state}: ${relative} (${result.productCount} products, ${result.bytes} bytes)`
  );
  return result;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}

export { DEFAULT_CATALOG_DIR, main };
