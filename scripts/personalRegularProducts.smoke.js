/**
 * Stage 7C.2 Sering Anda Pesan smoke.
 * Synthetic profiles and a tiny fake catalogue only.
 * Does not read or write src/catalog or public/product-images.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEARNING_PROFILE_SCHEMA_VERSION,
  emptyLearningProfile,
} from "../src/utils/learningProfileStorage.js";
import {
  derivePersonalRegularProductIds,
  resolvePersonalRegularProducts,
} from "../src/utils/personalRegularProducts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APP_SOURCE = join(ROOT, "src", "App.jsx");
const HELPER_SOURCE = join(ROOT, "src", "utils", "personalRegularProducts.js");
const SECTION_SOURCE = join(ROOT, "src", "components", "PersonalRegularsSection.jsx");
const LEARNING_SOURCE = join(ROOT, "src", "utils", "learningProfileStorage.js");
const SERING_SOURCE = join(ROOT, "src", "utils", "salesPopularity.js");
const FEATURED_SOURCE = join(ROOT, "src", "config", "homepageFeatured.js");
const RECO_SOURCE = join(ROOT, "src", "utils", "recommendations.js");
const PACKAGE_SOURCE = join(ROOT, "package.json");

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

function isoAt(offsetMs) {
  return new Date(Date.UTC(2026, 7, 1, 0, 0, 0) + offsetMs).toISOString();
}

function makeOccasions(productIdRows) {
  const count = productIdRows.length;
  return productIdRows.map((productIds, index) => ({
    observedAt: isoAt((count - index) * 60_000),
    productIds: [...productIds],
  }));
}

function makeProductEntry(productId, orderCount, lastOrderedAt, extra = {}) {
  return {
    productId,
    orderCount,
    lastOrderedAt,
    recentObservations: extra.recentObservations ?? [
      {
        unit: extra.unit ?? "Slof",
        quantity: extra.quantity ?? 1,
        orderedAt: lastOrderedAt,
      },
    ],
  };
}

function entriesFromRows(occasionRows, orderCountOverrides = {}, observationExtras = {}) {
  const counts = {};
  const lastAt = {};
  const count = occasionRows.length;

  occasionRows.forEach((ids, index) => {
    const at = isoAt((count - index) * 60_000);
    for (const id of ids) {
      counts[id] = (counts[id] ?? 0) + 1;
      if (!(id in lastAt)) {
        lastAt[id] = at;
      }
    }
  });

  return Object.keys(counts).map((productId) =>
    makeProductEntry(
      productId,
      orderCountOverrides[productId] ?? counts[productId],
      lastAt[productId],
      observationExtras[productId] ?? {}
    )
  );
}

function makeProfile({
  occasionRows = [],
  orderCountOverrides = {},
  observationExtras = {},
  totalOrderingOccasions,
  schemaVersion = LEARNING_PROFILE_SCHEMA_VERSION,
  products,
} = {}) {
  const recentOccasions = makeOccasions(occasionRows);
  const productEntries =
    products ??
    entriesFromRows(occasionRows, orderCountOverrides, observationExtras);
  const productsMap = {};

  for (const entry of productEntries) {
    productsMap[entry.productId] = entry;
  }

  return {
    schemaVersion,
    totalOrderingOccasions: totalOrderingOccasions ?? recentOccasions.length,
    firstObservedAt: recentOccasions[recentOccasions.length - 1]?.observedAt ?? "",
    lastObservedAt: recentOccasions[0]?.observedAt ?? "",
    lastOccasion: recentOccasions[0]
      ? {
          fingerprint: "fp",
          observedAt: recentOccasions[0].observedAt,
        }
      : null,
    recentOccasions,
    products: productsMap,
  };
}

function fakeProduct(id) {
  return {
    id,
    name: id,
    defaultUnit: "Slof",
    defaultQuantity: 1,
    availableUnits: ["Slof"],
  };
}

function fakeCatalog(ids) {
  return ids.map(fakeProduct);
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

try {
  const appSource = readFileSync(APP_SOURCE, "utf8");
  const helperSource = readFileSync(HELPER_SOURCE, "utf8");
  const sectionSource = readFileSync(SECTION_SOURCE, "utf8");
  const learningSource = readFileSync(LEARNING_SOURCE, "utf8");
  const seringSource = readFileSync(SERING_SOURCE, "utf8");
  const featuredSource = readFileSync(FEATURED_SOURCE, "utf8");
  const recoSource = readFileSync(RECO_SOURCE, "utf8");
  const packageSource = readFileSync(PACKAGE_SOURCE, "utf8");

  const catalog = fakeCatalog([
    "prod-a",
    "prod-b",
    "prod-c",
    "prod-d",
    "prod-e",
    "prod-f",
    "prod-g",
    "prod-h",
    "prod-i",
    "prod-k",
    "prod-m",
    "prod-high",
    "prod-low",
    "prod-q",
    "prod-z",
    "prod-six",
    "prod-oldsix",
    "prod-recent",
    "prod-lifetime",
    "prod-heavy",
  ]);

  assert(
    "1. 0 occasions → []",
    derivePersonalRegularProductIds(emptyLearningProfile()).length === 0 &&
      derivePersonalRegularProductIds(makeProfile({ occasionRows: [] })).length ===
        0
  );

  const oneOccasion = makeProfile({
    occasionRows: [["prod-a", "prod-b"]],
  });
  assert(
    "2. 1 occasion → []",
    derivePersonalRegularProductIds(oneOccasion).length === 0
  );

  const twoOfTwo = makeProfile({
    occasionRows: [
      ["prod-a", "prod-b"],
      ["prod-a", "prod-b"],
    ],
  });
  assert(
    "3. 2 occasions including 2/2 → []",
    derivePersonalRegularProductIds(twoOfTwo).length === 0
  );

  const threeMix = makeProfile({
    occasionRows: [
      ["prod-a", "prod-c"],
      ["prod-a", "prod-b"],
      ["prod-a", "prod-b"],
    ],
  });
  assert(
    "4. 3 occasions: A 3/3 and B 2/3 only",
    JSON.stringify(derivePersonalRegularProductIds(threeMix)) ===
      JSON.stringify(["prod-a", "prod-b"])
  );

  const fiveWindow = makeProfile({
    occasionRows: [
      ["prod-q"],
      ["prod-z"],
      ["prod-q"],
      ["prod-z"],
      ["prod-q"],
    ],
  });
  const fiveIds = derivePersonalRegularProductIds(fiveWindow);
  assert("5. 3/5 qualifies", fiveIds.includes("prod-q"));
  assert("6. 2/5 fails", !fiveIds.includes("prod-z") && fiveIds.length === 1);

  const tenWindow = makeProfile({
    occasionRows: [
      ["prod-six"],
      ["prod-six"],
      ["prod-c"],
      ["prod-d"],
      ["prod-six", "prod-oldsix"],
      ["prod-six", "prod-oldsix"],
      ["prod-six", "prod-oldsix"],
      ["prod-six", "prod-oldsix"],
      ["prod-oldsix"],
      ["prod-oldsix"],
    ],
  });
  const tenIds = derivePersonalRegularProductIds(tenWindow);
  assert(
    "7. exact 6/10 qualifies when recency guard passes",
    tenIds.includes("prod-six")
  );

  const lifetimeHeavy = makeProfile({
    occasionRows: [
      ["prod-heavy"],
      ["prod-a"],
      ["prod-b"],
      ["prod-c"],
      ["prod-d"],
      ["prod-e"],
      ["prod-f"],
      ["prod-g"],
      ["prod-h"],
      ["prod-i"],
    ],
    orderCountOverrides: { "prod-heavy": 80 },
  });
  assert(
    "8. lifetime-heavy but newest 1/10 fails",
    !derivePersonalRegularProductIds(lifetimeHeavy).includes("prod-heavy")
  );

  const rankRecent = makeProfile({
    occasionRows: [
      ["prod-recent", "prod-lifetime"],
      ["prod-recent", "prod-lifetime"],
      ["prod-recent"],
      ["prod-recent"],
      ["prod-recent", "prod-lifetime"],
      ["prod-recent", "prod-lifetime"],
      ["prod-recent", "prod-lifetime"],
      ["prod-recent", "prod-lifetime"],
      ["prod-a"],
      ["prod-b"],
    ],
    orderCountOverrides: {
      "prod-recent": 8,
      "prod-lifetime": 40,
    },
  });
  const rankedRecent = derivePersonalRegularProductIds(rankRecent);
  assert(
    "9. recent 8/10 ranks strongly over old lifetime product",
    rankedRecent[0] === "prod-recent" &&
      rankedRecent.includes("prod-lifetime") &&
      rankedRecent.indexOf("prod-recent") < rankedRecent.indexOf("prod-lifetime")
  );

  const resolveDropped = resolvePersonalRegularProducts(
    ["prod-a", "prod-missing", "prod-b"],
    catalog
  );
  assert(
    "10. missing current catalogue ID dropped during resolution",
    resolveDropped.map((product) => product.id).join(",") === "prod-a,prod-b"
  );

  const retiredProfile = makeProfile({
    occasionRows: [
      ["prod-a", "prod-retired"],
      ["prod-a", "prod-retired"],
      ["prod-a", "prod-retired"],
    ],
  });
  const retiredBefore = JSON.stringify(retiredProfile);
  const retiredIds = derivePersonalRegularProductIds(retiredProfile);
  const retiredResolved = resolvePersonalRegularProducts(retiredIds, catalog);
  assert(
    "11. missing/retired ID remains untouched in input profile",
    retiredProfile.products["prod-retired"] != null &&
      retiredProfile.recentOccasions.some((occasion) =>
        occasion.productIds.includes("prod-retired")
      ) &&
      JSON.stringify(retiredProfile) === retiredBefore &&
      !retiredResolved.some((product) => product.id === "prod-retired") &&
      retiredIds.includes("prod-retired")
  );

  const shuffledRows = [
    ["prod-b", "prod-a", "prod-c"],
    ["prod-c", "prod-a", "prod-b"],
    ["prod-a", "prod-b"],
  ];
  const mapOrderA = makeProfile({
    occasionRows: shuffledRows,
    products: [
      makeProductEntry("prod-c", 3, isoAt(180_000)),
      makeProductEntry("prod-a", 3, isoAt(180_000)),
      makeProductEntry("prod-b", 2, isoAt(120_000)),
    ],
  });
  const mapOrderB = makeProfile({
    occasionRows: shuffledRows,
    products: [
      makeProductEntry("prod-b", 2, isoAt(120_000)),
      makeProductEntry("prod-a", 3, isoAt(180_000)),
      makeProductEntry("prod-c", 3, isoAt(180_000)),
    ],
  });
  assert(
    "12. ranking deterministic with shuffled product-map key order",
    JSON.stringify(derivePersonalRegularProductIds(mapOrderA)) ===
      JSON.stringify(derivePersonalRegularProductIds(mapOrderB)) &&
      JSON.stringify(derivePersonalRegularProductIds(mapOrderA)) ===
        JSON.stringify(["prod-a", "prod-b", "prod-c"])
  );

  const occurrenceA = makeProfile({
    occasionRows: [
      ["prod-b", "prod-a"],
      ["prod-a", "prod-c"],
      ["prod-c", "prod-a", "prod-b"],
    ],
  });
  const occurrenceB = makeProfile({
    occasionRows: [
      ["prod-a", "prod-b"],
      ["prod-c", "prod-a"],
      ["prod-b", "prod-c", "prod-a"],
    ],
  });
  assert(
    "13. ranking deterministic from occurrence evidence",
    JSON.stringify(derivePersonalRegularProductIds(occurrenceA)) ===
      JSON.stringify(derivePersonalRegularProductIds(occurrenceB))
  );

  const idsNoCart = derivePersonalRegularProductIds(threeMix);
  const idsIgnoredCart = derivePersonalRegularProductIds(threeMix, {
    cart: [{ productId: "prod-a", unit: "Slof", quantity: 9 }],
  });
  assert(
    "14. helper has no cart input",
    derivePersonalRegularProductIds.length === 1 &&
      resolvePersonalRegularProducts.length === 2 &&
      helperSource.includes(
        "export function derivePersonalRegularProductIds(profile)"
      ) &&
      !helperSource.includes("derivePersonalRegularProductIds(profile,") &&
      JSON.stringify(idsNoCart) === JSON.stringify(idsIgnoredCart)
  );

  assert(
    "15. in-cart concept does not remove derived ID",
    idsNoCart.includes("prod-a") &&
      idsIgnoredCart.includes("prod-a") &&
      JSON.stringify(idsNoCart) === JSON.stringify(["prod-a", "prod-b"])
  );

  const nineEligible = makeProfile({
    occasionRows: [
      ["prod-a", "prod-b", "prod-c", "prod-d", "prod-e", "prod-f", "prod-g", "prod-h", "prod-i"],
      ["prod-a", "prod-b", "prod-c", "prod-d", "prod-e", "prod-f", "prod-g", "prod-h", "prod-i"],
      ["prod-a", "prod-b", "prod-c", "prod-d", "prod-e", "prod-f", "prod-g", "prod-h", "prod-i"],
    ],
  });
  const capped = derivePersonalRegularProductIds(nineEligible);
  assert(
    "16. 9 eligible → only 8 returned",
    capped.length === 8 &&
      JSON.stringify(capped) ===
        JSON.stringify([
          "prod-a",
          "prod-b",
          "prod-c",
          "prod-d",
          "prod-e",
          "prod-f",
          "prod-g",
          "prod-h",
        ]) &&
      !capped.includes("prod-i")
  );

  assert(
    "17. null / empty / unsupported schema → []",
    derivePersonalRegularProductIds(null).length === 0 &&
      derivePersonalRegularProductIds(undefined).length === 0 &&
      derivePersonalRegularProductIds({}).length === 0 &&
      derivePersonalRegularProductIds({ schemaVersion: 2, recentOccasions: threeMix.recentOccasions }).length === 0 &&
      resolvePersonalRegularProducts([], catalog).length === 0 &&
      resolvePersonalRegularProducts(null, catalog).length === 0
  );

  const frozen = deepFreeze(structuredClone(threeMix));
  const beforeFrozen = JSON.stringify(frozen);
  derivePersonalRegularProductIds(frozen);
  resolvePersonalRegularProducts(["prod-a"], catalog);
  assert(
    "18. input profile not mutated",
    JSON.stringify(frozen) === beforeFrozen
  );

  assert(
    "19. no salesPopularity/recommendations/homepageFeatured dependency",
    !helperSource.includes("salesPopularity") &&
      !helperSource.includes("homepageFeatured") &&
      !helperSource.includes("getSeringDipesanProducts") &&
      !helperSource.includes("getRecommendedProducts") &&
      !helperSource.includes("catalogRecommendations") &&
      !sectionSource.includes("salesPopularity") &&
      !sectionSource.includes("RecommendationCard") &&
      !seringSource.includes("derivePersonalRegularProductIds") &&
      !featuredSource.includes("derivePersonalRegularProductIds") &&
      !recoSource.includes("derivePersonalRegularProductIds")
  );

  const observationProfile = makeProfile({
    occasionRows: [
      ["prod-a", "prod-b"],
      ["prod-a", "prod-b"],
      ["prod-a", "prod-b"],
    ],
    observationExtras: {
      "prod-a": { unit: "Karton", quantity: 99 },
      "prod-b": { unit: "Slof", quantity: 1 },
    },
  });
  const observationIds = derivePersonalRegularProductIds(observationProfile);
  assert(
    "20. no recentObservations/unit/quantity used for eligibility",
    JSON.stringify(observationIds) === JSON.stringify(["prod-a", "prod-b"]) &&
      !helperSource.includes("recentObservations") &&
      !helperSource.includes("preferredUnit") &&
      !helperSource.includes("preferredQuantity") &&
      !helperSource.includes(".unit") &&
      !helperSource.includes(".quantity")
  );

  assert(
    "21. PersonalRegularsSection returns null for empty products",
    sectionSource.includes("if (!Array.isArray(products) || products.length === 0)") &&
      sectionSource.includes("return null;") &&
      sectionSource.includes("Sering Anda Pesan") &&
      sectionSource.includes("ProductCard") &&
      !sectionSource.includes("RecommendationCard")
  );

  const previousAt = appSource.indexOf("<PreviousOrdersSection");
  const personalAt = appSource.indexOf("<PersonalRegularsSection");
  const seringAt = appSource.indexOf('aria-label="Sering Dipesan"');
  const personalBlock = appSource.slice(
    appSource.lastIndexOf("{showHomepage", personalAt),
    appSource.indexOf("{isCategoryMode &&", personalAt)
  );
  const memoBlockStart = appSource.indexOf("const personalRegularProducts = useMemo");
  const memoBlock = appSource.slice(
    memoBlockStart,
    appSource.indexOf("const showHomepage", memoBlockStart)
  );
  assert(
    "22. App renders section only under homepage gate with heading",
    previousAt !== -1 &&
      personalAt !== -1 &&
      seringAt !== -1 &&
      previousAt < personalAt &&
      personalAt < seringAt &&
      personalBlock.includes("showHomepage") &&
      personalBlock.includes("<PersonalRegularsSection") &&
      sectionSource.includes(">Sering Anda Pesan<") &&
      memoBlock.includes("loadLearningProfile()") &&
      memoBlock.includes("[orderHistory]") &&
      !appSource.includes("PersonalRegularsSection") === false
  );

  const missingNewest = makeProfile({
    occasionRows: [
      ["prod-a"],
      ["prod-a", "prod-b"],
      ["prod-a", "prod-b"],
    ],
  });
  assert(
    "23a. 2/3 missing newest → eligible",
    derivePersonalRegularProductIds(missingNewest).includes("prod-b") &&
      derivePersonalRegularProductIds(missingNewest).includes("prod-a")
  );
  assert(
    "23b. 6/10 absent newest four → excluded",
    !tenIds.includes("prod-oldsix")
  );

  const tieBreak = makeProfile({
    occasionRows: [
      ["prod-high", "prod-low", "prod-k", "prod-m"],
      ["prod-high", "prod-low", "prod-k", "prod-m"],
      ["prod-c"],
    ],
    orderCountOverrides: {
      "prod-high": 10,
      "prod-low": 3,
      "prod-k": 5,
      "prod-m": 5,
    },
  });
  assert(
    "24. equal appearances + recency: lifetime then productId",
    JSON.stringify(derivePersonalRegularProductIds(tieBreak)) ===
      JSON.stringify(["prod-high", "prod-k", "prod-m", "prod-low"])
  );

  const seringBlockStart = appSource.indexOf('aria-label="Sering Dipesan"');
  const seringBlock = appSource.slice(
    seringBlockStart,
    appSource.indexOf("searchResultsSection", seringBlockStart)
  );
  assert(
    "source: no overlap filtering added to Sering Dipesan",
    seringBlock.includes("homepageFeaturedProducts") &&
      !seringBlock.includes("personalRegularProducts") &&
      !seringBlock.includes("derivePersonalRegularProductIds") &&
      !appSource.includes("homepageFeaturedProducts.filter") &&
      appSource.includes("getSeringDipesanProducts") &&
      !seringSource.includes("personalRegular")
  );

  assert(
    "source: no new localStorage key",
    !helperSource.includes("localStorage") &&
      !helperSource.includes("matahari-order:") &&
      !sectionSource.includes("localStorage") &&
      !sectionSource.includes("matahari-order:") &&
      !appSource.includes("matahari-order:personal") &&
      !appSource.includes("matahari-order:sering-anda")
  );

  assert(
    "source: no price/total/frequency percentage customer copy",
    !sectionSource.includes("%") &&
      !sectionSource.toLowerCase().includes("harga") &&
      !sectionSource.toLowerCase().includes("price") &&
      !sectionSource.toLowerCase().includes("total") &&
      !sectionSource.toLowerCase().includes("frequency") &&
      !sectionSource.toLowerCase().includes("rekomendasi") &&
      !sectionSource.toLowerCase().includes("confidence") &&
      !sectionSource.includes("AI") &&
      !sectionSource.includes("subtitle")
  );

  const personalQuickAdd = personalBlock.includes("onQuickAdd={handleQuickAdd}");
  assert(
    "source: no personal unit/quantity inference",
    personalQuickAdd &&
      appSource.includes("unit: product.defaultUnit") &&
      appSource.includes("quantity: product.defaultQuantity") &&
      !helperSource.includes("Biasanya") &&
      !sectionSource.includes("Biasanya") &&
      !helperSource.includes("preferredUnit") &&
      !helperSource.includes("preferredQuantity")
  );

  assert(
    "source: no learning-profile schema modification",
    learningSource.includes("STORE OBSERVATIONS; DERIVE CONCLUSIONS") &&
      learningSource.includes("schemaVersion: LEARNING_PROFILE_SCHEMA_VERSION") &&
      !helperSource.includes("LEARNING_PROFILE_SCHEMA_VERSION") &&
      !helperSource.includes("recordOrderingOccasion") &&
      !helperSource.includes("applyOrderingOccasion") &&
      helperSource.includes("sanitizeLearningProfile") &&
      packageSource.includes("catalog:personal-regulars:smoke")
  );

  const allResolvedMissing = resolvePersonalRegularProducts(
    ["prod-ghost-1", "prod-ghost-2"],
    catalog
  );
  assert(
    "resolve: all IDs missing → []",
    allResolvedMissing.length === 0
  );

  const cartAwarePersonal = personalBlock.includes(
    "getCartQuantity={getDefaultUnitQuantity}"
  );
  const seringHasNoStepper =
    !seringBlock.includes("getCartQuantity") &&
    !seringBlock.includes("onIncrease") &&
    !seringBlock.includes("onDecrease");
  assert(
    "source: personal rail is cart-aware; generic Sering Dipesan is unchanged",
    cartAwarePersonal &&
      personalBlock.includes("onIncrease={handleIncreaseQuantity}") &&
      personalBlock.includes("onDecrease={handleDecreaseQuantity}") &&
      seringHasNoStepper
  );

  const categoryBlock = appSource.slice(
    appSource.indexOf("{isCategoryMode &&"),
    appSource.indexOf("{showHomepage &&")
  );
  assert(
    "source: personal section hidden in search and category mode",
    !categoryBlock.includes("PersonalRegularsSection") &&
      !appSource.includes("PersonalRegularsSection") === false &&
      memoBlock.includes("orderHistory")
  );

  console.log("");
  console.log(
    `Personal regular products smoke: ${results.length}/${results.length} passed`
  );
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(
    `Personal regular products smoke failed after ${passed}/${results.length} checks`
  );
  console.error(error.message);
  process.exit(1);
}
