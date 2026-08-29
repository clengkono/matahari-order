/**
 * Isolated smoke tests for merge/recode.
 * Uses in-memory fixtures and a temp copy of the live catalogue.
 * Never writes the live src/catalog files.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "./buildCatalog.js";
import { CATALOG_FILES, loadCatalog } from "./catalogTransaction.js";
import {
  APPLY_REFUSED_MESSAGE,
  DO_NOT_TOUCH_PRODUCT_IDS,
  applyMergeRecode,
  applyMergeRecodeBatch,
  buildMergeRecodePlan,
  parseCliArgs,
  planMergeRecode,
  runMergeRecode,
} from "./catalogMergeRecode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");

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

function unit(productId, slug, name, isDefault, sortOrder) {
  return {
    id: `${productId}__${slug}`,
    productId,
    name,
    active: true,
    isDefault,
    sortOrder,
  };
}

function mapping(productId, name, posCode, posName, posUnit, unitSlug, unitName, row) {
  return {
    sourceRowIndex: row,
    posCode,
    posName,
    posUnit,
    productId,
    productName: name,
    unitId: `${productId}__${unitSlug}`,
    unitName,
  };
}

function cigaretteProduct(id, name, posCode, posName, rowBase) {
  return {
    product: {
      id,
      name,
      category: "Rokok",
      favorite: false,
      pattern: "fixed-product",
    },
    variant: {
      id,
      productId: id,
      name,
      availableUnitIds: [
        `${id}__bungkus`,
        `${id}__1-2-slof`,
        `${id}__slof`,
      ],
      defaultUnitId: `${id}__slof`,
      defaultQuantity: 1,
    },
    units: [
      unit(id, "bungkus", "Bungkus", false, 1),
      unit(id, "1-2-slof", "½ Slof", false, 3),
      unit(id, "slof", "Slof", true, 4),
    ],
    mappings: [
      mapping(id, name, posCode, posName, "BKS", "bungkus", "Bungkus", rowBase),
      mapping(id, name, posCode, posName, "½ SLOF", "1-2-slof", "½ Slof", rowBase + 1),
      mapping(id, name, posCode, posName, "SLOF", "slof", "Slof", rowBase + 2),
    ],
  };
}

function fixtureCatalog() {
  const keep = cigaretteProduct("prod-keep-20", "Keep 20", "KEEP20", "Keep 20", 10);
  const old = cigaretteProduct(
    "prod-zenix-coffee",
    "Zenix Coffee",
    "ZNXCFE",
    "Zenix Coffee",
    20
  );
  const imported = cigaretteProduct(
    "prod-zenix-coffee-20",
    "Zenix Coffee 20",
    "ZC20",
    "Zenix Coffee 20",
    30
  );
  const kretek = cigaretteProduct(
    "prod-sergio-kretek-20",
    "Sergio Kretek 20",
    "SK20",
    "Sergio Kretek 20",
    40
  );
  const other = cigaretteProduct("prod-other-20", "Other 20", "OTH20", "Other 20", 50);

  return {
    products: [
      keep.product,
      old.product,
      imported.product,
      kretek.product,
      other.product,
    ],
    variants: [
      keep.variant,
      old.variant,
      imported.variant,
      kretek.variant,
      other.variant,
    ],
    units: [
      ...keep.units,
      ...old.units,
      ...imported.units,
      ...kretek.units,
      ...other.units,
    ],
    aliases: [
      { id: "alias-zenix-coffee-1", productId: "prod-zenix-coffee", alias: "senix kopi" },
    ],
    mappings: [
      ...keep.mappings,
      ...old.mappings,
      ...imported.mappings,
      ...kretek.mappings,
      ...other.mappings,
    ],
    recommendations: [
      {
        sourceProductId: "prod-keep-20",
        targetProductId: "prod-zenix-coffee",
        weight: 8,
        source: "sales",
      },
      {
        sourceProductId: "prod-keep-20",
        targetProductId: "prod-other-20",
        weight: 5,
        source: "sales",
      },
    ],
    productFamilies: [],
    productDefaults: [],
  };
}

function writeCatalog(dir, catalog) {
  mkdirSync(dir, { recursive: true });
  for (const fileName of CATALOG_FILES) {
    const key = fileName.replace(".json", "");
    writeFileSync(
      join(dir, fileName),
      `${JSON.stringify(catalog[key], null, 2)}\n`,
      "utf8"
    );
  }
}

function liveSnapshot() {
  const snapshot = {};
  for (const fileName of CATALOG_FILES) {
    snapshot[fileName] = readFileSync(join(LIVE_CATALOG_DIR, fileName), "utf8");
  }
  return snapshot;
}

function liveUnchanged(snapshot) {
  return CATALOG_FILES.every(
    (fileName) =>
      readFileSync(join(LIVE_CATALOG_DIR, fileName), "utf8") === snapshot[fileName]
  );
}

const decision = {
  survivorProductId: "prod-zenix-coffee",
  duplicateProductId: "prod-zenix-coffee-20",
  newPosCode: "ZC20",
  approved: true,
  addDuplicateNameAsAlias: true,
};

function main() {
  const snapshot = liveSnapshot();
  const scratch = mkdtempSync(join(tmpdir(), "matahari-merge-recode-"));

  try {
    const catalog = fixtureCatalog();
    const fixtureErrors = validateCatalog(catalog, { publicDir: LIVE_PUBLIC_DIR });
    assert(
      "A. fixture catalogue validates",
      fixtureErrors.length === 0,
      fixtureErrors[0]
    );

    const self = planMergeRecode(catalog, {
      ...decision,
      duplicateProductId: "prod-zenix-coffee",
    });
    assert("B. reject self-merge", self.ok === false && self.code === "SELF_MERGE");

    const unknown = planMergeRecode(catalog, {
      ...decision,
      survivorProductId: "prod-missing",
    });
    assert(
      "C. reject unknown survivor",
      unknown.ok === false && unknown.code === "UNKNOWN_SURVIVOR"
    );

    const protectedDup = planMergeRecode(catalog, {
      survivorProductId: "prod-zenix-coffee",
      duplicateProductId: "prod-sergio-kretek-20",
      newPosCode: "SK20",
      approved: true,
    });
    assert(
      "D. reject protected duplicate (Sergio Kretek 20)",
      protectedDup.ok === false && protectedDup.code === "PROTECTED_DUPLICATE"
    );

    const conflictCatalog = structuredClone(catalog);
    conflictCatalog.mappings.push({
      sourceRowIndex: 99,
      posCode: "ZC20",
      posName: "Zenix Coffee 20",
      posUnit: "BKS",
      productId: "prod-other-20",
      productName: "Other 20",
      unitId: "prod-other-20__bungkus",
      unitName: "Bungkus",
    });
    const conflict = planMergeRecode(conflictCatalog, decision);
    assert(
      "E. reject unrelated POS-code conflict",
      conflict.ok === false && conflict.code === "POS_CONFLICT"
    );

    const planned = planMergeRecode(catalog, decision);
    assert("F. happy-path plan is ready", planned.ok === true);
    assert(
      "F. units match 1:1",
      planned.unitMatch.ok && planned.unitMatch.matched.length === 3
    );

    const applied = applyMergeRecode(structuredClone(catalog), decision);
    assert("G. apply succeeds", applied.ok === true);
    const after = structuredClone(catalog);
    const batch = applyMergeRecodeBatch(after, [decision]);
    assert("G. batch apply succeeds", batch.ok === true);
    assert(
      "G. duplicate product removed",
      !after.products.some((product) => product.id === "prod-zenix-coffee-20")
    );
    assert(
      "G. survivor kept with original name",
      after.products.find((product) => product.id === "prod-zenix-coffee")
        ?.name === "Zenix Coffee"
    );
    const survivorMaps = after.mappings.filter(
      (mapping) => mapping.productId === "prod-zenix-coffee"
    );
    assert(
      "G. survivor mappings use ZC20 and survivor units",
      survivorMaps.length === 3 &&
        survivorMaps.every((mapping) => mapping.posCode === "ZC20") &&
        survivorMaps.every((mapping) =>
          mapping.unitId.startsWith("prod-zenix-coffee__")
        ) &&
        survivorMaps.every((mapping) => mapping.productName === "Zenix Coffee") &&
        survivorMaps.every((mapping) => mapping.posName === "Zenix Coffee 20")
    );
    assert(
      "G. old POS ZNXCFE is gone",
      !after.mappings.some((mapping) => mapping.posCode === "ZNXCFE")
    );
    assert(
      "G. imported name added as alias",
      after.aliases.some(
        (row) =>
          row.productId === "prod-zenix-coffee" &&
          row.alias === "Zenix Coffee 20"
      )
    );
    assert(
      "G. existing alias kept",
      after.aliases.some((row) => row.alias === "senix kopi")
    );
    assert(
      "G. Sergio Kretek 20 untouched",
      after.products.some((product) => product.id === "prod-sergio-kretek-20") &&
        after.mappings.filter((mapping) => mapping.productId === "prod-sergio-kretek-20")
          .length === 3 &&
        after.mappings.every(
          (mapping) =>
            mapping.productId !== "prod-sergio-kretek-20" ||
            mapping.posCode === "SK20"
        )
    );
    assert(
      "G. keep-20 recommendation to survivor still valid",
      after.recommendations.some(
        (row) =>
          row.sourceProductId === "prod-keep-20" &&
          row.targetProductId === "prod-zenix-coffee"
      )
    );

    const remapDefaultOnlyOld = structuredClone(catalog);
    remapDefaultOnlyOld.productDefaults = [
      { productId: "prod-zenix-coffee-20", defaultUnitName: "Slof" },
    ];
    const remappedDefault = applyMergeRecode(remapDefaultOnlyOld, decision);
    assert("G2. remaps owner default from duplicate id", remappedDefault.ok);
    assert(
      "G2. duplicate default now belongs to survivor",
      remapDefaultOnlyOld.productDefaults.length === 1 &&
        remapDefaultOnlyOld.productDefaults[0].productId === "prod-zenix-coffee" &&
        remapDefaultOnlyOld.productDefaults[0].defaultUnitName === "Slof"
    );

    const keepSurvivorDefault = structuredClone(catalog);
    keepSurvivorDefault.productDefaults = [
      { productId: "prod-zenix-coffee", defaultUnitName: "Bungkus" },
      { productId: "prod-zenix-coffee-20", defaultUnitName: "Slof" },
    ];
    const keptSurvivorDefault = applyMergeRecode(keepSurvivorDefault, decision);
    assert("G3. conflicting defaults keep survivor row", keptSurvivorDefault.ok);
    assert(
      "G3. survivor defaultUnitName is unchanged",
      keepSurvivorDefault.productDefaults.length === 1 &&
        keepSurvivorDefault.productDefaults[0].productId === "prod-zenix-coffee" &&
        keepSurvivorDefault.productDefaults[0].defaultUnitName === "Bungkus"
    );

    const familyRemap = structuredClone(catalog);
    familyRemap.productFamilies = [
      {
        id: "zenix-keep",
        name: "Zenix Keep",
        members: ["prod-keep-20", "prod-zenix-coffee-20"],
      },
    ];
    const remappedFamily = applyMergeRecode(familyRemap, decision);
    assert("G4. remaps family member id to survivor", remappedFamily.ok);
    assert(
      "G4. family members are remapped and unique",
      familyRemap.productFamilies[0].members.join(",") ===
        "prod-keep-20,prod-zenix-coffee"
    );

    const familyCollapse = structuredClone(catalog);
    familyCollapse.productFamilies = [
      {
        id: "zenix-pair",
        name: "Zenix Pair",
        members: ["prod-keep-20", "prod-zenix-coffee", "prod-zenix-coffee-20"],
      },
    ];
    const collapsedFamily = applyMergeRecode(familyCollapse, decision);
    assert("G5. same-family recode collapses duplicate member", collapsedFamily.ok);
    assert(
      "G5. collapsed members stay unique",
      familyCollapse.productFamilies[0].members.join(",") ===
        "prod-keep-20,prod-zenix-coffee"
    );

    const familyConflict = structuredClone(catalog);
    familyConflict.productFamilies = [
      {
        id: "family-a",
        name: "Family A",
        members: ["prod-keep-20", "prod-zenix-coffee"],
      },
      {
        id: "family-b",
        name: "Family B",
        members: ["prod-other-20", "prod-zenix-coffee-20"],
      },
    ];
    const conflictedFamily = applyMergeRecode(familyConflict, decision);
    assert(
      "G6. cross-family recode is refused",
      conflictedFamily.ok === false && conflictedFamily.code === "FAMILY_CONFLICT"
    );

    const second = applyMergeRecode(after, decision);
    assert(
      "H. second apply is already-applied",
      second.ok === true && second.alreadyApplied === true
    );

    const refuse = parseCliArgs(["--apply"]);
    assert(
      "I. apply without confirm stays unconfirmed",
      refuse.apply === true && refuse.confirm !== true
    );
    const confirm = parseCliArgs(["--apply", "--confirm"]);
    assert("I. apply --confirm parsed", confirm.apply === true && confirm.confirm === true);

    const tempDir = join(scratch, "catalog");
    const backupsDir = join(scratch, "backups");
    writeCatalog(tempDir, fixtureCatalog());
    const refused = runMergeRecode({
      catalogDir: tempDir,
      backupsDir,
      decisions: [decision],
      apply: true,
      confirm: false,
      validateOptions: { publicDir: LIVE_PUBLIC_DIR },
    });
    assert(
      "J. transaction apply without confirm is refused",
      refused.ok === false && refused.error === APPLY_REFUSED_MESSAGE
    );

    const appliedTx = runMergeRecode({
      catalogDir: tempDir,
      backupsDir,
      decisions: [decision],
      apply: true,
      confirm: true,
      validateOptions: { publicDir: LIVE_PUBLIC_DIR },
    });
    assert("K. temp-dir apply succeeds", appliedTx.ok === true && appliedTx.applied === true);
    const tempAfter = loadCatalog({ catalogDir: tempDir });
    assert("K. temp catalogue now has 4 products", tempAfter.products.length === 4);
    assert(
      "K. temp backup was created",
      Boolean(appliedTx.backupId)
    );

    const live = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
    const livePlan = buildMergeRecodePlan(
      live,
      [
        {
          survivorProductId: "prod-zenix-coffee",
          duplicateProductId: "prod-zenix-coffee-20",
          newPosCode: "ZC20",
          approved: true,
          addDuplicateNameAsAlias: true,
        },
        {
          survivorProductId: "prod-zenix-sultan",
          duplicateProductId: "prod-zenix-sultan-20",
          newPosCode: "ZS20",
          approved: true,
          addDuplicateNameAsAlias: true,
        },
        {
          survivorProductId: "prod-sergio-filter",
          duplicateProductId: "prod-sergio-filter-20",
          newPosCode: "SF20",
          approved: true,
          addDuplicateNameAsAlias: true,
        },
      ]
    );
    assert(
      "L. live dry-run plan is ready",
      livePlan.ok === true,
      (livePlan.conflicts || []).join("; ")
    );
    const liveAlreadyMerged =
      livePlan.alreadyApplied === true && livePlan.before.products === 2256;
    assert(
      "L. live counts are 2,256 after merge or would drop 2,259 → 2,256",
      (livePlan.before.products === 2259 && livePlan.after.products === 2256) ||
        liveAlreadyMerged,
      `${livePlan.before.products} → ${livePlan.after.products}`
    );
    assert(
      "L. do-not-touch products stay put",
      livePlan.protectedUntouched === true && livePlan.driftedIds.length === 0
    );
    assert(
      "L. proposed live catalogue validates",
      livePlan.validationErrors.length === 0,
      livePlan.validationErrors[0]
    );
    assert(
      "L. Sergio Kretek 20 remains in proposed live catalogue",
      livePlan.proposed.products.some((product) => product.id === "prod-sergio-kretek-20")
    );
    assert(
      "L. Speed 1087 remains absent",
      !livePlan.proposed.mappings.some((mapping) => mapping.posCode === "1087") &&
        !livePlan.proposed.products.some((product) => product.id === "prod-speed")
    );
    for (const id of DO_NOT_TOUCH_PRODUCT_IDS) {
      const before = live.products.find((product) => product.id === id);
      const afterProduct = livePlan.proposed.products.find((product) => product.id === id);
      if (before) {
        assert(
          `L. protected ${id} still present`,
          Boolean(afterProduct)
        );
      }
    }

    assert("M. smoke did not write live catalogue", liveUnchanged(snapshot));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const failed = results.filter((row) => !row.passed);
  console.log("");
  console.log(`Merge/recode smoke: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
