/**
 * Guarded merge/recode for catalogue products.
 *
 * Keeps the survivor product identity (id, name, category, image, aliases,
 * recommendations) and adopts the duplicate's POS identity (code, POS name,
 * mapping rows). Removes the duplicate product/variant/units/mappings.
 *
 * Mutates an in-memory catalogue. Live writes go through runCatalogTransaction.
 * Dry-run is the default CLI. Apply requires --apply --confirm.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCatalog } from "./buildCatalog.js";
import { assembleProducts } from "../src/catalog/assembleProducts.js";
import { searchProducts, normalizeSearchText } from "../src/utils/productSearch.js";
import {
  loadCatalog,
  runCatalogTransaction,
  DEFAULT_CATALOG_DIR,
} from "./catalogTransaction.js";
import { buildCustomerCatalog } from "./buildCustomerCatalog.js";
import { unitsEquivalent } from "./catalogWorkbook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const MERGE_RECODE_DECISIONS_RELATIVE =
  "imports/catalog-merge-recode-decisions.json";
export const DRY_RUN_RELATIVE = "tmp/catalog-merge-recode";

const DECISIONS_PATH = join(ROOT, MERGE_RECODE_DECISIONS_RELATIVE);
const DRY_RUN_DIR = join(ROOT, DRY_RUN_RELATIVE);
const DEFAULT_PUBLIC_DIR = join(ROOT, "public");

export const APPLY_REFUSED_MESSAGE =
  "Apply refused: live catalogue write requires both --apply and --confirm.";

export const DO_NOT_TOUCH_PRODUCT_IDS = Object.freeze([
  "prod-rose-brand-tepung-tapioka-500g",
  "prod-rose-brand-tepung-tapioka-500g-tpgtapio",
  "prod-aqua-15l",
  "prod-aqua-botol-1500ml",
  "prod-energen-vanilla",
  "prod-energen-vanilla-32g",
  "prod-masako-ayam",
  "prod-masako-sapi",
  "prod-indomie-goreng",
  "prod-dss-magnum-mild-16",
  "prod-dss-magnum-mild-20",
  "prod-teh-botol-sosro",
  "prod-sergio-kretek-20",
]);

function fail(error, extra = {}) {
  return { ok: false, error, alreadyApplied: false, ...extra };
}

function cloneCatalog(catalog) {
  return structuredClone(catalog);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))].sort(
    (a, b) => String(a).localeCompare(String(b), "id")
  );
}

export function loadMergeRecodeDecisions(filePath = DECISIONS_PATH) {
  if (!existsSync(filePath)) {
    return { version: 1, decisions: [] };
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function approvedMergeRecodeDecisions(file = loadMergeRecodeDecisions()) {
  return (file.decisions ?? []).filter(
    (decision) =>
      decision &&
      decision.approved === true &&
      String(decision.survivorProductId ?? "").trim() &&
      String(decision.duplicateProductId ?? "").trim() &&
      String(decision.newPosCode ?? "").trim()
  );
}

function productById(catalog, productId) {
  return catalog.products.find((product) => product.id === productId) ?? null;
}

function variantByProductId(catalog, productId) {
  return (
    catalog.variants.find((variant) => variant.productId === productId) ?? null
  );
}

function unitsForProduct(catalog, productId) {
  return catalog.units.filter((unit) => unit.productId === productId);
}

function mappingsForProduct(catalog, productId) {
  return catalog.mappings.filter((mapping) => mapping.productId === productId);
}

function posCodesForProduct(catalog, productId) {
  return uniqueSorted(
    mappingsForProduct(catalog, productId).map((mapping) => mapping.posCode)
  );
}

function productsUsingPosCode(catalog, posCode, exceptIds = []) {
  const except = new Set(exceptIds);
  const ids = new Set();
  for (const mapping of catalog.mappings) {
    if (mapping.posCode === posCode && !except.has(mapping.productId)) {
      ids.add(mapping.productId);
    }
  }
  return [...ids];
}

function matchSurvivorUnit(survivorUnits, duplicateUnit) {
  const matches = survivorUnits.filter((unit) =>
    unitsEquivalent(unit.name, duplicateUnit.name)
  );
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

function unitSetsCompatible(survivorUnits, duplicateUnits) {
  if (survivorUnits.length === 0 || duplicateUnits.length === 0) {
    return {
      ok: false,
      reason: "one side has no product-scoped units",
      matched: [],
    };
  }

  const matched = [];
  const usedSurvivor = new Set();

  for (const duplicateUnit of duplicateUnits) {
    const candidates = survivorUnits.filter(
      (unit) =>
        !usedSurvivor.has(unit.id) &&
        unitsEquivalent(unit.name, duplicateUnit.name)
    );
    if (candidates.length !== 1) {
      return {
        ok: false,
        reason: `duplicate unit "${duplicateUnit.name}" (${duplicateUnit.id}) does not have exactly one survivor match`,
        matched,
      };
    }
    usedSurvivor.add(candidates[0].id);
    matched.push({
      survivorUnit: candidates[0],
      duplicateUnit,
    });
  }

  return { ok: true, reason: null, matched };
}

function nextAliasId(aliases, productId) {
  const slug = String(productId).replace(/^prod-/, "");
  const prefix = `alias-${slug}-`;
  let max = 0;
  for (const record of aliases) {
    const id = String(record?.id ?? "");
    if (!id.startsWith(prefix)) {
      continue;
    }
    const suffix = Number(id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > max) {
      max = suffix;
    }
  }
  return `${prefix}${max + 1}`;
}

function aliasExists(aliases, productId, aliasText) {
  const normalized = normalizeSearchText(aliasText);
  return aliases.some(
    (record) =>
      record.productId === productId &&
      normalizeSearchText(record.alias) === normalized
  );
}

function inspectPair(catalog, decision) {
  const survivorId = String(decision.survivorProductId).trim();
  const duplicateId = String(decision.duplicateProductId).trim();
  const newPosCode = String(decision.newPosCode).trim();

  const survivor = productById(catalog, survivorId);
  const duplicate = productById(catalog, duplicateId);
  const survivorVariant = variantByProductId(catalog, survivorId);
  const duplicateVariant = variantByProductId(catalog, duplicateId);
  const survivorUnits = unitsForProduct(catalog, survivorId);
  const duplicateUnits = unitsForProduct(catalog, duplicateId);
  const survivorMappings = mappingsForProduct(catalog, survivorId);
  const duplicateMappings = mappingsForProduct(catalog, duplicateId);

  return {
    survivorId,
    duplicateId,
    newPosCode,
    addDuplicateNameAsAlias: decision.addDuplicateNameAsAlias !== false,
    survivor,
    duplicate,
    survivorVariant,
    duplicateVariant,
    survivorUnits,
    duplicateUnits,
    survivorMappings,
    duplicateMappings,
    survivorPosCodes: uniqueSorted(survivorMappings.map((m) => m.posCode)),
    duplicatePosCodes: uniqueSorted(duplicateMappings.map((m) => m.posCode)),
    survivorAliases: catalog.aliases.filter((a) => a.productId === survivorId),
    duplicateAliases: catalog.aliases.filter((a) => a.productId === duplicateId),
    survivorRecs: catalog.recommendations.filter(
      (row) =>
        row.sourceProductId === survivorId || row.targetProductId === survivorId
    ),
    duplicateRecs: catalog.recommendations.filter(
      (row) =>
        row.sourceProductId === duplicateId ||
        row.targetProductId === duplicateId
    ),
  };
}

function alreadyApplied(catalog, decision) {
  const survivorId = String(decision.survivorProductId).trim();
  const duplicateId = String(decision.duplicateProductId).trim();
  const newPosCode = String(decision.newPosCode).trim();
  const duplicateGone = !productById(catalog, duplicateId);
  const survivor = productById(catalog, survivorId);
  const survivorCodes = posCodesForProduct(catalog, survivorId);
  const hasNew = survivorCodes.includes(newPosCode);
  const others = productsUsingPosCode(catalog, newPosCode, [survivorId]);
  return Boolean(
    duplicateGone && survivor && hasNew && others.length === 0
  );
}

/**
 * Plan one merge/recode without mutating catalog.
 */
export function planMergeRecode(catalog, decision) {
  const pair = inspectPair(catalog, decision);
  const {
    survivorId,
    duplicateId,
    newPosCode,
  } = pair;

  if (survivorId === duplicateId) {
    return fail("Self-merge is not allowed.", { code: "SELF_MERGE" });
  }

  if (DO_NOT_TOUCH_PRODUCT_IDS.includes(survivorId)) {
    return fail(`Survivor ${survivorId} is on the do-not-touch list.`, {
      code: "PROTECTED_SURVIVOR",
    });
  }
  if (DO_NOT_TOUCH_PRODUCT_IDS.includes(duplicateId)) {
    return fail(`Duplicate ${duplicateId} is on the do-not-touch list.`, {
      code: "PROTECTED_DUPLICATE",
    });
  }

  if (alreadyApplied(catalog, decision)) {
    return {
      ok: true,
      alreadyApplied: true,
      error: null,
      code: "ALREADY_APPLIED",
      pair,
      unitMatch: { ok: true, matched: [] },
    };
  }

  if (!pair.survivor) {
    return fail(`Unknown survivor product "${survivorId}".`, {
      code: "UNKNOWN_SURVIVOR",
    });
  }
  if (!pair.duplicate) {
    return fail(`Unknown duplicate product "${duplicateId}".`, {
      code: "UNKNOWN_DUPLICATE",
    });
  }
  if (!pair.survivorVariant) {
    return fail(`Survivor "${survivorId}" has no variant.`, {
      code: "MISSING_SURVIVOR_VARIANT",
    });
  }
  if (!pair.duplicateVariant) {
    return fail(`Duplicate "${duplicateId}" has no variant.`, {
      code: "MISSING_DUPLICATE_VARIANT",
    });
  }

  const foreignNew = productsUsingPosCode(catalog, newPosCode, [
    survivorId,
    duplicateId,
  ]);
  if (foreignNew.length > 0) {
    return fail(
      `POS code ${newPosCode} is already mapped to unrelated product(s): ${foreignNew.join(", ")}.`,
      { code: "POS_CONFLICT", foreignProductIds: foreignNew }
    );
  }

  if (!pair.duplicatePosCodes.includes(newPosCode)) {
    return fail(
      `Duplicate ${duplicateId} does not carry POS code ${newPosCode}.`,
      { code: "DUPLICATE_MISSING_NEW_POS" }
    );
  }

  if (pair.duplicatePosCodes.some((code) => code !== newPosCode)) {
    return fail(
      `Duplicate ${duplicateId} has unexpected extra POS codes: ${pair.duplicatePosCodes.join(", ")}.`,
      { code: "DUPLICATE_EXTRA_POS" }
    );
  }

  const unitMatch = unitSetsCompatible(pair.survivorUnits, pair.duplicateUnits);
  if (!unitMatch.ok) {
    return fail(unitMatch.reason, { code: "INCOMPATIBLE_UNITS", unitMatch });
  }

  const unmatchedMappings = [];
  for (const mapping of pair.duplicateMappings) {
    const unit = pair.duplicateUnits.find((row) => row.id === mapping.unitId);
    const match = unit
      ? matchSurvivorUnit(pair.survivorUnits, unit)
      : pair.survivorUnits.find((row) =>
          unitsEquivalent(row.name, mapping.unitName)
        );
    if (!match) {
      unmatchedMappings.push(mapping);
    }
  }
  if (unmatchedMappings.length > 0) {
    return fail("Duplicate mappings do not match survivor units.", {
      code: "INCOMPATIBLE_MAPPINGS",
      unmatchedMappings,
    });
  }

  return {
    ok: true,
    alreadyApplied: false,
    error: null,
    pair,
    unitMatch,
    preserve: {
      productId: survivorId,
      variantId: pair.survivorVariant.id,
      name: pair.survivor.name,
      category: pair.survivor.category,
      image: pair.survivor.image ?? null,
      favorite: pair.survivor.favorite,
      aliases: pair.survivorAliases.map((row) => row.alias),
      defaultUnitId: pair.survivorVariant.defaultUnitId,
    },
    adopt: {
      posCode: newPosCode,
      posName: uniqueSorted(pair.duplicateMappings.map((m) => m.posName)),
      mappingSourceRows: uniqueSorted(
        pair.duplicateMappings.map((m) => m.sourceRowIndex)
      ),
    },
    remove: {
      productId: duplicateId,
      variantId: pair.duplicateVariant.id,
      unitIds: pair.duplicateUnits.map((unit) => unit.id),
      mappingCount: pair.duplicateMappings.length,
      oldPosCodes: pair.survivorPosCodes,
    },
    metadata: {
      duplicateAliases: pair.duplicateAliases.map((row) => row.alias),
      duplicateRecs: pair.duplicateRecs.length,
      duplicateHasImage: Boolean(
        pair.duplicate.image?.card ||
          pair.duplicate.image?.detail ||
          pair.duplicate.image?.original
      ),
      survivorHasImage: Boolean(
        pair.survivor.image?.card ||
          pair.survivor.image?.detail ||
          pair.survivor.image?.original
      ),
    },
  };
}

function remapOwnerDefaults(defaults, survivorId, duplicateId) {
  const rows = Array.isArray(defaults) ? defaults : [];
  const survivorRow = rows.find((row) => row.productId === survivorId);
  const duplicateRow = rows.find((row) => row.productId === duplicateId);
  const kept = rows.filter((row) => row.productId !== duplicateId);

  if (duplicateRow && !survivorRow) {
    kept.push({ ...duplicateRow, productId: survivorId });
    return { rows: kept, action: "remapped-duplicate" };
  }
  if (duplicateRow && survivorRow) {
    return { rows: kept, action: "kept-survivor" };
  }
  if (survivorRow) {
    return { rows: kept, action: "kept-survivor" };
  }
  return { rows: kept, action: "none" };
}

function remapOwnerFamilies(families, survivorId, duplicateId) {
  const list = Array.isArray(families) ? families : [];
  const survivorFamily = list.find((family) =>
    (family.members ?? []).includes(survivorId)
  );
  const duplicateFamily = list.find((family) =>
    (family.members ?? []).includes(duplicateId)
  );

  if (
    survivorFamily &&
    duplicateFamily &&
    survivorFamily.id !== duplicateFamily.id
  ) {
    return {
      ok: false,
      error: `Cannot recode ${duplicateId} into ${survivorId}: they belong to different families ("${duplicateFamily.id}" and "${survivorFamily.id}").`,
      code: "FAMILY_CONFLICT",
      families: list,
    };
  }

  const next = list.map((family) => {
    const members = [];
    const seen = new Set();
    for (const memberId of family.members ?? []) {
      const mapped = memberId === duplicateId ? survivorId : memberId;
      if (seen.has(mapped)) {
        continue;
      }
      seen.add(mapped);
      members.push(mapped);
    }
    return { ...family, members };
  });

  const tooSmall = next.find((family) => family.members.length < 2);
  if (tooSmall) {
    return {
      ok: false,
      error: `Cannot recode ${duplicateId} into ${survivorId}: family "${tooSmall.id}" would have fewer than 2 members.`,
      code: "FAMILY_TOO_SMALL",
      families: list,
    };
  }

  return {
    ok: true,
    error: null,
    code: null,
    families: next,
    action: duplicateFamily ? "remapped-member" : "none",
  };
}

function remapOwnerMetadata(catalog, survivorId, duplicateId) {
  if (!Array.isArray(catalog.productDefaults)) {
    catalog.productDefaults = [];
  }
  if (!Array.isArray(catalog.productFamilies)) {
    catalog.productFamilies = [];
  }

  const defaults = remapOwnerDefaults(
    catalog.productDefaults,
    survivorId,
    duplicateId
  );
  const families = remapOwnerFamilies(
    catalog.productFamilies,
    survivorId,
    duplicateId
  );
  if (!families.ok) {
    return families;
  }

  catalog.productDefaults = defaults.rows;
  catalog.productFamilies = families.families;
  return {
    ok: true,
    error: null,
    defaultRemap: defaults.action,
    familyRemap: families.action,
  };
}

function rewriteRecommendations(catalog, survivorId, duplicateId, report) {
  const seen = new Set();
  const next = [];

  for (const row of catalog.recommendations) {
    const source =
      row.sourceProductId === duplicateId ? survivorId : row.sourceProductId;
    const target =
      row.targetProductId === duplicateId ? survivorId : row.targetProductId;
    const changed =
      source !== row.sourceProductId || target !== row.targetProductId;

    if (source === target) {
      if (changed) {
        report.recommendationDroppedSelf += 1;
      }
      continue;
    }

    const key = `${source}→${target}|${row.source}`;
    if (seen.has(key)) {
      if (changed) {
        report.recommendationDeduped += 1;
      }
      continue;
    }
    seen.add(key);

    if (changed) {
      report.recommendationRewritten += 1;
      next.push({ ...row, sourceProductId: source, targetProductId: target });
    } else {
      next.push(row);
    }
  }

  catalog.recommendations = next;
}

function migrateAliases(catalog, pair, report) {
  const survivorId = pair.survivorId;
  const duplicateId = pair.duplicateId;

  for (const record of catalog.aliases) {
    if (record.productId === duplicateId) {
      record.productId = survivorId;
      if (record.variantId === duplicateId) {
        record.variantId = survivorId;
      }
      report.aliasesMigrated.push(record.alias);
    }
    if (record.variantId === duplicateId) {
      record.variantId = survivorId;
    }
  }

  const seen = new Set();
  const kept = [];
  for (const record of catalog.aliases) {
    const normalized = `${record.productId}|${normalizeSearchText(record.alias)}`;
    if (seen.has(normalized)) {
      report.aliasesDeduped.push(record.alias);
      continue;
    }
    seen.add(normalized);
    kept.push(record);
  }
  catalog.aliases = kept;

  if (
    pair.addDuplicateNameAsAlias &&
    pair.duplicate?.name &&
    normalizeSearchText(pair.duplicate.name) !==
      normalizeSearchText(pair.survivor.name) &&
    !aliasExists(catalog.aliases, survivorId, pair.duplicate.name)
  ) {
    const id = nextAliasId(catalog.aliases, survivorId);
    catalog.aliases.push({
      id,
      productId: survivorId,
      alias: pair.duplicate.name,
    });
    report.aliasesAdded.push({ id, alias: pair.duplicate.name });
  }
}

/**
 * Apply one approved merge/recode to an in-memory catalogue.
 * Mutates catalog. Caller must clone first if they need the original.
 */
export function applyMergeRecode(catalog, decision) {
  const planned = planMergeRecode(catalog, decision);
  if (!planned.ok) {
    return planned;
  }
  if (planned.alreadyApplied) {
    return planned;
  }

  const pair = inspectPair(catalog, decision);
  const unitMatch = planned.unitMatch;
  const report = {
    ok: true,
    alreadyApplied: false,
    error: null,
    survivorProductId: pair.survivorId,
    duplicateProductId: pair.duplicateId,
    newPosCode: pair.newPosCode,
    oldPosCodesRemoved: pair.survivorPosCodes,
    aliasesMigrated: [],
    aliasesAdded: [],
    aliasesDeduped: [],
    recommendationRewritten: 0,
    recommendationDeduped: 0,
    recommendationDroppedSelf: 0,
    imageAction: "none",
    mappingsWritten: 0,
  };

  if (!pair.survivor.image && pair.duplicate.image) {
    pair.survivor.image = structuredClone(pair.duplicate.image);
    report.imageAction = "copied-from-duplicate";
  } else if (pair.survivor.image && pair.duplicate.image) {
    report.imageAction = "kept-survivor";
  } else {
    report.imageAction = "none";
  }

  const unitByDuplicateId = new Map(
    (unitMatch?.matched ?? []).map((row) => [
      row.duplicateUnit.id,
      row.survivorUnit,
    ])
  );

  const rewritten = pair.duplicateMappings.map((mapping) => {
    const duplicateUnit = pair.duplicateUnits.find(
      (unit) => unit.id === mapping.unitId
    );
    const survivorUnit =
      (duplicateUnit && unitByDuplicateId.get(duplicateUnit.id)) ||
      matchSurvivorUnit(pair.survivorUnits, {
        name: mapping.unitName,
      });
    if (!survivorUnit) {
      throw new Error(
        `Internal error: no survivor unit for mapping ${mapping.unitId}`
      );
    }
    return {
      sourceRowIndex: mapping.sourceRowIndex,
      posCode: mapping.posCode,
      posName: mapping.posName,
      posUnit: mapping.posUnit,
      productId: pair.survivorId,
      productName: pair.survivor.name,
      unitId: survivorUnit.id,
      unitName: survivorUnit.name,
    };
  });

  catalog.mappings = catalog.mappings.filter(
    (mapping) =>
      mapping.productId !== pair.duplicateId &&
      mapping.productId !== pair.survivorId
  );
  catalog.mappings.push(...rewritten);
  report.mappingsWritten = rewritten.length;

  migrateAliases(catalog, pair, report);
  rewriteRecommendations(catalog, pair.survivorId, pair.duplicateId, report);

  const ownerMeta = remapOwnerMetadata(
    catalog,
    pair.survivorId,
    pair.duplicateId
  );
  if (!ownerMeta.ok) {
    return fail(ownerMeta.error, { code: ownerMeta.code });
  }
  report.defaultRemap = ownerMeta.defaultRemap;
  report.familyRemap = ownerMeta.familyRemap;

  catalog.units = catalog.units.filter(
    (unit) => unit.productId !== pair.duplicateId
  );
  catalog.variants = catalog.variants.filter(
    (variant) => variant.productId !== pair.duplicateId
  );
  catalog.products = catalog.products.filter(
    (product) => product.id !== pair.duplicateId
  );

  return report;
}

export function applyMergeRecodeBatch(catalog, decisions) {
  const reports = [];
  for (const decision of decisions) {
    const report = applyMergeRecode(catalog, decision);
    reports.push(report);
    if (!report.ok) {
      return {
        ok: false,
        error: report.error,
        failedDecision: decision,
        reports,
      };
    }
  }
  return { ok: true, error: null, reports };
}

function countsOf(catalog) {
  return {
    products: catalog.products.length,
    variants: catalog.variants.length,
    units: catalog.units.length,
    aliases: catalog.aliases.length,
    mappings: catalog.mappings.length,
    recommendations: catalog.recommendations.length,
  };
}

function posIntegrity(catalog) {
  const posToProducts = new Map();
  const posUnitToRows = new Map();
  for (const mapping of catalog.mappings) {
    if (!posToProducts.has(mapping.posCode)) {
      posToProducts.set(mapping.posCode, new Set());
    }
    posToProducts.get(mapping.posCode).add(mapping.productId);
    const key = `${mapping.posCode}||${mapping.posUnit}`;
    if (!posUnitToRows.has(key)) {
      posUnitToRows.set(key, []);
    }
    posUnitToRows.get(key).push(mapping);
  }
  return {
    onePosManyProducts: [...posToProducts.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([posCode, ids]) => ({ posCode, productIds: [...ids] })),
    duplicatePosUnit: [...posUnitToRows.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({
        key,
        productIds: uniqueSorted(rows.map((row) => row.productId)),
        count: rows.length,
      })),
  };
}

function recordsForProduct(catalog, productId) {
  return {
    product: catalog.products.find((product) => product.id === productId) ?? null,
    variant:
      catalog.variants.find((variant) => variant.productId === productId) ??
      null,
    units: catalog.units.filter((unit) => unit.productId === productId),
    mappings: catalog.mappings.filter((mapping) => mapping.productId === productId),
    aliases: catalog.aliases.filter((alias) => alias.productId === productId),
  };
}

function uninvolvedRecommendations(catalog, involvedIds) {
  const involved = new Set(involvedIds);
  return catalog.recommendations.filter(
    (row) =>
      !involved.has(row.sourceProductId) && !involved.has(row.targetProductId)
  );
}

function untouchedProductDrift(beforeCatalog, afterCatalog, involvedIds) {
  const involved = new Set(involvedIds);
  const drifts = [];
  for (const product of beforeCatalog.products) {
    if (involved.has(product.id)) {
      continue;
    }
    const before = recordsForProduct(beforeCatalog, product.id);
    const after = recordsForProduct(afterCatalog, product.id);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      drifts.push(product.id);
    }
  }
  if (
    JSON.stringify(uninvolvedRecommendations(beforeCatalog, involvedIds)) !==
    JSON.stringify(uninvolvedRecommendations(afterCatalog, involvedIds))
  ) {
    drifts.push("(uninvolved-recommendations)");
  }
  return drifts;
}

export function buildMergeRecodePlan(catalog, decisions) {
  const before = countsOf(catalog);
  const involvedIds = decisions.flatMap((decision) => [
    String(decision.survivorProductId).trim(),
    String(decision.duplicateProductId).trim(),
  ]);
  const pairPlans = decisions.map((decision) => planMergeRecode(catalog, decision));
  const firstError = pairPlans.find((plan) => !plan.ok);

  const proposed = cloneCatalog(catalog);
  const applied = applyMergeRecodeBatch(proposed, decisions);
  const validationErrors = applied.ok
    ? validateCatalog(proposed, { publicDir: DEFAULT_PUBLIC_DIR })
    : [];
  const integrity = applied.ok ? posIntegrity(proposed) : null;
  const driftedIds = applied.ok
    ? untouchedProductDrift(catalog, proposed, involvedIds)
    : [];
  const protectedUntouched = DO_NOT_TOUCH_PRODUCT_IDS.every(
    (id) => !driftedIds.includes(id)
  );

  const conflicts = [];
  if (firstError) {
    conflicts.push(firstError.error);
  }
  if (!applied.ok) {
    conflicts.push(applied.error);
  }
  if (validationErrors.length > 0) {
    conflicts.push(`proposed catalogue failed validation (${validationErrors.length})`);
  }
  if (integrity?.onePosManyProducts.length) {
    conflicts.push("POS code would map to multiple products");
  }
  if (integrity?.duplicatePosUnit.length) {
    conflicts.push("duplicate POS code+unit mappings would remain");
  }
  if (driftedIds.length > 0) {
    conflicts.push(
      `unrelated products would change: ${driftedIds.slice(0, 8).join(", ")}`
    );
  }
  if (!protectedUntouched) {
    conflicts.push("a do-not-touch product would change");
  }

  return {
    ok: conflicts.length === 0,
    conflicts,
    before,
    after: countsOf(proposed),
    pairPlans,
    reports: applied.reports ?? [],
    validationErrors,
    integrity,
    protectedUntouched,
    driftedIds,
    proposed,
    alreadyApplied: pairPlans.every((plan) => plan.alreadyApplied),
  };
}

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function printPlan(plan) {
  console.log("Matahari Order — Merge / recode");
  console.log("--------------------------------");
  console.log(
    `Products : ${plan.before.products} → ${plan.after.products}`
  );
  console.log(
    `Variants : ${plan.before.variants} → ${plan.after.variants}`
  );
  console.log(`Units    : ${plan.before.units} → ${plan.after.units}`);
  console.log(
    `Mappings : ${plan.before.mappings} → ${plan.after.mappings}`
  );
  console.log(
    `Aliases  : ${plan.before.aliases} → ${plan.after.aliases}`
  );
  console.log(
    `Reco     : ${plan.before.recommendations} → ${plan.after.recommendations}`
  );
  console.log("");
  for (const pairPlan of plan.pairPlans) {
    if (!pairPlan.ok) {
      console.log(`FAIL  ${pairPlan.error}`);
      continue;
    }
    if (pairPlan.alreadyApplied) {
      console.log(
        `ALREADY  ${pairPlan.pair.survivorId} already has ${pairPlan.pair.newPosCode}`
      );
      continue;
    }
    console.log(
      `OK  keep ${pairPlan.preserve.productId} "${pairPlan.preserve.name}" ← POS ${pairPlan.adopt.posCode}`
    );
    console.log(`    remove ${pairPlan.remove.productId}`);
    console.log(
      `    drop old POS ${pairPlan.remove.oldPosCodes.join(", ") || "(none)"}`
    );
  }
  console.log("");
  console.log(
    plan.ok ? "Plan: READY" : `Plan: BLOCKED (${plan.conflicts.join("; ")})`
  );
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = { dry: true, apply: false, confirm: false };
  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
      options.dry = false;
    } else if (arg === "--dry") {
      options.dry = true;
      options.apply = false;
    } else if (arg === "--confirm") {
      options.confirm = true;
    }
  }
  return options;
}

export function verifySearches(catalog) {
  const assembled = assembleProducts(catalog);
  const aliases = catalog.aliases;
  const checks = [
    {
      query: "Zenix Coffee",
      expectId: "prod-zenix-coffee",
      forbidId: "prod-zenix-coffee-20",
    },
    {
      query: "Zenix Coffee 20",
      expectId: "prod-zenix-coffee",
      forbidId: "prod-zenix-coffee-20",
    },
    {
      query: "Zenix Sultan",
      expectId: "prod-zenix-sultan",
      forbidId: "prod-zenix-sultan-20",
    },
    {
      query: "Sergio Filter",
      expectId: "prod-sergio-filter",
      forbidId: "prod-sergio-filter-20",
    },
    {
      query: "Sergio Kretek 20",
      expectId: "prod-sergio-kretek-20",
    },
  ];
  return checks.map((check) => {
    const { results } = searchProducts({
      query: check.query,
      products: assembled,
      aliases,
    });
    const ids = results.map((product) => product.id);
    return {
      query: check.query,
      ids,
      expectPresent: ids.includes(check.expectId),
      expectAbsent: check.forbidId ? !ids.includes(check.forbidId) : true,
    };
  });
}

export function runMergeRecode(options = {}) {
  const catalog = options.catalog ?? loadCatalog(options);
  const decisions = options.decisions ?? approvedMergeRecodeDecisions();
  if (decisions.length === 0) {
    return fail("No approved merge/recode decisions found.");
  }

  const plan = buildMergeRecodePlan(catalog, decisions);
  if (options.outputDir) {
    writeJson(join(options.outputDir, "merge-recode-plan.json"), {
      ok: plan.ok,
      conflicts: plan.conflicts,
      before: plan.before,
      after: plan.after,
      alreadyApplied: plan.alreadyApplied,
      reports: plan.reports,
      pairPlans: plan.pairPlans.map((row) => ({
        ok: row.ok,
        error: row.error ?? null,
        alreadyApplied: row.alreadyApplied ?? false,
        survivorProductId: row.pair?.survivorId,
        duplicateProductId: row.pair?.duplicateId,
        newPosCode: row.pair?.newPosCode,
        preserve: row.preserve ?? null,
        adopt: row.adopt ?? null,
        remove: row.remove ?? null,
        metadata: row.metadata ?? null,
      })),
      validationErrors: plan.validationErrors,
      integrity: plan.integrity,
      protectedUntouched: plan.protectedUntouched,
    });
  }

  if (!plan.ok) {
    return {
      ok: false,
      error: plan.conflicts.join("; "),
      plan,
      applied: false,
    };
  }

  if (options.apply !== true) {
    return { ok: true, applied: false, dryRun: true, plan };
  }

  if (options.confirm !== true) {
    return {
      ok: false,
      error: APPLY_REFUSED_MESSAGE,
      applied: false,
      plan,
    };
  }

  const productIds = decisions.flatMap((decision) => [
    decision.survivorProductId,
    decision.duplicateProductId,
  ]);

  const tx = runCatalogTransaction({
    action: "merge-recode",
    summary: `Merge/recode ${decisions.length} approved product pair(s)`,
    productIds,
    catalogDir: options.catalogDir,
    backupsDir: options.backupsDir,
    validateOptions: options.validateOptions ?? { publicDir: DEFAULT_PUBLIC_DIR },
    mutate(next) {
      const result = applyMergeRecodeBatch(next, decisions);
      if (!result.ok) {
        throw new Error(result.error || "Merge/recode failed.");
      }
    },
  });

  return {
    ok: tx.ok,
    error: tx.error,
    applied: Boolean(tx.ok && !tx.noop),
    noop: tx.noop === true,
    backupId: tx.backupId,
    changedFiles: tx.changedFiles,
    validationErrors: tx.validationErrors,
    plan,
    reports: plan.reports,
  };
}

function main() {
  const cli = parseCliArgs();
  mkdirSync(DRY_RUN_DIR, { recursive: true });
  const live = loadCatalog({ catalogDir: DEFAULT_CATALOG_DIR });
  const decisions = approvedMergeRecodeDecisions();
  const plan = buildMergeRecodePlan(live, decisions);
  writeJson(join(DRY_RUN_DIR, "merge-recode-plan.json"), {
    ok: plan.ok,
    conflicts: plan.conflicts,
    before: plan.before,
    after: plan.after,
    reports: plan.reports,
    validationErrors: plan.validationErrors,
    protectedUntouched: plan.protectedUntouched,
  });
  printPlan(plan);

  if (!plan.ok) {
    process.exitCode = 1;
    return;
  }

  if (cli.apply !== true) {
    console.log("Dry-run only. Live catalogue was not written.");
    return;
  }

  const result = runMergeRecode({
    apply: true,
    confirm: cli.confirm,
    catalog: live,
    decisions,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  console.log(`Applied. Backup: ${result.backupId ?? "(noop)"}`);
  if (result.applied) {
    const built = buildCustomerCatalog();
    console.log(
      `Customer catalogue: ${built.ok ? built.productCount : built.error}`
    );
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}
