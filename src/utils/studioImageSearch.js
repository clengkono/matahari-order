/**
 * Client-side Studio Images/Queue matching. Search only — no ranking changes
 * to the customer shop.
 */

export const STUDIO_IMAGE_PAGE_SIZE = 40;

export function normalizeStudioQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function matchesStudioImageQuery(product, rawQuery) {
  const query = normalizeStudioQuery(rawQuery);
  if (!query) {
    return true;
  }

  if (String(product?.name ?? "").toLowerCase().includes(query)) {
    return true;
  }

  if (String(product?.id ?? "").toLowerCase().includes(query)) {
    return true;
  }

  if (String(product?.posName ?? "").toLowerCase().includes(query)) {
    return true;
  }

  if (String(product?.posCode ?? "").toLowerCase().includes(query)) {
    return true;
  }

  return (product?.aliases ?? []).some((alias) =>
    String(alias).toLowerCase().includes(query)
  );
}

export function filterStudioImageProducts(
  products,
  { query = "", status = "all", category = "", recentIds = [] } = {}
) {
  const recent = new Set(recentIds);
  return (products ?? []).filter((product) => {
    if (category && product.category !== category) {
      return false;
    }

    if (status === "missing" && product.hasImage) {
      return false;
    }

    if (status === "has" && !product.hasImage) {
      return false;
    }

    if (status === "recent" && !recent.has(product.id)) {
      return false;
    }

    return matchesStudioImageQuery(product, query);
  });
}

export function missingNeighbors(products, selectedId) {
  const missing = (products ?? []).filter((product) => !product.hasImage);
  const index = missing.findIndex((product) => product.id === selectedId);
  if (index < 0) {
    return {
      previousId: missing[0]?.id ?? null,
      nextId: missing[0]?.id ?? null,
      remaining: missing.length,
      position: 0,
    };
  }

  return {
    previousId: index > 0 ? missing[index - 1].id : null,
    nextId: index < missing.length - 1 ? missing[index + 1].id : null,
    remaining: missing.length,
    position: index + 1,
  };
}
