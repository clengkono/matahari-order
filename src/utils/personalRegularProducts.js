/**
 * Device-local "Sering Anda Pesan" derivation (Stage 7C.2).
 *
 * STORE OBSERVATIONS; DERIVE CONCLUSIONS.
 *
 * Eligibility, rank, and the personal-regular ID list are computed at
 * runtime from the 7C.1 learning profile. Nothing here is persisted.
 *
 * Cart, sales popularity, recommendations, categories, and product
 * families are not inputs.
 */

import { sanitizeLearningProfile } from "./learningProfileStorage.js";

const PERSONAL_REGULAR_MAX_WINDOW = 10;
const PERSONAL_REGULAR_MAX_RESULTS = 8;
const PERSONAL_REGULAR_MIN_OCCASIONS = 3;
const PERSONAL_REGULAR_RECENCY_INDEX_MAX = 2;

function compareProductIdAsc(left, right) {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareEligible(left, right) {
  if (left.appearances !== right.appearances) {
    return right.appearances - left.appearances;
  }

  if (left.newestAppearanceIndex !== right.newestAppearanceIndex) {
    return left.newestAppearanceIndex - right.newestAppearanceIndex;
  }

  if (left.lifetimeOrderCount !== right.lifetimeOrderCount) {
    return right.lifetimeOrderCount - left.lifetimeOrderCount;
  }

  return compareProductIdAsc(left.productId, right.productId);
}

/**
 * Ranked personal-regular product IDs from a learning profile.
 * Weak or immature evidence → [].
 *
 * @param {unknown} profile
 * @returns {string[]}
 */
export function derivePersonalRegularProductIds(profile) {
  const sanitized = sanitizeLearningProfile(profile);
  const occasions = sanitized.recentOccasions;

  if (
    sanitized.totalOrderingOccasions < PERSONAL_REGULAR_MIN_OCCASIONS ||
    occasions.length < PERSONAL_REGULAR_MIN_OCCASIONS
  ) {
    return [];
  }

  const windowSize = Math.min(
    PERSONAL_REGULAR_MAX_WINDOW,
    occasions.length,
    sanitized.totalOrderingOccasions
  );

  if (windowSize < PERSONAL_REGULAR_MIN_OCCASIONS) {
    return [];
  }

  const window = occasions.slice(0, windowSize);
  const seen = new Set();
  const productIds = [];

  for (const occasion of window) {
    for (const productId of occasion.productIds) {
      if (seen.has(productId)) {
        continue;
      }

      seen.add(productId);
      productIds.push(productId);
    }
  }

  const eligible = [];

  for (const productId of productIds) {
    let appearances = 0;
    let newestAppearanceIndex = -1;

    for (let index = 0; index < window.length; index += 1) {
      if (!window[index].productIds.includes(productId)) {
        continue;
      }

      appearances += 1;
      if (newestAppearanceIndex < 0) {
        newestAppearanceIndex = index;
      }
    }

    if (appearances < 2) {
      continue;
    }

    if (appearances * 5 < windowSize * 3) {
      continue;
    }

    if (newestAppearanceIndex > PERSONAL_REGULAR_RECENCY_INDEX_MAX) {
      continue;
    }

    eligible.push({
      productId,
      appearances,
      newestAppearanceIndex,
      lifetimeOrderCount: sanitized.products[productId]?.orderCount ?? 0,
    });
  }

  eligible.sort(compareEligible);

  return eligible
    .slice(0, PERSONAL_REGULAR_MAX_RESULTS)
    .map((item) => item.productId);
}

/**
 * Resolve ranked IDs against the current catalogue.
 * Missing IDs are skipped. Order is preserved. The profile is not modified.
 *
 * @param {unknown} productIds
 * @param {unknown} products
 * @returns {object[]}
 */
export function resolvePersonalRegularProducts(productIds, products) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return [];
  }

  const byId = new Map();

  if (Array.isArray(products)) {
    for (const product of products) {
      if (product && typeof product.id === "string") {
        byId.set(product.id, product);
      }
    }
  }

  const resolved = [];

  for (const productId of productIds) {
    const product = byId.get(productId);
    if (product) {
      resolved.push(product);
    }
  }

  return resolved;
}
