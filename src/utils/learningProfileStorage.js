/**
 * Device-local learning evidence (Stage 7C.1).
 * Never transmitted — localStorage only.
 *
 * STORE OBSERVATIONS; DERIVE CONCLUSIONS.
 *
 * This is long-term behavioral evidence, not the Pesan Lagi occasion log.
 * Order history remains `matahari-order:order-history` and must not gain
 * scores, frequency fields, or recommendation state in schema v1.
 *
 * One accepted "Kirim via WhatsApp" preparation = one ordering occasion.
 * Learning means prepared-for-WhatsApp. It does not mean sent.
 *
 * Persistence errors must never block the current order or WhatsApp handoff.
 * The storage layer does not consult the live catalogue.
 */

export const LEARNING_PROFILE_STORAGE_KEY = "matahari-order:learning-profile";
export const LEARNING_PROFILE_SCHEMA_VERSION = 1;
export const LEARNING_DUPLICATE_WINDOW_MS = 45000;
export const LEARNING_MAX_RECENT_OCCASIONS = 20;
export const LEARNING_MAX_PRODUCT_OBSERVATIONS = 20;
export const LEARNING_MAX_QUANTITY = 9999;

const FINGERPRINT_FIELD_SEP = "\t";
const FINGERPRINT_LINE_SEP = "\n";

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isValidLearningQuantity(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= LEARNING_MAX_QUANTITY
  );
}

function isValidIsoTimestamp(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function resolveNow(now) {
  if (isValidIsoTimestamp(now)) {
    return now;
  }

  if (now instanceof Date && Number.isFinite(now.getTime())) {
    return now.toISOString();
  }

  if (typeof now === "number" && Number.isFinite(now)) {
    const fromNumber = new Date(now);
    if (Number.isFinite(fromNumber.getTime())) {
      return fromNumber.toISOString();
    }
  }

  return new Date().toISOString();
}

export function emptyLearningProfile() {
  return {
    schemaVersion: LEARNING_PROFILE_SCHEMA_VERSION,
    totalOrderingOccasions: 0,
    firstObservedAt: "",
    lastObservedAt: "",
    lastOccasion: null,
    recentOccasions: [],
    products: {},
  };
}

function uniqueSortedProductIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  const seen = new Set();
  const unique = [];

  for (const id of ids) {
    if (!isNonEmptyString(id) || seen.has(id)) {
      continue;
    }

    seen.add(id);
    unique.push(id);
  }

  unique.sort();
  return unique;
}

function sortNewestFirst(items, getIso) {
  return [...items].sort((left, right) => {
    return Date.parse(getIso(right)) - Date.parse(getIso(left));
  });
}

function sanitizeObservation(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (!isNonEmptyString(value.unit)) {
    return null;
  }

  if (!isValidLearningQuantity(value.quantity)) {
    return null;
  }

  if (!isValidIsoTimestamp(value.orderedAt)) {
    return null;
  }

  return {
    unit: value.unit,
    quantity: value.quantity,
    orderedAt: value.orderedAt,
  };
}

function sanitizeObservations(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = [];

  for (const item of value) {
    const observation = sanitizeObservation(item);
    if (observation) {
      cleaned.push(observation);
    }
  }

  return sortNewestFirst(cleaned, (item) => item.orderedAt).slice(
    0,
    LEARNING_MAX_PRODUCT_OBSERVATIONS
  );
}

function sanitizeRecentOccasion(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (!isValidIsoTimestamp(value.observedAt)) {
    return null;
  }

  const productIds = uniqueSortedProductIds(value.productIds);
  if (productIds.length === 0) {
    return null;
  }

  return {
    observedAt: value.observedAt,
    productIds,
  };
}

function sanitizeLastOccasion(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (!isNonEmptyString(value.fingerprint)) {
    return null;
  }

  if (!isValidIsoTimestamp(value.observedAt)) {
    return null;
  }

  return {
    fingerprint: value.fingerprint,
    observedAt: value.observedAt,
  };
}

function sanitizeProductEntry(key, value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const productId = isNonEmptyString(key)
    ? key
    : isNonEmptyString(value.productId)
      ? value.productId
      : "";

  if (!isNonEmptyString(productId)) {
    return null;
  }

  const recentObservations = sanitizeObservations(value.recentObservations);
  const lastOrderedAt = isValidIsoTimestamp(value.lastOrderedAt)
    ? value.lastOrderedAt
    : (recentObservations[0]?.orderedAt ?? "");
  const orderCount =
    Number.isSafeInteger(value.orderCount) && value.orderCount >= 0
      ? value.orderCount
      : recentObservations.length;

  const hasEvidence =
    recentObservations.length > 0 ||
    (orderCount >= 1 && isValidIsoTimestamp(lastOrderedAt));

  if (!hasEvidence) {
    return null;
  }

  return {
    productId,
    orderCount,
    lastOrderedAt,
    recentObservations,
  };
}

function sanitizeProducts(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const products = {};

  for (const [key, entry] of Object.entries(value)) {
    const clean = sanitizeProductEntry(key, entry);
    if (clean) {
      products[clean.productId] = clean;
    }
  }

  return products;
}

/**
 * Conservative structural sanitization. Does not look up the live catalogue.
 * Unknown / retired product IDs and historical unit strings are kept.
 *
 * @param {unknown} value
 */
export function sanitizeLearningProfile(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return emptyLearningProfile();
  }

  if (value.schemaVersion !== LEARNING_PROFILE_SCHEMA_VERSION) {
    return emptyLearningProfile();
  }

  const recentOccasions = sortNewestFirst(
    (Array.isArray(value.recentOccasions) ? value.recentOccasions : [])
      .map(sanitizeRecentOccasion)
      .filter(Boolean),
    (item) => item.observedAt
  ).slice(0, LEARNING_MAX_RECENT_OCCASIONS);

  const totalOrderingOccasions =
    Number.isSafeInteger(value.totalOrderingOccasions) &&
    value.totalOrderingOccasions >= 0
      ? value.totalOrderingOccasions
      : 0;

  return {
    schemaVersion: LEARNING_PROFILE_SCHEMA_VERSION,
    totalOrderingOccasions,
    firstObservedAt: isValidIsoTimestamp(value.firstObservedAt)
      ? value.firstObservedAt
      : "",
    lastObservedAt: isValidIsoTimestamp(value.lastObservedAt)
      ? value.lastObservedAt
      : "",
    lastOccasion: sanitizeLastOccasion(value.lastOccasion),
    recentOccasions,
    products: sanitizeProducts(value.products),
  };
}

/**
 * Validate cart lines, drop invalid rows, collapse duplicate product IDs
 * (first-seen unit wins, quantities sum, cap 9999), then sort by productId.
 *
 * @param {unknown} cart
 * @returns {Array<{ productId: string, unit: string, quantity: number }>}
 */
export function normalizeOccasionLines(cart) {
  if (!Array.isArray(cart)) {
    return [];
  }

  const collapsed = [];
  const indexByProductId = new Map();

  for (const line of cart) {
    if (line == null || typeof line !== "object") {
      continue;
    }

    const productId = line.productId;
    const unit = line.unit;

    if (!isNonEmptyString(productId) || !isNonEmptyString(unit)) {
      continue;
    }

    if (!isValidLearningQuantity(line.quantity)) {
      continue;
    }

    const existingIndex = indexByProductId.get(productId);
    if (existingIndex === undefined) {
      indexByProductId.set(productId, collapsed.length);
      collapsed.push({
        productId,
        unit,
        quantity: line.quantity,
      });
      continue;
    }

    const existing = collapsed[existingIndex];
    collapsed[existingIndex] = {
      ...existing,
      quantity: Math.min(
        LEARNING_MAX_QUANTITY,
        existing.quantity + line.quantity
      ),
    };
  }

  collapsed.sort((left, right) =>
    left.productId < right.productId
      ? -1
      : left.productId > right.productId
        ? 1
        : 0
  );

  return collapsed;
}

/**
 * Canonical deterministic fingerprint. No crypto.
 * Each line is productId<TAB>unit<TAB>quantity, joined by newline.
 *
 * @param {Array<{ productId: string, unit: string, quantity: number }>} lines
 */
export function buildOccasionFingerprint(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map(
      (line) =>
        `${line.productId}${FINGERPRINT_FIELD_SEP}${line.unit}${FINGERPRINT_FIELD_SEP}${line.quantity}`
    )
    .join(FINGERPRINT_LINE_SEP);
}

function shouldSuppressDuplicate(lastOccasion, fingerprint, nowIso) {
  if (!lastOccasion || lastOccasion.fingerprint !== fingerprint) {
    return false;
  }

  const lastMs = Date.parse(lastOccasion.observedAt);
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  const delta = nowMs - lastMs;
  if (delta < 0) {
    return false;
  }

  return delta <= LEARNING_DUPLICATE_WINDOW_MS;
}

/**
 * Pure learning update. Does not persist.
 *
 * @param {unknown} profile
 * @param {{ cart?: unknown, now?: string | number | Date }} [input]
 * @returns {{ profile: object, status: "recorded" | "suppressed" | "skipped" }}
 */
export function applyOrderingOccasion(profile, { cart, now } = {}) {
  const current = sanitizeLearningProfile(profile);
  const lines = normalizeOccasionLines(cart);

  if (lines.length === 0) {
    return { profile: current, status: "skipped" };
  }

  const timestamp = resolveNow(now);
  const fingerprint = buildOccasionFingerprint(lines);

  if (shouldSuppressDuplicate(current.lastOccasion, fingerprint, timestamp)) {
    return {
      profile: {
        ...current,
        lastOccasion: {
          fingerprint,
          observedAt: timestamp,
        },
      },
      status: "suppressed",
    };
  }

  const productIds = lines.map((line) => line.productId);
  const recentOccasions = [
    {
      observedAt: timestamp,
      productIds,
    },
    ...current.recentOccasions,
  ].slice(0, LEARNING_MAX_RECENT_OCCASIONS);

  const products = { ...current.products };

  for (const line of lines) {
    const existing = products[line.productId];
    const recentObservations = [
      {
        unit: line.unit,
        quantity: line.quantity,
        orderedAt: timestamp,
      },
      ...(existing?.recentObservations ?? []),
    ].slice(0, LEARNING_MAX_PRODUCT_OBSERVATIONS);

    products[line.productId] = {
      productId: line.productId,
      orderCount: (existing?.orderCount ?? 0) + 1,
      lastOrderedAt: timestamp,
      recentObservations,
    };
  }

  return {
    profile: {
      schemaVersion: LEARNING_PROFILE_SCHEMA_VERSION,
      totalOrderingOccasions: current.totalOrderingOccasions + 1,
      firstObservedAt: current.firstObservedAt || timestamp,
      lastObservedAt: timestamp,
      lastOccasion: {
        fingerprint,
        observedAt: timestamp,
      },
      recentOccasions,
      products,
    },
    status: "recorded",
  };
}

function getLocalStorage() {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    return localStorage;
  } catch {
    return null;
  }
}

function readJson(key) {
  const storage = getLocalStorage();
  if (!storage) {
    return { ok: false };
  }

  try {
    const raw = storage.getItem(key);
    if (raw == null || raw === "") {
      return { ok: true, value: undefined };
    }

    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function writeJson(key, value) {
  const storage = getLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function serializeObservation(observation) {
  return {
    unit: observation.unit,
    quantity: observation.quantity,
    orderedAt: observation.orderedAt,
  };
}

function serializeProductEntry(entry) {
  return {
    productId: entry.productId,
    orderCount: entry.orderCount,
    lastOrderedAt: entry.lastOrderedAt,
    recentObservations: (entry.recentObservations ?? []).map(serializeObservation),
  };
}

function serializeLearningProfile(profile) {
  const products = {};

  for (const [productId, entry] of Object.entries(profile.products ?? {})) {
    products[productId] = serializeProductEntry(entry);
  }

  return {
    schemaVersion: LEARNING_PROFILE_SCHEMA_VERSION,
    totalOrderingOccasions: profile.totalOrderingOccasions,
    firstObservedAt: profile.firstObservedAt,
    lastObservedAt: profile.lastObservedAt,
    lastOccasion: profile.lastOccasion
      ? {
          fingerprint: profile.lastOccasion.fingerprint,
          observedAt: profile.lastOccasion.observedAt,
        }
      : null,
    recentOccasions: (profile.recentOccasions ?? []).map((occasion) => ({
      observedAt: occasion.observedAt,
      productIds: [...occasion.productIds],
    })),
    products,
  };
}

function persistLearningProfile(profile) {
  return writeJson(
    LEARNING_PROFILE_STORAGE_KEY,
    serializeLearningProfile(sanitizeLearningProfile(profile))
  );
}

/**
 * Load sanitized learning profile.
 * Corrupt / missing / unsupported schema → empty profile.
 * Does not require the live catalogue. Never throws.
 */
export function loadLearningProfile() {
  try {
    const result = readJson(LEARNING_PROFILE_STORAGE_KEY);
    if (!result.ok || result.value === undefined) {
      return emptyLearningProfile();
    }

    return sanitizeLearningProfile(result.value);
  } catch {
    return emptyLearningProfile();
  }
}

/**
 * Record one prepared-for-WhatsApp ordering occasion.
 *
 * Contract: never throws. Persistence failure is independent of
 * order-history persistence and must not block WhatsApp.
 *
 * @param {{ cart?: unknown, now?: string | number | Date }} [input]
 * @returns {{ ok: boolean, status: "recorded" | "suppressed" | "skipped" }}
 */
export function recordOrderingOccasion({ cart, now } = {}) {
  try {
    const applied = applyOrderingOccasion(loadLearningProfile(), { cart, now });

    if (applied.status === "skipped") {
      return { ok: false, status: "skipped" };
    }

    const written = persistLearningProfile(applied.profile);
    return { ok: written, status: applied.status };
  } catch {
    return { ok: false, status: "skipped" };
  }
}

/**
 * Infrastructure / test support only. Not connected to customer UI.
 *
 * @returns {boolean}
 */
export function clearLearningProfile() {
  try {
    const storage = getLocalStorage();
    if (!storage) {
      return false;
    }

    storage.removeItem(LEARNING_PROFILE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
