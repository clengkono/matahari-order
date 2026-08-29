/**
 * Catalogue Studio product-family helpers.
 *
 * Reads the full catalogue. Writes only through runCatalogTransaction().
 * LOCAL ONLY.
 */

import { slugify } from "./catalogWorkbook.js";
import { loadCatalog, runCatalogTransaction } from "./catalogTransaction.js";
import { rebuildCustomerCatalogAfterStudioWrite } from "./studioImageCatalog.js";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function failInput(error, code = "INVALID_INPUT") {
  return {
    ok: false,
    error,
    code,
    validationErrors: [],
    changedFiles: [],
    backupId: null,
    noop: false,
  };
}

function ownerFacingTransactionError(transaction) {
  if (transaction.code === "BUSY") {
    return "Another catalogue save is already running. Try again.";
  }
  if (transaction.code === "VALIDATION_FAILED") {
    const first = transaction.validationErrors?.[0];
    return first
      ? `Could not save. ${first}`
      : "Could not save. The catalogue check failed.";
  }
  if (transaction.code === "NOT_FOUND") {
    return "Family not found.";
  }
  return transaction.error || "Could not save the family.";
}

function productToFamilyId(families = []) {
  const map = new Map();
  for (const family of families) {
    for (const memberId of family.members ?? []) {
      map.set(memberId, family.id);
    }
  }
  return map;
}

function compactMemberImage(image) {
  if (!image || typeof image !== "object" || typeof image.card !== "string") {
    return null;
  }
  if (!image.card) {
    return null;
  }
  return { card: image.card };
}

function toFamilyMember(productId, catalog) {
  const product = (catalog.products ?? []).find((entry) => entry.id === productId);
  return {
    productId,
    name: product?.name ?? productId,
    category: product?.category ?? "",
    image: compactMemberImage(product?.image),
  };
}

export function listStudioFamilies(catalog) {
  const families = (catalog.productFamilies ?? []).map((family) => ({
    id: family.id,
    name: family.name ?? "",
    members: (family.members ?? []).map((productId) =>
      toFamilyMember(productId, catalog)
    ),
  }));

  return {
    families,
    stats: {
      familyCount: families.length,
      memberCount: families.reduce(
        (total, family) => total + family.members.length,
        0
      ),
    },
  };
}

export function getStudioFamily(catalog, familyId) {
  const listed = listStudioFamilies(catalog);
  return listed.families.find((family) => family.id === familyId) ?? null;
}

export function proposeFamilyId(name, usedIds = new Set()) {
  const base = slugify(name) || "family";
  if (!usedIds.has(base)) {
    return base;
  }
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function normalizeMembers(members) {
  if (!Array.isArray(members)) {
    return {
      ok: false,
      error: "Members must be a list of product IDs.",
      code: "INVALID_INPUT",
    };
  }

  const normalized = [];
  for (const member of members) {
    if (typeof member !== "string" || !member.trim()) {
      return {
        ok: false,
        error: "Each member must be a product ID.",
        code: "INVALID_INPUT",
      };
    }
    normalized.push(member.trim());
  }
  return { ok: true, members: normalized };
}

function validateMembers(members, catalog, { ignoreFamilyId } = {}) {
  if (members.length < 2) {
    return {
      ok: false,
      error: "A family needs at least 2 products.",
      code: "FAMILY_TOO_SMALL",
    };
  }

  const productIds = new Set((catalog.products ?? []).map((product) => product.id));
  const seen = new Set();
  const ownedBy = productToFamilyId(catalog.productFamilies);

  for (const productId of members) {
    if (seen.has(productId)) {
      return {
        ok: false,
        error: `Product "${productId}" is listed more than once.`,
        code: "DUPLICATE_MEMBER",
      };
    }
    seen.add(productId);

    if (!productIds.has(productId)) {
      return {
        ok: false,
        error: `Unknown product "${productId}".`,
        code: "UNKNOWN_MEMBER",
      };
    }

    const currentFamily = ownedBy.get(productId);
    if (currentFamily && currentFamily !== ignoreFamilyId) {
      const family = (catalog.productFamilies ?? []).find(
        (entry) => entry.id === currentFamily
      );
      const familyName = family?.name || currentFamily;
      return {
        ok: false,
        error: `Product "${productId}" already belongs to "${familyName}".`,
        code: "FAMILY_CONFLICT",
        conflictFamilyId: currentFamily,
        conflictFamilyName: familyName,
      };
    }
  }

  return { ok: true };
}

function rebuildAfterWrite(transaction, options) {
  if (transaction.noop) {
    return null;
  }
  try {
    if (typeof options.rebuildCustomerCatalog === "function") {
      return options.rebuildCustomerCatalog(options);
    }
    return rebuildCustomerCatalogAfterStudioWrite({
      catalogDir: options.catalogDir,
      outputPath: options.customerCatalogPath,
      validateOptions: options.validateOptions,
    });
  } catch (error) {
    return {
      ok: false,
      unchanged: false,
      warning:
        error.message ||
        "Customer catalogue could not be rebuilt. Run npm run catalog:customer-build.",
      code: "REBUILD_FAILED",
    };
  }
}

export function parseFamilyCreateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: "Expected JSON with name and members.",
      code: "INVALID_INPUT",
    };
  }

  const extra = Object.keys(body).filter((key) => key !== "name" && key !== "members");
  if (extra.length > 0) {
    return {
      ok: false,
      error: "Only name and members can be set.",
      code: "INVALID_INPUT",
    };
  }

  if (!hasOwn(body, "name") || !hasOwn(body, "members")) {
    return {
      ok: false,
      error: "Name and members are required.",
      code: "INVALID_INPUT",
    };
  }

  return { ok: true, name: body.name, members: body.members };
}

export function parseFamilyPatchBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: "Expected JSON with name and/or members.",
      code: "INVALID_INPUT",
    };
  }

  const extra = Object.keys(body).filter((key) => key !== "name" && key !== "members");
  if (extra.length > 0) {
    return {
      ok: false,
      error: "Only name and members can be changed.",
      code: "INVALID_INPUT",
    };
  }

  if (!hasOwn(body, "name") && !hasOwn(body, "members")) {
    return {
      ok: false,
      error: "Name or members is required.",
      code: "INVALID_INPUT",
    };
  }

  const patch = {};
  if (hasOwn(body, "name")) {
    patch.name = body.name;
  }
  if (hasOwn(body, "members")) {
    patch.members = body.members;
  }
  return { ok: true, patch };
}

export function createStudioFamily(input, options = {}) {
  if (typeof input?.name !== "string") {
    return failInput("Family name must be text.");
  }
  const name = input.name.trim();
  if (!name) {
    return failInput("Enter a family name.");
  }

  const normalized = normalizeMembers(input.members);
  if (!normalized.ok) {
    return failInput(normalized.error, normalized.code);
  }

  let catalog;
  try {
    catalog = loadCatalog(options);
  } catch (error) {
    return failInput(error.message || "Failed to read catalogue.", "LOAD_FAILED");
  }

  const membersCheck = validateMembers(normalized.members, catalog);
  if (!membersCheck.ok) {
    return failInput(membersCheck.error, membersCheck.code);
  }

  const usedIds = new Set(
    (catalog.productFamilies ?? []).map((family) => family.id)
  );
  const id = proposeFamilyId(name, usedIds);

  const transaction = runCatalogTransaction({
    ...options,
    action: "create-product-family",
    productIds: normalized.members,
    summary: `Created family ${name}`,
    mutate(next) {
      if (!Array.isArray(next.productFamilies)) {
        next.productFamilies = [];
      }
      next.productFamilies.push({
        id,
        name,
        members: normalized.members,
      });
    },
  });

  if (!transaction.ok) {
    return {
      ...transaction,
      error: ownerFacingTransactionError(transaction),
    };
  }

  const after = loadCatalog(options);
  return {
    ...transaction,
    family: getStudioFamily(after, id),
    customerCatalog: rebuildAfterWrite(transaction, options),
  };
}

export function updateStudioFamily(input, options = {}) {
  const familyId = typeof input?.familyId === "string" ? input.familyId.trim() : "";
  if (!familyId) {
    return failInput("Family is required.");
  }

  let catalog;
  try {
    catalog = loadCatalog(options);
  } catch (error) {
    return failInput(error.message || "Failed to read catalogue.", "LOAD_FAILED");
  }

  const current = (catalog.productFamilies ?? []).find(
    (family) => family.id === familyId
  );
  if (!current) {
    return failInput("Family not found.", "NOT_FOUND");
  }

  let nextName = current.name;
  if (hasOwn(input, "name")) {
    if (typeof input.name !== "string") {
      return failInput("Family name must be text.");
    }
    nextName = input.name.trim();
    if (!nextName) {
      return failInput("Enter a family name.");
    }
  }

  let nextMembers = current.members;
  if (hasOwn(input, "members")) {
    const normalized = normalizeMembers(input.members);
    if (!normalized.ok) {
      return failInput(normalized.error, normalized.code);
    }
    const membersCheck = validateMembers(normalized.members, catalog, {
      ignoreFamilyId: familyId,
    });
    if (!membersCheck.ok) {
      return failInput(membersCheck.error, membersCheck.code);
    }
    nextMembers = normalized.members;
  }

  const transaction = runCatalogTransaction({
    ...options,
    action: "update-product-family",
    productIds: nextMembers,
    summary:
      nextName !== current.name
        ? `Renamed family ${current.name} → ${nextName}`
        : `Updated family ${nextName}`,
    mutate(next) {
      const target = (next.productFamilies ?? []).find(
        (family) => family.id === familyId
      );
      if (!target) {
        throw new Error("Family not found.");
      }
      target.name = nextName;
      target.members = nextMembers;
    },
  });

  if (!transaction.ok) {
    return {
      ...transaction,
      error: ownerFacingTransactionError(transaction),
    };
  }

  const after = loadCatalog(options);
  return {
    ...transaction,
    family: getStudioFamily(after, familyId),
    customerCatalog: rebuildAfterWrite(transaction, options),
  };
}

export function deleteStudioFamily(input, options = {}) {
  const familyId = typeof input?.familyId === "string" ? input.familyId.trim() : "";
  if (!familyId) {
    return failInput("Family is required.");
  }

  let catalog;
  try {
    catalog = loadCatalog(options);
  } catch (error) {
    return failInput(error.message || "Failed to read catalogue.", "LOAD_FAILED");
  }

  const current = (catalog.productFamilies ?? []).find(
    (family) => family.id === familyId
  );
  if (!current) {
    return failInput("Family not found.", "NOT_FOUND");
  }

  const transaction = runCatalogTransaction({
    ...options,
    action: "delete-product-family",
    productIds: current.members ?? [],
    summary: `Deleted family ${current.name}`,
    mutate(next) {
      next.productFamilies = (next.productFamilies ?? []).filter(
        (family) => family.id !== familyId
      );
    },
  });

  if (!transaction.ok) {
    return {
      ...transaction,
      error: ownerFacingTransactionError(transaction),
    };
  }

  return {
    ...transaction,
    familyId,
    deleted: !transaction.noop,
    customerCatalog: rebuildAfterWrite(transaction, options),
  };
}

export { ownerFacingTransactionError };
