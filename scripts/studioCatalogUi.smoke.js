/**
 * Catalogue Studio Defaults/Families UI smoke.
 * Source and helper assertions only — never writes the live catalogue.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleCustomerCatalog } from "./buildCustomerCatalog.js";
import { loadCatalog } from "./catalogTransaction.js";
import { listStudioImageCatalog } from "./studioImageCatalog.js";
import {
  DEFAULT_PARTIAL_WARNING,
  FAMILY_PARTIAL_WARNING,
  STUDIO_DEFAULTS_PAGE_SIZE,
  STUDIO_NEW_FAMILY_ID,
  availableUnitChoices,
  canSaveFamilyDraft,
  categoriesFromStudioDefaults,
  customerCatalogPartialWarning,
  emptyFamilyDraft,
  familyDraftFromFamily,
  familyPickerState,
  filterStudioDefaults,
  filterStudioFamilies,
  isCustomerCatalogPartial,
  isFamilyDraftDirty,
  isSingleUnitProduct,
  mergeStudioDefaultRow,
  ownerFacingStudioLoadError,
  productFamilyOwnership,
  studioDefaultStats,
} from "../src/utils/studioCatalogUi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIVE_CATALOG_DIR = join(ROOT, "src", "catalog");

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

function readSource(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const milkita = {
  productId: "prod-milkita-candy-stroberi-premium-30",
  name: "Milkita Candy Stroberi Premium (30)",
  category: "Makanan Ringan",
  aliases: ["milkita stroberi"],
  posName: "MILKITA CANDY STROBERI",
  posCode: "MLK001",
  availableUnits: ["Pak", "Karton"],
  currentDefaultUnit: "Karton",
  ownerDefaultUnit: null,
  ownerConfigured: false,
};

const glory = {
  productId: "prod-glory-16",
  name: "Glory 16",
  category: "Rokok",
  aliases: ["glori"],
  posName: "GLORY 16",
  posCode: "GL16",
  availableUnits: ["Slof"],
  currentDefaultUnit: "Slof",
  ownerDefaultUnit: "Slof",
  ownerConfigured: true,
};

const aqua = {
  productId: "prod-aqua-15l",
  name: "Aqua 1.5 L",
  category: "Minuman",
  aliases: [],
  posName: "AQUA 1500",
  posCode: "AQ15",
  availableUnits: ["Pcs", "Karton"],
  currentDefaultUnit: "Karton",
  ownerDefaultUnit: null,
  ownerConfigured: false,
};

const fixtureRows = [milkita, glory, aqua];

const fixtureFamilies = [
  {
    id: "daia-sachet-46g",
    name: "Daia Sachet 46G",
    members: [
      { productId: "prod-daia-bunga-sachet-46g", name: "Daia Bunga" },
      { productId: "prod-daia-putih-sachet-46g", name: "Daia Putih" },
    ],
  },
  {
    id: "milkita-candy-premium-30",
    name: "Milkita Candy Premium (30)",
    members: [
      { productId: "prod-milkita-candy-coklat-premium-30", name: "Coklat" },
      { productId: milkita.productId, name: milkita.name },
    ],
  },
];

const studio = readSource("src/components/CatalogueStudio.jsx");
const defaultsTab = readSource("src/components/StudioDefaultsTab.jsx");
const familiesTab = readSource("src/components/StudioFamiliesTab.jsx");
const productsTab = readSource("src/components/StudioProductsTab.jsx");
const queueTab = readSource("src/components/StudioQueueTab.jsx");
const studioApi = readSource("src/utils/studioApi.js");
const productInfo = readSource("src/components/ProductInfoView.jsx");
const appSource = readSource("src/App.jsx");

assert(
  "1. Defaults tab exists",
  studio.includes('label: "Defaults"') &&
    studio.includes("StudioDefaultsTab") &&
    studio.includes('id: "defaults"')
);
assert(
  "2. fetch defaults",
  studioApi.includes("fetchStudioDefaults") &&
    studioApi.includes("/defaults") &&
    defaultsTab.includes("fetchStudioDefaults")
);

const reviewOnly = filterStudioDefaults(fixtureRows, { status: "review" });
const configuredOnly = filterStudioDefaults(fixtureRows, {
  status: "configured",
});
assert(
  "3. All / Needs Review / Configured filters",
  filterStudioDefaults(fixtureRows, { status: "all" }).length === 3 &&
    reviewOnly.every((row) => !row.ownerConfigured) &&
    reviewOnly.length === 2 &&
    configuredOnly.length === 1 &&
    configuredOnly[0].productId === glory.productId &&
    defaultsTab.includes("Needs review") &&
    defaultsTab.includes("Configured")
);

const categoryFiltered = filterStudioDefaults(fixtureRows, {
  category: "Rokok",
});
assert(
  "4. category filter",
  categoryFiltered.length === 1 &&
    categoryFiltered[0].productId === glory.productId &&
    categoriesFromStudioDefaults(fixtureRows).includes("Rokok") &&
    defaultsTab.includes("All categories")
);

assert(
  "5. search",
  filterStudioDefaults(fixtureRows, { query: "stroberi" })[0]?.productId ===
    milkita.productId &&
    filterStudioDefaults(fixtureRows, { query: "MLK001" })[0]?.productId ===
      milkita.productId &&
    filterStudioDefaults(fixtureRows, { query: "prod-glory-16" })[0]
      ?.productId === glory.productId &&
    filterStudioDefaults(fixtureRows, { query: "AQUA 1500" })[0]?.productId ===
      aqua.productId
);

assert(
  "6. available-unit-only choices",
  availableUnitChoices(milkita).join(",") === "Pak,Karton" &&
    defaultsTab.includes("availableUnitChoices") &&
    defaultsTab.includes("units.map") &&
    !defaultsTab.includes("Slof")
);

assert(
  "7. immediate PATCH on changed unit",
  defaultsTab.includes("onChangeUnit={saveUnit}") &&
    studioApi.includes("setStudioDefaultUnit") &&
    studioApi.includes("default-unit") &&
    studioApi.includes('method: "PATCH"')
);

assert(
  "8. explicit confirm-current fallback",
  defaultsTab.includes('"Confirm"') &&
    defaultsTab.includes("onConfirm={saveUnit}")
);

const confirmedMilkita = mergeStudioDefaultRow(fixtureRows, {
  ...milkita,
  currentDefaultUnit: "Karton",
  ownerDefaultUnit: "Karton",
  ownerConfigured: true,
});
assert(
  "9. same-as-fallback confirmation",
  confirmedMilkita.find((row) => row.productId === milkita.productId)
    ?.ownerConfigured === true &&
    confirmedMilkita.find((row) => row.productId === milkita.productId)
      ?.currentDefaultUnit === "Karton"
);

const afterConfirmStats = studioDefaultStats(confirmedMilkita);
const pinnedReview = filterStudioDefaults(confirmedMilkita, {
  status: "review",
  pinnedIds: [milkita.productId],
});
assert(
  "10. configured progress update",
  studioDefaultStats(fixtureRows).configured === 1 &&
    afterConfirmStats.configured === 2 &&
    afterConfirmStats.needsReview === 1 &&
    pinnedReview.some((row) => row.productId === milkita.productId) &&
    defaultsTab.includes("configured ·") &&
    defaultsTab.includes("needs review")
);

assert(
  "11. clear/reset override",
  studioApi.includes("clearStudioDefaultUnit") &&
    studioApi.includes('method: "DELETE"') &&
    defaultsTab.includes("Use automatic default") &&
    defaultsTab.includes("clearStudioDefaultUnit")
);

assert(
  "12. single-unit confirmation",
  isSingleUnitProduct(glory) &&
    !isSingleUnitProduct(milkita) &&
    defaultsTab.includes("isSingleUnitProduct") &&
    defaultsTab.includes("Confirm")
);

assert(
  "13. pagination/progressive rendering",
  STUDIO_DEFAULTS_PAGE_SIZE === 40 &&
    defaultsTab.includes("STUDIO_DEFAULTS_PAGE_SIZE") &&
    defaultsTab.includes("Show") &&
    defaultsTab.includes("more")
);

assert(
  "14. row-level save/error state",
  defaultsTab.includes("Saving…") &&
    defaultsTab.includes('type: "error"') &&
    defaultsTab.includes("savingRef")
);

const partial = {
  customerCatalog: { ok: false, warning: "rebuild exploded" },
};
assert(
  "15. customerCatalog.ok=false warning path",
  isCustomerCatalogPartial(partial) &&
    customerCatalogPartialWarning(partial, DEFAULT_PARTIAL_WARNING) ===
      "rebuild exploded" &&
    defaultsTab.includes("DEFAULT_PARTIAL_WARNING") &&
    defaultsTab.includes("isCustomerCatalogPartial") &&
    DEFAULT_PARTIAL_WARNING.includes("customer catalogue could not be rebuilt")
);

assert(
  "16. Families tab exists",
  studio.includes('label: "Families"') && studio.includes("StudioFamiliesTab")
);
assert(
  "17. fetch families",
  studioApi.includes("fetchStudioFamilies") &&
    familiesTab.includes("fetchStudioFamilies")
);

assert(
  "18. family list/search",
  filterStudioFamilies(fixtureFamilies, "milkita").length === 1 &&
    filterStudioFamilies(fixtureFamilies, "nope").length === 0 &&
    familiesTab.includes("Search families") &&
    familiesTab.includes("Create family")
);

assert(
  "19. select family",
  familiesTab.includes("requestSelect") &&
    familiesTab.includes("familyDraftFromFamily")
);

const blank = emptyFamilyDraft();
const twoMembers = {
  ...blank,
  name: "Smoke Family",
  members: [
    { productId: "a", name: "A" },
    { productId: "b", name: "B" },
  ],
};
const liveDraft = familyDraftFromFamily(fixtureFamilies[1]);
const shrunk = {
  ...liveDraft,
  members: liveDraft.members.slice(0, 1),
};
assert(
  "20. local draft editing",
  blank.id === STUDIO_NEW_FAMILY_ID &&
    isFamilyDraftDirty(blank, twoMembers) &&
    familiesTab.includes("setDraft")
);
assert(
  "21. create draft requires >=2 members",
  !canSaveFamilyDraft(blank) &&
    !canSaveFamilyDraft({ name: "X", members: [{ productId: "a" }] }) &&
    canSaveFamilyDraft(twoMembers) &&
    familiesTab.includes("canSaveFamilyDraft")
);
assert(
  "22. existing edit cannot save <2 members",
  !canSaveFamilyDraft(shrunk) &&
    familiesTab.includes("disabled={saving || !canSave || !dirty}")
);

const ownership = productFamilyOwnership(fixtureFamilies);
assert(
  "23. product picker",
  familiesTab.includes("ProductPicker") &&
    familiesTab.includes("fetchStudioProducts") &&
    familiesTab.includes("filterStudioPickerProducts")
);
assert(
  "24. cross-family product disabled/conflict shown",
  familyPickerState(milkita.productId, new Set(), ownership).kind ===
    "conflict" &&
    familyPickerState("prod-glory-16", new Set(), ownership).kind ===
      "available" &&
    familyPickerState("prod-glory-16", new Set(["prod-glory-16"]), ownership)
      .kind === "added" &&
    familiesTab.includes("Already in") &&
    familiesTab.includes('state.kind !== "available"')
);

assert(
  "25. create",
  studioApi.includes("createStudioFamily") &&
    familiesTab.includes("createStudioFamily") &&
    familiesTab.includes("Create family")
);
assert(
  "26. update",
  studioApi.includes("updateStudioFamily") &&
    familiesTab.includes("Save changes")
);
assert(
  "27. delete confirmation",
  studioApi.includes("deleteStudioFamily") &&
    familiesTab.includes("Delete family") &&
    familiesTab.includes("Products will not be deleted") &&
    familiesTab.includes("setConfirmDelete")
);
assert(
  "28. immutable family id not editable",
  !familiesTab.includes("Family id") &&
    !familiesTab.includes("familyId input") &&
    !familiesTab.includes("draft.id =") &&
    familiesTab.includes("STUDIO_NEW_FAMILY_ID")
);

assert(
  "29. partial-success warning path",
  familiesTab.includes("FAMILY_PARTIAL_WARNING") &&
    familiesTab.includes("isCustomerCatalogPartial") &&
    FAMILY_PARTIAL_WARNING.includes("Family saved")
);

assert(
  "30. existing Queue/Image workflow remains",
  studio.includes("StudioQueueTab") &&
    studio.includes("StudioImagesTab") &&
    studio.includes('label: "Queue"') &&
    studio.includes('label: "Images"') &&
    queueTab.includes("StudioImageBrowser")
);
assert(
  "31. existing Products workflow remains",
  studio.includes("StudioProductsTab") &&
    productsTab.includes("fetchStudioProducts") &&
    productsTab.includes("updateStudioProduct")
);
assert(
  "32. existing keyboard shortcuts remain where applicable",
  studio.includes('event.key === "/"') &&
    studio.includes('key === "f"') &&
    studio.includes("ArrowLeft") &&
    studio.includes("ArrowRight") &&
    studio.includes("defaultsSearchRef") &&
    studio.includes("productsSearchRef")
);

assert(
  "stale service 404 is explained to the owner",
  ownerFacingStudioLoadError({ status: 404, message: "Not found." }).includes(
    "older catalogue service"
  ) &&
    defaultsTab.includes("ownerFacingStudioLoadError") &&
    familiesTab.includes("ownerFacingStudioLoadError")
);

assert(
  "33. no customer UI imports/changes required",
  !productInfo.includes("studioCatalogUi") &&
    !appSource.includes("StudioDefaultsTab") &&
    !appSource.includes("StudioFamiliesTab") &&
    !defaultsTab.includes("ProductInfoView") &&
    !familiesTab.includes("ProductInfoView")
);

const live = loadCatalog({ catalogDir: LIVE_CATALOG_DIR });
const images = listStudioImageCatalog({ catalog: live });
const customer = assembleCustomerCatalog(live);
const reco = readFileSync(join(LIVE_CATALOG_DIR, "recommendations.json"), "utf8");

assert(
  "live owner data unchanged by UI smoke",
  live.productDefaults.length === 1 &&
    live.productDefaults[0]?.productId ===
      "prod-milkita-candy-stroberi-premium-30" &&
    live.productDefaults[0]?.defaultUnitName === "Pak" &&
    live.productFamilies.length === 3 &&
    live.productFamilies.reduce(
      (total, family) => total + family.members.length,
      0
    ) === 10 &&
    live.recommendations.length === 147 &&
    reco.includes("sourceProductId")
);

assert(
  "baseline counts remain",
  live.products.length === 2256 &&
    live.variants.length === 2256 &&
    live.units.length === 5840 &&
    live.mappings.length === 5834 &&
    live.aliases.length === 196 &&
    customer.products.length === 2256 &&
    images.stats.completed + images.stats.missing === 2256 &&
    images.stats.incomplete === 0 &&
    customer.products.find((row) => row.id === "prod-glory-16")?.defaultUnit ===
      "Slof" &&
    customer.products.find((row) => row.id === "prod-aqua-15l")?.defaultUnit ===
      "Karton" &&
    customer.products.find(
      (row) => row.id === "prod-milkita-candy-stroberi-premium-30"
    )?.defaultUnit === "Pak"
);

assert(
  "Queue/Images/Products still first, then Defaults/Families",
  /Queue[\s\S]*Images[\s\S]*Products[\s\S]*Defaults[\s\S]*Families/.test(
    studio
  )
);

console.log("");
console.log(`Studio catalogue UI smoke: ${results.length}/${results.length} passed`);
