/**
 * Isolated smoke tests for the Stage 5B.2 full-catalogue importer.
 * Uses in-memory fixtures and temp directories — never writes the live catalogue.
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
import { CATALOG_FILES, loadCatalog } from "./catalogTransaction.js";
import { proposeProductId } from "./catalogWorkbook.js";
import {
  APPLY_REFUSED_MESSAGE,
  applyFullCatalogImport,
  buildImportPlan,
  parseCliArgs,
  serializeCatalogJson,
  validateProposedCatalog,
} from "./importFullCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_CUSTOMER_CATALOG = join(
  LIVE_CATALOG_DIR,
  "generated",
  "customerCatalog.json"
);

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

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function snapshotLive() {
  const snapshot = {};
  for (const fileName of CATALOG_FILES) {
    snapshot[fileName] = readText(join(LIVE_CATALOG_DIR, fileName));
  }
  snapshot.customerCatalog = existsSync(LIVE_CUSTOMER_CATALOG)
    ? readText(LIVE_CUSTOMER_CATALOG)
    : null;
  return snapshot;
}

function liveUnchanged(snapshot) {
  const filesOk = CATALOG_FILES.every(
    (fileName) => readText(join(LIVE_CATALOG_DIR, fileName)) === snapshot[fileName]
  );
  const generatedNow = existsSync(LIVE_CUSTOMER_CATALOG)
    ? readText(LIVE_CUSTOMER_CATALOG)
    : null;
  return filesOk && generatedNow === snapshot.customerCatalog;
}

function baseCatalog() {
  return {
    products: [
      {
        id: "prod-glory-16",
        name: "Glory 16",
        category: "Rokok",
        favorite: true,
        pattern: "fixed-product",
        image: {
          card: "/product-images/cards/cigarettes/prod-glory-16.webp",
          detail: "/product-images/details/cigarettes/prod-glory-16.webp",
          original:
            "/product-images/originals/cigarettes/prod-glory-16-original.png",
        },
      },
      {
        id: "prod-camel-blue16",
        name: "Camel Blue 16",
        category: "Rokok",
        favorite: false,
        pattern: "fixed-product",
      },
      {
        id: "prod-ave-20",
        name: "Ave 20",
        category: "Rokok",
        favorite: false,
        pattern: "fixed-product",
      },
      {
        id: "prod-aqua-15l",
        name: "Aqua 1.5 L",
        category: "Minuman",
        favorite: true,
        pattern: "fixed-product",
      },
    ],
    variants: [
      {
        id: "prod-glory-16",
        productId: "prod-glory-16",
        name: "Glory 16",
        availableUnitIds: ["prod-glory-16__slof"],
        defaultUnitId: "prod-glory-16__slof",
        defaultQuantity: 1,
      },
      {
        id: "prod-camel-blue16",
        productId: "prod-camel-blue16",
        name: "Camel Blue 16",
        availableUnitIds: ["prod-camel-blue16__slof"],
        defaultUnitId: "prod-camel-blue16__slof",
        defaultQuantity: 1,
      },
      {
        id: "prod-ave-20",
        productId: "prod-ave-20",
        name: "Ave 20",
        availableUnitIds: ["prod-ave-20__slof"],
        defaultUnitId: "prod-ave-20__slof",
        defaultQuantity: 1,
      },
      {
        id: "prod-aqua-15l",
        productId: "prod-aqua-15l",
        name: "Aqua 1.5 L",
        availableUnitIds: ["karton"],
        defaultUnitId: "karton",
        defaultQuantity: 1,
      },
    ],
    units: [
      { id: "karton", name: "Karton", active: true },
      {
        id: "prod-glory-16__slof",
        productId: "prod-glory-16",
        name: "Slof",
        active: true,
        isDefault: true,
        sortOrder: 4,
      },
      {
        id: "prod-camel-blue16__slof",
        productId: "prod-camel-blue16",
        name: "Slof",
        active: true,
        isDefault: true,
        sortOrder: 4,
      },
      {
        id: "prod-ave-20__slof",
        productId: "prod-ave-20",
        name: "Slof",
        active: true,
        isDefault: true,
        sortOrder: 4,
      },
    ],
    aliases: [
      { id: "alias-glory-1", productId: "prod-glory-16", alias: "glori" },
    ],
    mappings: [
      {
        sourceRowIndex: 0,
        posCode: "GLORY16",
        posName: "Glory 16",
        posUnit: "SLOF",
        productId: "prod-glory-16",
        productName: "Glory 16",
        unitId: "prod-glory-16__slof",
        unitName: "Slof",
      },
      {
        sourceRowIndex: 1,
        posCode: "CMLBLU16",
        posName: "Camel Blue16",
        posUnit: "SLOF",
        productId: "prod-camel-blue16",
        productName: "Camel Blue 16",
        unitId: "prod-camel-blue16__slof",
        unitName: "Slof",
      },
      {
        sourceRowIndex: 2,
        posCode: "AVE20",
        posName: "AVE 20",
        posUnit: "SLOF",
        productId: "prod-ave-20",
        productName: "Ave 20",
        unitId: "prod-ave-20__slof",
        unitName: "Slof",
      },
    ],
    recommendations: [
      {
        sourceProductId: "prod-glory-16",
        targetProductId: "prod-camel-blue16",
        weight: 10,
        source: "sales",
      },
    ],
  };
}

function workbookProduct(posCode, posName, units, extra = {}) {
  return {
    posCode,
    posName,
    rows: units.map((unit, index) => ({
      sourceRow: extra.sourceRowStart ? extra.sourceRowStart + index : 10 + index,
      posName,
      posUnit: unit.posUnit,
      qtyPerPackage: unit.qtyPerPackage ?? 1,
      qtyRaw: String(unit.qtyPerPackage ?? 1),
      qtyOk: true,
      baseUnit: unit.baseUnit ?? unit.posUnit,
    })),
  };
}

function classification(posCode, posName, extra = {}) {
  return {
    posCode,
    posName,
    proposedCategory: extra.proposedCategory ?? "Minuman",
    proposedSubcategory: extra.proposedSubcategory ?? "Air Mineral",
    confidence: extra.confidence ?? "HIGH",
    reviewNeeded: extra.reviewNeeded ?? false,
    classificationReason: extra.reason ?? "test",
  };
}

function runPlan(overrides = {}) {
  const catalog = overrides.catalog ?? baseCatalog();
  return buildImportPlan({
    catalog,
    workbookProducts: overrides.workbookProducts ?? [],
    classifications: overrides.classifications ?? [],
    recodeDecisions: overrides.recodeDecisions ?? { decisions: [] },
    homepageFeaturedIds: overrides.homepageFeaturedIds ?? ["prod-glory-16"],
    categoryConfigIds: overrides.categoryConfigIds ?? new Set(["Rokok", "Minuman"]),
  });
}

function setupTempCatalog(catalog) {
  const root = mkdtempSync(join(tmpdir(), "matahari-import-full-"));
  const catalogDir = join(root, "catalog");
  const backupsDir = join(catalogDir, "backups");
  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });
  for (const fileName of CATALOG_FILES) {
    const key = fileName.replace(".json", "");
    writeFileSync(
      join(catalogDir, fileName),
      serializeCatalogJson(catalog[key]),
      "utf8"
    );
  }
  return { root, catalogDir, backupsDir };
}

function alwaysExists() {
  return true;
}

function main() {
  const liveSnapshot = snapshotLive();

  try {
    const exactWorkbook = [
      workbookProduct("GLORY16", "GLORY 16", [{ posUnit: "SLOF" }]),
    ];
    const exactPlan = runPlan({
      workbookProducts: exactWorkbook,
      classifications: [
        classification("GLORY16", "GLORY 16", {
          proposedCategory: "Rokok",
          proposedSubcategory: "Filter",
        }),
      ],
    });
    const glory = exactPlan.proposed.products.find(
      (product) => product.id === "prod-glory-16"
    );
    assert(
      "A. exact POS match preserves ID/name/category/image",
      glory?.id === "prod-glory-16" &&
        glory.name === "Glory 16" &&
        glory.category === "Rokok" &&
        glory.image?.card ===
          "/product-images/cards/cigarettes/prod-glory-16.webp" &&
        exactPlan.exactPosMatches.length === 1 &&
        exactPlan.newVisibleProducts.length === 0
    );

    const namePlan = runPlan({
      workbookProducts: [
        workbookProduct("CMLBLU16", "Camel Biru 16", [{ posUnit: "SLOF" }]),
      ],
      classifications: [
        classification("CMLBLU16", "Camel Biru 16", { proposedCategory: "Rokok" }),
      ],
    });
    const camel = namePlan.proposed.products.find(
      (product) => product.id === "prod-camel-blue16"
    );
    const camelMapping = namePlan.proposed.mappings.find(
      (mapping) => mapping.productId === "prod-camel-blue16"
    );
    assert(
      "B. customer name differs from POS name",
      camel?.name === "Camel Blue 16" &&
        camelMapping?.posName === "Camel Biru 16" &&
        camelMapping?.productName === "Camel Blue 16"
    );

    const used = new Set(["prod-glory-16"]);
    const idA = proposeProductId("ABC Kecap Asin 133ML", "110016", used);
    const usedAgain = new Set(["prod-glory-16"]);
    const idB = proposeProductId("ABC Kecap Asin 133ML", "110016", usedAgain);
    assert(
      "C. deterministic new product ID",
      idA.proposedProductId === "prod-abc-kecap-asin-133ml" &&
        idA.proposedProductId === idB.proposedProductId
    );

    const collisionPlan = runPlan({
      workbookProducts: [
        workbookProduct("108900", "Rose Brand Tepung Tapioka 500G", [
          { posUnit: "PCS" },
        ]),
        workbookProduct("TPGTAPIO", "Rose Brand Tepung Tapioka 500G", [
          { posUnit: "PCS" },
        ]),
      ],
      classifications: [
        classification("108900", "Rose Brand Tepung Tapioka 500G", {
          proposedCategory: "Bahan Makanan",
        }),
        classification("TPGTAPIO", "Rose Brand Tepung Tapioka 500G", {
          proposedCategory: "Bahan Makanan",
        }),
      ],
      categoryConfigIds: new Set(["Rokok", "Minuman", "Bahan Makanan"]),
    });
    const roseIds = collisionPlan.newVisibleProducts.map(
      (row) => row.proposedProductId
    );
    assert(
      "D. slug collision",
      roseIds.includes("prod-rose-brand-tepung-tapioka-500g") &&
        roseIds.includes("prod-rose-brand-tepung-tapioka-500g-tpgtapio") &&
        collisionPlan.idCollisions.length === 1
    );

    const multiUnitPlan = runPlan({
      workbookProducts: [
        workbookProduct("110016", "ABC Kecap Asin 133ML", [
          { posUnit: "BTL", qtyPerPackage: 1 },
          { posUnit: "LSN", qtyPerPackage: 12 },
          { posUnit: "KTN", qtyPerPackage: 48 },
        ]),
      ],
      classifications: [
        classification("110016", "ABC Kecap Asin 133ML", {
          proposedCategory: "Bahan Makanan",
        }),
      ],
      categoryConfigIds: new Set(["Rokok", "Minuman", "Bahan Makanan"]),
    });
    const abcProduct = multiUnitPlan.proposed.products.filter(
      (product) => product.id === "prod-abc-kecap-asin-133ml"
    );
    const abcVariant = multiUnitPlan.proposed.variants.filter(
      (variant) => variant.productId === "prod-abc-kecap-asin-133ml"
    );
    assert(
      "E. multiple selling-unit rows → one product/variant",
      abcProduct.length === 1 &&
        abcVariant.length === 1 &&
        abcVariant[0].availableUnitIds.length === 3 &&
        abcVariant[0].defaultUnitId === "prod-abc-kecap-asin-133ml__karton"
    );

    const fixture = {
      workbookProducts: [
        workbookProduct("GLORY16", "Glory 16", [{ posUnit: "SLOF" }]),
        workbookProduct("110016", "ABC Kecap Asin 133ML", [
          { posUnit: "BTL" },
          { posUnit: "KTN" },
        ]),
      ],
      classifications: [
        classification("GLORY16", "Glory 16", { proposedCategory: "Rokok" }),
        classification("110016", "ABC Kecap Asin 133ML", {
          proposedCategory: "Bahan Makanan",
        }),
      ],
      categoryConfigIds: new Set(["Rokok", "Minuman", "Bahan Makanan"]),
    };
    const first = runPlan(fixture);
    const second = runPlan(fixture);
    assert(
      "F. duplicate importer run is identical",
      serializeCatalogJson(first.proposed) === serializeCatalogJson(second.proposed)
    );

    const dirs = setupTempCatalog(baseCatalog());
    const applied = applyFullCatalogImport(first, {
      argv: ["--apply", "--confirm"],
      catalogDir: dirs.catalogDir,
      backupsDir: dirs.backupsDir,
      publicDir: join(ROOT, "public"),
      fileExists: alwaysExists,
    });
    assert("F. hypothetical apply succeeds", applied.ok, applied.error);
    const afterApply = loadCatalog({ catalogDir: dirs.catalogDir });
    const rerun = buildImportPlan({
      catalog: afterApply,
      workbookProducts: fixture.workbookProducts,
      classifications: fixture.classifications,
      recodeDecisions: { decisions: [] },
      homepageFeaturedIds: ["prod-glory-16"],
      categoryConfigIds: new Set(["Rokok", "Minuman", "Bahan Makanan"]),
    });
    assert(
      "F. second apply plan adds 0 products/units/mappings",
      rerun.summary.newVisibleProducts === 0 &&
        rerun.summary.after.products === rerun.summary.before.products &&
        rerun.summary.after.units === rerun.summary.before.units &&
        rerun.summary.after.mappings === rerun.summary.before.mappings
    );
    rmSync(dirs.root, { recursive: true, force: true });

    const mediumPlan = runPlan({
      workbookProducts: [
        workbookProduct("MED1", "Medium Product", [{ posUnit: "PCS" }]),
      ],
      classifications: [
        classification("MED1", "Medium Product", {
          proposedCategory: "Minuman",
          confidence: "MEDIUM",
          reviewNeeded: true,
        }),
      ],
    });
    assert(
      "G. MEDIUM product held",
      mediumPlan.summary.heldMedium === 1 &&
        mediumPlan.newVisibleProducts.length === 0 &&
        !mediumPlan.proposed.products.some((product) => product.id.includes("medium"))
    );

    const lowPlan = runPlan({
      workbookProducts: [
        workbookProduct("LOW1", "Low Product", [{ posUnit: "PCS" }]),
      ],
      classifications: [
        classification("LOW1", "Low Product", {
          proposedCategory: "Kesehatan",
          confidence: "LOW",
          reviewNeeded: true,
        }),
      ],
    });
    assert(
      "H. LOW product held",
      lowPlan.summary.heldLow === 1 && lowPlan.newVisibleProducts.length === 0
    );

    const lainnyaPlan = runPlan({
      workbookProducts: [
        workbookProduct("GML5", "Gomala No.5", [{ posUnit: "PCS" }]),
      ],
      classifications: [
        classification("GML5", "Gomala No.5", {
          proposedCategory: "Lainnya",
          confidence: "LOW",
          reviewNeeded: true,
        }),
      ],
    });
    assert(
      "I. Lainnya product held",
      lainnyaPlan.summary.heldLainnya === 1 &&
        !lainnyaPlan.proposed.products.some(
          (product) => product.category === "Lainnya"
        )
    );

    const unknownPlan = runPlan({
      workbookProducts: [
        workbookProduct("UNK1", "Mystery Item", [{ posUnit: "PCS" }]),
      ],
      classifications: [
        classification("UNK1", "Mystery Item", {
          proposedCategory: "Pending",
          confidence: "HIGH",
          reviewNeeded: false,
        }),
      ],
    });
    assert(
      "J. unknown category held/fails safely",
      unknownPlan.newVisibleProducts.length === 0 &&
        unknownPlan.heldForReview[0]?.holdReason ===
          "unknown-or-unapproved-category" &&
        !unknownPlan.proposed.products.some(
          (product) => product.category === "Pending"
        )
    );

    const missingPlan = runPlan({
      workbookProducts: [
        workbookProduct("GLORY16", "Glory 16", [{ posUnit: "SLOF" }]),
      ],
      classifications: [
        classification("GLORY16", "Glory 16", { proposedCategory: "Rokok" }),
      ],
    });
    assert(
      "K. current-not-in-source preserved",
      missingPlan.preservedNotInSource.some(
        (row) => row.productId === "prod-aqua-15l"
      ) &&
        missingPlan.proposed.products.some(
          (product) => product.id === "prod-aqua-15l"
        )
    );

    assert(
      "L. alias preservation",
      exactPlan.proposed.aliases.length === 1 &&
        exactPlan.proposed.aliases[0].alias === "glori" &&
        exactPlan.newVisibleProducts.every((row) => row.aliases.length === 0)
    );

    assert(
      "M. recommendation preservation",
      exactPlan.proposed.recommendations.length === 1 &&
        exactPlan.proposed.recommendations[0].sourceProductId === "prod-glory-16"
    );

    assert(
      "N. image preservation",
      glory.image.card.includes("prod-glory-16") &&
        !("image" in (multiUnitPlan.proposed.products.find(
          (product) => product.id === "prod-abc-kecap-asin-133ml"
        ) ?? {}))
    );

    const invalid = structuredClone(multiUnitPlan.proposed);
    invalid.variants[invalid.variants.length - 1].defaultUnitId = "missing-unit";
    const invalidErrors = validateProposedCatalog(invalid, {
      fileExists: alwaysExists,
    });
    assert(
      "O. invalid proposed catalogue aborts",
      invalidErrors.length > 0
    );

    const refusedArgs = parseCliArgs(["--apply"]);
    const refusedApply = applyFullCatalogImport(multiUnitPlan, {
      argv: ["--apply"],
    });
    assert(
      "P. apply without explicit confirmation refuses",
      refusedArgs.mode === "refused" &&
        refusedArgs.error === APPLY_REFUSED_MESSAGE &&
        refusedApply.ok === false &&
        refusedApply.code === "APPLY_REFUSED"
    );

    const recodePlan = runPlan({
      workbookProducts: [
        workbookProduct("AV20", "Ave 20", [{ posUnit: "SLOF" }]),
      ],
      classifications: [
        classification("AV20", "Ave 20", { proposedCategory: "Rokok" }),
      ],
    });
    assert(
      "Q. recode cases not silently merged",
      recodePlan.recodeReview.length === 1 &&
        recodePlan.recodeReview[0].status === "RECODE_REVIEW" &&
        recodePlan.recodeReview[0].toPosCode === "AV20" &&
        recodePlan.proposed.mappings.some(
          (mapping) => mapping.posCode === "AVE20"
        ) &&
        !recodePlan.proposed.mappings.some(
          (mapping) => mapping.posCode === "AV20"
        ) &&
        !recodePlan.newVisibleProducts.some((row) => row.posCode === "AV20")
    );

    const noMode = parseCliArgs([]);
    assert("default mode is dry-run", noMode.mode === "dry");

    assert("live catalogue unchanged by smoke tests", liveUnchanged(liveSnapshot));
  } catch (error) {
    if (!results.some((row) => !row.passed)) {
      record("unexpected error", false, error.message);
    }
    console.error(error);
  } finally {
    if (!liveUnchanged(liveSnapshot)) {
      record("LIVE CATALOGUE SAFETY", false, "src/catalog changed");
    }
  }

  const failed = results.filter((row) => !row.passed);
  console.log("");
  console.log(`Importer smoke: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
