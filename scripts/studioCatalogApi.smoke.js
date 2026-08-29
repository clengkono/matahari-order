/**
 * Isolated Studio catalogue-management API smoke.
 * Copies live JSON into a temp directory — never writes the real catalogue.
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
import { assembleCustomerCatalog } from "./buildCustomerCatalog.js";
import {
  CATALOG_FILES,
  loadCatalog,
  runCatalogTransaction,
} from "./catalogTransaction.js";
import {
  clearOwnerDefaultUnit,
  listStudioDefaults,
  parseDefaultUnitPatch,
  setOwnerDefaultUnit,
} from "./studioCatalogDefaults.js";
import { listStudioImageCatalog } from "./studioImageCatalog.js";
import {
  createStudioFamily,
  deleteStudioFamily,
  listStudioFamilies,
  parseFamilyCreateBody,
  parseFamilyPatchBody,
  proposeFamilyId,
  updateStudioFamily,
} from "./studioProductFamilies.js";
import {
  listStudioProducts,
  parseProductMetadataPatch,
} from "./studioProductMetadata.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");
const LIVE_PUBLIC_DIR = join(ROOT, "public");
const LIVE_CUSTOMER = join(
  LIVE_CATALOG_DIR,
  "generated",
  "customerCatalog.json"
);

const MILKITA_ID = "prod-milkita-candy-stroberi-premium-30";
const MILKITA_PEER_ID = "prod-milkita-candy-coklat-premium-30";
const GLORY_ID = "prod-glory-16";
const AQUA_ID = "prod-aqua-15l";
const TEH_A_ID = "prod-teh-sariwangi-dos-25";
const TEH_B_ID = "prod-teh-sarimurni-dos-25";
const ROMA_A_ID = "prod-roma-malkist-coklat-sachet-18g";
const ROMA_B_ID = "prod-roma-malkist-crackers-sachet-21g";

const FORBIDDEN_KEY =
  /^(price|harga|conversion|conversionFactor|qtyPerPackage|posPrice|unitPrice)$/i;

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

function snapshotCatalogFiles(catalogDir) {
  const snapshot = {};
  for (const fileName of CATALOG_FILES) {
    snapshot[fileName] = readText(join(catalogDir, fileName));
  }
  return snapshot;
}

function filesMatchSnapshot(catalogDir, snapshot) {
  return CATALOG_FILES.every(
    (fileName) => readText(join(catalogDir, fileName)) === snapshot[fileName]
  );
}

function collectForbiddenKeys(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectForbiddenKeys(item, found);
    }
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) {
        found.push(key);
      }
      collectForbiddenKeys(child, found);
    }
  }
  return found;
}

function setupTempCatalog() {
  const root = mkdtempSync(join(tmpdir(), "matahari-studio-catalog-api-"));
  const catalogDir = join(root, "catalog");
  const backupsDir = join(catalogDir, "backups");
  const customerCatalogPath = join(root, "customerCatalog.json");

  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(backupsDir, { recursive: true });

  for (const fileName of CATALOG_FILES) {
    writeFileSync(
      join(catalogDir, fileName),
      readText(join(LIVE_CATALOG_DIR, fileName)),
      "utf8"
    );
  }

  return { root, catalogDir, backupsDir, customerCatalogPath };
}

function apiOptions(dirs, extra = {}) {
  return {
    catalogDir: dirs.catalogDir,
    backupsDir: dirs.backupsDir,
    customerCatalogPath: dirs.customerCatalogPath,
    validateOptions: { publicDir: LIVE_PUBLIC_DIR },
    ...extra,
  };
}

function readCustomer(dirs) {
  return JSON.parse(readText(dirs.customerCatalogPath));
}

function customerProduct(dirs, productId) {
  return readCustomer(dirs).products.find((row) => row.id === productId);
}

function defaultRow(catalog, productId) {
  return listStudioDefaults(catalog).defaults.find(
    (row) => row.productId === productId
  );
}

function overrideCount(catalog, productId) {
  return (catalog.productDefaults ?? []).filter(
    (row) => row.productId === productId
  ).length;
}

function main() {
  const liveSnapshot = snapshotCatalogFiles(LIVE_CATALOG_DIR);
  const liveCustomerBefore = existsSync(LIVE_CUSTOMER)
    ? readText(LIVE_CUSTOMER)
    : null;
  const recoBefore = liveSnapshot["recommendations.json"];
  const dirs = setupTempCatalog();

  try {
    const live = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
    const listed = listStudioDefaults(live);
    const milkita = defaultRow(live, MILKITA_ID);
    const glory = defaultRow(live, GLORY_ID);
    const aqua = defaultRow(live, AQUA_ID);

    assert(
      "1. GET defaults returns catalogue rows",
      listed.defaults.length === live.products.length &&
        listed.stats.total === 2256 &&
        listed.stats.configured === 0 &&
        listed.stats.needsReview === 2256
    );
    assert(
      "2. unconfigured effective fallback",
      milkita?.ownerConfigured === false &&
        milkita?.ownerDefaultUnit === null &&
        milkita?.currentDefaultUnit === "Karton" &&
        milkita?.availableUnits.includes("Pak") &&
        milkita?.availableUnits.includes("Karton") &&
        glory?.currentDefaultUnit === "Slof" &&
        aqua?.currentDefaultUnit === "Karton"
    );

    const created = setOwnerDefaultUnit(
      { productId: MILKITA_ID, defaultUnitName: "Pak" },
      apiOptions(dirs)
    );
    assert(
      "3. PATCH create override",
      created.ok &&
        created.created === true &&
        created.default.ownerConfigured === true &&
        created.default.ownerDefaultUnit === "Pak" &&
        created.default.currentDefaultUnit === "Pak" &&
        created.customerCatalog?.ok === true
    );

    const sameAsFallback = setOwnerDefaultUnit(
      { productId: GLORY_ID, defaultUnitName: "Slof" },
      apiOptions(dirs)
    );
    assert(
      "4. PATCH same-as-fallback still ownerConfigured",
      sameAsFallback.ok &&
        sameAsFallback.created === true &&
        sameAsFallback.default.ownerConfigured === true &&
        sameAsFallback.default.currentDefaultUnit === "Slof" &&
        sameAsFallback.default.ownerDefaultUnit === "Slof"
    );

    const updated = setOwnerDefaultUnit(
      { productId: MILKITA_ID, defaultUnitName: "karton" },
      apiOptions(dirs)
    );
    assert(
      "5. PATCH update override",
      updated.ok &&
        updated.created === false &&
        updated.updated === true &&
        updated.defaultUnitName === "Karton" &&
        updated.default.currentDefaultUnit === "Karton"
    );

    const unknownProduct = setOwnerDefaultUnit(
      { productId: "prod-does-not-exist", defaultUnitName: "Pak" },
      apiOptions(dirs)
    );
    assert(
      "6. invalid product",
      !unknownProduct.ok && unknownProduct.code === "NOT_FOUND"
    );

    const missingBody = parseDefaultUnitPatch({});
    const emptyName = setOwnerDefaultUnit(
      { productId: MILKITA_ID, defaultUnitName: "   " },
      apiOptions(dirs)
    );
    const invalidUnit = setOwnerDefaultUnit(
      { productId: MILKITA_ID, defaultUnitName: "Slof" },
      apiOptions(dirs)
    );
    assert(
      "7. invalid unit / missing body / empty name",
      missingBody.code === "INVALID_INPUT" &&
        !emptyName.ok &&
        emptyName.code === "INVALID_INPUT" &&
        !invalidUnit.ok &&
        invalidUnit.code === "UNIT_UNAVAILABLE"
    );

    const deactivatePak = runCatalogTransaction(
      apiOptions(dirs, {
        action: "smoke-deactivate-pak",
        productIds: [MILKITA_ID],
        summary: "Deactivate Milkita Pak for inactive-unit smoke",
        mutate(catalog) {
          const unit = catalog.units.find(
            (entry) => entry.id === `${MILKITA_ID}__pak`
          );
          unit.active = false;
        },
      })
    );
    const inactiveUnit = setOwnerDefaultUnit(
      { productId: MILKITA_ID, defaultUnitName: "Pak" },
      apiOptions(dirs)
    );
    assert(
      "8. inactive unit",
      deactivatePak.ok &&
        !inactiveUnit.ok &&
        inactiveUnit.code === "UNIT_INACTIVE"
    );
    runCatalogTransaction(
      apiOptions(dirs, {
        action: "smoke-reactivate-pak",
        productIds: [MILKITA_ID],
        summary: "Reactivate Milkita Pak after inactive-unit smoke",
        mutate(catalog) {
          const unit = catalog.units.find(
            (entry) => entry.id === `${MILKITA_ID}__pak`
          );
          unit.active = true;
        },
      })
    );

    const cleared = clearOwnerDefaultUnit(
      { productId: MILKITA_ID },
      apiOptions(dirs)
    );
    const afterClear = loadCatalog(apiOptions(dirs));
    assert(
      "9. DELETE override",
      cleared.ok &&
        cleared.cleared === true &&
        cleared.default.ownerConfigured === false &&
        cleared.default.currentDefaultUnit === "Karton" &&
        overrideCount(afterClear, MILKITA_ID) === 0
    );

    const clearNoop = clearOwnerDefaultUnit(
      { productId: MILKITA_ID },
      apiOptions(dirs)
    );
    assert(
      "10. DELETE no-op",
      clearNoop.ok &&
        clearNoop.noop === true &&
        clearNoop.cleared === false &&
        clearNoop.customerCatalog === null
    );

    const rebuildDefault = setOwnerDefaultUnit(
      { productId: MILKITA_ID, defaultUnitName: "Pak" },
      apiOptions(dirs)
    );
    const rebuiltMilkita = customerProduct(dirs, MILKITA_ID);
    const rebuiltGlory = customerProduct(dirs, GLORY_ID);
    const rebuiltAqua = customerProduct(dirs, AQUA_ID);
    assert(
      "11. customer rebuild receives new default",
      rebuildDefault.customerCatalog?.ok === true &&
        rebuiltMilkita.defaultUnit === "Pak" &&
        rebuiltGlory.defaultUnit === "Slof" &&
        rebuiltAqua.defaultUnit === "Karton"
    );

    const beforeFailure = readText(join(dirs.catalogDir, "productDefaults.json"));
    const writeFailed = setOwnerDefaultUnit(
      { productId: AQUA_ID, defaultUnitName: "Karton" },
      apiOptions(dirs, {
        testHooks: {
          beforeReplace() {
            throw new Error("simulated default-unit replace failure");
          },
        },
      })
    );
    assert(
      "12. transaction failure does not corrupt source",
      !writeFailed.ok &&
        writeFailed.code === "WRITE_FAILED" &&
        readText(join(dirs.catalogDir, "productDefaults.json")) === beforeFailure
    );

    const afterCreate = loadCatalog(apiOptions(dirs));
    assert(
      "13. no duplicate owner row",
      overrideCount(afterCreate, MILKITA_ID) === 1 &&
        overrideCount(afterCreate, GLORY_ID) === 1 &&
        afterCreate.productDefaults.length === 2
    );

    const families = listStudioFamilies(loadCatalog(apiOptions(dirs)));
    assert(
      "14. GET families",
      families.families.length === 3 &&
        families.stats.familyCount === 3 &&
        families.stats.memberCount === 10 &&
        families.families.every(
          (family) =>
            family.id &&
            family.name &&
            family.members.length >= 2 &&
            family.members.every((member) => member.productId && member.name)
        )
    );

    const recoAtFamilyStart = readText(
      join(dirs.catalogDir, "recommendations.json")
    );
    const createdFamily = createStudioFamily(
      { name: "Smoke Test Family", members: [GLORY_ID, AQUA_ID] },
      apiOptions(dirs)
    );
    const glorySimilarAfterCreate = customerProduct(dirs, GLORY_ID)
      ?.similarProductIds;
    assert(
      "15. POST valid family",
      createdFamily.ok &&
        createdFamily.family?.members.length === 2 &&
        createdFamily.customerCatalog?.ok === true &&
        Array.isArray(glorySimilarAfterCreate) &&
        glorySimilarAfterCreate.includes(AQUA_ID)
    );
    assert(
      "16. generated id stable/valid",
      createdFamily.family.id === "smoke-test-family" &&
        proposeFamilyId("Smoke Test Family", new Set()) === "smoke-test-family"
    );

    const collided = createStudioFamily(
      { name: "Smoke Test Family", members: [TEH_A_ID, TEH_B_ID] },
      apiOptions(dirs)
    );
    const liveIdCollision = proposeFamilyId(
      "Daia Sachet 46G",
      new Set(families.families.map((family) => family.id))
    );
    assert(
      "17. slug collision safely handled",
      collided.ok &&
        collided.family.id === "smoke-test-family-2" &&
        liveIdCollision === "daia-sachet-46g-2" &&
        proposeFamilyId(
          "Smoke Test Family",
          new Set(["smoke-test-family", "smoke-test-family-2"])
        ) === "smoke-test-family-3"
    );

    const tooSmall = createStudioFamily(
      { name: "Too Small", members: [ROMA_A_ID] },
      apiOptions(dirs)
    );
    assert(
      "18. POST <2 members rejected",
      !tooSmall.ok && tooSmall.code === "FAMILY_TOO_SMALL"
    );

    const unknownMember = createStudioFamily(
      {
        name: "Unknown Member",
        members: [ROMA_A_ID, "prod-does-not-exist"],
      },
      apiOptions(dirs)
    );
    assert(
      "19. unknown member rejected",
      !unknownMember.ok && unknownMember.code === "UNKNOWN_MEMBER"
    );

    const duplicateMember = createStudioFamily(
      { name: "Duplicate Member", members: [ROMA_A_ID, ROMA_A_ID] },
      apiOptions(dirs)
    );
    assert(
      "20. duplicate member rejected",
      !duplicateMember.ok && duplicateMember.code === "DUPLICATE_MEMBER"
    );

    const crossCreate = createStudioFamily(
      { name: "Cross Family", members: [ROMA_A_ID, MILKITA_ID] },
      apiOptions(dirs)
    );
    assert(
      "21. cross-family member rejected",
      !crossCreate.ok && crossCreate.code === "FAMILY_CONFLICT"
    );

    const renamed = updateStudioFamily(
      { familyId: "smoke-test-family", name: "Smoke Test Family Renamed" },
      apiOptions(dirs)
    );
    assert(
      "22. PATCH rename",
      renamed.ok &&
        renamed.family.name === "Smoke Test Family Renamed" &&
        !renamed.noop
    );

    const membersUpdated = updateStudioFamily(
      {
        familyId: "smoke-test-family",
        members: [ROMA_A_ID, ROMA_B_ID],
      },
      apiOptions(dirs)
    );
    const romaSimilarAfterPatch = customerProduct(dirs, ROMA_A_ID)
      ?.similarProductIds;
    const glorySimilarAfterPatch = customerProduct(dirs, GLORY_ID)
      ?.similarProductIds;
    assert(
      "23. PATCH members",
      membersUpdated.ok &&
        membersUpdated.family.members.map((member) => member.productId).join(",") ===
          `${ROMA_A_ID},${ROMA_B_ID}` &&
        romaSimilarAfterPatch?.[0] === ROMA_B_ID &&
        !glorySimilarAfterPatch
    );

    const shrink = updateStudioFamily(
      { familyId: "smoke-test-family", members: [ROMA_A_ID] },
      apiOptions(dirs)
    );
    assert(
      "24. PATCH resulting <2 rejected",
      !shrink.ok && shrink.code === "FAMILY_TOO_SMALL"
    );

    const crossPatch = updateStudioFamily(
      {
        familyId: "smoke-test-family",
        members: [ROMA_A_ID, MILKITA_ID],
      },
      apiOptions(dirs)
    );
    assert(
      "25. PATCH cross-family rejected",
      !crossPatch.ok && crossPatch.code === "FAMILY_CONFLICT"
    );

    assert(
      "26. family id remains unchanged on rename",
      renamed.family.id === "smoke-test-family" &&
        membersUpdated.family.id === "smoke-test-family"
    );

    const noopRename = updateStudioFamily(
      { familyId: "smoke-test-family", name: "Smoke Test Family Renamed" },
      apiOptions(dirs)
    );
    assert(
      "PATCH no-op skips rebuild",
      noopRename.ok &&
        noopRename.noop === true &&
        noopRename.customerCatalog === null
    );

    const deleted = deleteStudioFamily(
      { familyId: "smoke-test-family" },
      apiOptions(dirs)
    );
    const deletedCollision = deleteStudioFamily(
      { familyId: "smoke-test-family-2" },
      apiOptions(dirs)
    );
    const afterDeletes = listStudioFamilies(loadCatalog(apiOptions(dirs)));
    assert(
      "27. DELETE family",
      deleted.ok &&
        deleted.deleted === true &&
        deletedCollision.ok &&
        afterDeletes.stats.familyCount === 3 &&
        afterDeletes.stats.memberCount === 10
    );

    const deleteUnknown = deleteStudioFamily(
      { familyId: "does-not-exist" },
      apiOptions(dirs)
    );
    assert(
      "28. delete unknown family",
      !deleteUnknown.ok && deleteUnknown.code === "NOT_FOUND"
    );

    const afterDeleteCustomer = assembleCustomerCatalog(
      loadCatalog(apiOptions(dirs))
    );
    const milkitaSimilar = afterDeleteCustomer.products.find(
      (row) => row.id === MILKITA_ID
    )?.similarProductIds;
    const glorySimilar = afterDeleteCustomer.products.find(
      (row) => row.id === GLORY_ID
    )?.similarProductIds;
    const romaSimilar = afterDeleteCustomer.products.find(
      (row) => row.id === ROMA_A_ID
    )?.similarProductIds;
    assert(
      "29. customer similarProductIds rebuilt",
      createdFamily.customerCatalog?.ok === true &&
        membersUpdated.customerCatalog?.ok === true &&
        deleted.customerCatalog?.ok === true &&
        glorySimilarAfterCreate.includes(AQUA_ID) &&
        romaSimilarAfterPatch?.[0] === ROMA_B_ID &&
        Array.isArray(milkitaSimilar) &&
        milkitaSimilar.includes(MILKITA_PEER_ID) &&
        !glorySimilar &&
        !romaSimilar
    );

    assert(
      "30. recommendations unchanged",
      readText(join(dirs.catalogDir, "recommendations.json")) ===
        recoAtFamilyStart && recoAtFamilyStart === recoBefore
    );

    const defaultsPayload = listStudioDefaults(loadCatalog(apiOptions(dirs)));
    const familiesPayload = listStudioFamilies(loadCatalog(apiOptions(dirs)));
    const defaultLeaks = collectForbiddenKeys(defaultsPayload);
    const familyLeaks = collectForbiddenKeys(familiesPayload);
    assert(
      "31. no prices exposed by defaults endpoint",
      defaultLeaks.length === 0,
      defaultLeaks.join(",")
    );
    assert(
      "32. no conversion factors exposed",
      !JSON.stringify(defaultsPayload).includes("conversion") &&
        !JSON.stringify(defaultsPayload).includes("qtyPerPackage")
    );
    assert(
      "33. family endpoint no prices/conversions",
      familyLeaks.length === 0 &&
        !JSON.stringify(familiesPayload).includes("conversion") &&
        !JSON.stringify(familiesPayload).includes("qtyPerPackage")
    );

    const studioProducts = listStudioProducts(live);
    const imageCatalog = listStudioImageCatalog({ catalog: live });
    const picker = studioProducts.find((row) => row.id === MILKITA_ID);
    const metadataRejected = parseProductMetadataPatch({
      name: "X",
      defaultUnitName: "Pak",
    });
    const familyRejected = parseFamilyCreateBody({
      name: "X",
      members: [GLORY_ID, AQUA_ID],
      extra: true,
    });
    const familyPatchRejected = parseFamilyPatchBody({ id: "nope" });
    assert(
      "34. existing Studio product/image endpoint behaviour remains compatible",
      studioProducts.length === 2256 &&
        picker?.name &&
        Array.isArray(picker.aliases) &&
        Object.hasOwn(picker, "posName") &&
        Object.hasOwn(picker, "posCode") &&
        Object.hasOwn(picker, "image") &&
        Object.hasOwn(picker, "variantId") &&
        imageCatalog.stats.total === 2256 &&
        imageCatalog.stats.completed === 56 &&
        imageCatalog.stats.missing === 2200 &&
        imageCatalog.stats.incomplete === 0 &&
        metadataRejected.ok === false &&
        familyRejected.ok === false &&
        familyPatchRejected.ok === false
    );

    const rebuildFailed = setOwnerDefaultUnit(
      { productId: AQUA_ID, defaultUnitName: "Karton" },
      apiOptions(dirs, {
        rebuildCustomerCatalog() {
          throw new Error("forced rebuild failure");
        },
      })
    );
    assert(
      "rebuild failure reported without silent success",
      rebuildFailed.ok &&
        rebuildFailed.customerCatalog?.ok === false &&
        rebuildFailed.customerCatalog?.code === "REBUILD_FAILED" &&
        /forced rebuild failure/.test(rebuildFailed.customerCatalog?.warning || "")
    );

    const liveNow = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
    const liveCustomerNow = assembleCustomerCatalog(liveNow);
    assert(
      "real catalogue unchanged after isolated API smoke",
      filesMatchSnapshot(LIVE_CATALOG_DIR, liveSnapshot) &&
        liveNow.productDefaults.length === 0 &&
        liveNow.productFamilies.length === 3 &&
        liveNow.productFamilies.reduce(
          (total, family) => total + family.members.length,
          0
        ) === 10 &&
        liveNow.recommendations.length === 147 &&
        readText(join(LIVE_CATALOG_DIR, "recommendations.json")) === recoBefore &&
        (liveCustomerBefore === null ||
          readText(LIVE_CUSTOMER) === liveCustomerBefore)
    );
    assert(
      "customer fallback defaults unchanged on live catalogue",
      liveCustomerNow.products.find((row) => row.id === GLORY_ID)?.defaultUnit ===
        "Slof" &&
        liveCustomerNow.products.find((row) => row.id === AQUA_ID)?.defaultUnit ===
          "Karton" &&
        liveCustomerNow.products.find((row) => row.id === MILKITA_ID)
          ?.defaultUnit === "Karton"
    );
  } finally {
    rmSync(dirs.root, { recursive: true, force: true });
  }

  if (!filesMatchSnapshot(LIVE_CATALOG_DIR, liveSnapshot)) {
    throw new Error("Live catalogue files changed during API smoke.");
  }
}

try {
  main();
  console.log("");
  console.log(
    `Studio catalogue API smoke: ${results.length}/${results.length} passed`
  );
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(
    `Studio catalogue API smoke failed after ${passed}/${results.length} checks`
  );
  console.error(error.message || error);
  process.exitCode = 1;
}
