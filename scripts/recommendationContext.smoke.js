/**
 * Stage 7A.2 recommendation-context leak smoke.
 * Read-only against live catalogue. Does not write src/catalog or images.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./catalogTransaction.js";
import { assembleCustomerCatalog } from "./buildCustomerCatalog.js";
import {
  excludeSimilarFromRecommendations,
} from "../src/utils/productFamilies.js";
import { searchProducts } from "../src/utils/productSearch.js";
import {
  getRecommendedProducts,
  recommendationSourcesForCart,
  recommendationSourcesForProductDetail,
  recommendationSourcesForSearch,
} from "../src/utils/recommendations.js";
import { buildSalesPopularity } from "../src/utils/salesPopularity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_RECOMMENDATIONS = join(LIVE_CATALOG_DIR, "recommendations.json");
const APP_SOURCE = join(ROOT, "src", "App.jsx");
const CARD_SOURCE = join(ROOT, "src", "components", "RecommendationCard.jsx");
const SEARCH_SOURCE = join(ROOT, "src", "utils", "productSearch.js");
const POPULARITY_SOURCE = join(ROOT, "src", "utils", "salesPopularity.js");

const AQUA_ID = "prod-aqua-15l";
const MILKITA_ID = "prod-milkita-candy-coklat-premium-30";
const DAIA_ID = "prod-daia-bunga-sachet-46g";
const GLORY_ID = "prod-glory-16";
const TROY_ID = "prod-troy-20";

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

function leakedCartSources(productId, cart) {
  return [
    { productId },
    ...cart.map((line) => ({ productId: line.productId })),
  ];
}

function leakedSearchSources(searchHits, cart) {
  return [
    ...searchHits.map((product) => ({ productId: product.id })),
    ...cart.map((line) => ({ productId: line.productId })),
  ];
}

function productPageRecos(product, relationships, products, cart = []) {
  const cartIds = new Set(cart.map((line) => line.productId));
  return excludeSimilarFromRecommendations(
    getRecommendedProducts({
      cart: recommendationSourcesForProductDetail(product.id),
      relationships,
      products,
      limit: 8,
    }),
    product.similarProductIds
  ).filter((row) => !cartIds.has(row.id));
}

function searchRecos(searchHits, relationships, products, cart = []) {
  const searchIds = new Set(searchHits.map((product) => product.id));
  const cartIds = new Set(cart.map((line) => line.productId));
  return getRecommendedProducts({
    cart: recommendationSourcesForSearch(searchHits),
    relationships,
    products,
    limit: 3,
  }).filter((row) => !searchIds.has(row.id) && !cartIds.has(row.id));
}

function hasPriceField(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    Object.hasOwn(value, "price") ||
    Object.hasOwn(value, "harga") ||
    Object.hasOwn(value, "hargaJual")
  );
}

try {
  const live = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
  const customer = assembleCustomerCatalog(live);
  const products = customer.products;
  const relationships = customer.recommendations;
  const byId = Object.fromEntries(products.map((product) => [product.id, product]));
  const recoText = readFileSync(LIVE_RECOMMENDATIONS, "utf8");
  const recoJson = JSON.parse(recoText);
  const appSource = readFileSync(APP_SOURCE, "utf8");
  const cardSource = readFileSync(CARD_SOURCE, "utf8");
  const searchSource = readFileSync(SEARCH_SOURCE, "utf8");
  const popularitySource = readFileSync(POPULARITY_SOURCE, "utf8");

  const aqua = byId[AQUA_ID];
  const milkita = byId[MILKITA_ID];
  const daia = byId[DAIA_ID];
  const glory = byId[GLORY_ID];
  const gloryCart = [{ productId: GLORY_ID }];

  assert("fixture products exist", Boolean(aqua && milkita && daia && glory));

  assert(
    "1. product-detail sources are the viewed product only",
    JSON.stringify(recommendationSourcesForProductDetail(AQUA_ID)) ===
      JSON.stringify([{ productId: AQUA_ID }]) &&
      JSON.stringify(
        recommendationSourcesForProductDetail(AQUA_ID).concat(
          recommendationSourcesForCart(gloryCart)
        )
      ) !==
        JSON.stringify(recommendationSourcesForProductDetail(AQUA_ID))
  );

  assert(
    "2. search sources are search hits only",
    JSON.stringify(recommendationSourcesForSearch([aqua, milkita])) ===
      JSON.stringify([{ productId: AQUA_ID }, { productId: MILKITA_ID }]) &&
      !recommendationSourcesForSearch([aqua]).some(
        (row) => row.productId === GLORY_ID
      )
  );

  assert(
    "3. cart sources remain whole-cart",
    JSON.stringify(recommendationSourcesForCart(gloryCart)) ===
      JSON.stringify([{ productId: GLORY_ID }]) &&
      JSON.stringify(
        recommendationSourcesForCart([
          { productId: GLORY_ID },
          { productId: TROY_ID },
        ])
      ) ===
        JSON.stringify([
          { productId: GLORY_ID },
          { productId: TROY_ID },
        ])
  );

  const leakedAqua = getRecommendedProducts({
    cart: leakedCartSources(AQUA_ID, gloryCart),
    relationships,
    products,
    limit: 8,
  });
  const fixedAqua = productPageRecos(aqua, relationships, products, gloryCart);
  assert(
    "4. Aqua Detail + Glory cart: BEFORE leaked cigarettes, AFTER none",
    leakedAqua.length > 0 &&
      leakedAqua.every((product) => product.category === "Rokok") &&
      leakedAqua.some((product) => product.id === TROY_ID) &&
      fixedAqua.length === 0
  );

  const leakedMilkita = getRecommendedProducts({
    cart: leakedCartSources(MILKITA_ID, gloryCart),
    relationships,
    products,
    limit: 8,
  });
  const fixedMilkita = productPageRecos(
    milkita,
    relationships,
    products,
    gloryCart
  );
  assert(
    "5. Milkita Detail + Glory cart: AFTER no inherited Glory recs",
    leakedMilkita.some((product) => product.category === "Rokok") &&
      fixedMilkita.length === 0
  );

  const leakedDaia = getRecommendedProducts({
    cart: leakedCartSources(DAIA_ID, gloryCart),
    relationships,
    products,
    limit: 8,
  });
  const fixedDaia = productPageRecos(daia, relationships, products, gloryCart);
  assert(
    "6. Daia Detail + Glory cart: AFTER no inherited Glory recs",
    leakedDaia.some((product) => product.category === "Rokok") &&
      fixedDaia.length === 0
  );

  const gloryEmpty = productPageRecos(glory, relationships, products, []);
  const gloryWithSelfInCart = productPageRecos(
    glory,
    relationships,
    products,
    gloryCart
  );
  assert(
    "7. Glory Detail still has cigarette recommendations",
    gloryEmpty.length > 0 &&
      gloryEmpty.every((product) => product.category === "Rokok") &&
      gloryEmpty.some((product) => product.id === TROY_ID) &&
      gloryWithSelfInCart.length > 0 &&
      !gloryWithSelfInCart.some((product) => product.id === GLORY_ID)
  );

  const popularity = buildSalesPopularity(relationships);
  const aquaSearch = searchProducts({
    query: "aqua",
    products,
    aliases: customer.aliases,
    popularityById: popularity,
  });
  const milkitaSearch = searchProducts({
    query: "milkita",
    products,
    aliases: customer.aliases,
    popularityById: popularity,
  });
  const daiaSearch = searchProducts({
    query: "daia",
    products,
    aliases: customer.aliases,
    popularityById: popularity,
  });
  const glorySearch = searchProducts({
    query: "glory",
    products,
    aliases: customer.aliases,
    popularityById: popularity,
  });

  const leakedAquaSearch = getRecommendedProducts({
    cart: leakedSearchSources(aquaSearch.results, gloryCart),
    relationships,
    products,
    limit: 3,
  });
  const fixedAquaSearch = searchRecos(
    aquaSearch.results,
    relationships,
    products,
    gloryCart
  );
  assert(
    "8. search aqua + Glory cart: BEFORE cigarettes, AFTER none",
    leakedAquaSearch.some((product) => product.category === "Rokok") &&
      fixedAquaSearch.length === 0
  );

  assert(
    "9. search milkita + Glory cart: AFTER no cigarette strip",
    searchRecos(
      milkitaSearch.results,
      relationships,
      products,
      gloryCart
    ).length === 0
  );

  assert(
    "10. search daia + Glory cart: AFTER no cigarette strip",
    searchRecos(daiaSearch.results, relationships, products, gloryCart)
      .length === 0
  );

  const searchWithOwnEdges = searchRecos(
    glorySearch.results,
    relationships,
    products,
    []
  );
  assert(
    "11. search whose hits have edges may still recommend",
    glorySearch.results.some((product) => product.id === GLORY_ID) &&
      searchWithOwnEdges.length > 0 &&
      searchWithOwnEdges.every((product) => product.category === "Rokok") &&
      !searchWithOwnEdges.some((product) => product.id === GLORY_ID)
  );

  const cartRecos = getRecommendedProducts({
    cart: recommendationSourcesForCart(gloryCart),
    relationships,
    products,
    limit: 8,
  });
  assert(
    "12. cart with Glory still has FBT",
    cartRecos.length > 0 &&
      cartRecos.every((product) => product.category === "Rokok") &&
      cartRecos.some((product) => product.id === TROY_ID) &&
      !cartRecos.some((product) => product.id === GLORY_ID)
  );

  const overlap = excludeSimilarFromRecommendations(
    [{ id: DAIA_ID }, { id: "prod-daia-hijab-sachet-46g" }, { id: GLORY_ID }],
    daia.similarProductIds
  );
  assert(
    "13. Produk Serupa exclusion remains functional",
    Array.isArray(daia.similarProductIds) &&
      daia.similarProductIds.includes("prod-daia-hijab-sachet-46g") &&
      overlap.length === 2 &&
      overlap.every((row) => row.id !== "prod-daia-hijab-sachet-46g") &&
      appSource.includes("excludeSimilarFromRecommendations") &&
      appSource.includes("recommendationSourcesForProductDetail") &&
      !appSource.includes("...cart.map((line) => ({ productId: line.productId }))")
  );

  const salesCount = recoJson.filter((edge) => edge.source === "sales").length;
  const manualCount = recoJson.filter((edge) => edge.source === "manual").length;
  assert(
    "14. recommendations.json unchanged: 147 sales, 0 manual",
    recoJson.length === 147 &&
      salesCount === 147 &&
      manualCount === 0 &&
      live.recommendations.length === 147
  );

  const aquaNoPop = searchProducts({
    query: "aqua",
    products,
    aliases: customer.aliases,
  });
  assert(
    "15. search relevance still text/alias first",
    aquaSearch.results.some((product) => product.id === AQUA_ID) &&
      aquaSearch.nameMatches.some((product) => product.id === AQUA_ID) &&
      aquaNoPop.results.some((product) => product.id === AQUA_ID) &&
      !searchSource.includes("recommendationSourcesFor") &&
      popularitySource.includes("only order products") &&
      !appSource.includes("popularityById: salesPopularity") === false
  );

  assert(
    "16. no prices on recommendation cards or ranked products",
    !cardSource.includes("price") &&
      !cardSource.includes("harga") &&
      gloryEmpty.every((product) => !hasPriceField(product)) &&
      cartRecos.every((product) => !hasPriceField(product))
  );

  console.log("");
  console.log(
    `Recommendation context smoke: ${results.length}/${results.length} passed`
  );
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(
    `Recommendation context smoke failed after ${passed}/${results.length} checks`
  );
  console.error(error.message || error);
  process.exitCode = 1;
}
