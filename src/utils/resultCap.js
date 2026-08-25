/**
 * Search and category list rendering caps (Stage 5B.2A).
 *
 * Matching, ranking, recommendations, and category membership still run
 * over the full result set. These helpers only limit how many rows mount.
 *
 * Virtualization was not added: a "Tampilkan lainnya" batch is enough for
 * the current ordering UI, keeps the bundle dependency-free, and avoids
 * changing scroll/focus behaviour on small phones.
 */

export const SEARCH_RESULT_PAGE_SIZE = 20;
export const CATEGORY_RESULT_PAGE_SIZE = 24;

/**
 * Initial visible row count for the current search/category mode.
 * Searching is always the search page size, including category-scoped search.
 */
export function initialVisibleLimit({ isSearching, isCategoryMode } = {}) {
  if (isSearching) {
    return SEARCH_RESULT_PAGE_SIZE;
  }

  if (isCategoryMode) {
    return CATEGORY_RESULT_PAGE_SIZE;
  }

  return SEARCH_RESULT_PAGE_SIZE;
}

export function nextVisibleLimit(currentLimit, pageSize) {
  const current = Number(currentLimit);
  const size = Number(pageSize);
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
  const safeSize =
    Number.isFinite(size) && size > 0 ? size : SEARCH_RESULT_PAGE_SIZE;
  return safeCurrent + safeSize;
}

export function visibleItems(items, limit) {
  if (!Array.isArray(items)) {
    return [];
  }

  const safeLimit = Number(limit);
  if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
    return [];
  }

  return items.slice(0, safeLimit);
}

export function remainingItemCount(total, visibleCount) {
  const safeTotal = Number(total);
  const safeVisible = Number(visibleCount);
  const totalCount = Number.isFinite(safeTotal) ? Math.max(0, safeTotal) : 0;
  const shown = Number.isFinite(safeVisible) ? Math.max(0, safeVisible) : 0;
  return Math.max(0, totalCount - shown);
}
