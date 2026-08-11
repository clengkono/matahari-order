/**
 * Device-local recent search history (Release 0.10).
 * Never transmitted — localStorage only.
 */

import { normalizeSearchText } from "./productSearch";

export const RECENT_SEARCHES_KEY = "matahari-order:recent-searches";
export const MAX_RECENT_SEARCHES = 5;

/**
 * Sanitize a stored list into newest-first unique normalized queries.
 * @param {unknown} value
 * @returns {string[]}
 */
function sanitizeRecentList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = [];
  const seen = new Set();

  for (const item of value) {
    if (typeof item !== "string" && typeof item !== "number") {
      continue;
    }

    const normalized = normalizeSearchText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    cleaned.push(normalized);

    if (cleaned.length >= MAX_RECENT_SEARCHES) {
      break;
    }
  }

  return cleaned;
}

/**
 * Load recent searches from localStorage.
 * Corrupt / invalid data falls back to [].
 * @returns {string[]}
 */
export function loadRecentSearches() {
  try {
    if (typeof localStorage === "undefined") {
      return [];
    }

    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (raw == null || raw === "") {
      return [];
    }

    return sanitizeRecentList(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Persist recent searches. Failures (quota, private mode) are ignored.
 * @param {string[]} searches
 */
export function persistRecentSearches(searches) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(sanitizeRecentList(searches))
    );
  } catch {
    // Ignore storage failures — in-memory state still works for the session.
  }
}

/**
 * Remember a completed/meaningful search.
 * Newest first, case-insensitive dedupe via normalizeSearchText, max 5.
 *
 * @param {string} query
 * @param {string[]} [current]
 * @returns {string[]}
 */
export function rememberRecentSearch(query, current = loadRecentSearches()) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return sanitizeRecentList(current);
  }

  const next = [
    normalized,
    ...sanitizeRecentList(current).filter((item) => item !== normalized),
  ].slice(0, MAX_RECENT_SEARCHES);

  persistRecentSearches(next);
  return next;
}

/**
 * Clear only search history (not cart / favourites / catalogue).
 * @returns {string[]}
 */
export function clearRecentSearches() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    }
  } catch {
    // Ignore removal failures.
  }

  return [];
}
