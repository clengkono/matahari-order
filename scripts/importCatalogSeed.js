import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const catalogDir = join(rootDir, "src", "catalog");
const seedPath = join(rootDir, "rkk.catalog-seed.json");

const CURATED_CIGARETTE_FAVORITES = new Set([
  "Glory 16",
  "Troy 20",
  "Apache 16",
  "Chief 12",
]);

const NON_CIGARETTE_PRODUCTS = [
  {
    id: "prod-aqua-15l",
    name: "Aqua 1.5 L",
    category: "Minuman",
    favorite: true,
    pattern: "fixed-product",
  },
  {
    id: "prod-masako-ayam",
    name: "Masako Ayam",
    category: "Bahan & Bumbu Masak",
    favorite: true,
    pattern: "fixed-product",
  },
  {
    id: "prod-masako-sapi",
    name: "Masako Sapi",
    category: "Bahan & Bumbu Masak",
    favorite: true,
    pattern: "fixed-product",
  },
  {
    id: "prod-energen-vanilla",
    name: "Energen Vanilla",
    category: "Minuman",
    favorite: true,
    pattern: "fixed-product",
  },
  {
    id: "prod-teh-botol-sosro",
    name: "Teh Botol Sosro",
    category: "Minuman",
    favorite: true,
    pattern: "fixed-product",
  },
  {
    id: "prod-indomie-goreng",
    name: "Indomie Goreng",
    category: "Bahan & Bumbu Masak",
    favorite: false,
    pattern: "fixed-product",
  },
];

const NON_CIGARETTE_VARIANTS = [
  {
    id: "prod-aqua-15l",
    productId: "prod-aqua-15l",
    name: "Aqua 1.5 L",
    availableUnitIds: ["pcs", "karton"],
    defaultUnitId: "karton",
    defaultQuantity: 1,
  },
  {
    id: "prod-masako-ayam",
    productId: "prod-masako-ayam",
    name: "Masako Ayam",
    availableUnitIds: ["bungkus", "dus"],
    defaultUnitId: "dus",
    defaultQuantity: 1,
  },
  {
    id: "prod-masako-sapi",
    productId: "prod-masako-sapi",
    name: "Masako Sapi",
    availableUnitIds: ["bungkus", "dus"],
    defaultUnitId: "dus",
    defaultQuantity: 1,
  },
  {
    id: "prod-energen-vanilla",
    productId: "prod-energen-vanilla",
    name: "Energen Vanilla",
    availableUnitIds: ["pcs", "pack"],
    defaultUnitId: "pack",
    defaultQuantity: 1,
  },
  {
    id: "prod-teh-botol-sosro",
    productId: "prod-teh-botol-sosro",
    name: "Teh Botol Sosro",
    availableUnitIds: ["pcs", "karton"],
    defaultUnitId: "karton",
    defaultQuantity: 1,
  },
  {
    id: "prod-indomie-goreng",
    productId: "prod-indomie-goreng",
    name: "Indomie Goreng",
    availableUnitIds: ["bungkus", "dus"],
    defaultUnitId: "dus",
    defaultQuantity: 1,
  },
];

const SHARED_UNITS = [
  { id: "bungkus", name: "Bungkus", active: true },
  { id: "slof", name: "Slof", active: true },
  { id: "dus", name: "Dus", active: true },
  { id: "pcs", name: "Pcs", active: true },
  { id: "karton", name: "Karton", active: true },
  { id: "pack", name: "Pack", active: true },
];

const ALIASES = [
  {
    id: "alias-glory-1",
    productId: "prod-glory-16",
    alias: "glori",
  },
  {
    id: "alias-aqua-1",
    productId: "prod-aqua-15l",
    alias: "aqua",
  },
  {
    id: "alias-teh-botol-1",
    productId: "prod-teh-botol-sosro",
    alias: "teh botol",
  },
  {
    id: "alias-indomie-1",
    productId: "prod-indomie-goreng",
    alias: "mie goreng",
  },
  {
    id: "alias-masako-ayam-1",
    productId: "prod-masako-ayam",
    alias: "masako",
  },
];

function writeJson(fileName, data) {
  writeFileSync(
    join(catalogDir, fileName),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );
}

function loadSeed() {
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  if (!Array.isArray(seed.products) || !Array.isArray(seed.units)) {
    throw new Error("rkk.catalog-seed.json must include products and units arrays.");
  }
  if (!Array.isArray(seed.mappings)) {
    throw new Error("rkk.catalog-seed.json must include a mappings array.");
  }
  return seed;
}

function importSeed() {
  const seed = loadSeed();

  const cigaretteProducts = seed.products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category || "Rokok",
    favorite: CURATED_CIGARETTE_FAVORITES.has(product.name),
    pattern: product.pattern || "fixed-product",
  }));

  const products = [...cigaretteProducts, ...NON_CIGARETTE_PRODUCTS];

  const cigaretteUnits = seed.units.map((unit) => ({
    id: unit.id,
    productId: unit.productId,
    name: unit.name,
    active: unit.active !== false,
    isDefault: Boolean(unit.isDefault),
    sortOrder: unit.sortOrder ?? null,
  }));

  const units = [...SHARED_UNITS, ...cigaretteUnits];

  const unitById = new Map(cigaretteUnits.map((unit) => [unit.id, unit]));

  const cigaretteVariants = seed.products.map((product) => {
    const availableUnitIds = (product.availableUnitIds ?? []).filter((unitId) => {
      const unit = unitById.get(unitId);
      return unit ? unit.active !== false : false;
    });

    return {
      id: product.id,
      productId: product.id,
      name: product.name,
      availableUnitIds,
      defaultUnitId: product.defaultUnitId,
      defaultQuantity: product.defaultQuantity ?? 1,
    };
  });

  const variants = [...cigaretteVariants, ...NON_CIGARETTE_VARIANTS];

  const mappings = seed.mappings.map((mapping) => ({
    sourceRowIndex: mapping.sourceRowIndex,
    posCode: mapping.posCode,
    posName: mapping.posName,
    posUnit: mapping.posUnit,
    productId: mapping.productId,
    productName: mapping.productName,
    unitId: mapping.unitId,
    unitName: mapping.unitName,
  }));

  writeJson("products.json", products);
  writeJson("units.json", units);
  writeJson("variants.json", variants);
  writeJson("mappings.json", mappings);
  writeJson("aliases.json", ALIASES);

  console.log("Imported RKK catalogue seed into src/catalog");
  console.log(`  Cigarette products : ${cigaretteProducts.length}`);
  console.log(`  Cigarette units    : ${cigaretteUnits.length}`);
  console.log(`  Non-cigarette keep : ${NON_CIGARETTE_PRODUCTS.length}`);
  console.log(`  Total products     : ${products.length}`);
  console.log(`  Total variants     : ${variants.length}`);
  console.log(`  Total units        : ${units.length}`);
  console.log(`  Mappings           : ${mappings.length}`);
  console.log(
    `  Cigarette favorites: ${cigaretteProducts.filter((product) => product.favorite).length}`
  );
}

importSeed();
