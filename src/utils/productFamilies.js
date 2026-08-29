/**
 * Curated product-family helpers for Produk Serupa.
 *
 * Families are owner-curated in src/catalog/productFamilies.json.
 * This module does not guess membership from names.
 */

export function deriveSimilarProductIds(families = []) {
  const byProduct = new Map();

  if (!Array.isArray(families)) {
    return byProduct;
  }

  for (const family of families) {
    const members = Array.isArray(family?.members) ? family.members : [];
    for (const productId of members) {
      byProduct.set(
        productId,
        members.filter((memberId) => memberId !== productId)
      );
    }
  }

  return byProduct;
}

export function similarProductIdsFor(productId, similarByProduct) {
  if (!productId || !similarByProduct) {
    return [];
  }

  if (similarByProduct instanceof Map) {
    return similarByProduct.get(productId) ?? [];
  }

  return similarByProduct[productId] ?? [];
}

export function resolveSimilarProducts(similarProductIds, productsById) {
  if (!Array.isArray(similarProductIds) || similarProductIds.length === 0) {
    return [];
  }

  const result = [];
  for (const productId of similarProductIds) {
    const product =
      productsById instanceof Map
        ? productsById.get(productId)
        : productsById?.[productId];
    if (product) {
      result.push(product);
    }
  }
  return result;
}

export function excludeSimilarFromRecommendations(
  recommendations,
  similarProductIds
) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return recommendations ?? [];
  }

  const skip = new Set(similarProductIds ?? []);
  if (skip.size === 0) {
    return recommendations;
  }

  return recommendations.filter((product) => !skip.has(product.id));
}
