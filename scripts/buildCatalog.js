import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeSearchText } from "../src/utils/productSearch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const catalogDir = join(rootDir, "src", "catalog");
const defaultPublicDir = join(rootDir, "public");

const PRODUCT_IMAGE_PREFIX = "/product-images/";
const SERVED_IMAGE_EXTENSION = ".webp";
const ORIGINAL_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function loadJson(fileName) {
  const filePath = join(catalogDir, fileName);
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function findDuplicateIds(items, label) {
  const seen = new Map();
  const duplicates = [];

  for (const item of items) {
    const id = item?.id;
    if (id === undefined || id === null) {
      continue;
    }

    const key = String(id);
    if (seen.has(key)) {
      duplicates.push(`${label} id "${key}"`);
    } else {
      seen.set(key, true);
    }
  }

  return duplicates;
}

function isInsideDir(filePath, dirPath) {
  const resolvedFile = resolve(filePath);
  const resolvedDir = resolve(dirPath);
  const prefix = resolvedDir.endsWith(sep) ? resolvedDir : resolvedDir + sep;
  return resolvedFile === resolvedDir || resolvedFile.startsWith(prefix);
}

function pathExtension(pathname) {
  const base = pathname.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return base.slice(dot).toLowerCase();
}

function pathBasename(pathname) {
  return pathname.split("/").pop() || "";
}

function hasImageField(image, field) {
  return (
    Object.prototype.hasOwnProperty.call(image, field) &&
    image[field] !== undefined &&
    image[field] !== null
  );
}

/**
 * Validate one image path. Missing image metadata is handled by the caller.
 * Local /product-images/ files only — no remote URLs.
 */
function validateImagePath(value, productId, field, { publicDir, fileExists }) {
  const errors = [];
  const label = `product "${productId}" image.${field}`;

  if (typeof value !== "string") {
    errors.push(`${label} must be a string`);
    return { errors, normalizedPath: null };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    errors.push(`${label} is empty`);
    return { errors, normalizedPath: null };
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("//")
  ) {
    errors.push(
      `${label} must be a local /product-images/ path, not an external URL`
    );
    return { errors, normalizedPath: null };
  }

  if (!trimmed.startsWith(PRODUCT_IMAGE_PREFIX)) {
    errors.push(`${label} must begin with "/product-images/"`);
    return { errors, normalizedPath: null };
  }

  if (
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.includes("//") ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    errors.push(`${label} contains an unsafe path`);
    return { errors, normalizedPath: null };
  }

  const relativeFromPublic = trimmed.slice(1);
  const segments = relativeFromPublic.split("/");
  if (segments.some((segment) => segment === "" || segment === ".")) {
    errors.push(`${label} contains an unsafe path`);
    return { errors, normalizedPath: null };
  }

  const absolutePath = join(publicDir, ...segments);
  if (!isInsideDir(absolutePath, join(publicDir, "product-images"))) {
    errors.push(`${label} contains an unsafe path`);
    return { errors, normalizedPath: null };
  }

  if (!fileExists(absolutePath)) {
    errors.push(
      `${label} references missing file "public/${relativeFromPublic}"`
    );
  }

  return { errors, normalizedPath: trimmed };
}

function validateServedImageFilename(pathname, productId, field) {
  const errors = [];
  const label = `product "${productId}" image.${field}`;
  const basename = pathBasename(pathname);
  const extension = pathExtension(pathname);

  if (extension !== SERVED_IMAGE_EXTENSION) {
    errors.push(`${label} must use a .webp extension`);
  }

  const stem =
    basename.lastIndexOf(".") >= 0
      ? basename.slice(0, basename.lastIndexOf("."))
      : basename;
  if (productId && stem !== productId) {
    errors.push(`${label} filename must be "${productId}.webp"`);
  }

  return errors;
}

function validateOriginalImageFilename(pathname, productId) {
  const errors = [];
  const label = `product "${productId}" image.original`;
  const extension = pathExtension(pathname);

  if (!ORIGINAL_IMAGE_EXTENSIONS.has(extension)) {
    errors.push(
      `${label} must use a .jpg, .jpeg, .png, or .webp extension`
    );
  }

  return errors;
}

function validateProductImages(products, { publicDir, fileExists } = {}) {
  const errors = [];
  const resolvedPublicDir = publicDir ?? defaultPublicDir;
  const exists = fileExists ?? existsSync;
  const seenCard = new Map();
  const seenDetail = new Map();
  const seenOriginal = new Map();

  for (const product of products) {
    const productId = product.id ?? "(unknown)";
    const image = product.image;

    if (image === undefined || image === null) {
      continue;
    }

    if (typeof image !== "object" || Array.isArray(image)) {
      errors.push(`product "${productId}" image must be an object`);
      continue;
    }

    const hasCard = hasImageField(image, "card");
    const hasDetail = hasImageField(image, "detail");
    const hasOriginal = hasImageField(image, "original");

    if (hasCard && !hasDetail) {
      errors.push(
        `product "${productId}" image.card is set without image.detail`
      );
    } else if (hasDetail && !hasCard) {
      errors.push(
        `product "${productId}" image.detail is set without image.card`
      );
    } else if (!hasCard && !hasDetail) {
      errors.push(
        `product "${productId}" image must include both card and detail`
      );
    }

    const pathOptions = {
      publicDir: resolvedPublicDir,
      fileExists: exists,
    };

    if (hasCard) {
      const result = validateImagePath(
        image.card,
        productId,
        "card",
        pathOptions
      );
      errors.push(...result.errors);
      if (result.normalizedPath) {
        errors.push(
          ...validateServedImageFilename(result.normalizedPath, productId, "card")
        );
        if (seenCard.has(result.normalizedPath)) {
          errors.push(
            `duplicate image.card path "${result.normalizedPath}" on products "${seenCard.get(result.normalizedPath)}" and "${productId}"`
          );
        } else {
          seenCard.set(result.normalizedPath, productId);
        }
      }
    }

    if (hasDetail) {
      const result = validateImagePath(
        image.detail,
        productId,
        "detail",
        pathOptions
      );
      errors.push(...result.errors);
      if (result.normalizedPath) {
        errors.push(
          ...validateServedImageFilename(
            result.normalizedPath,
            productId,
            "detail"
          )
        );
        if (seenDetail.has(result.normalizedPath)) {
          errors.push(
            `duplicate image.detail path "${result.normalizedPath}" on products "${seenDetail.get(result.normalizedPath)}" and "${productId}"`
          );
        } else {
          seenDetail.set(result.normalizedPath, productId);
        }
      }
    }

    if (hasOriginal) {
      const result = validateImagePath(
        image.original,
        productId,
        "original",
        pathOptions
      );
      errors.push(...result.errors);
      if (result.normalizedPath) {
        errors.push(
          ...validateOriginalImageFilename(result.normalizedPath, productId)
        );
        if (seenOriginal.has(result.normalizedPath)) {
          errors.push(
            `duplicate image.original path "${result.normalizedPath}" on products "${seenOriginal.get(result.normalizedPath)}" and "${productId}"`
          );
        } else {
          seenOriginal.set(result.normalizedPath, productId);
        }
      }
    }
  }

  return errors;
}

const RECOMMENDATION_SOURCES = new Set(["sales", "manual"]);

/**
 * Optional customer-facing unit conversion hints on variants.
 * Shape: { fromUnitId, toUnitId, quantity }
 * Not POS conversion — display-only wholesale packing hints.
 */
function validateCustomerUnitHints(variant, unitIds) {
  const errors = [];
  const variantLabel = variant.id ?? "(unknown)";
  const hints = variant.customerUnitHints;

  if (hints === undefined || hints === null) {
    return errors;
  }

  if (!Array.isArray(hints)) {
    errors.push(
      `variant "${variantLabel}" customerUnitHints must be an array`
    );
    return errors;
  }

  const availableUnitIds = Array.isArray(variant.availableUnitIds)
    ? new Set(variant.availableUnitIds)
    : new Set();
  const seenPairs = new Map();

  hints.forEach((hint, index) => {
    const label = `variant "${variantLabel}" customerUnitHints[${index}]`;
    const fromUnitId = hint?.fromUnitId;
    const toUnitId = hint?.toUnitId;
    const quantity = hint?.quantity;

    if (
      fromUnitId === undefined ||
      fromUnitId === null ||
      fromUnitId === ""
    ) {
      errors.push(`${label} missing fromUnitId`);
    } else if (!unitIds.has(fromUnitId)) {
      errors.push(`${label} references unknown fromUnitId "${fromUnitId}"`);
    } else if (!availableUnitIds.has(fromUnitId)) {
      errors.push(
        `${label} fromUnitId "${fromUnitId}" is not in availableUnitIds`
      );
    }

    if (toUnitId === undefined || toUnitId === null || toUnitId === "") {
      errors.push(`${label} missing toUnitId`);
    } else if (!unitIds.has(toUnitId)) {
      errors.push(`${label} references unknown toUnitId "${toUnitId}"`);
    } else if (!availableUnitIds.has(toUnitId)) {
      errors.push(
        `${label} toUnitId "${toUnitId}" is not in availableUnitIds`
      );
    }

    if (fromUnitId && toUnitId && fromUnitId === toUnitId) {
      errors.push(`${label} cannot convert a unit to itself`);
    }

    if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
      errors.push(`${label} has invalid/non-numeric quantity`);
    } else if (quantity <= 0) {
      errors.push(`${label} has zero or negative quantity (${quantity})`);
    }

    if (fromUnitId && toUnitId && fromUnitId !== toUnitId) {
      const pairKey = `${fromUnitId}→${toUnitId}`;
      if (seenPairs.has(pairKey)) {
        errors.push(`${label} duplicate conversion pair "${pairKey}"`);
      } else {
        seenPairs.set(pairKey, true);
      }
    }
  });

  return errors;
}

function validateRecommendations(recommendations, productIds) {
  const errors = [];

  if (!Array.isArray(recommendations)) {
    errors.push("recommendations must be an array");
    return errors;
  }

  // Identity: sourceProductId + targetProductId + provenance source
  const seenEdges = new Map();

  recommendations.forEach((relationship, index) => {
    const label = `recommendation[${index}]`;
    const sourceProductId = relationship?.sourceProductId;
    const targetProductId = relationship?.targetProductId;
    const weight = relationship?.weight;
    const source = relationship?.source;

    if (
      sourceProductId === undefined ||
      sourceProductId === null ||
      sourceProductId === ""
    ) {
      errors.push(`${label} missing sourceProductId`);
    } else if (!productIds.has(sourceProductId)) {
      errors.push(
        `${label} has missing source product "${sourceProductId}"`
      );
    }

    if (
      targetProductId === undefined ||
      targetProductId === null ||
      targetProductId === ""
    ) {
      errors.push(`${label} missing targetProductId`);
    } else if (!productIds.has(targetProductId)) {
      errors.push(
        `${label} has missing target product "${targetProductId}"`
      );
    }

    if (
      sourceProductId &&
      targetProductId &&
      sourceProductId === targetProductId
    ) {
      errors.push(`${label} source recommends itself ("${sourceProductId}")`);
    }

    if (typeof weight !== "number" || !Number.isFinite(weight)) {
      errors.push(`${label} has invalid/non-numeric weight`);
    } else if (weight <= 0) {
      errors.push(`${label} has zero or negative weight (${weight})`);
    }

    if (source === undefined || source === null || source === "") {
      errors.push(`${label} missing provenance source`);
    } else if (!RECOMMENDATION_SOURCES.has(source)) {
      errors.push(
        `${label} has invalid provenance source "${source}" (expected sales|manual)`
      );
    }

    if (sourceProductId && targetProductId && source) {
      const edgeKey = `${sourceProductId}→${targetProductId}|${source}`;
      if (seenEdges.has(edgeKey)) {
        errors.push(
          `duplicate recommendation edge "${edgeKey}"`
        );
      } else {
        seenEdges.set(edgeKey, true);
      }
    }
  });

  return errors;
}

function validateCatalog(
  { products, variants, units, aliases, mappings, recommendations },
  options = {}
) {
  const errors = [];

  errors.push(...findDuplicateIds(products, "product"));
  errors.push(...findDuplicateIds(variants, "variant"));
  errors.push(...findDuplicateIds(units, "unit"));
  errors.push(...findDuplicateIds(aliases, "alias-record"));

  const productIds = new Set(products.map((product) => product.id));
  const unitIds = new Set(units.map((unit) => unit.id));
  const variantIds = new Set(variants.map((variant) => variant.id));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  for (const unit of units) {
    const unitLabel = unit.id ?? "(unknown)";

    if (unit.id === undefined || unit.id === null || unit.id === "") {
      errors.push("unit missing id");
    }
    if (isBlank(unit.name)) {
      errors.push(`unit "${unitLabel}" missing name`);
    }
    if (unit.productId) {
      if (!productIds.has(unit.productId)) {
        errors.push(
          `unit "${unitLabel}" has invalid productId "${unit.productId}"`
        );
      }
    }
  }

  for (const product of products) {
    if (product.id === undefined || product.id === null || product.id === "") {
      errors.push("product missing id");
    }
    if (isBlank(product.name)) {
      errors.push(`product "${product.id ?? "(unknown)"}" missing name`);
    }
  }

  for (const variant of variants) {
    const variantLabel = variant.id ?? "(unknown)";

    if (variant.id === undefined || variant.id === null || variant.id === "") {
      errors.push("variant missing id");
    }

    if (isBlank(variant.name)) {
      errors.push(`variant "${variantLabel}" missing name`);
    }

    if (!variant.productId || !productIds.has(variant.productId)) {
      errors.push(
        `variant "${variantLabel}" has invalid productId "${variant.productId}"`
      );
    }

    const availableUnitIds = Array.isArray(variant.availableUnitIds)
      ? variant.availableUnitIds
      : null;

    if (!availableUnitIds || availableUnitIds.length === 0) {
      errors.push(`variant "${variantLabel}" missing units`);
    } else {
      for (const unitId of availableUnitIds) {
        if (!unitIds.has(unitId)) {
          errors.push(
            `variant "${variantLabel}" references unknown unit "${unitId}"`
          );
        }
      }

      if (!variant.defaultUnitId) {
        errors.push(`variant "${variantLabel}" missing defaultUnitId`);
      } else if (!unitIds.has(variant.defaultUnitId)) {
        errors.push(
          `variant "${variantLabel}" references unknown defaultUnitId "${variant.defaultUnitId}"`
        );
      } else if (!availableUnitIds.includes(variant.defaultUnitId)) {
        errors.push(
          `variant "${variantLabel}" defaultUnitId "${variant.defaultUnitId}" is not in availableUnitIds`
        );
      } else {
        const defaultUnit = unitById.get(variant.defaultUnitId);
        if (defaultUnit && defaultUnit.active === false) {
          errors.push(
            `variant "${variantLabel}" defaultUnitId "${variant.defaultUnitId}" is inactive`
          );
        }
      }
    }

    if (
      variant.defaultQuantity === undefined ||
      variant.defaultQuantity === null ||
      Number(variant.defaultQuantity) < 1
    ) {
      errors.push(`variant "${variantLabel}" has invalid defaultQuantity`);
    }

    errors.push(...validateCustomerUnitHints(variant, unitIds));
  }

  const defaultsByProduct = new Map();
  for (const unit of units) {
    if (!unit.productId || !unit.isDefault) {
      continue;
    }
    const list = defaultsByProduct.get(unit.productId) ?? [];
    list.push(unit);
    defaultsByProduct.set(unit.productId, list);
  }

  for (const [productId, defaultUnits] of defaultsByProduct) {
    if (defaultUnits.length === 0) {
      errors.push(`product "${productId}" has no default unit`);
    } else if (defaultUnits.length > 1) {
      errors.push(`product "${productId}" has more than one default unit`);
    } else if (defaultUnits[0].active === false) {
      errors.push(
        `product "${productId}" default unit "${defaultUnits[0].id}" is inactive`
      );
    }
  }

  for (const product of products) {
    if (product.pattern !== "fixed-product") {
      continue;
    }
    const productUnits = units.filter((unit) => unit.productId === product.id);
    if (productUnits.length === 0) {
      continue;
    }
    const defaultUnits = productUnits.filter((unit) => unit.isDefault);
    if (defaultUnits.length === 0) {
      errors.push(`product "${product.id}" has no default unit`);
    }
  }

  // Exact duplicate aliases for the same target product are errors.
  // The same alias text on different products is allowed (legitimate ambiguity).
  const seenAliasPerTarget = new Map();

  for (const record of aliases) {
    const aliasLabel = record.id ?? "(unknown)";

    if (record.id === undefined || record.id === null || record.id === "") {
      errors.push("alias-record missing id");
    }

    const normalizedAlias = normalizeSearchText(record.alias);
    const hasProductId = !isBlank(record.productId);
    const hasVariantId =
      record.variantId !== undefined &&
      record.variantId !== null &&
      record.variantId !== "";

    if (!normalizedAlias) {
      errors.push(
        `alias-record "${aliasLabel}" missing alias or empty after normalization`
      );
    }

    if (hasProductId) {
      if (!productIds.has(record.productId)) {
        errors.push(
          `alias-record "${aliasLabel}" has invalid productId "${record.productId}"`
        );
      }
    } else if (hasVariantId) {
      if (!variantIds.has(record.variantId)) {
        errors.push(
          `alias-record "${aliasLabel}" has invalid variantId "${record.variantId}"`
        );
      }
    } else {
      errors.push(
        `alias-record "${aliasLabel}" missing productId or variantId`
      );
    }

    if (normalizedAlias && (hasProductId || hasVariantId)) {
      const targetId = hasProductId ? record.productId : record.variantId;
      const duplicateKey = `${targetId}::${normalizedAlias}`;

      if (seenAliasPerTarget.has(duplicateKey)) {
        errors.push(
          `duplicate alias "${normalizedAlias}" for the same product "${targetId}"`
        );
      } else {
        seenAliasPerTarget.set(duplicateKey, true);
      }
    }
  }

  for (const mapping of mappings) {
    const mappingLabel =
      mapping.sourceRowIndex !== undefined
        ? `row ${mapping.sourceRowIndex}`
        : "(unknown)";

    if (!mapping.productId || !productIds.has(mapping.productId)) {
      errors.push(
        `mapping ${mappingLabel} has invalid productId "${mapping.productId}"`
      );
    }

    if (!mapping.unitId || !unitIds.has(mapping.unitId)) {
      errors.push(
        `mapping ${mappingLabel} has invalid unitId "${mapping.unitId}"`
      );
    }
  }

  errors.push(...validateRecommendations(recommendations, productIds));
  errors.push(...validateProductImages(products, options));

  return errors;
}

function printSummary(
  { products, variants, units, aliases, mappings, recommendations },
  errors
) {
  console.log("Matahari Order — Catalogue Build");
  console.log("--------------------------------");
  console.log(`Products : ${products.length}`);
  console.log(`Variants : ${variants.length}`);
  console.log(`Units    : ${units.length}`);
  console.log(`Aliases  : ${aliases.length}`);
  console.log(`Mappings : ${mappings.length}`);
  console.log(
    `Reco     : ${Array.isArray(recommendations) ? recommendations.length : 0}`
  );
  console.log("");

  if (errors.length === 0) {
    console.log("Validation: OK");
    console.log("Errors    : 0");
    return;
  }

  console.log("Validation: FAILED");
  console.log(`Errors    : ${errors.length}`);
  console.log("");
  console.log("Issues:");
  for (const error of errors) {
    console.log(`  - ${error}`);
  }
}

function main() {
  const products = loadJson("products.json");
  const variants = loadJson("variants.json");
  const units = loadJson("units.json");
  const aliases = loadJson("aliases.json");
  const mappings = loadJson("mappings.json");
  const recommendations = loadJson("recommendations.json");

  if (
    !Array.isArray(products) ||
    !Array.isArray(variants) ||
    !Array.isArray(units) ||
    !Array.isArray(aliases) ||
    !Array.isArray(mappings) ||
    !Array.isArray(recommendations)
  ) {
    console.error("Catalogue JSON files must each contain an array.");
    process.exit(1);
  }

  const errors = validateCatalog({
    products,
    variants,
    units,
    aliases,
    mappings,
    recommendations,
  });
  printSummary(
    { products, variants, units, aliases, mappings, recommendations },
    errors
  );

  if (errors.length > 0) {
    process.exit(1);
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}

export { validateCatalog, validateProductImages };
