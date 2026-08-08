/**
 * Whole-cart recommendation ranking.
 *
 * Pure utility — no React dependency. Accepts relationship data from
 * recommendations.json today, or from transaction-derived data later,
 * without changing the customer-facing UI.
 */

function isProductEligible(product) {
  if (!product) {
    return false;
  }

  if (product.active === false) {
    return false;
  }

  if (
    Array.isArray(product.availableUnits) &&
    product.availableUnits.length === 0
  ) {
    return false;
  }

  return true;
}

function getCartProductIds(cart) {
  const ids = new Set();

  for (const line of cart ?? []) {
    if (line?.productId) {
      ids.add(line.productId);
    }
  }

  return ids;
}

/**
 * Rank recommendation candidates for the current cart.
 *
 * @param {object} options
 * @param {Array<{ productId: string }>} options.cart
 * @param {Array<{ sourceProductId: string, targetProductId: string, weight: number }>} options.relationships
 * @param {Array<object>} options.products - assembled customer-facing products
 * @param {number} [options.limit=3]
 * @returns {Array<{ product: object, score: number }>}
 */
export function rankRecommendedProducts({
  cart,
  relationships,
  products,
  limit = 3,
} = {}) {
  if (!Array.isArray(relationships) || relationships.length === 0) {
    return [];
  }

  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }

  const cartProductIds = getCartProductIds(cart);

  if (cartProductIds.size === 0) {
    return [];
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const scores = new Map();

  for (const relationship of relationships) {
    const sourceId = relationship?.sourceProductId;
    const targetId = relationship?.targetProductId;
    const weight = relationship?.weight;

    if (!sourceId || !targetId || !cartProductIds.has(sourceId)) {
      continue;
    }

    if (cartProductIds.has(targetId)) {
      continue;
    }

    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      continue;
    }

    const product = productById.get(targetId);

    if (!isProductEligible(product)) {
      continue;
    }

    scores.set(targetId, (scores.get(targetId) ?? 0) + weight);
  }

  return [...scores.entries()]
    .map(([productId, score]) => ({
      product: productById.get(productId),
      score,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const nameCompare = a.product.name.localeCompare(b.product.name, "id");
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return String(a.product.id).localeCompare(String(b.product.id));
    })
    .slice(0, Math.max(0, limit));
}

/**
 * Convenience wrapper returning product records only (for UI).
 */
export function getRecommendedProducts(options) {
  return rankRecommendedProducts(options).map(({ product }) => product);
}
