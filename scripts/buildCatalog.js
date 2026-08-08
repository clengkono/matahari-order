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

function validateRecommendations(recommendations, productIds) {
  const errors = [];

  if (!Array.isArray(recommendations)) {
    errors.push("recommendations must be an array");
    return errors;
  }

  const seenPairs = new Map();

  recommendations.forEach((relationship, index) => {
    const label = `recommendation[${index}]`;
    const sourceProductId = relationship?.sourceProductId;
    const targetProductId = relationship?.targetProductId;
    const weight = relationship?.weight;

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

    if (sourceProductId && targetProductId) {
      const pairKey = `${sourceProductId}→${targetProductId}`;
      if (seenPairs.has(pairKey)) {
        errors.push(
          `duplicate source → target relationship "${pairKey}"`
        );
      } else {
        seenPairs.set(pairKey, true);
      }
    }
  });

  return errors;
}

function validateCatalog({
  products,
  variants,
  units,
  aliases,
  mappings,
  recommendations,
}) {
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

main();
