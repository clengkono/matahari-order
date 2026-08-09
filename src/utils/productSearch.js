/**
 * Customer product search helpers (Release 0.8.1).
 * Pure utilities — no React dependency.
 */

/**
 * Normalize query or searchable text for predictable matching.
 * - lowercase
 * - trim ends
 * - collapse internal whitespace
 */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compareByNameThenId(a, b) {
  const nameCompare = a.name.localeCompare(b.name, "id");
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return String(a.id).localeCompare(String(b.id));
}

/**
 * Resolve an alias record to customer-facing product IDs.
 * Supports existing aliases.json fields: productId and/or variantId.
 */
export function resolveAliasTargetIds(aliasRecord) {
  const ids = [];

  if (aliasRecord?.productId) {
    ids.push(aliasRecord.productId);
  }

  if (
    aliasRecord?.variantId &&
    aliasRecord.variantId !== aliasRecord.productId
  ) {
    ids.push(aliasRecord.variantId);
  }

  return ids;
}

/**
 * Search products by name (Tier 1) then alias (Tier 2).
 *
 * @param {object} options
 * @param {string} options.query
 * @param {Array<object>} options.products - assembled customer-facing products
 * @param {Array<{ id?: string, productId?: string, variantId?: string, alias: string }>} options.aliases
 * @returns {{ nameMatches: object[], aliasMatches: object[], results: object[] }}
 */
export function searchProducts({ query, products, aliases } = {}) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery || !Array.isArray(products) || products.length === 0) {
    return { nameMatches: [], aliasMatches: [], results: [] };
  }

  const nameMatches = products.filter((product) =>
    normalizeSearchText(product.name).includes(normalizedQuery)
  );

  const nameMatchIds = new Set(nameMatches.map((product) => product.id));
  const productById = new Map(products.map((product) => [product.id, product]));
  const aliasMatchById = new Map();

  if (Array.isArray(aliases)) {
    for (const record of aliases) {
      const normalizedAlias = normalizeSearchText(record?.alias);

      if (!normalizedAlias || !normalizedAlias.includes(normalizedQuery)) {
        continue;
      }

      for (const targetId of resolveAliasTargetIds(record)) {
        if (nameMatchIds.has(targetId) || aliasMatchById.has(targetId)) {
          continue;
        }

        const product = productById.get(targetId);
        if (product) {
          aliasMatchById.set(targetId, product);
        }
      }
    }
  }

  const aliasMatches = [...aliasMatchById.values()].sort(compareByNameThenId);

  return {
    nameMatches,
    aliasMatches,
    results: [...nameMatches, ...aliasMatches],
  };
}
