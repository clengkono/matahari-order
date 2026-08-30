/**
 * Stage 6B.1 owner-default overlay, validation, and leak smoke.
 * Writes only under temp dirs — never the live catalogue.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveOwnerDefaultUnitName,
  validateCatalog,
  validateProductDefaults,
} from "./buildCatalog.js";
import {
  assembleCustomerCatalog,
  serializeCustomerCatalog,
} from "./buildCustomerCatalog.js";
import { loadCatalog } from "./catalogTransaction.js";
import { isSafeOwnerPath } from "./publishClassify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");
const LIVE_RECOMMENDATIONS = join(LIVE_CATALOG_DIR, "recommendations.json");

const MILKITA_ID = "prod-milkita-candy-stroberi-premium-30";
const GLORY_ID = "prod-glory-16";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(
    `${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`
  );
}

function assert(name, condition, detail = "") {
  record(name, Boolean(condition), condition ? "" : detail);
  if (!condition) {
    throw new Error(`Assertion failed: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function validateOpts() {
  return { publicDir: LIVE_PUBLIC_DIR };
}

function oneUnitProductId(catalog) {
  const variant = catalog.variants.find(
    (row) => Array.isArray(row.availableUnitIds) && row.availableUnitIds.length === 1
  );
  return variant?.productId ?? null;
}

function main() {
  const scratch = mkdtempSync(join(tmpdir(), "matahari-product-defaults-"));
  const recoBefore = readFileSync(LIVE_RECOMMENDATIONS, "utf8");

  try {
    const live = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
    const productIds = new Set(live.products.map((product) => product.id));

    assert(
      "1. empty productDefaults is valid",
      validateProductDefaults([], productIds, live.variants, live.units)
        .length === 0
    );
    assert(
      "1b. live owner defaults are valid",
      Array.isArray(live.productDefaults) &&
        live.productDefaults.length === 1 &&
        live.productDefaults[0]?.productId === MILKITA_ID &&
        live.productDefaults[0]?.defaultUnitName === "Pak" &&
        validateProductDefaults(
          live.productDefaults,
          productIds,
          live.variants,
          live.units
        ).length === 0 &&
        validateCatalog(live, validateOpts()).length === 0
    );

    const validOverride = [
      { productId: MILKITA_ID, defaultUnitName: "Pak" },
    ];
    assert(
      "2. valid owner override passes",
      validateProductDefaults(
        validOverride,
        productIds,
        live.variants,
        live.units
      ).length === 0
    );

    const unknownProduct = validateProductDefaults(
      [{ productId: "prod-does-not-exist", defaultUnitName: "Pak" }],
      productIds,
      live.variants,
      live.units
    );
    assert(
      "3. unknown product fails",
      unknownProduct.some((message) => message.includes("unknown product"))
    );

    const duplicate = validateProductDefaults(
      [
        { productId: MILKITA_ID, defaultUnitName: "Pak" },
        { productId: MILKITA_ID, defaultUnitName: "Karton" },
      ],
      productIds,
      live.variants,
      live.units
    );
    assert(
      "4. duplicate product override fails",
      duplicate.some((message) => message.includes("duplicate productDefaults"))
    );

    const unavailable = validateProductDefaults(
      [{ productId: MILKITA_ID, defaultUnitName: "Slof" }],
      productIds,
      live.variants,
      live.units
    );
    assert(
      "5. unavailable unit fails",
      unavailable.some((message) => message.includes("not an available unit"))
    );

    const inactiveCatalog = structuredClone(live);
    const milkitaVariant = inactiveCatalog.variants.find(
      (row) => row.productId === MILKITA_ID
    );
    const pakUnit = inactiveCatalog.units.find(
      (unit) => unit.id === `${MILKITA_ID}__pak`
    );
    pakUnit.active = false;
    const inactive = validateProductDefaults(
      [{ productId: MILKITA_ID, defaultUnitName: "Pak" }],
      productIds,
      inactiveCatalog.variants,
      inactiveCatalog.units
    );
    assert(
      "6. inactive unit fails",
      inactive.some((message) => message.includes("is inactive")) &&
        milkitaVariant.availableUnitIds.includes(`${MILKITA_ID}__pak`)
    );

    const malformed = validateProductDefaults(
      [
        { productId: MILKITA_ID, defaultUnitName: "" },
        { productId: GLORY_ID },
      ],
      productIds,
      live.variants,
      live.units
    );
    assert(
      "7. malformed/empty unit fails",
      malformed.filter((message) => message.includes("missing defaultUnitName"))
        .length >= 2
    );

    const withOverride = structuredClone(live);
    withOverride.productDefaults = validOverride;
    const customerWithOverride = assembleCustomerCatalog(withOverride);
    const milkitaCustomer = customerWithOverride.products.find(
      (product) => product.id === MILKITA_ID
    );
    const gloryCustomer = customerWithOverride.products.find(
      (product) => product.id === GLORY_ID
    );
    assert(
      "8. customer build uses owner override",
      milkitaCustomer?.defaultUnit === "Pak"
    );
    assert(
      "9. customer build falls back to variant default when no override exists",
      gloryCustomer?.defaultUnit === "Slof"
    );

    const singleId = oneUnitProductId(live);
    const singleVariant = live.variants.find(
      (row) => row.productId === singleId
    );
    const singleUnit = live.units.find(
      (unit) => unit.id === singleVariant.defaultUnitId
    );
    const singleOverride = [
      { productId: singleId, defaultUnitName: singleUnit.name },
    ];
    assert(
      "10. one-unit product can be configured",
      Boolean(singleId) &&
        validateProductDefaults(
          singleOverride,
          productIds,
          live.variants,
          live.units
        ).length === 0
    );

    const serialized = serializeCustomerCatalog(customerWithOverride);
    assert(
      "11. no owner/admin default metadata leaks to customer artefact",
      !serialized.includes("productDefaults") &&
        !serialized.includes("ownerConfigured") &&
        !serialized.includes("defaultUnitId") &&
        !serialized.includes("defaultUnitName")
    );
    assert(
      "12. no price/POS conversion leakage",
      !serialized.toLowerCase().includes("price") &&
        !serialized.toLowerCase().includes("harga") &&
        !serialized.includes("conversion") &&
        !serialized.includes("qtyPerPackage") &&
        !customerWithOverride.products.some(
          (product) =>
            Object.hasOwn(product, "posCode") ||
            Object.hasOwn(product, "mappings")
        )
    );

    assert(
      "resolveOwnerDefaultUnitName uses existing unit equivalence",
      resolveOwnerDefaultUnitName("pak", ["Pak", "Karton"]).ok &&
        resolveOwnerDefaultUnitName("pak", ["Pak", "Karton"]).name === "Pak"
    );

    const liveCustomer = assembleCustomerCatalog(live);
    assert(
      "live customer defaults use the Milkita owner override",
      liveCustomer.products.find((product) => product.id === MILKITA_ID)
        ?.defaultUnit === "Pak" &&
        liveCustomer.products.find((product) => product.id === GLORY_ID)
          ?.defaultUnit === "Slof"
    );
    assert(
      "20. recommendations remain unchanged",
      readFileSync(LIVE_RECOMMENDATIONS, "utf8") === recoBefore &&
        JSON.stringify(liveCustomer.recommendations) ===
          JSON.stringify(live.recommendations.map((row) => ({
            sourceProductId: row.sourceProductId,
            targetProductId: row.targetProductId,
            weight: row.weight,
            source: row.source,
          })))
    );
    assert(
      "productDefaults.json is safe owner data",
      isSafeOwnerPath("src/catalog/productDefaults.json")
    );
    assert(
      "live owner override is Milkita Stroberi Premium → Pak",
      live.productDefaults.length === 1 &&
        live.productDefaults[0]?.productId === MILKITA_ID &&
        live.productDefaults[0]?.defaultUnitName === "Pak"
    );
    assert(
      "catalogue counts remain the Stage 6B.1 baseline",
      live.products.length === 2256 &&
        live.variants.length === 2256 &&
        live.units.length === 5840 &&
        live.mappings.length === 5834 &&
        live.aliases.length === 196 &&
        live.recommendations.length === 147 &&
        live.productFamilies.length === 3
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  main();
  console.log("");
  console.log(`Product default smoke: ${results.length}/${results.length} passed`);
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(`Product default smoke failed after ${passed}/${results.length} checks`);
  console.error(error.message || error);
  process.exitCode = 1;
}
