/**
 * Stage 5B.2 — Safe full-catalogue importer.
 *
 * Merge-based. Reconciles by mappings.posCode ↔ workbook Kode Item.
 * Dry-run is the default. Live apply requires --apply --confirm and uses
 * runCatalogTransaction(). Never calls catalog:import-seed.
 *
 * Visibility strategy:
 * The live schema has no product.status / visible flag. assembleProducts()
 * exposes every variant. Inactive exists only on units. Rather than invent a
 * fake Uncategorized / Lainnya category or a casual visibility field, unresolved
 * NEW products (MEDIUM, LOW, Lainnya, reviewNeeded, unknown category) are omitted
 * from the proposed live products/variants/units/mappings and staged only in
 * dry-run artifacts (held-for-review.json). Existing catalogue rows are never
 * deleted in this stage.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOMEPAGE_FEATURED_PRODUCT_IDS } from "../src/config/homepageFeatured.js";
import { CURATED_CATEGORY_IDS } from "../src/config/categories.js";
import { validateCatalog } from "./buildCatalog.js";
import { buildCustomerCatalog, isLiveCatalogDir } from "./buildCustomerCatalog.js";
import {
  CATALOG_FILES,
  loadCatalog,
  runCatalogTransaction,
} from "./catalogTransaction.js";
import {
  chooseDefaultUnit,
  groupWorkbookProducts,
  loadWorkbook,
  namesStronglyMatch,
  normalizeNameKey,
  proposeProductId,
  proposedCustomerUnitName,
  sortOrderForUnit,
  uniqueSorted,
  unitIdFromProductAndUnit,
  unitsEquivalent,
} from "./catalogWorkbook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const WORKBOOK_RELATIVE = "imports/Matahari_Product_List_FINAL.xlsx";
export const CLASSIFICATION_RELATIVE =
  "tmp/catalog-category-preview/product-classification.json";
export const RECODE_DECISIONS_RELATIVE = "imports/catalog-recode-decisions.json";
export const HELD_PRODUCT_DECISIONS_RELATIVE =
  "imports/catalog-held-product-decisions.json";
export const DRY_RUN_RELATIVE = "tmp/catalog-full-import";

const WORKBOOK_PATH = join(ROOT, WORKBOOK_RELATIVE);
const CLASSIFICATION_PATH = join(ROOT, CLASSIFICATION_RELATIVE);
const RECODE_DECISIONS_PATH = join(ROOT, RECODE_DECISIONS_RELATIVE);
const HELD_PRODUCT_DECISIONS_PATH = join(ROOT, HELD_PRODUCT_DECISIONS_RELATIVE);
const CATALOG_DIR = join(ROOT, "src", "catalog");
const CATEGORIES_JS = join(ROOT, "src", "config", "categories.js");
const IMAGE_DIR = join(ROOT, "public", "product-images");
const DRY_RUN_DIR = join(ROOT, DRY_RUN_RELATIVE);
const XLSX_EXTRACT_DIR = join(DRY_RUN_DIR, "_xlsx");
const DEFAULT_PUBLIC_DIR = join(ROOT, "public");

export const APPROVED_CATEGORIES = Object.freeze([...CURATED_CATEGORY_IDS]);

const APPROVED_CATEGORY_SET = new Set(APPROVED_CATEGORIES);

export const APPLY_REFUSED_MESSAGE =
  "Apply refused: live catalogue write requires both --apply and --confirm.";

export const DRY_RUN_ARTIFACT_FILES = Object.freeze([
  "IMPORT_DIFF.md",
  "import-summary.json",
  "existing-updates.json",
  "new-visible-products.json",
  "held-for-review.json",
  "recode-review.json",
  "preserved-not-in-source.json",
  "new-units.json",
  "mapping-changes.json",
  "default-unit-review.json",
  "validation-report.json",
  "proposed-products.json",
  "proposed-variants.json",
  "proposed-units.json",
  "proposed-mappings.json",
  "proposed-aliases.json",
  "proposed-recommendations.json",
]);

export function serializeCatalogJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(filePath, data) {
  writeFileSync(filePath, serializeCatalogJson(data), "utf8");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function hashFile(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function hashCatalogFiles(catalogDir = CATALOG_DIR) {
  const hashes = {};
  for (const fileName of CATALOG_FILES) {
    hashes[fileName] = hashFile(join(catalogDir, fileName));
  }
  return hashes;
}

function hashTree(dirPath) {
  const hashes = {};
  if (!existsSync(dirPath)) {
    return hashes;
  }

  function walk(current) {
    const entries = readdirSync(current).sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        hashes[relative(ROOT, full).replaceAll("\\", "/")] = hashFile(full);
      }
    }
  }

  walk(dirPath);
  return hashes;
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const args = argv.filter((arg) => arg.startsWith("-"));
  const apply = args.includes("--apply");
  const dry = args.includes("--dry") || args.includes("--dry-run");
  const confirm = args.includes("--confirm");

  if (apply && dry) {
    return {
      mode: "error",
      error: "Cannot combine --apply with --dry / --dry-run.",
    };
  }

  if (apply && !confirm) {
    return {
      mode: "refused",
      error: APPLY_REFUSED_MESSAGE,
    };
  }

  if (apply && confirm) {
    return { mode: "apply" };
  }

  return { mode: "dry" };
}

export function loadRecodeDecisions(filePath = RECODE_DECISIONS_PATH) {
  if (!existsSync(filePath)) {
    return { version: 1, decisions: [], source: "missing" };
  }

  const parsed = readJson(filePath);
  const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
  return {
    version: parsed?.version ?? 1,
    decisions,
    source: filePath,
  };
}

export function loadHeldProductDecisions(
  filePath = HELD_PRODUCT_DECISIONS_PATH
) {
  if (!existsSync(filePath)) {
    return {
      version: 1,
      decisions: [],
      categoryCorrections: [],
      source: "missing",
    };
  }

  const parsed = readJson(filePath);
  return {
    version: parsed?.version ?? 1,
    decisions: Array.isArray(parsed?.decisions) ? parsed.decisions : [],
    categoryCorrections: Array.isArray(parsed?.categoryCorrections)
      ? parsed.categoryCorrections
      : [],
    source: filePath,
  };
}

function ownerCategoryOverrides(heldProductDecisions) {
  const byPosCode = new Map();

  for (const decision of heldProductDecisions?.decisions ?? []) {
    if (!decision || decision.approved !== true) {
      continue;
    }
    const category = String(decision.category ?? "").trim();
    if (!APPROVED_CATEGORY_SET.has(category)) {
      continue;
    }
    for (const code of decision.posCodes ?? []) {
      const posCode = String(code ?? "").trim();
      if (!posCode) {
        continue;
      }
      byPosCode.set(posCode, {
        category,
        subcategory: decision.subcategory ?? null,
        reason: `owner-approved-family:${decision.familyId ?? posCode}`,
      });
    }
  }

  for (const correction of heldProductDecisions?.categoryCorrections ?? []) {
    if (!correction || correction.approved !== true) {
      continue;
    }
    const posCode = String(correction.posCode ?? "").trim();
    const category = String(correction.category ?? "").trim();
    if (!posCode || !APPROVED_CATEGORY_SET.has(category)) {
      continue;
    }
    byPosCode.set(posCode, {
      category,
      subcategory: correction.subcategory ?? null,
      reason: `owner-approved-category-correction:${posCode}`,
    });
  }

  return byPosCode;
}

function applyOwnerClassification(classification, posCode, overrides) {
  const override = overrides.get(String(posCode ?? "").trim());
  if (!override) {
    return classification;
  }

  return {
    ...(classification ?? {}),
    proposedCategory: override.category,
    proposedSubcategory:
      override.subcategory || classification?.proposedSubcategory || "",
    confidence: "HIGH",
    reviewNeeded: false,
    classificationReason: override.reason,
    ownerApproved: true,
  };
}

function approvedRecodeMap(recodeDecisions) {
  const byTo = new Map();

  for (const decision of recodeDecisions.decisions ?? []) {
    if (!decision || decision.approved !== true) {
      continue;
    }
    const fromPosCode = String(decision.fromPosCode ?? "").trim();
    const toPosCode = String(decision.toPosCode ?? "").trim();
    const productId = String(decision.productId ?? "").trim();
    if (!fromPosCode || !toPosCode || !productId) {
      continue;
    }
    byTo.set(toPosCode, {
      ...decision,
      fromPosCode,
      toPosCode,
      productId,
    });
  }

  return { byTo };
}

function applyApprovedRecodeMappings({
  proposed,
  product,
  fromPosCode,
  toPosCode,
  toPosName,
  workbookProduct,
}) {
  const otherProductIds = uniqueSorted(
    proposed.mappings
      .filter(
        (mapping) =>
          String(mapping.posCode ?? "").trim() === toPosCode &&
          mapping.productId !== product.id
      )
      .map((mapping) => mapping.productId)
  );
  if (otherProductIds.length > 0) {
    return {
      applied: false,
      reason: `new POS code ${toPosCode} already mapped to ${otherProductIds.join(", ")}`,
      updates: [],
    };
  }

  const fromMappings = proposed.mappings.filter(
    (mapping) =>
      mapping.productId === product.id &&
      String(mapping.posCode ?? "").trim() === fromPosCode
  );
  if (fromMappings.length === 0) {
    return {
      applied: false,
      reason: `no current mapping uses fromPosCode ${fromPosCode}`,
      updates: [],
    };
  }

  const alreadyHasNewCode = proposed.mappings.some(
    (mapping) =>
      mapping.productId === product.id &&
      String(mapping.posCode ?? "").trim() === toPosCode
  );
  if (alreadyHasNewCode) {
    return {
      applied: false,
      reason: `product already has mapping for ${toPosCode}; refusing duplicate`,
      updates: [],
    };
  }

  const updates = [];
  for (const mapping of fromMappings) {
    const workbookRow = (workbookProduct.rows ?? []).find((row) =>
      unitsEquivalent(mapping.posUnit, row.posUnit)
    );
    const nextPosName =
      workbookRow?.posName ||
      workbookProduct.posName ||
      toPosName ||
      mapping.posName;

    if (mapping.posCode !== toPosCode) {
      updates.push({
        field: "posCode",
        mappingSourceRowIndex: mapping.sourceRowIndex,
        from: mapping.posCode,
        to: toPosCode,
      });
      mapping.posCode = toPosCode;
    }
    if (nextPosName && mapping.posName !== nextPosName) {
      updates.push({
        field: "posName",
        mappingSourceRowIndex: mapping.sourceRowIndex,
        from: mapping.posName,
        to: nextPosName,
      });
      mapping.posName = nextPosName;
    }
  }

  return {
    applied: true,
    updates,
    recodedMappingCount: fromMappings.length,
  };
}

export function isEligibleForVisibleImport(classification) {
  if (!classification) {
    return {
      eligible: false,
      holdReason: "missing-classification",
    };
  }

  const category = classification.proposedCategory;
  if (!APPROVED_CATEGORY_SET.has(category)) {
    return {
      eligible: false,
      holdReason:
        category === "Lainnya" ? "lainnya" : "unknown-or-unapproved-category",
    };
  }

  if (classification.reviewNeeded) {
    return { eligible: false, holdReason: "review-needed" };
  }

  if (classification.confidence === "MEDIUM") {
    return { eligible: false, holdReason: "medium-confidence" };
  }

  if (classification.confidence === "LOW") {
    return { eligible: false, holdReason: "low-confidence" };
  }

  if (classification.confidence !== "HIGH") {
    return { eligible: false, holdReason: "non-high-confidence" };
  }

  return { eligible: true, holdReason: null };
}

function catalogIndex(catalog) {
  const mappingsByProductId = new Map();
  const mappingsByPosCode = new Map();
  for (const mapping of catalog.mappings) {
    const productList = mappingsByProductId.get(mapping.productId) ?? [];
    productList.push(mapping);
    mappingsByProductId.set(mapping.productId, productList);

    const code = String(mapping.posCode ?? "").trim();
    if (!code) {
      continue;
    }
    const codeList = mappingsByPosCode.get(code) ?? [];
    codeList.push(mapping);
    mappingsByPosCode.set(code, codeList);
  }

  return { mappingsByProductId, mappingsByPosCode };
}

function cloneCatalog(catalog) {
  return structuredClone(catalog);
}

function mappingIdentityKey(posCode, posUnit) {
  return `${String(posCode).trim()}::${String(posUnit).trim()}`;
}

function findMappingForWorkbookRow(mappings, posCode, posUnit) {
  return mappings.find(
    (mapping) =>
      String(mapping.posCode ?? "").trim() === String(posCode).trim() &&
      unitsEquivalent(mapping.posUnit, posUnit)
  );
}

function dedupeWorkbookUnitRows(rows, posCode) {
  const seen = new Map();
  const unique = [];
  const duplicates = [];
  for (const row of rows) {
    const key = mappingIdentityKey(posCode, row.posUnit);
    if (seen.has(key)) {
      duplicates.push({
        posUnit: row.posUnit,
        firstSourceRow: seen.get(key),
        duplicateSourceRow: row.sourceRow,
      });
      continue;
    }
    seen.set(key, row.sourceRow);
    unique.push(row);
  }
  return { unique, duplicates };
}

function buildNewProductRecords(workbookProduct, productId, classification) {
  const customerName = String(workbookProduct.posName ?? "").trim();
  const { unique: uniqueRows } = dedupeWorkbookUnitRows(
    workbookProduct.rows,
    workbookProduct.posCode
  );

  const unitByName = new Map();
  for (const row of uniqueRows) {
    const unitName = proposedCustomerUnitName(row.posUnit) || row.posUnit;
    if (!unitByName.has(unitName)) {
      unitByName.set(unitName, []);
    }
    unitByName.get(unitName).push(row);
  }

  const unitNames = [...unitByName.keys()].sort(
    (a, b) =>
      sortOrderForUnit(a) - sortOrderForUnit(b) || a.localeCompare(b, "id")
  );
  const defaultChoice = chooseDefaultUnit(unitNames);
  const units = [];
  const mappings = [];
  const availableUnitIds = [];

  for (const unitName of unitNames) {
    const unitId = unitIdFromProductAndUnit(productId, unitName);
    const isDefault = unitName === defaultChoice.name;
    availableUnitIds.push(unitId);
    units.push({
      id: unitId,
      productId,
      name: unitName,
      active: true,
      isDefault,
      sortOrder: sortOrderForUnit(unitName),
    });

    for (const row of unitByName.get(unitName)) {
      mappings.push({
        sourceRowIndex: row.sourceRow,
        posCode: workbookProduct.posCode,
        posName: row.posName || workbookProduct.posName,
        posUnit: row.posUnit,
        productId,
        productName: customerName,
        unitId,
        unitName,
      });
    }
  }

  const product = {
    id: productId,
    name: customerName,
    category: classification.proposedCategory,
    favorite: false,
    pattern: "fixed-product",
  };

  const variant = {
    id: productId,
    productId,
    name: customerName,
    availableUnitIds,
    defaultUnitId: defaultChoice.name
      ? unitIdFromProductAndUnit(productId, defaultChoice.name)
      : null,
    defaultQuantity: 1,
  };

  return {
    product,
    variant,
    units,
    mappings,
    defaultChoice,
    unitNames,
  };
}

function holdBucket(classification, eligibility) {
  if (
    eligibility.holdReason === "lainnya" ||
    classification?.proposedCategory === "Lainnya"
  ) {
    return "lainnya";
  }
  if (
    eligibility.holdReason === "medium-confidence" ||
    classification?.confidence === "MEDIUM"
  ) {
    return "medium";
  }
  if (
    eligibility.holdReason === "low-confidence" ||
    classification?.confidence === "LOW"
  ) {
    return "low";
  }
  return "other";
}

function jsonByteLength(value) {
  return Buffer.byteLength(serializeCatalogJson(value), "utf8");
}

function categoryCounts(products) {
  const counts = new Map();
  for (const product of products) {
    const key = product.category || "(none)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category, "id")
    );
}

function missingCategoryConfig(products, categoryConfigIds) {
  const present = new Set(
    products.map((product) => product.category).filter(Boolean)
  );
  return [...present]
    .filter((category) => !categoryConfigIds.has(category))
    .sort((a, b) => a.localeCompare(b, "id"));
}

function loadCategoryConfigIds() {
  return new Set(CURATED_CATEGORY_IDS);
}

/**
 * Build the proposed catalogue and dry-run reports. Pure: does not write disk.
 */
export function buildImportPlan({
  catalog,
  workbookProducts,
  classifications,
  recodeDecisions,
  heldProductDecisions,
  homepageFeaturedIds = HOMEPAGE_FEATURED_PRODUCT_IDS,
  categoryConfigIds = loadCategoryConfigIds(),
} = {}) {
  const before = {
    products: catalog.products.length,
    variants: catalog.variants.length,
    units: catalog.units.length,
    aliases: catalog.aliases.length,
    mappings: catalog.mappings.length,
    recommendations: catalog.recommendations.length,
  };

  const proposed = cloneCatalog(catalog);
  const index = catalogIndex(catalog);
  const workbookByCode = new Map(
    workbookProducts.map((product) => [product.posCode, product])
  );
  const classificationByCode = new Map(
    (classifications ?? []).map((row) => [String(row.posCode), row])
  );
  const recodes = approvedRecodeMap(recodeDecisions ?? { decisions: [] });
  const ownerOverrides = ownerCategoryOverrides(
    heldProductDecisions ?? { decisions: [], categoryCorrections: [] }
  );

  const matchedCurrentIds = new Set();
  const representedPosCodes = new Set();
  const exactPosMatches = [];
  const existingUpdates = [];
  const mappingChanges = [];
  const skippedExistingUnits = [];
  const recodeReview = [];
  const preservedNotInSource = [];
  const newVisibleProducts = [];
  const heldForReview = [];
  const newUnits = [];
  const defaultUnitReview = [];
  const idCollisions = [];
  const ambiguousMatches = [];

  for (const product of catalog.products) {
    const mappings = index.mappingsByProductId.get(product.id) ?? [];
    const mappedCodes = uniqueSorted(
      mappings.map((mapping) => String(mapping.posCode ?? "").trim())
    );
    const matchedWorkbook = mappedCodes
      .map((code) => workbookByCode.get(code))
      .filter(Boolean);
    const uniqueWorkbookCodes = uniqueSorted(
      matchedWorkbook.map((item) => item.posCode)
    );

    if (uniqueWorkbookCodes.length > 1) {
      ambiguousMatches.push({
        status: "AMBIGUOUS",
        currentProductId: product.id,
        currentCustomerName: product.name,
        posCodes: uniqueWorkbookCodes,
        notes: `Current product ${product.id} maps to multiple workbook Kode Item values`,
      });
      matchedCurrentIds.add(product.id);
      for (const code of uniqueWorkbookCodes) {
        representedPosCodes.add(code);
      }
      continue;
    }

    if (uniqueWorkbookCodes.length !== 1) {
      continue;
    }

    const posCode = uniqueWorkbookCodes[0];
    const otherProducts = (index.mappingsByPosCode.get(posCode) ?? [])
      .map((mapping) => mapping.productId)
      .filter((id) => id !== product.id);
    if (otherProducts.length > 0) {
      ambiguousMatches.push({
        status: "AMBIGUOUS",
        currentProductId: product.id,
        currentCustomerName: product.name,
        posCode,
        otherProductIds: uniqueSorted(otherProducts),
        notes: `Workbook code ${posCode} is mapped to multiple catalogue products`,
      });
      matchedCurrentIds.add(product.id);
      representedPosCodes.add(posCode);
      continue;
    }

    const workbookProduct = matchedWorkbook[0];
    const proposedMappings = proposed.mappings.filter(
      (mapping) => mapping.productId === product.id
    );
    const fieldUpdates = [];

    for (const row of workbookProduct.rows) {
      const existing = findMappingForWorkbookRow(
        proposedMappings,
        workbookProduct.posCode,
        row.posUnit
      );
      if (!existing) {
        skippedExistingUnits.push({
          productId: product.id,
          customerName: product.name,
          posCode: workbookProduct.posCode,
          posUnit: row.posUnit,
          sourceRow: row.sourceRow,
          reason: "workbook-unit-not-added-in-5B.2",
        });
        continue;
      }

      const beforePosName = existing.posName;
      const beforePosUnit = existing.posUnit;
      const workbookPosName = row.posName || workbookProduct.posName;
      if (existing.posName !== workbookPosName) {
        existing.posName = workbookPosName;
        fieldUpdates.push({
          field: "posName",
          mappingSourceRowIndex: existing.sourceRowIndex,
          from: beforePosName,
          to: workbookPosName,
        });
      }
      if (existing.posUnit !== row.posUnit) {
        existing.posUnit = row.posUnit;
        fieldUpdates.push({
          field: "posUnit",
          mappingSourceRowIndex: existing.sourceRowIndex,
          from: beforePosUnit,
          to: row.posUnit,
        });
      }
      if (existing.productName !== product.name) {
        const previous = existing.productName;
        existing.productName = product.name;
        fieldUpdates.push({
          field: "productName",
          mappingSourceRowIndex: existing.sourceRowIndex,
          from: previous,
          to: product.name,
          note: "synchronized to customer-facing product name",
        });
      }
    }

    if (fieldUpdates.length > 0) {
      mappingChanges.push({
        productId: product.id,
        posCode: workbookProduct.posCode,
        updates: fieldUpdates,
      });
      existingUpdates.push({
        productId: product.id,
        customerName: product.name,
        posCode: workbookProduct.posCode,
        workbookPosName: workbookProduct.posName,
        updateCount: fieldUpdates.length,
        preserved: {
          productId: true,
          variantId: true,
          customerFacingName: true,
          category: true,
          image: true,
          favorite: true,
          aliases: true,
          recommendations: true,
        },
      });
    }

    exactPosMatches.push({
      status: "EXACT_POS_MATCH",
      productId: product.id,
      customerName: product.name,
      category: product.category || "",
      workbookPosCode: workbookProduct.posCode,
      workbookPosName: workbookProduct.posName,
      customerNameDiffersFromWorkbookPosName:
        normalizeNameKey(product.name) !==
        normalizeNameKey(workbookProduct.posName),
      mappingUpdates: fieldUpdates.length,
      hasImage: Boolean(
        product.image?.card || product.image?.detail || product.image?.original
      ),
    });
    matchedCurrentIds.add(product.id);
    representedPosCodes.add(workbookProduct.posCode);
  }

  const unmatchedCurrent = catalog.products.filter(
    (product) => !matchedCurrentIds.has(product.id)
  );
  const unmatchedWorkbook = workbookProducts.filter(
    (product) => !representedPosCodes.has(product.posCode) && product.posCode
  );

  const claimedWorkbookCodes = new Set();
  const claimedCurrentIds = new Set();

  for (const product of unmatchedCurrent) {
    const hits = unmatchedWorkbook.filter((candidate) =>
      namesStronglyMatch(product.name, candidate.posName)
    );

    if (hits.length > 1) {
      recodeReview.push({
        status: "RECODE_REVIEW",
        currentProductId: product.id,
        currentCustomerName: product.name,
        currentPosCodes: uniqueSorted(
          (index.mappingsByProductId.get(product.id) ?? []).map(
            (mapping) => mapping.posCode
          )
        ),
        candidates: hits.map((hit) => ({
          posCode: hit.posCode,
          posName: hit.posName,
        })),
        reason: "multiple strong workbook name candidates; not merged",
      });
      claimedCurrentIds.add(product.id);
      for (const hit of hits) {
        claimedWorkbookCodes.add(hit.posCode);
      }
      continue;
    }

    if (hits.length === 1) {
      const hit = hits[0];
      const reverse = unmatchedCurrent.filter(
        (other) =>
          other.id !== product.id && namesStronglyMatch(other.name, hit.posName)
      );
      if (reverse.length > 0) {
        recodeReview.push({
          status: "RECODE_REVIEW",
          currentProductId: product.id,
          currentCustomerName: product.name,
          posCode: hit.posCode,
          posName: hit.posName,
          otherProductIds: reverse.map((other) => other.id),
          reason: "workbook name matches multiple current products; not merged",
        });
        claimedCurrentIds.add(product.id);
        claimedWorkbookCodes.add(hit.posCode);
        continue;
      }

      const approvedHit = recodes.byTo.get(hit.posCode);
      const approvedForThis =
        approvedHit && approvedHit.productId === product.id;

      let applied = false;
      let applyReason = approvedForThis
        ? "owner-approved recode mapping"
        : "normalized names match; no POS code match; not silently merged";
      let recodeUpdates = [];

      if (approvedForThis) {
        const currentCodes = uniqueSorted(
          (index.mappingsByProductId.get(product.id) ?? []).map(
            (mapping) => mapping.posCode
          )
        );
        if (!currentCodes.includes(approvedHit.fromPosCode)) {
          applyReason = `approved recode fromPosCode ${approvedHit.fromPosCode} is not on the current product`;
        } else {
          const recodeResult = applyApprovedRecodeMappings({
            proposed,
            product,
            fromPosCode: approvedHit.fromPosCode,
            toPosCode: approvedHit.toPosCode,
            toPosName: approvedHit.toPosName || hit.posName,
            workbookProduct: hit,
          });
          applied = recodeResult.applied;
          recodeUpdates = recodeResult.updates;
          if (!recodeResult.applied) {
            applyReason = recodeResult.reason;
          } else {
            applyReason = "owner-approved recode mapping applied in proposed catalogue";
            if (recodeResult.updates.length > 0) {
              mappingChanges.push({
                productId: product.id,
                posCode: hit.posCode,
                recode: true,
                fromPosCode: approvedHit.fromPosCode,
                toPosCode: approvedHit.toPosCode,
                updates: recodeResult.updates,
              });
              existingUpdates.push({
                productId: product.id,
                customerName: product.name,
                posCode: hit.posCode,
                workbookPosName: hit.posName,
                recode: true,
                fromPosCode: approvedHit.fromPosCode,
                toPosCode: approvedHit.toPosCode,
                updateCount: recodeResult.updates.length,
                preserved: {
                  productId: true,
                  variantId: true,
                  customerFacingName: true,
                  category: true,
                  image: true,
                  favorite: true,
                  aliases: true,
                  recommendations: true,
                  units: true,
                },
              });
            }
            const recodedMappings = proposed.mappings.filter(
              (mapping) => mapping.productId === product.id
            );
            for (const row of hit.rows ?? []) {
              const existing = findMappingForWorkbookRow(
                recodedMappings,
                hit.posCode,
                row.posUnit
              );
              if (!existing) {
                skippedExistingUnits.push({
                  productId: product.id,
                  customerName: product.name,
                  posCode: hit.posCode,
                  posUnit: row.posUnit,
                  sourceRow: row.sourceRow,
                  reason: "workbook-unit-not-added-in-5B.2",
                });
              }
            }
          }
        }
      }

      recodeReview.push({
        status: approvedForThis && applied ? "RECODE_APPROVED" : "RECODE_REVIEW",
        currentProductId: product.id,
        currentCustomerName: product.name,
        category: product.category || "",
        fromPosCodes: uniqueSorted(
          (index.mappingsByProductId.get(product.id) ?? []).map(
            (mapping) => mapping.posCode
          )
        ),
        toPosCode: hit.posCode,
        posName: hit.posName,
        reason: applyReason,
        applied,
        mappingUpdates: recodeUpdates,
        preserved: {
          productId: true,
          variantId: true,
          customerFacingName: true,
          category: true,
          image: true,
          aliases: true,
          recommendations: true,
          units: true,
        },
      });
      claimedCurrentIds.add(product.id);
      claimedWorkbookCodes.add(hit.posCode);
    }
  }

  for (const product of unmatchedCurrent.filter(
    (item) => !claimedCurrentIds.has(item.id)
  )) {
    const mappings = index.mappingsByProductId.get(product.id) ?? [];
    preservedNotInSource.push({
      status: "PRESERVED_NOT_IN_SOURCE",
      productId: product.id,
      customerName: product.name,
      category: product.category || "",
      posCodes: uniqueSorted(mappings.map((mapping) => mapping.posCode)),
      posNames: uniqueSorted(mappings.map((mapping) => mapping.posName)),
      hasImage: Boolean(
        product.image?.card || product.image?.detail || product.image?.original
      ),
      favorite: Boolean(product.favorite),
      homepageFeatured: homepageFeaturedIds.includes(product.id),
    });
  }

  const newWorkbookProducts = unmatchedWorkbook
    .filter((product) => !claimedWorkbookCodes.has(product.posCode))
    .sort((a, b) => a.posCode.localeCompare(b.posCode, "en"));

  const usedIds = new Set(catalog.products.map((product) => product.id));
  for (const variant of catalog.variants) {
    usedIds.add(variant.id);
  }

  const newProductsToInsert = [];
  const newVariantsToInsert = [];
  const newUnitsToInsert = [];
  const newMappingsToInsert = [];

  for (const workbookProduct of newWorkbookProducts) {
    const classification = applyOwnerClassification(
      classificationByCode.get(workbookProduct.posCode),
      workbookProduct.posCode,
      ownerOverrides
    );
    const eligibility = isEligibleForVisibleImport(classification);
    const idPlan = proposeProductId(
      workbookProduct.posName,
      workbookProduct.posCode,
      usedIds
    );
    if (idPlan.issues.includes("slug-collision")) {
      idCollisions.push({
        posCode: workbookProduct.posCode,
        posName: workbookProduct.posName,
        proposedProductId: idPlan.proposedProductId,
        issues: idPlan.issues,
      });
    }

    const built = buildNewProductRecords(
      workbookProduct,
      idPlan.proposedProductId,
      classification ?? { proposedCategory: "" }
    );

    const reviewRow = {
      posCode: workbookProduct.posCode,
      posName: workbookProduct.posName,
      proposedProductId: idPlan.proposedProductId,
      proposedVariantId: idPlan.proposedProductId,
      proposedCategory: classification?.proposedCategory ?? null,
      proposedSubcategory: classification?.proposedSubcategory ?? null,
      confidence: classification?.confidence ?? null,
      reviewNeeded: classification?.reviewNeeded ?? true,
      holdReason: eligibility.holdReason,
      defaultUnitName: built.defaultChoice.name,
      defaultUnitReason: built.defaultChoice.reason,
      unitCount: built.units.length,
      mappingCount: built.mappings.length,
      idIssues: idPlan.issues,
    };

    if (!eligibility.eligible) {
      heldForReview.push({
        ...reviewRow,
        bucket: holdBucket(classification, eligibility),
        classificationReason: classification?.classificationReason ?? null,
        qtyPerPaket: uniqueSorted(
          workbookProduct.rows.map(
            (row) => row.qtyRaw ?? String(row.qtyPerPackage ?? "")
          )
        ),
      });
      continue;
    }

    newProductsToInsert.push(built.product);
    newVariantsToInsert.push(built.variant);
    newUnitsToInsert.push(...built.units);
    newMappingsToInsert.push(...built.mappings);

    for (const unit of built.units) {
      const sourceRows = workbookProduct.rows.filter((row) =>
        unitsEquivalent(
          proposedCustomerUnitName(row.posUnit) || row.posUnit,
          unit.name
        )
      );
      newUnits.push({
        productId: built.product.id,
        posCode: workbookProduct.posCode,
        posName: workbookProduct.posName,
        unitId: unit.id,
        unitName: unit.name,
        isDefault: unit.isDefault,
        sortOrder: unit.sortOrder,
        sourceRows: sourceRows.map((row) => row.sourceRow),
        posUnits: uniqueSorted(sourceRows.map((row) => row.posUnit)),
        qtyPerPackage: sourceRows.map((row) => ({
          sourceRow: row.sourceRow,
          qtyPerPackage: row.qtyPerPackage,
          qtyRaw: row.qtyRaw,
          baseUnit: row.baseUnit,
        })),
      });
    }

    const questionable =
      built.defaultChoice.questionable || built.defaultChoice.flags.length > 0;
    if (questionable) {
      defaultUnitReview.push({
        productId: built.product.id,
        posCode: workbookProduct.posCode,
        posName: workbookProduct.posName,
        chosenDefault: built.defaultChoice.name,
        reason: built.defaultChoice.reason,
        flags: built.defaultChoice.flags,
        unitNames: built.unitNames,
      });
    }

    newVisibleProducts.push({
      ...reviewRow,
      category: built.product.category,
      image: null,
      aliases: [],
      recommendations: [],
      units: built.units.map((unit) => unit.name),
      defaultUnitName: built.defaultChoice.name,
      defaultUnitReason: built.defaultChoice.reason,
    });
  }

  proposed.products = [...proposed.products, ...newProductsToInsert];
  proposed.variants = [...proposed.variants, ...newVariantsToInsert];
  proposed.units = [
    ...proposed.units,
    ...[...newUnitsToInsert].sort(
      (a, b) =>
        a.productId.localeCompare(b.productId, "en") ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id, "en")
    ),
  ];
  proposed.mappings = [
    ...proposed.mappings,
    ...[...newMappingsToInsert].sort(
      (a, b) =>
        String(a.posCode).localeCompare(String(b.posCode), "en") ||
        a.sourceRowIndex - b.sourceRowIndex ||
        String(a.posUnit).localeCompare(String(b.posUnit), "en")
    ),
  ];

  const validProductIds = new Set(proposed.products.map((product) => product.id));
  const droppedRecommendations = [];
  proposed.recommendations = catalog.recommendations.filter((edge) => {
    const ok =
      validProductIds.has(edge.sourceProductId) &&
      validProductIds.has(edge.targetProductId);
    if (!ok) {
      droppedRecommendations.push(edge);
    }
    return ok;
  });

  const after = {
    products: proposed.products.length,
    variants: proposed.variants.length,
    units: proposed.units.length,
    aliases: proposed.aliases.length,
    mappings: proposed.mappings.length,
    recommendations: proposed.recommendations.length,
  };

  const recodeApplied = recodeReview.filter((row) => row.applied === true);
  const heldMedium = heldForReview.filter(
    (row) => row.confidence === "MEDIUM"
  );
  const heldLow = heldForReview.filter((row) => row.confidence === "LOW");
  const heldLainnya = heldForReview.filter(
    (row) => row.proposedCategory === "Lainnya" || row.bucket === "lainnya"
  );
  const missingConfig = missingCategoryConfig(
    proposed.products,
    categoryConfigIds
  );

  const proposedBytes = {
    products: jsonByteLength(proposed.products),
    variants: jsonByteLength(proposed.variants),
    units: jsonByteLength(proposed.units),
    aliases: jsonByteLength(proposed.aliases),
    mappings: jsonByteLength(proposed.mappings),
    recommendations: jsonByteLength(proposed.recommendations),
  };
  proposedBytes.total = Object.values(proposedBytes).reduce(
    (sum, n) => sum + n,
    0
  );

  const currentBytes = {
    products: jsonByteLength(catalog.products),
    variants: jsonByteLength(catalog.variants),
    units: jsonByteLength(catalog.units),
    aliases: jsonByteLength(catalog.aliases),
    mappings: jsonByteLength(catalog.mappings),
    recommendations: jsonByteLength(catalog.recommendations),
  };
  currentBytes.total = Object.values(currentBytes).reduce(
    (sum, n) => sum + n,
    0
  );

  const summary = {
    strategy: {
      visibility:
        "Omit unresolved NEW products from live products/variants/units/mappings. Do not invent Uncategorized / Lainnya / Pending as customer categories. Existing rows are never deleted.",
      units:
        "New products use product-scoped unit IDs `{productId}__{unitSlug}` (cigarette Pattern A). Existing shared grocery units are left on current grocery products. Qty/Paket is staging metadata only — no conversion factors.",
      defaultUnit:
        "Preference Slof → Karton → Dus → Pack → Pak → Lusin → Bal → Box → Gross → Sak → Karung → Galon → Rim → Lembar → Baki → Toples → Ikat → Gantung → 5 Kg → Kg → Gram → Balok → Bungkus → Botol → Pcs. Half-units are never preferred over a full unit. Workbook row order is not used.",
      recodes:
        "Name-only POS recodes stay in RECODE_REVIEW unless imports/catalog-recode-decisions.json has an approved decision. Unapproved recodes are not silently merged and their workbook SKUs are not imported as new products. Approved recodes update mapping posCode/posName in the proposed catalogue, preserve product/variant IDs and customer-facing fields, drop the stale old POS code, and still require --apply --confirm to write live src/catalog.",
    },
    source: {
      workbook: WORKBOOK_RELATIVE,
      classification: CLASSIFICATION_RELATIVE,
      recodeDecisions: RECODE_DECISIONS_RELATIVE,
      heldProductDecisions: HELD_PRODUCT_DECISIONS_RELATIVE,
    },
    before,
    after,
    exactPosMatches: exactPosMatches.length,
    existingMappingUpdateProducts: existingUpdates.length,
    mappingChangeRows: mappingChanges.reduce(
      (sum, row) => sum + row.updates.length,
      0
    ),
    newVisibleProducts: newVisibleProducts.length,
    heldForReview: heldForReview.length,
    heldMedium: heldMedium.length,
    heldLow: heldLow.length,
    heldLainnya: heldLainnya.length,
    recodeReview: recodeReview.length,
    recodeApplied: recodeApplied.length,
    preservedNotInSource: preservedNotInSource.length,
    ambiguousMatches: ambiguousMatches.length,
    skippedExistingUnits: skippedExistingUnits.length,
    idCollisions: idCollisions.length,
    defaultUnitReview: defaultUnitReview.length,
    droppedRecommendations: droppedRecommendations.length,
    proposedVisibleCatalogueSize: after.products,
    newVisibleAdded: newVisibleProducts.length,
    categoryCounts: categoryCounts(proposed.products),
    missingCategoryConfig: missingConfig,
    performance: {
      currentJsonBytes: currentBytes,
      proposedJsonBytes: proposedBytes,
      proposedVisibleProducts: after.products,
      note:
        after.products >= 1500
          ? "Performance work is required BEFORE customer activation: unbounded category/search lists and bundled JSON size. Do not activate ~2,200 products without list virtualization / result caps."
          : "Proposed visible set is still small; no activation-blocking performance work yet.",
    },
  };

  return {
    proposed,
    summary,
    exactPosMatches,
    existingUpdates,
    newVisibleProducts,
    heldForReview,
    recodeReview,
    preservedNotInSource,
    newUnits,
    mappingChanges,
    skippedExistingUnits,
    defaultUnitReview,
    idCollisions,
    ambiguousMatches,
    droppedRecommendations,
    homepageFeaturedStillValid: homepageFeaturedIds.every((id) =>
      validProductIds.has(id)
    ),
  };
}

export function validateProposedCatalog(proposed, options = {}) {
  return validateCatalog(proposed, {
    publicDir: options.publicDir ?? DEFAULT_PUBLIC_DIR,
    fileExists: options.fileExists,
  });
}

function renderImportDiff(plan, hashes, validation) {
  const s = plan.summary;
  const lines = [];
  const add = (text = "") => lines.push(text);

  add("# Stage 5B.2 — Full Catalogue Import Dry Run");
  add();
  add("Dry-run only. Live `src/catalog` was **not** written.");
  add("Apply requires `npm run catalog:import-full:apply -- --confirm`.");
  add();
  add(`Workbook: \`${s.source.workbook}\``);
  add(`Classification: \`${s.source.classification}\``);
  add();
  add("## Visibility strategy");
  add();
  add(s.strategy.visibility);
  add();
  add(s.strategy.units);
  add();
  add(s.strategy.defaultUnit);
  add();
  add(s.strategy.recodes);
  add();
  add("## Counts");
  add();
  add("| File | Before | After proposed apply |");
  add("| --- | ---: | ---: |");
  add(`| products | ${s.before.products} | ${s.after.products} |`);
  add(`| variants | ${s.before.variants} | ${s.after.variants} |`);
  add(`| units | ${s.before.units} | ${s.after.units} |`);
  add(`| aliases | ${s.before.aliases} | ${s.after.aliases} |`);
  add(`| mappings | ${s.before.mappings} | ${s.after.mappings} |`);
  add(
    `| recommendations | ${s.before.recommendations} | ${s.after.recommendations} |`
  );
  add();
  add(`- Existing exact POS matches: **${s.exactPosMatches}**`);
  add(
    `- Existing mapping-update products: **${s.existingMappingUpdateProducts}**`
  );
  add(`- Mapping field updates: **${s.mappingChangeRows}**`);
  add(`- New visible HIGH products: **${s.newVisibleProducts}**`);
  add(`- Held MEDIUM: **${s.heldMedium}**`);
  add(`- Held LOW: **${s.heldLow}**`);
  add(`- Held Lainnya: **${s.heldLainnya}**`);
  add(`- Held for review (unique): **${s.heldForReview}**`);
  add(`- Recode review: **${s.recodeReview}**`);
  add(`- Recode applied in proposed catalogue: **${s.recodeApplied}**`);
  add(`- Preserved not in source: **${s.preservedNotInSource}**`);
  add(`- ID collisions: **${s.idCollisions}**`);
  add(`- Default-unit review flags: **${s.defaultUnitReview}**`);
  add(
    `- Proposed final visible catalogue: **${s.proposedVisibleCatalogueSize}**`
  );
  add();
  add("## Category counts (proposed live products)");
  add();
  add("| Category | Count |");
  add("| --- | ---: |");
  for (const row of s.categoryCounts) {
    add(`| ${row.category} | ${row.count} |`);
  }
  add();
  add("## Category config");
  add();
  add("`src/config/categories.js` was not modified.");
  if (s.missingCategoryConfig.length === 0) {
    add("All proposed live categories already have config entries.");
  } else {
    add(
      "New categories need config entries / icons / searchTerms before UI activation:"
    );
    add();
    for (const category of s.missingCategoryConfig) {
      add(`- ${category}`);
    }
  }
  add();
  add("## Recode review");
  add();
  if (plan.recodeReview.length === 0) {
    add("None.");
  } else {
    for (const row of plan.recodeReview) {
      add(
        `- \`${row.currentProductId}\` **${row.currentCustomerName}** ${row.fromPosCodes ? row.fromPosCodes.join(", ") : ""} → \`${row.toPosCode || ""}\` ${row.posName || ""} — ${row.status}${row.applied ? " (applied in proposed catalogue)" : ""} — ${row.reason || row.notes}`
      );
    }
  }
  add();
  add("## Preserved not in source");
  add();
  for (const row of plan.preservedNotInSource) {
    add(
      `- \`${row.productId}\` **${row.customerName}** (${row.category}) POS ${row.posCodes.join(", ") || "—"}`
    );
  }
  add();
  add("## ID collisions");
  add();
  if (plan.idCollisions.length === 0) {
    add("None.");
  } else {
    for (const row of plan.idCollisions) {
      add(
        `- \`${row.posCode}\` **${row.posName}** → \`${row.proposedProductId}\` (${row.issues.join(", ")})`
      );
    }
  }
  add();
  add("## Performance");
  add();
  add(
    `- Current catalogue JSON bytes: **${s.performance.currentJsonBytes.total.toLocaleString("en")}**`
  );
  add(
    `- Proposed catalogue JSON bytes: **${s.performance.proposedJsonBytes.total.toLocaleString("en")}**`
  );
  add(
    `- products.json: ${s.performance.proposedJsonBytes.products.toLocaleString("en")}`
  );
  add(
    `- variants.json: ${s.performance.proposedJsonBytes.variants.toLocaleString("en")}`
  );
  add(
    `- units.json: ${s.performance.proposedJsonBytes.units.toLocaleString("en")}`
  );
  add(
    `- mappings.json: ${s.performance.proposedJsonBytes.mappings.toLocaleString("en")}`
  );
  add(`- ${s.performance.note}`);
  add();
  add("## Validation");
  add();
  add(
    validation.ok
      ? "Proposed catalogue validation: **OK** (same `validateCatalog` as `npm run catalog:check`)."
      : `Proposed catalogue validation: **FAILED** (${validation.errors.length} errors). Dry-run must fail.`
  );
  add();
  add("## Live catalogue hashes");
  add();
  add("| File | Before | After | Same |");
  add("| --- | --- | --- | --- |");
  for (const fileName of CATALOG_FILES) {
    const same = hashes.before[fileName] === hashes.after[fileName];
    add(
      `| ${fileName} | \`${hashes.before[fileName]}\` | \`${hashes.after[fileName]}\` | ${same ? "yes" : "CHANGED"} |`
    );
  }
  add();
  add(
    hashes.unchanged
      ? "Live `src/catalog` JSON is unchanged."
      : "WARNING: live catalogue JSON changed during dry-run."
  );
  add();
  add(
    `- categories.js: ${hashes.categoriesJsUnchanged ? "unchanged" : "CHANGED"}`
  );
  add(
    `- product-images: ${hashes.imagesUnchanged ? "unchanged" : "CHANGED"}`
  );
  add();
  return `${lines.join("\n")}\n`;
}

export function writeDryRunArtifacts(plan, outputDir, extra = {}) {
  mkdirSync(outputDir, { recursive: true });

  const validationErrors = extra.validationErrors ?? [];
  const validation = {
    ok: validationErrors.length === 0,
    errorCount: validationErrors.length,
    errors: validationErrors,
  };

  writeJson(join(outputDir, "import-summary.json"), plan.summary);
  writeJson(join(outputDir, "existing-updates.json"), plan.existingUpdates);
  writeJson(join(outputDir, "new-visible-products.json"), plan.newVisibleProducts);
  writeJson(join(outputDir, "held-for-review.json"), plan.heldForReview);
  writeJson(join(outputDir, "recode-review.json"), {
    count: plan.recodeReview.length,
    items: plan.recodeReview,
  });
  writeJson(
    join(outputDir, "preserved-not-in-source.json"),
    plan.preservedNotInSource
  );
  writeJson(join(outputDir, "new-units.json"), plan.newUnits);
  writeJson(join(outputDir, "mapping-changes.json"), {
    existingFieldUpdates: plan.mappingChanges,
    skippedExistingUnits: plan.skippedExistingUnits,
    newMappingCount: plan.summary.after.mappings - plan.summary.before.mappings,
  });
  writeJson(join(outputDir, "default-unit-review.json"), plan.defaultUnitReview);
  writeJson(join(outputDir, "validation-report.json"), validation);
  writeJson(join(outputDir, "proposed-products.json"), plan.proposed.products);
  writeJson(join(outputDir, "proposed-variants.json"), plan.proposed.variants);
  writeJson(join(outputDir, "proposed-units.json"), plan.proposed.units);
  writeJson(join(outputDir, "proposed-aliases.json"), plan.proposed.aliases);
  writeJson(
    join(outputDir, "proposed-recommendations.json"),
    plan.proposed.recommendations
  );
  writeJson(join(outputDir, "proposed-mappings.json"), plan.proposed.mappings);

  const hashes = extra.hashes ?? {
    before: {},
    after: {},
    unchanged: true,
    categoriesJsUnchanged: true,
    imagesUnchanged: true,
  };

  writeFileSync(
    join(outputDir, "IMPORT_DIFF.md"),
    renderImportDiff(plan, hashes, validation),
    "utf8"
  );

  return DRY_RUN_ARTIFACT_FILES.map((name) => join(outputDir, name));
}

export function applyFullCatalogImport(plan, options = {}) {
  const parsed = parseCliArgs(options.argv ?? ["--apply", "--confirm"]);
  if (parsed.mode !== "apply") {
    return {
      ok: false,
      code: "APPLY_REFUSED",
      error: parsed.error || APPLY_REFUSED_MESSAGE,
    };
  }

  const validationErrors = validateProposedCatalog(plan.proposed, {
    publicDir: options.publicDir,
    fileExists: options.fileExists,
  });
  if (validationErrors.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      error: "Proposed catalogue validation failed.",
      validationErrors,
    };
  }

  const summary = [
    `source ${options.workbookPath || WORKBOOK_RELATIVE}`,
    `new products ${plan.summary.newVisibleProducts}`,
    `updated mappings ${plan.summary.mappingChangeRows}`,
    `held review ${plan.summary.heldForReview}`,
  ].join("; ");

  const transaction = runCatalogTransaction({
    action: "full-catalog-import",
    productIds: plan.newVisibleProducts.map((row) => row.proposedProductId),
    summary,
    catalogDir: options.catalogDir,
    backupsDir: options.backupsDir,
    validateOptions: {
      publicDir: options.publicDir ?? DEFAULT_PUBLIC_DIR,
      fileExists: options.fileExists,
    },
    mutate(catalog) {
      catalog.products = plan.proposed.products;
      catalog.variants = plan.proposed.variants;
      catalog.units = plan.proposed.units;
      catalog.aliases = plan.proposed.aliases;
      catalog.mappings = plan.proposed.mappings;
      catalog.recommendations = plan.proposed.recommendations;
    },
  });

  if (
    transaction.ok &&
    !transaction.noop &&
    options.rebuildCustomerCatalog !== false &&
    isLiveCatalogDir(options.catalogDir)
  ) {
    const customerCatalog = buildCustomerCatalog({
      catalogDir: options.catalogDir ?? CATALOG_DIR,
      outputPath: options.customerCatalogPath,
      validateOptions: {
        publicDir: options.publicDir ?? DEFAULT_PUBLIC_DIR,
        fileExists: options.fileExists,
      },
    });
    return { ...transaction, customerCatalog };
  }

  return transaction;
}

function loadClassifications(filePath = CLASSIFICATION_PATH) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing classification artifact: ${filePath}`);
  }
  const rows = readJson(filePath);
  if (!Array.isArray(rows)) {
    throw new Error("product-classification.json must be an array.");
  }
  return rows;
}

export function runDryImport(options = {}) {
  const workbookPath = options.workbookPath ?? WORKBOOK_PATH;
  const classificationPath = options.classificationPath ?? CLASSIFICATION_PATH;
  const catalogDir = options.catalogDir ?? CATALOG_DIR;
  const outputDir = options.outputDir ?? DRY_RUN_DIR;
  const extractDir = options.extractDir ?? XLSX_EXTRACT_DIR;

  if (!existsSync(workbookPath)) {
    throw new Error(`Missing workbook: ${workbookPath}`);
  }

  const hashesBefore = hashCatalogFiles(catalogDir);
  const categoriesJsBefore = existsSync(CATEGORIES_JS)
    ? hashFile(CATEGORIES_JS)
    : null;
  const imagesBefore = hashTree(IMAGE_DIR);

  const catalog = loadCatalog({ catalogDir });
  const workbook = loadWorkbook(workbookPath, extractDir);
  const workbookProducts = groupWorkbookProducts(workbook.dataRows);
  const classifications = loadClassifications(classificationPath);
  const recodeDecisions = loadRecodeDecisions(options.recodePath);
  const heldProductDecisions = loadHeldProductDecisions(
    options.heldProductPath
  );

  const plan = buildImportPlan({
    catalog,
    workbookProducts,
    classifications,
    recodeDecisions,
    heldProductDecisions,
    homepageFeaturedIds:
      options.homepageFeaturedIds ?? HOMEPAGE_FEATURED_PRODUCT_IDS,
    categoryConfigIds: options.categoryConfigIds ?? loadCategoryConfigIds(),
  });

  const validationErrors = validateProposedCatalog(plan.proposed, {
    publicDir: options.publicDir ?? DEFAULT_PUBLIC_DIR,
    fileExists: options.fileExists,
  });

  if (existsSync(extractDir)) {
    rmSync(extractDir, { recursive: true, force: true });
  }

  const hashesAfter = hashCatalogFiles(catalogDir);
  const categoriesJsAfter = existsSync(CATEGORIES_JS)
    ? hashFile(CATEGORIES_JS)
    : null;
  const imagesAfter = hashTree(IMAGE_DIR);
  const hashes = {
    before: hashesBefore,
    after: hashesAfter,
    unchanged: CATALOG_FILES.every(
      (fileName) => hashesBefore[fileName] === hashesAfter[fileName]
    ),
    categoriesJsUnchanged: categoriesJsBefore === categoriesJsAfter,
    imagesUnchanged: JSON.stringify(imagesBefore) === JSON.stringify(imagesAfter),
  };

  writeDryRunArtifacts(plan, outputDir, { validationErrors, hashes });

  return {
    ok: validationErrors.length === 0 && hashes.unchanged,
    plan,
    validationErrors,
    hashes,
    outputDir,
  };
}

function printDrySummary(result) {
  const s = result.plan.summary;
  console.log("Stage 5B.2 full catalogue import — DRY RUN");
  console.log(`Workbook        : ${s.source.workbook}`);
  console.log(`Classification  : ${s.source.classification}`);
  console.log(`Exact matches   : ${s.exactPosMatches}`);
  console.log(
    `Mapping updates : ${s.existingMappingUpdateProducts} products / ${s.mappingChangeRows} fields`
  );
  console.log(`New visible     : ${s.newVisibleProducts}`);
  console.log(`Held MEDIUM     : ${s.heldMedium}`);
  console.log(`Held LOW        : ${s.heldLow}`);
  console.log(`Held Lainnya    : ${s.heldLainnya}`);
  console.log(`Held unique     : ${s.heldForReview}`);
  console.log(`Recode review   : ${s.recodeReview}`);
  console.log(`Recode applied  : ${s.recodeApplied}`);
  console.log(`Not in source   : ${s.preservedNotInSource}`);
  console.log(`Visible after   : ${s.proposedVisibleCatalogueSize}`);
  console.log(
    `Validation      : ${result.validationErrors.length === 0 ? "OK" : "FAILED"}`
  );
  console.log(
    `Live JSON       : ${result.hashes.unchanged ? "UNCHANGED" : "CHANGED"}`
  );
  console.log(`Output          : ${DRY_RUN_RELATIVE}/`);
}

function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv);

  if (parsed.mode === "error") {
    console.error(parsed.error);
    process.exitCode = 1;
    return parsed;
  }

  if (parsed.mode === "refused") {
    console.error(parsed.error);
    process.exitCode = 1;
    return parsed;
  }

  if (parsed.mode === "apply") {
    const dry = runDryImport();
    printDrySummary(dry);

    if (!dry.ok) {
      console.error(
        "Apply aborted: dry-run validation or live-hash check failed."
      );
      if (dry.validationErrors.length > 0) {
        console.error("Proposed catalogue validation failed:");
        for (const error of dry.validationErrors.slice(0, 40)) {
          console.error(`  - ${error}`);
        }
      }
      if (!dry.hashes.unchanged) {
        console.error("Live src/catalog hashes changed during dry-run.");
      }
      process.exitCode = 1;
      return dry;
    }

    const applied = applyFullCatalogImport(dry.plan, {
      argv,
      rebuildCustomerCatalog: false,
    });

    if (!applied.ok) {
      console.error(applied.error || "Apply failed.");
      if (applied.code) {
        console.error(`Code: ${applied.code}`);
      }
      for (const error of (applied.validationErrors ?? []).slice(0, 40)) {
        console.error(`  - ${error}`);
      }
      process.exitCode = 1;
      return applied;
    }

    console.log("");
    console.log("Stage 5B.3 full catalogue import — APPLY");
    console.log(`Transaction     : OK`);
    console.log(`Action          : ${applied.action || "full-catalog-import"}`);
    console.log(`No-op           : ${applied.noop ? "yes" : "no"}`);
    console.log(`Backup          : ${applied.backupId || "none"}`);
    console.log(
      `Changed files   : ${(applied.changedFiles || []).join(", ") || "none"}`
    );
    console.log(
      "Customer catalogue was not rebuilt by the transaction. Run catalog:customer-build next."
    );
    return { dry, applied };
  }

  const result = runDryImport();
  printDrySummary(result);

  if (!result.ok) {
    if (result.validationErrors.length > 0) {
      console.error("Proposed catalogue validation failed:");
      for (const error of result.validationErrors.slice(0, 40)) {
        console.error(`  - ${error}`);
      }
    }
    if (!result.hashes.unchanged) {
      console.error("Live src/catalog hashes changed during dry-run.");
    }
    process.exitCode = 1;
  }

  return result;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}

export { CLASSIFICATION_PATH, CATALOG_DIR, DRY_RUN_DIR, WORKBOOK_PATH, main };
