/**
 * Stage 5B.2A customer-catalogue generator, result caps, and taxonomy smoke.
 * Writes only under tmp/ — never the live generated artefact.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { HOMEPAGE_FEATURED_PRODUCT_IDS } from "../src/config/homepageFeatured.js";
import { CURATED_CATEGORY_IDS, getVisibleCategories } from "../src/config/categories.js";
import {
  searchProducts,
  normalizeSearchText,
} from "../src/utils/productSearch.js";
import {
  CATEGORY_RESULT_PAGE_SIZE,
  SEARCH_RESULT_PAGE_SIZE,
  initialVisibleLimit,
  nextVisibleLimit,
  remainingItemCount,
  visibleItems,
} from "../src/utils/resultCap.js";
import { lowercaseUnitLabel } from "../src/utils/unitDisplay.js";
import { CATALOG_FILES, loadCatalog } from "./catalogTransaction.js";
import {
  assembleCustomerCatalog,
  buildCustomerCatalog,
  DEFAULT_CUSTOMER_CATALOG_PATH,
  serializeCustomerCatalog,
} from "./buildCustomerCatalog.js";
import {
  FROM_CATEGORY,
  migrateCategoryTaxonomy,
  PRODUCT_IDS as GROCERY_MIGRATE_IDS,
  TO_CATEGORY,
} from "./migrateCategoryTaxonomy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const FIXTURE_DIR = join(ROOT, "tmp", "catalog-full-import");
const HELD_PATH = join(FIXTURE_DIR, "held-for-review.json");

const PROPOSED_FILES = Object.freeze({
  products: "proposed-products.json",
  variants: "proposed-variants.json",
  units: "proposed-units.json",
  aliases: "proposed-aliases.json",
  mappings: "proposed-mappings.json",
  recommendations: "proposed-recommendations.json",
});

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, condition, detail = "") {
  record(name, Boolean(condition), condition ? "" : detail);
  if (!condition) {
    throw new Error(`Assertion failed: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function copyLiveCatalog(destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const fileName of CATALOG_FILES) {
    writeFileSync(
      join(destDir, fileName),
      readFileSync(join(LIVE_CATALOG_DIR, fileName), "utf8"),
      "utf8"
    );
  }
}

function loadProposedCatalog() {
  const catalog = {};
  for (const [key, fileName] of Object.entries(PROPOSED_FILES)) {
    const filePath = join(FIXTURE_DIR, fileName);
    if (!existsSync(filePath)) {
      return null;
    }
    catalog[key] = readJson(filePath);
  }
  return catalog;
}

function gzipBytes(text) {
  return gzipSync(Buffer.from(text, "utf8")).length;
}

function main() {
  const liveGeneratedBefore = existsSync(DEFAULT_CUSTOMER_CATALOG_PATH)
    ? readFileSync(DEFAULT_CUSTOMER_CATALOG_PATH, "utf8")
    : null;
  const scratch = mkdtempSync(join(tmpdir(), "matahari-customer-catalog-"));

  try {
    assert(
      "curated taxonomy has nine approved categories",
      CURATED_CATEGORY_IDS.length === 9 &&
        CURATED_CATEGORY_IDS[0] === "Makanan Ringan" &&
        CURATED_CATEGORY_IDS[8] === "Bayi & Anak" &&
        !CURATED_CATEGORY_IDS.includes("Lainnya") &&
        !CURATED_CATEGORY_IDS.includes("Bahan & Bumbu Masak")
    );

    const searchInitial = initialVisibleLimit({
      isSearching: true,
      isCategoryMode: false,
    });
    const categoryInitial = initialVisibleLimit({
      isSearching: false,
      isCategoryMode: true,
    });
    const categorySearchInitial = initialVisibleLimit({
      isSearching: true,
      isCategoryMode: true,
    });
    assert(
      "search cap is 20 and category cap is 24",
      searchInitial === SEARCH_RESULT_PAGE_SIZE &&
        searchInitial === 20 &&
        categoryInitial === CATEGORY_RESULT_PAGE_SIZE &&
        categoryInitial === 24 &&
        categorySearchInitial === 20
    );
    assert(
      "Tampilkan lainnya adds the current page size",
      nextVisibleLimit(20, 20) === 40 && nextVisibleLimit(24, 24) === 48
    );

    const liveCatalog = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
    const liveCustomer = assembleCustomerCatalog(liveCatalog);
    const liveSerialized = serializeCustomerCatalog(liveCustomer);

    assert(
      "live customer catalogue has 2,256 products",
      liveCustomer.products.length === 2256,
      `count=${liveCustomer.products.length}`
    );
    assert(
      "customer products omit unused source fields",
      liveCustomer.products.every(
        (product) =>
          !Object.hasOwn(product, "favorite") &&
          !Object.hasOwn(product, "pattern") &&
          !product.image?.original &&
          !Object.hasOwn(product, "availableUnitIds")
      )
    );
    assert(
      "customer aliases omit record ids",
      liveCustomer.aliases.every((entry) => !Object.hasOwn(entry, "id"))
    );
    assert(
      "customer artefact has no POS mapping fields",
      !liveSerialized.includes("sourceRowIndex") &&
        !liveSerialized.includes("posCode") &&
        !liveSerialized.includes("\"sortOrder\"")
    );

    const featured = HOMEPAGE_FEATURED_PRODUCT_IDS.map((id) =>
      liveCustomer.products.find((product) => product.id === id)
    );
    assert(
      "homepage Sering Dipesan IDs remain",
      featured.length === 6 && featured.every(Boolean)
    );
    const glory = liveCustomer.products.find(
      (product) => product.id === "prod-glory-16"
    );
    const aqua = liveCustomer.products.find(
      (product) => product.id === "prod-aqua-15l"
    );
    assert(
      "Glory and Aqua defaults stay Slof / Karton",
      glory?.defaultUnit === "Slof" &&
        glory?.defaultQuantity === 1 &&
        aqua?.defaultUnit === "Karton" &&
        aqua?.availableUnits.includes("Karton")
    );

    const aliasHit = searchProducts({
      query: "glori",
      products: liveCustomer.products,
      aliases: liveCustomer.aliases,
    });
    const nameHit = searchProducts({
      query: "indomie",
      products: liveCustomer.products,
      aliases: liveCustomer.aliases,
    });
    const categoryTerm = normalizeSearchText("minuman");
    assert(
      "alias search still resolves Glory",
      aliasHit.results.some((product) => product.id === "prod-glory-16")
    );
    assert(
      "ordinary product-name search still works",
      nameHit.results.some((product) => product.id === "prod-indomie-goreng")
    );
    assert("category-term helper still normalizes", categoryTerm === "minuman");

    const visible = getVisibleCategories(liveCustomer.products);
    const bahan = visible.find((entry) => entry.id === "Bahan Makanan");
    const oldBahan = visible.find((entry) => entry.id === FROM_CATEGORY);
    const migrated = GROCERY_MIGRATE_IDS.map((id) =>
      liveCustomer.products.find((product) => product.id === id)
    );
    assert(
      "Masako / Indomie sit under Bahan Makanan",
      migrated.every((product) => product?.category === TO_CATEGORY) &&
        bahan?.count >= 3
    );
    assert(
      "empty Bahan & Bumbu Masak is hidden",
      !oldBahan
    );

    const whatsAppUnit = lowercaseUnitLabel("Slof");
    assert(
      "WhatsApp unit formatting still lowercases the first letter",
      whatsAppUnit === "slof"
    );

    const firstWrite = join(scratch, "customerCatalog-a.json");
    const secondWrite = join(scratch, "customerCatalog-b.json");
    const builtA = buildCustomerCatalog({
      catalogDir: LIVE_CATALOG_DIR,
      outputPath: firstWrite,
    });
    const builtB = buildCustomerCatalog({
      catalogDir: LIVE_CATALOG_DIR,
      outputPath: secondWrite,
    });
    assert("live generator succeeds", builtA.ok && builtB.ok, builtA.error);
    const bytesA = readFileSync(firstWrite);
    const bytesB = readFileSync(secondWrite);
    assert(
      "generator output is byte-identical across two runs",
      bytesA.equals(bytesB)
    );

    const migrateDir = join(scratch, "migrate-catalog");
    const migrateBackups = join(scratch, "migrate-backups");
    copyLiveCatalog(migrateDir);
    const firstMigrate = migrateCategoryTaxonomy({
      catalogDir: migrateDir,
      backupsDir: migrateBackups,
    });
    const afterFirstMigrate = loadCatalog({ catalogDir: migrateDir });
    assert("taxonomy migration succeeds", firstMigrate.ok, firstMigrate.error);
    assert(
      "taxonomy migration leaves the three grocery products on Bahan Makanan",
      GROCERY_MIGRATE_IDS.every(
        (id) =>
          afterFirstMigrate.products.find((product) => product.id === id)
            ?.category === TO_CATEGORY
      )
    );
    const repeatMigrate = migrateCategoryTaxonomy({
      catalogDir: migrateDir,
      backupsDir: migrateBackups,
    });
    assert(
      "taxonomy migration is idempotent",
      repeatMigrate.ok && repeatMigrate.noop === true
    );
    const catalogToRewind = loadCatalog({ catalogDir: migrateDir });
    const rewind = catalogToRewind.products.find(
      (product) => product.id === "prod-masako-ayam"
    );
    rewind.category = FROM_CATEGORY;
    writeFileSync(
      join(migrateDir, "products.json"),
      `${JSON.stringify(catalogToRewind.products, null, 2)}\n`,
      "utf8"
    );
    const secondMigrate = migrateCategoryTaxonomy({
      catalogDir: migrateDir,
      backupsDir: migrateBackups,
    });
    assert(
      "taxonomy migration writes products.json only",
      secondMigrate.ok &&
        secondMigrate.noop !== true &&
        secondMigrate.changedFiles.length === 1 &&
        secondMigrate.changedFiles[0] === "products.json",
      secondMigrate.error
    );
    const thirdMigrate = migrateCategoryTaxonomy({
      catalogDir: migrateDir,
      backupsDir: migrateBackups,
    });
    assert(
      "second migration after apply is a no-op",
      thirdMigrate.ok && thirdMigrate.noop === true
    );

    const proposed = loadProposedCatalog();
    assert(
      "proposed 2,259-product fixture exists under tmp/",
      Boolean(proposed),
      `missing ${FIXTURE_DIR}`
    );
    assert(
      "proposed fixture has 2,259 products",
      proposed.products.length === 2259,
      `count=${proposed.products.length}`
    );

    const fixtureOutput = join(scratch, "fixture-customerCatalog.json");
    const fixtureBuild = buildCustomerCatalog({
      catalog: proposed,
      outputPath: fixtureOutput,
    });
    assert(
      "generator produces compact fixture artefact",
      fixtureBuild.ok && fixtureBuild.productCount === 2259,
      fixtureBuild.error ||
        (fixtureBuild.validationErrors || []).slice(0, 3).join("; ")
    );

    const fixtureCustomer = assembleCustomerCatalog(proposed);
    const fixtureSerialized = serializeCustomerCatalog(fixtureCustomer);
    const held = existsSync(HELD_PATH) ? readJson(HELD_PATH) : [];
    const heldIds = new Set(
      held.map((row) => row.proposedProductId).filter(Boolean)
    );
    const visibleIds = new Set(fixtureCustomer.products.map((row) => row.id));
    const leakedHeld = [...heldIds].filter((id) => visibleIds.has(id));
    assert(
      "held products are omitted from the proposed customer catalogue",
      leakedHeld.length === 0,
      leakedHeld.slice(0, 5).join(", ")
    );

    const broad = searchProducts({
      query: "a",
      products: fixtureCustomer.products,
      aliases: fixtureCustomer.aliases,
    });
    const started = process.hrtime.bigint();
    const timed = searchProducts({
      query: "a",
      products: fixtureCustomer.products,
      aliases: fixtureCustomer.aliases,
    });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert(
      "broad fixture search count is stable",
      timed.results.length === broad.results.length && timed.results.length > 20
    );
    record(
      `broad fixture search "${"a"}" returned ${timed.results.length} in ${elapsedMs.toFixed(1)}ms`,
      elapsedMs < 50,
      elapsedMs < 50 ? "" : "slower than 50ms budget"
    );
    assert(
      "search calculation stays responsive on the 2,259 fixture",
      elapsedMs < 50,
      `${elapsedMs.toFixed(1)}ms`
    );

    const firstSearchPage = visibleItems(
      timed.results,
      SEARCH_RESULT_PAGE_SIZE
    );
    assert(
      "search UI cap mounts 20 rows initially",
      firstSearchPage.length === 20 &&
        remainingItemCount(timed.results.length, firstSearchPage.length) ===
          timed.results.length - 20
    );
    assert(
      "search Tampilkan lainnya adds 20",
      visibleItems(
        timed.results,
        nextVisibleLimit(SEARCH_RESULT_PAGE_SIZE, SEARCH_RESULT_PAGE_SIZE)
      ).length === 40
    );

    const makanan = fixtureCustomer.products.filter(
      (product) => product.category === "Makanan Ringan"
    );
    assert(
      "Makanan Ringan fixture has 507 products",
      makanan.length === 507,
      `count=${makanan.length}`
    );
    assert(
      "Makanan Ringan initially renders 24 rows, not 507",
      visibleItems(makanan, CATEGORY_RESULT_PAGE_SIZE).length === 24
    );
    assert(
      "category Tampilkan lainnya adds 24",
      visibleItems(
        makanan,
        nextVisibleLimit(CATEGORY_RESULT_PAGE_SIZE, CATEGORY_RESULT_PAGE_SIZE)
      ).length === 48
    );

    record(
      `fixture customer catalogue ${fixtureBuild.bytes} bytes raw, ${gzipBytes(fixtureSerialized)} gzip`,
      true
    );

    const liveGeneratedAfter = existsSync(DEFAULT_CUSTOMER_CATALOG_PATH)
      ? readFileSync(DEFAULT_CUSTOMER_CATALOG_PATH, "utf8")
      : null;
    assert(
      "smoke tests do not rewrite the live generated artefact",
      liveGeneratedBefore === liveGeneratedAfter
    );
  } catch (error) {
    if (!results.some((row) => !row.passed)) {
      record("unexpected error", false, error.message);
    }
    console.error(error);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const failed = results.filter((row) => !row.passed);
  console.log("");
  console.log(
    `Customer catalogue smoke: ${results.length - failed.length}/${results.length} passed`
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
