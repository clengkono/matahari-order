/**
 * Curated homepage category order and presentation (Stage 2A / 2B / 5B.2A).
 *
 * Canonical `id` values must match product.category on assembled products.
 * Icons/labels are presentation only — filtering always uses `id`.
 *
 * `searchTerms` are exact normalized query synonyms used for global
 * category-discovery chips (Stage 2B). They are NOT product aliases.
 *
 * This file is the authoritative customer-facing taxonomy. Studio reads
 * CURATED_CATEGORY_IDS from here — do not duplicate the list elsewhere.
 *
 * Categories with zero active products are hidden at render time.
 * Unknown future catalogue categories are appended after this list.
 *
 * There is no Lainnya catch-all.
 */

import { normalizeSearchText } from "../utils/productSearch.js";

export const CATEGORY_CONFIG = [
  {
    id: "Makanan Ringan",
    label: "Makanan Ringan",
    icon: "🍪",
    searchTerms: ["makanan ringan", "cemilan", "snack"],
  },
  {
    id: "Bahan Makanan",
    label: "Bahan Makanan",
    icon: "🍳",
    searchTerms: [
      "bahan makanan",
      "bahan",
      "bumbu",
      "bumbu masak",
      "bahan & bumbu masak",
    ],
  },
  {
    id: "Minuman",
    label: "Minuman",
    icon: "🥤",
    searchTerms: ["minuman"],
  },
  {
    id: "Perawatan Diri",
    label: "Perawatan Diri",
    icon: "🧼",
    searchTerms: ["perawatan diri", "perawatan"],
  },
  {
    id: "Kebutuhan Rumah",
    label: "Kebutuhan Rumah",
    icon: "🧹",
    searchTerms: ["kebutuhan rumah", "kebersihan"],
  },
  {
    id: "Alat & Perlengkapan",
    label: "Alat & Perlengkapan",
    icon: "🔧",
    searchTerms: ["alat & perlengkapan", "alat", "perlengkapan"],
  },
  {
    id: "Kesehatan",
    label: "Kesehatan",
    icon: "💊",
    searchTerms: ["kesehatan"],
  },
  {
    id: "Rokok",
    label: "Rokok",
    icon: "🚬",
    searchTerms: ["rokok"],
  },
  {
    id: "Bayi & Anak",
    label: "Bayi & Anak",
    icon: "🍼",
    searchTerms: ["bayi & anak", "bayi", "anak"],
  },
];

export const CURATED_CATEGORY_IDS = CATEGORY_CONFIG.map((entry) => entry.id);

const configById = new Map(
  CATEGORY_CONFIG.map((entry) => [entry.id, entry])
);

/**
 * Build the visible category list from active products.
 * Curated order first (only if present), then any unknown categories A–Z.
 *
 * @param {Array<{ category?: string }>} products
 * @returns {Array<{ id: string, label: string, icon: string, count: number, searchTerms?: string[] }>}
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
        searchTerms: known?.searchTerms ?? [id],
        count,
      });
    }
  }

  return visible;
}

/**
 * Presentation metadata for a canonical category id.
 * @param {string | null | undefined} categoryId
 * @returns {{ id: string, label: string, icon: string, searchTerms?: string[] }}
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

/**
 * Exact category-term match for global search discovery (Stage 2B).
 * Does not auto-navigate — caller shows a suggestion chip/card.
 *
 * Matches against:
 * - configured searchTerms
 * - canonical id / label
 *
 * Only considers categories currently visible (have products).
 *
 * @param {string} query
 * @param {Array<{ id: string, label: string, icon?: string, count: number, searchTerms?: string[] }>} visibleCategories
 * @returns {{ id: string, label: string, icon: string, count: number } | null}
 */
export function matchCategorySearchTerm(query, visibleCategories = []) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || !Array.isArray(visibleCategories)) {
    return null;
  }

  for (const category of visibleCategories) {
    const candidates = [
      category.id,
      category.label,
      ...(category.searchTerms ?? []),
    ];

    const matched = candidates.some(
      (term) => normalizeSearchText(term) === normalizedQuery
    );

    if (matched) {
      return {
        id: category.id,
        label: category.label,
        icon: category.icon ?? "",
        count: category.count,
      };
    }
  }

  return null;
}
