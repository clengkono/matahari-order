/**
 * Sales-informed discovery scores from catalogue recommendation edges.
 *
 * Does not read spreadsheets. recommendations.json already carries
 * sales-derived co-purchase weights with provenance.
 *
 * Text/alias search remains primary; these scores only order products
 * that already matched the query.
 */

export function buildSalesPopularity(recommendations) {
  const scores = new Map();

  for (const edge of recommendations ?? []) {
    if (edge?.source !== "sales") {
      continue;
    }
    const weight = Number(edge.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    if (edge.sourceProductId) {
      scores.set(
        edge.sourceProductId,
        (scores.get(edge.sourceProductId) ?? 0) + weight
      );
    }
    if (edge.targetProductId) {
      scores.set(
        edge.targetProductId,
        (scores.get(edge.targetProductId) ?? 0) + weight * 0.5
      );
    }
  }

  return scores;
}

/**
 * Homepage Sering Dipesan pool: owner/manual IDs first, then sales-ranked
 * fillers. Never invents IDs that are not in the live catalogue.
 */
export function getSeringDipesanProducts({
  products,
  recommendations,
  manualIds = [],
  limit = 9,
} = {}) {
  const byId = new Map((products ?? []).map((product) => [product.id, product]));
  const seen = new Set();
  const result = [];

  for (const id of manualIds) {
    const product = byId.get(id);
    if (!product || seen.has(id)) {
      continue;
    }
    result.push(product);
    seen.add(id);
    if (result.length >= limit) {
      return result;
    }
  }

  const popularity = buildSalesPopularity(recommendations);
  const ranked = [...(products ?? [])]
    .filter((product) => (popularity.get(product.id) ?? 0) > 0)
    .sort((a, b) => {
      const diff = (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0);
      if (diff !== 0) {
        return diff;
      }
      return a.name.localeCompare(b.name, "id");
    });

  for (const product of ranked) {
    if (seen.has(product.id)) {
      continue;
    }
    result.push(product);
    seen.add(product.id);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}
