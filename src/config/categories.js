/**
 * Curated homepage category order and presentation (Stage 2A).
 *
 * Canonical `id` values must match product.category on assembled products.
 * Icons/labels are presentation only — filtering always uses `id`.
 *
 * Categories with zero active products are hidden at render time.
 * Unknown future catalogue categories are appended after this list.
 */

export const CATEGORY_CONFIG = [
  { id: "Rokok", label: "Rokok", icon: "🚬" },
  { id: "Minuman", label: "Minuman", icon: "🥤" },
  { id: "Bahan & Bumbu Masak", label: "Bahan & Bumbu Masak", icon: "🍳" },
  { id: "Perawatan", label: "Perawatan", icon: "🧼" },
  { id: "Kebersihan", label: "Kebersihan", icon: "🧹" },
];

const configById = new Map(
  CATEGORY_CONFIG.map((entry) => [entry.id, entry])
);

/**
 * Build the visible category list from active products.
 * Curated order first (only if present), then any unknown categories A–Z.
 *
 * @param {Array<{ category?: string }>} products
 * @returns {Array<{ id: string, label: string, icon: string, count: number }>}
 */
export function getVisibleCategories(products) {
  const counts = new Map();

  for (const product of products ?? []) {
    const category = product?.category;
    if (!category) {
      continue;
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const visible = [];

  for (const entry of CATEGORY_CONFIG) {
    const count = counts.get(entry.id) ?? 0;
    if (count > 0) {
      visible.push({ ...entry, count });
      counts.delete(entry.id);
    }
  }

  const unknownIds = [...counts.keys()].sort((a, b) =>
    a.localeCompare(b, "id")
  );

  for (const id of unknownIds) {
    const count = counts.get(id) ?? 0;
    if (count > 0) {
      const known = configById.get(id);
      visible.push({
        id,
        label: known?.label ?? id,
        icon: known?.icon ?? "",
        count,
      });
    }
  }

  return visible;
}

/**
 * Presentation metadata for a canonical category id.
 * @param {string | null | undefined} categoryId
 * @returns {{ id: string, label: string, icon: string }}
 */
export function getCategoryPresentation(categoryId) {
  if (!categoryId) {
    return { id: "", label: "", icon: "" };
  }

  const known = configById.get(categoryId);
  if (known) {
    return { ...known };
  }

  return { id: categoryId, label: categoryId, icon: "" };
}
