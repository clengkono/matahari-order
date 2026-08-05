import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogDir = join(__dirname, "..", "src", "catalog");

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

function validateCatalog({ products, variants, units, aliases }) {
  const errors = [];

  errors.push(...findDuplicateIds(products, "product"));
  errors.push(...findDuplicateIds(variants, "variant"));
  errors.push(...findDuplicateIds(units, "unit"));
  errors.push(...findDuplicateIds(aliases, "alias-record"));

  const productIds = new Set(products.map((product) => product.id));
  const unitIds = new Set(units.map((unit) => unit.id));
  const variantIds = new Set(variants.map((variant) => variant.id));

  for (const unit of units) {
    if (unit.id === undefined || unit.id === null || unit.id === "") {
      errors.push("unit missing id");
    }
    if (isBlank(unit.name)) {
      errors.push(`unit "${unit.id ?? "(unknown)"}" missing name`);
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
      }
    }

    if (
      variant.defaultQuantity === undefined ||
      variant.defaultQuantity === null ||
      Number(variant.defaultQuantity) < 1
    ) {
      errors.push(`variant "${variantLabel}" has invalid defaultQuantity`);
    }
  }

  const seenAliases = new Map();

  for (const record of aliases) {
    const aliasLabel = record.id ?? "(unknown)";

    if (record.id === undefined || record.id === null || record.id === "") {
      errors.push("alias-record missing id");
    }

    if (isBlank(record.alias)) {
      errors.push(`alias-record "${aliasLabel}" missing alias`);
    } else {
      const normalized = record.alias.trim().toLowerCase();
      if (seenAliases.has(normalized)) {
        errors.push(`duplicate alias "${record.alias.trim()}"`);
      } else {
        seenAliases.set(normalized, true);
      }
    }

    if (record.productId) {
      if (!productIds.has(record.productId)) {
        errors.push(
          `alias-record "${aliasLabel}" has invalid productId "${record.productId}"`
        );
      }
    } else if (record.variantId !== undefined) {
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
  }

  return errors;
}

function printSummary({ products, variants, units, aliases }, errors) {
  console.log("Matahari Order — Catalogue Build");
  console.log("--------------------------------");
  console.log(`Products : ${products.length}`);
  console.log(`Variants : ${variants.length}`);
  console.log(`Units    : ${units.length}`);
  console.log(`Aliases  : ${aliases.length}`);
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

  if (
    !Array.isArray(products) ||
    !Array.isArray(variants) ||
    !Array.isArray(units) ||
    !Array.isArray(aliases)
  ) {
    console.error("Catalogue JSON files must each contain an array.");
    process.exit(1);
  }

  const errors = validateCatalog({ products, variants, units, aliases });
  printSummary({ products, variants, units, aliases }, errors);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
