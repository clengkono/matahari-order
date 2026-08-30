/**
 * Recommendation source construction and ranking.
 *
 * Pure utility — no React dependency. Consumes edges from
 * recommendations.json with provenance:
 *   source: "sales"  — transaction-derived evidence
 *   source: "manual" — owner-entered business knowledge
 *
 * Ranking sums edge weights across the supplied source IDs. Which IDs are
 * sources depends on the surface:
 *   Product Detail — viewed product only
 *   Search strip   — current search hits only
 *   Cart / review  — every product in the cart
 *
 * Cart lines must not be mixed into Product Detail or Search sources.
 * That leak made grocery pages inherit cigarette neighbors.
 */

/** Allowed provenance values for recommendation edges. */
export const RECOMMENDATION_SOURCES = Object.freeze(["sales", "manual"]);

const ALLOWED_SOURCES = new Set(RECOMMENDATION_SOURCES);

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

function uniqueSourceRows(items, getId) {
  const sources = [];
  const seen = new Set();

  for (const item of items ?? []) {
    const productId = getId(item);
    if (!productId || seen.has(productId)) {
      continue;
    }
    seen.add(productId);
    sources.push({ productId });
  }

  return sources;
}

/**
 * Product Detail FBT sources: the viewed product only.
 * Do not add cart IDs — that inherited unrelated recommendations.
 */
export function recommendationSourcesForProductDetail(productId) {
  return productId ? [{ productId }] : [];
}

/**
 * Search "Mungkin Anda juga perlu" sources: current search hits only.
 * Do not add cart IDs.
 */
export function recommendationSourcesForSearch(searchResultProducts = []) {
  return uniqueSourceRows(searchResultProducts, (product) => product?.id);
}

/**
 * Cart / order-review FBT sources: every product in the cart.
 * This is the only surface that aggregates multiple cart lines.
 */
export function recommendationSourcesForCart(cart = []) {
  return uniqueSourceRows(cart, (line) => line?.productId);
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

function isValidEdge(relationship) {
  const sourceId = relationship?.sourceProductId;
  const targetId = relationship?.targetProductId;
  const weight = relationship?.weight;
  const provenance = relationship?.source;

  if (!sourceId || !targetId) {
    return false;
  }

  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
    return false;
  }

  // Edges without a known provenance are ignored at rank time; catalogue
  // validation rejects them at build time.
  if (!ALLOWED_SOURCES.has(provenance)) {
    return false;
  }

  return true;
}

/**
 * Rank recommendation candidates for the current cart.
 *
 * Combined score for a target = sum of weights from every valid edge whose
 * sourceProductId is in the cart. Sales and manual edges both contribute
 * when present (identity is sourceProductId + targetProductId + source).
 *
 * Tie-break (deterministic):
 * 1. combined score descending
 * 2. product name (id locale)
 * 3. product id
 *
 * @param {object} options
 * @param {Array<{ productId: string }>} options.cart
 * @param {Array<{ sourceProductId: string, targetProductId: string, weight: number, source: "sales"|"manual" }>} options.relationships
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
    if (!isValidEdge(relationship)) {
      continue;
    }

    const sourceId = relationship.sourceProductId;
    const targetId = relationship.targetProductId;
    const weight = relationship.weight;

    if (!cartProductIds.has(sourceId)) {
      continue;
    }

    if (cartProductIds.has(targetId)) {
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
