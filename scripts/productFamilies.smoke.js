/**
 * Stage 6A product-family / Produk Serupa smoke.
 * Does not write live catalogue files.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts } from "../src/utils/productSearch.js";
import {
  deriveSimilarProductIds,
  excludeSimilarFromRecommendations,
  resolveSimilarProducts,
} from "../src/utils/productFamilies.js";
import { isSafeOwnerPath } from "./publishClassify.js";
import { loadCatalog } from "./catalogTransaction.js";
import {
  assembleCustomerCatalog,
  serializeCustomerCatalog,
} from "./buildCustomerCatalog.js";
import { validateCatalog, validateProductFamilies } from "./buildCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");
const LIVE_CUSTOMER = join(
  LIVE_CATALOG_DIR,
  "generated",
  "customerCatalog.json"
);

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

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

const DAIA_IDS = Object.freeze([
  "prod-daia-bunga-sachet-46g",
  "prod-daia-hijab-sachet-46g",
  "prod-daia-lemon-sachet-46g",
  "prod-daia-putih-sachet-46g",
  "prod-daia-softener-sachet-46g",
  "prod-daia-violet-sachet-46g",
]);

try {
  const live = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
  const productIds = new Set(live.products.map((product) => product.id));
  const liveCustomer = assembleCustomerCatalog(live);
  const liveSerialized = serializeCustomerCatalog(liveCustomer);
  const onDiskCustomer = JSON.parse(readText(LIVE_CUSTOMER));
  const productInfoSource = readText(
    join(ROOT, "src", "components", "ProductInfoView.jsx")
  );
  const appSource = readText(join(ROOT, "src", "App.jsx"));
  const recoCardSource = readText(
    join(ROOT, "src", "components", "RecommendationCard.jsx")
  );
  const searchSource = readText(join(ROOT, "src", "utils", "productSearch.js"));

  const liveFamilyErrors = validateProductFamilies(
    live.productFamilies,
    productIds
  );
  assert(
    "1. valid live families pass",
    liveFamilyErrors.length === 0,
    liveFamilyErrors.join("; ")
  );

  const catalogErrors = validateCatalog(live, { publicDir: LIVE_PUBLIC_DIR });
  assert(
    "live catalog:check equivalent still passes with families",
    catalogErrors.length === 0,
    catalogErrors.slice(0, 5).join("; ")
  );

  assert(
    "duplicate family id is rejected",
    validateProductFamilies(
      [
        { id: "family-a", members: ["prod-glory-16", "prod-troy-20"] },
        { id: "family-a", members: ["prod-apache-16", "prod-nation-gold-20"] },
      ],
      productIds
    ).some((message) => message.includes("duplicate product family id"))
  );

  assert(
    "3. missing member is rejected",
    validateProductFamilies(
      [
        {
          id: "family-missing",
          members: ["prod-glory-16", "prod-does-not-exist"],
        },
      ],
      productIds
    ).some((message) => message.includes("missing product"))
  );

  assert(
    "4. duplicate member is rejected",
    validateProductFamilies(
      [
        {
          id: "family-dup-member",
          members: ["prod-glory-16", "prod-glory-16"],
        },
      ],
      productIds
    ).some((message) => message.includes("duplicate member"))
  );

  assert(
    "5. product in two families is rejected",
    validateProductFamilies(
      [
        { id: "family-one", members: ["prod-glory-16", "prod-troy-20"] },
        { id: "family-two", members: ["prod-glory-16", "prod-apache-16"] },
      ],
      productIds
    ).some((message) => message.includes("multiple families"))
  );

  assert(
    "6. family with fewer than 2 members is rejected",
    validateProductFamilies(
      [{ id: "family-solo", members: ["prod-glory-16"] }],
      productIds
    ).some((message) => message.includes("at least 2 members"))
  );

  const daiaFamily = live.productFamilies.find(
    (family) => family.id === "daia-sachet-46g"
  );
  const similarByProduct = deriveSimilarProductIds(live.productFamilies);
  const daiaSimilar = similarByProduct.get("prod-daia-violet-sachet-46g") ?? [];

  assert(
    "7. similar IDs are symmetric and follow family order",
    JSON.stringify(daiaSimilar) ===
      JSON.stringify(
        DAIA_IDS.filter((id) => id !== "prod-daia-violet-sachet-46g")
      ) &&
      daiaFamily?.members.length === 6 &&
      similarByProduct.get("prod-daia-bunga-sachet-46g")?.length === 5
  );

  assert(
    "8. current product excludes self",
    !daiaSimilar.includes("prod-daia-violet-sachet-46g") &&
      daiaSimilar.length === 5
  );

  const daiaCustomer = liveCustomer.products.find(
    (product) => product.id === "prod-daia-violet-sachet-46g"
  );
  const gloryCustomer = liveCustomer.products.find(
    (product) => product.id === "prod-glory-16"
  );
  const customerWithSimilar = liveCustomer.products.filter((product) =>
    Array.isArray(product.similarProductIds)
  );

  assert(
    "9. customer artefact stores IDs only",
    customerWithSimilar.length === 10 &&
      customerWithSimilar.every(
        (product) =>
          product.similarProductIds.every(
            (id) => typeof id === "string" && productIds.has(id) && id !== product.id
          ) && !Object.hasOwn(product, "familyId")
      ) &&
      !liveSerialized.includes("productFamilies") &&
      !liveSerialized.includes("daia-sachet-46g")
  );

  assert(
    "10. no original image leakage",
    !liveSerialized.includes("product-images/originals") &&
      liveCustomer.products.every((product) => !product.image?.original)
  );

  assert(
    "11. Produk Serupa renders only when related products exist",
    productInfoSource.includes("title=\"Produk Serupa\"") &&
      productInfoSource.includes(
        "if (!Array.isArray(products) || products.length === 0)"
      ) &&
      Array.isArray(daiaCustomer?.similarProductIds) &&
      daiaCustomer.similarProductIds.length === 5 &&
      gloryCustomer?.similarProductIds === undefined
  );

  assert(
    "12. + uses existing cart / recommendation add path",
    appSource.includes("onQuickAddRecommendation={handleAddRecommendation}") &&
      productInfoSource.includes("onAdd={onQuickAddRecommendation}") &&
      recoCardSource.includes("event.stopPropagation()") &&
      recoCardSource.includes("onAdd(product)")
  );

  assert(
    "13. card click opens related product",
    appSource.includes("onOpenRecommendation={handleOpenRecommendationProduct}") &&
      productInfoSource.includes("onOpen={onOpenRecommendation}") &&
      appSource.includes("setProductStack((current) => [...current, product])")
  );

  const overlap = excludeSimilarFromRecommendations(
    [
      { id: "prod-daia-bunga-sachet-46g" },
      { id: "prod-glory-16" },
    ],
    daiaCustomer.similarProductIds
  );
  assert(
    "14. overlap with Sering Dipesan Bersama is suppressed in co-purchase only",
    overlap.length === 1 &&
      overlap[0].id === "prod-glory-16" &&
      appSource.includes("excludeSimilarFromRecommendations") &&
      !appSource.includes("catalogRecommendations.filter")
  );

  assert(
    "15. products without a family remain unchanged",
    gloryCustomer &&
      !Object.hasOwn(gloryCustomer, "similarProductIds") &&
      gloryCustomer.name === "Glory 16" &&
      gloryCustomer.defaultUnit === "Slof"
  );

  assert(
    "16. catalogue counts remain unchanged",
    live.products.length === 2256 &&
      live.variants.length === 2256 &&
      live.units.length === 5840 &&
      live.mappings.length === 5834 &&
      live.aliases.length === 196 &&
      live.recommendations.length === 147 &&
      live.productFamilies.length === 3
  );

  const resolved = resolveSimilarProducts(
    daiaCustomer.similarProductIds,
    Object.fromEntries(liveCustomer.products.map((product) => [product.id, product]))
  );
  assert(
    "resolved similar products keep family member order and omit self",
    resolved.map((product) => product.id).join(",") ===
      daiaCustomer.similarProductIds.join(",") &&
      !resolved.some((product) => product.id === "prod-daia-violet-sachet-46g")
  );

  const milkita = liveCustomer.products.find(
    (product) => product.id === "prod-milkita-candy-stroberi-premium-30"
  );
  assert(
    "Milkita Premium family is two flavor variants",
    JSON.stringify(milkita?.similarProductIds) ===
      JSON.stringify(["prod-milkita-candy-coklat-premium-30"])
  );

  const searchHit = searchProducts({
    query: "daia violet",
    products: liveCustomer.products,
    aliases: liveCustomer.aliases,
  });
  assert(
    "search ranking/results are unchanged for daia violet",
    searchHit.results.some(
      (product) => product.id === "prod-daia-violet-sachet-46g"
    ) &&
      !searchSource.includes("similarProductIds") &&
      !searchSource.includes("productFamilies")
  );

  assert(
    "customerCatalog on disk matches assembled families",
    JSON.stringify(onDiskCustomer.products.find((product) => product.id === "prod-daia-violet-sachet-46g")?.similarProductIds) ===
      JSON.stringify(daiaCustomer.similarProductIds)
  );

  assert(
    "family JSON is safe owner data and not mixed into recommendations",
    isSafeOwnerPath("src/catalog/productFamilies.json") &&
      !JSON.stringify(live.recommendations).includes("daia-sachet-46g")
  );

  assert(
    "Produk Serupa is listed above Sering Dipesan Bersama in ProductInfo",
    productInfoSource.indexOf('title="Produk Serupa"') <
      productInfoSource.indexOf('title="Sering Dipesan Bersama"')
  );

  console.log("");
  console.log(`Product family smoke: ${results.length}/${results.length} passed`);
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(`Product family smoke failed after ${passed}/${results.length} checks`);
  console.error(error.message || error);
  process.exitCode = 1;
}
