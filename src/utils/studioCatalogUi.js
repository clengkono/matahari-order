/**
 * Catalogue Studio Defaults/Families UI helpers.
 * Client-side only. Does not write the live catalogue.
 */

import { CURATED_CATEGORY_IDS } from "../config/categories.js";
import {
  STUDIO_IMAGE_PAGE_SIZE,
  filterStudioImageProducts,
} from "./studioImageSearch.js";

export const STUDIO_DEFAULTS_PAGE_SIZE = STUDIO_IMAGE_PAGE_SIZE;
export const STUDIO_NEW_FAMILY_ID = "__new__";

export const DEFAULT_PARTIAL_WARNING =
  "Default saved, but customer catalogue could not be rebuilt. Run validation before publishing.";

export const FAMILY_PARTIAL_WARNING =
  "Family saved, but customer catalogue could not be rebuilt.";

export function ownerFacingStudioLoadError(error, fallback) {
  if (error?.status === 404 || error?.message === "Not found.") {
    return "This Studio window is using an older catalogue service. Close every Matahari Studio window (Ctrl+C), then start Studio again.";
  }
  return error?.message || fallback;
}

export function isCustomerCatalogPartial(result) {
  return Boolean(result?.customerCatalog) && result.customerCatalog.ok === false;
}

export function customerCatalogPartialWarning(result, fallback) {
  if (!isCustomerCatalogPartial(result)) {
    return null;
  }
  return result.customerCatalog.warning || fallback;
}

export function studioDefaultStats(rows = []) {
  const configured = rows.filter((row) => row.ownerConfigured).length;
  return {
    total: rows.length,
    configured,
    needsReview: rows.length - configured,
  };
}

export function categoriesFromStudioDefaults(rows = []) {
  const seen = new Set();
  for (const row of rows) {
    const category = typeof row?.category === "string" ? row.category.trim() : "";
    if (category) {
      seen.add(category);
    }
  }

  const curated = CURATED_CATEGORY_IDS.filter((id) => seen.has(id));
  const extras = [...seen]
    .filter((id) => !CURATED_CATEGORY_IDS.includes(id))
    .sort((left, right) => left.localeCompare(right, "id"));
  return [...curated, ...extras];
}

function toSearchProduct(row) {
  return {
    ...row,
    id: row.productId,
    name: row.name ?? "",
    aliases: row.aliases ?? [],
    posName: row.posName ?? null,
    posCode: row.posCode ?? null,
    category: row.category ?? "",
  };
}

export function filterStudioDefaults(
  rows = [],
  { query = "", status = "all", category = "", pinnedIds = [] } = {}
) {
  const pinned = new Set(pinnedIds);
  const matched = filterStudioImageProducts(
    rows.map(toSearchProduct),
    { query, status: "all", category }
  );

  return matched.filter((row) => {
    if (pinned.has(row.productId)) {
      return true;
    }
    if (status === "review" && row.ownerConfigured) {
      return false;
    }
    if (status === "configured" && !row.ownerConfigured) {
      return false;
    }
    return true;
  });
}

export function mergeStudioDefaultRow(rows, nextRow) {
  if (!nextRow?.productId) {
    return rows;
  }
  return rows.map((row) =>
    row.productId === nextRow.productId ? { ...row, ...nextRow } : row
  );
}

export function availableUnitChoices(row) {
  return Array.isArray(row?.availableUnits) ? row.availableUnits.filter(Boolean) : [];
}

export function isSingleUnitProduct(row) {
  return availableUnitChoices(row).length === 1;
}

export function productFamilyOwnership(families = [], ignoreFamilyId = null) {
  const map = new Map();
  for (const family of families) {
    if (!family || family.id === ignoreFamilyId) {
      continue;
    }
    for (const member of family.members ?? []) {
      const productId = member?.productId;
      if (productId) {
        map.set(productId, {
          familyId: family.id,
          familyName: family.name ?? family.id,
        });
      }
    }
  }
  return map;
}

export function familyPickerState(productId, draftMemberIds, ownership) {
  if (draftMemberIds?.has(productId)) {
    return { kind: "added" };
  }
  const conflict = ownership?.get(productId);
  if (conflict) {
    return {
      kind: "conflict",
      familyId: conflict.familyId,
      familyName: conflict.familyName,
    };
  }
  return { kind: "available" };
}

export function canSaveFamilyDraft(draft) {
  const name = typeof draft?.name === "string" ? draft.name.trim() : "";
  const members = Array.isArray(draft?.members) ? draft.members : [];
  return Boolean(name) && members.length >= 2;
}

export function emptyFamilyDraft() {
  return {
    id: STUDIO_NEW_FAMILY_ID,
    name: "",
    members: [],
  };
}

export function familyDraftFromFamily(family) {
  if (!family) {
    return emptyFamilyDraft();
  }
  return {
    id: family.id,
    name: family.name ?? "",
    members: (family.members ?? []).map((member) => ({
      productId: member.productId,
      name: member.name ?? member.productId,
      category: member.category ?? "",
      image: member.image ?? null,
    })),
  };
}

function memberIds(members = []) {
  return members.map((member) => member.productId).join("\0");
}

export function isFamilyDraftDirty(baseline, draft) {
  if (!draft) {
    return false;
  }
  if (!baseline || baseline.id === STUDIO_NEW_FAMILY_ID) {
    return Boolean(draft.name.trim()) || draft.members.length > 0;
  }
  return (
    draft.name.trim() !== String(baseline.name ?? "").trim() ||
    memberIds(draft.members) !== memberIds(baseline.members)
  );
}

export function toFamilyMemberFromProduct(product) {
  return {
    productId: product.id,
    name: product.name ?? product.id,
    category: product.category ?? "",
    image: product.image?.card ? { card: product.image.card } : null,
  };
}

export function filterStudioFamilies(families = [], query = "") {
  const normalized = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return families;
  }
  return families.filter((family) =>
    String(family.name ?? "")
      .toLowerCase()
      .includes(normalized)
  );
}

export function filterStudioPickerProducts(products, query) {
  return filterStudioImageProducts(products, {
    query,
    status: "all",
    category: "",
  });
}
