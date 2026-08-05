import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const samplePath = join(
  __dirname,
  "catalog-samples",
  "cigarettes.sample.json"
);
const previewDir = join(rootDir, "tmp", "catalog-preview");

const UNIT_SORT_ORDER = [
  "Bungkus",
  "5 Bungkus",
  "½ Slof",
  "Slof",
  "½ Pak",
  "Pak",
  "Pcs",
  "Dus",
  "½ Karton",
  "Karton",
  "Bal",
  "Balok",
];

const DEFAULT_UNIT_PREFERENCE = ["Slof", "Karton", "Dus", "Bungkus"];

const INACTIVE_UNITS_CIGARETTE_PREVIEW = new Set(["Bal"]);

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function titleCaseWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeProductName(rawName) {
  if (isBlank(rawName)) {
    return "";
  }

  return titleCaseWords(rawName.trim().replace(/\s+/g, " "));
}

function normalizeUnitLabel(rawUnit) {
  if (isBlank(rawUnit)) {
    return "";
  }

  const compact = rawUnit.trim().replace(/\s+/g, " ").toUpperCase();

  if (compact === "BKS") {
    return "Bungkus";
  }
  if (compact === "5BKS" || compact === "5 BKS") {
    return "5 Bungkus";
  }
  if (compact === "1/2 SLOF" || compact === "½ SLOF") {
    return "½ Slof";
  }
  if (compact === "SLOF") {
    return "Slof";
  }
  if (compact === "BAL") {
    return "Bal";
  }
  if (compact === "BLK") {
    return "Balok";
  }
  if (compact === "DOS" || compact === "DUS") {
    return "Dus";
  }
  if (compact === "PCS") {
    return "Pcs";
  }
  if (compact === "PAK") {
    return "Pak";
  }
  if (compact === "1/2PAK" || compact === "1/2 PAK" || compact === "½ PAK") {
    return "½ Pak";
  }
  if (compact === "KTN" || compact === "KARTON") {
    return "Karton";
  }
  if (compact === "1/2KTN" || compact === "1/2 KTN" || compact === "½ KTN") {
    return "½ Karton";
  }

  return titleCaseWords(rawUnit.trim());
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/½/g, "1-2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productIdFromName(name) {
  return `prod-${slugify(name)}`;
}

function unitIdFromProductAndUnit(productId, unitName) {
  return `${productId}__${slugify(unitName)}`;
}

function sortOrderForUnit(unitName) {
  const index = UNIT_SORT_ORDER.indexOf(unitName);
  return index === -1 ? UNIT_SORT_ORDER.length + 1 : index + 1;
}

function chooseDefaultUnit(unitNames) {
  const activeNames = unitNames.filter(
    (name) => !INACTIVE_UNITS_CIGARETTE_PREVIEW.has(name)
  );

  for (const preferred of DEFAULT_UNIT_PREFERENCE) {
    if (activeNames.includes(preferred)) {
      return preferred;
    }
  }

  return activeNames[0] ?? null;
}

function buildPreview(sourceRows) {
  const groups = new Map();
  const ambiguousRows = [];
  const allMappings = [];

  sourceRows.forEach((row, index) => {
    const sourceRowIndex = index;
    const posCode = typeof row?.posCode === "string" ? row.posCode.trim() : "";
    const posName = typeof row?.posName === "string" ? row.posName : "";
    const posUnit = typeof row?.posUnit === "string" ? row.posUnit : "";

    const productName = normalizeProductName(posName);
    const unitName = normalizeUnitLabel(posUnit);

    if (!productName || !unitName || !posCode) {
      ambiguousRows.push({
        sourceRowIndex,
        reason: "missing posCode, product name, or unit after normalization",
        row,
      });
      return;
    }

    if (!groups.has(productName)) {
      groups.set(productName, {
        name: productName,
        id: productIdFromName(productName),
        units: new Map(),
      });
    }

    const group = groups.get(productName);
    if (!group.units.has(unitName)) {
      group.units.set(unitName, []);
    }

    const mapping = {
      sourceRowIndex,
      posCode,
      posName: posName.trim(),
      posUnit: posUnit.trim(),
      productId: group.id,
      productName,
      unitName,
    };

    group.units.get(unitName).push(mapping);
    allMappings.push(mapping);
  });

  const products = [];
  const units = [];
  const inactiveUnits = [];

  for (const group of groups.values()) {
    const unitNames = [...group.units.keys()].sort(
      (a, b) => sortOrderForUnit(a) - sortOrderForUnit(b)
    );
    const defaultUnitName = chooseDefaultUnit(unitNames);

    const productUnitIds = [];

    for (const unitName of unitNames) {
      const sourceMappings = group.units.get(unitName);
      const active = !INACTIVE_UNITS_CIGARETTE_PREVIEW.has(unitName);
      const isDefault = unitName === defaultUnitName;
      const unitId = unitIdFromProductAndUnit(group.id, unitName);

      const unitRecord = {
        id: unitId,
        productId: group.id,
        name: unitName,
        active,
        isDefault,
        sortOrder: sortOrderForUnit(unitName),
        sourceMappings: sourceMappings.map((mapping) => ({
          sourceRowIndex: mapping.sourceRowIndex,
          posCode: mapping.posCode,
          posName: mapping.posName,
          posUnit: mapping.posUnit,
        })),
      };

      units.push(unitRecord);
      productUnitIds.push(unitId);

      if (!active) {
        inactiveUnits.push({
          unitId,
          productId: group.id,
          productName: group.name,
          unitName,
        });
      }
    }

    products.push({
      id: group.id,
      name: group.name,
      category: "Rokok",
      pattern: "fixed-product",
      availableUnitIds: productUnitIds,
      defaultUnitId: defaultUnitName
        ? unitIdFromProductAndUnit(group.id, defaultUnitName)
        : null,
      defaultQuantity: 1,
    });
  }

  products.sort((a, b) => a.name.localeCompare(b.name, "en"));
  units.sort((a, b) => {
    if (a.productId === b.productId) {
      return a.sortOrder - b.sortOrder;
    }
    return a.productId.localeCompare(b.productId, "en");
  });

  const mappings = allMappings.map((mapping) => ({
    sourceRowIndex: mapping.sourceRowIndex,
    posCode: mapping.posCode,
    posName: mapping.posName,
    posUnit: mapping.posUnit,
    productId: mapping.productId,
    productName: mapping.productName,
    unitName: mapping.unitName,
    unitId: unitIdFromProductAndUnit(mapping.productId, mapping.unitName),
  }));

  const duplicateSourceMappings = findDuplicatePosMappings(mappings);

  const review = {
    productsGenerated: products.length,
    sourceRowsProcessed: sourceRows.length,
    inactiveUnits,
    duplicateSourceMappings,
    ambiguousRows,
    validationErrors: [],
  };

  return { products, units, mappings, review };
}

function findDuplicateIds(items, label) {
  const seen = new Map();
  const duplicates = [];

  for (const item of items) {
    const id = item?.id;
    if (id === undefined || id === null || id === "") {
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

function findDuplicatePosMappings(mappings) {
  const seen = new Map();
  const duplicates = [];

  for (const mapping of mappings) {
    const key = `${mapping.posCode}::${mapping.posUnit}`;
    if (seen.has(key)) {
      duplicates.push({
        posCode: mapping.posCode,
        posUnit: mapping.posUnit,
        firstSourceRowIndex: seen.get(key),
        duplicateSourceRowIndex: mapping.sourceRowIndex,
      });
    } else {
      seen.set(key, mapping.sourceRowIndex);
    }
  }

  return duplicates;
}

function validatePreview({ products, units, mappings }) {
  const errors = [];

  errors.push(...findDuplicateIds(products, "product"));
  errors.push(...findDuplicateIds(units, "unit"));

  const productIds = new Set(products.map((product) => product.id));
  const unitIds = new Set(units.map((unit) => unit.id));

  for (const product of products) {
    const productLabel = product.id ?? "(unknown)";

    if (product.id === undefined || product.id === null || product.id === "") {
      errors.push("product missing id");
    }

    if (isBlank(product.name)) {
      errors.push(`product "${productLabel}" missing name`);
    }

    const productUnits = units.filter((unit) => unit.productId === product.id);
    const defaultUnits = productUnits.filter((unit) => unit.isDefault);

    if (defaultUnits.length === 0) {
      errors.push(`product "${productLabel}" has no default unit`);
    } else if (defaultUnits.length > 1) {
      errors.push(
        `product "${productLabel}" has more than one default unit`
      );
    } else if (!defaultUnits[0].active) {
      errors.push(
        `product "${productLabel}" default unit "${defaultUnits[0].id}" is inactive`
      );
    }

    if (product.defaultUnitId) {
      if (!unitIds.has(product.defaultUnitId)) {
        errors.push(
          `product "${productLabel}" references unknown defaultUnitId "${product.defaultUnitId}"`
        );
      }
    }

    const availableUnitIds = Array.isArray(product.availableUnitIds)
      ? product.availableUnitIds
      : [];

    for (const unitId of availableUnitIds) {
      if (!unitIds.has(unitId)) {
        errors.push(
          `product "${productLabel}" references unknown unit "${unitId}"`
        );
      }
    }
  }

  for (const unit of units) {
    const unitLabel = unit.id ?? "(unknown)";

    if (unit.id === undefined || unit.id === null || unit.id === "") {
      errors.push("unit missing id");
    }

    if (isBlank(unit.name)) {
      errors.push(`unit "${unitLabel}" missing name`);
    }

    if (!unit.productId || !productIds.has(unit.productId)) {
      errors.push(
        `unit "${unitLabel}" has invalid productId "${unit.productId}"`
      );
    }

    if (!Array.isArray(unit.sourceMappings) || unit.sourceMappings.length === 0) {
      errors.push(`unit "${unitLabel}" missing source mappings`);
    }
  }

  for (const mapping of mappings) {
    if (!mapping.productId || !productIds.has(mapping.productId)) {
      errors.push(
        `mapping row ${mapping.sourceRowIndex} has invalid productId "${mapping.productId}"`
      );
    }

    if (!mapping.unitId || !unitIds.has(mapping.unitId)) {
      errors.push(
        `mapping row ${mapping.sourceRowIndex} has invalid unitId "${mapping.unitId}"`
      );
    }
  }

  const duplicatePos = findDuplicatePosMappings(mappings);
  for (const duplicate of duplicatePos) {
    errors.push(
      `duplicate POS mapping "${duplicate.posCode}" / "${duplicate.posUnit}"`
    );
  }

  return errors;
}

function printSummary({ products, units, review }, errors) {
  console.log("Catalogue Builder Preview");
  console.log("");
  console.log(`Source rows : ${review.sourceRowsProcessed}`);
  console.log(`Products    : ${products.length}`);
  console.log(`Unit options: ${units.length}`);
  console.log(`Inactive    : ${review.inactiveUnits.length}`);
  console.log(`Warnings    : ${review.ambiguousRows.length + review.duplicateSourceMappings.length}`);
  console.log(`Errors      : ${errors.length}`);
  console.log("");

  if (errors.length === 0) {
    console.log("Validation: OK");
    return;
  }

  console.log("Validation: FAILED");
  console.log("");
  console.log("Issues:");
  for (const error of errors) {
    console.log(`  - ${error}`);
  }
}

function generatePreview() {
  const sourceRows = loadJson(samplePath);

  if (!Array.isArray(sourceRows)) {
    console.error("Sample catalogue JSON must contain an array.");
    process.exit(1);
  }

  const preview = buildPreview(sourceRows);
  const errors = validatePreview(preview);
  preview.review.validationErrors = errors;

  mkdirSync(previewDir, { recursive: true });
  writeJson(join(previewDir, "products.preview.json"), preview.products);
  writeJson(join(previewDir, "units.preview.json"), preview.units);
  writeJson(join(previewDir, "mappings.preview.json"), preview.mappings);
  writeJson(join(previewDir, "review.preview.json"), preview.review);

  printSummary(preview, errors);

  if (errors.length > 0) {
    process.exit(1);
  }
}

function checkPreview() {
  let products;
  let units;
  let mappings;
  let review;

  try {
    products = loadJson(join(previewDir, "products.preview.json"));
    units = loadJson(join(previewDir, "units.preview.json"));
    mappings = loadJson(join(previewDir, "mappings.preview.json"));
    review = loadJson(join(previewDir, "review.preview.json"));
  } catch (error) {
    console.error(
      "Preview files are missing. Run `npm run catalog:preview` first."
    );
    console.error(error.message);
    process.exit(1);
  }

  if (
    !Array.isArray(products) ||
    !Array.isArray(units) ||
    !Array.isArray(mappings) ||
    typeof review !== "object" ||
    review === null
  ) {
    console.error("Preview JSON files have an unexpected shape.");
    process.exit(1);
  }

  const errors = validatePreview({ products, units, mappings });
  const summaryReview = {
    sourceRowsProcessed:
      review.sourceRowsProcessed ?? mappings.length ?? 0,
    inactiveUnits: Array.isArray(review.inactiveUnits)
      ? review.inactiveUnits
      : units.filter((unit) => unit.active === false),
    ambiguousRows: Array.isArray(review.ambiguousRows)
      ? review.ambiguousRows
      : [],
    duplicateSourceMappings: Array.isArray(review.duplicateSourceMappings)
      ? review.duplicateSourceMappings
      : [],
  };

  printSummary({ products, units, review: summaryReview }, errors);

  if (errors.length > 0) {
    process.exit(1);
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    checkPreview();
    return;
  }

  generatePreview();
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}

export {
  buildPreview,
  normalizeProductName,
  normalizeUnitLabel,
  validatePreview,
};
