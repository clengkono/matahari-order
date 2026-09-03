/**
 * Device-local previous-order snapshots (Stage 7B.2).
 * Never transmitted — localStorage only.
 *
 * A record means "this basket was prepared for WhatsApp".
 * It does not mean the message was sent, received, or completed.
 *
 * History is a convenience feature. Persistence errors must never
 * block the current order or the WhatsApp handoff.
 *
 * Storage sanitizes structure only. Catalogue membership is a restore
 * concern (Stage 7B.3), not a storage concern.
 *
 * Identical baskets are stored as separate records. No deduplication.
 */

export const ORDER_HISTORY_STORAGE_KEY = "matahari-order:order-history";
export const ORDER_HISTORY_SCHEMA_VERSION = 1;
export const ORDER_HISTORY_MAX_RECORDS = 10;
export const ORDER_HISTORY_SOURCE = "prepared-for-whatsapp";
export const ORDER_HISTORY_MAX_QUANTITY = 9999;

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function isValidHistoryQuantity(value) {
  return (
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= ORDER_HISTORY_MAX_QUANTITY
  );
}

function isValidHistoryId(value) {
  return typeof value === "string" && value.startsWith("oh_") && value.length > 3;
}

function isValidIsoTimestamp(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function emptyStore() {
  return {
    schemaVersion: ORDER_HISTORY_SCHEMA_VERSION,
    orders: [],
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
    // Ignore quota / private-mode failures — ordering still works.
    return false;
  }
}

export function createHistoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `oh_${crypto.randomUUID()}`;
  }

  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 12);
  return `oh_${time}_${random}`;
}

/**
 * Structural line sanitizer. Does not look up the live catalogue.
 *
 * @param {unknown} line
 * @returns {{ productId: string, quantity: number, unit: string, nameAtSave: string } | null}
 */
export function sanitizeHistoryLine(line) {
  if (line == null || typeof line !== "object") {
    return null;
  }

  const productId = line.productId;
  const unit = line.unit;
  const nameAtSave =
    typeof line.nameAtSave === "string"
      ? line.nameAtSave
      : typeof line.name === "string"
        ? line.name
        : "";

  if (!isNonEmptyString(productId)) {
    return null;
  }

  if (!isNonEmptyString(unit)) {
    return null;
  }

  if (!isNonEmptyString(nameAtSave)) {
    return null;
  }

  if (!isValidHistoryQuantity(line.quantity)) {
    return null;
  }

  return {
    productId,
    quantity: line.quantity,
    unit,
    nameAtSave,
  };
}

function sanitizeHistoryLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }

  const cleaned = [];

  for (const line of lines) {
    const clean = sanitizeHistoryLine(line);
    if (clean) {
      cleaned.push(clean);
    }
  }

  return cleaned;
}

/**
 * @param {unknown} record
 * @returns {object | null}
 */
export function sanitizeHistoryRecord(record) {
  if (record == null || typeof record !== "object") {
    return null;
  }

  if (!isValidHistoryId(record.id)) {
    return null;
  }

  if (!isValidIsoTimestamp(record.createdAt)) {
    return null;
  }

  if (record.source !== ORDER_HISTORY_SOURCE) {
    return null;
  }

  const lines = sanitizeHistoryLines(record.lines);
  if (lines.length === 0) {
    return null;
  }

  const lastUsedAt = isValidIsoTimestamp(record.lastUsedAt)
    ? record.lastUsedAt
    : record.createdAt;

  return {
    id: record.id,
    createdAt: record.createdAt,
    lastUsedAt,
    source: ORDER_HISTORY_SOURCE,
    note: typeof record.note === "string" ? record.note : "",
    lines,
  };
}

/**
 * Newest createdAt first. Stable for equal timestamps.
 * Drops records beyond the retention cap. Does not compare baskets.
 *
 * @param {object[]} orders
 * @param {number} [limit]
 */
export function retainNewestOrders(orders, limit = ORDER_HISTORY_MAX_RECORDS) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const ranked = [...orders].sort((left, right) => {
    const rightTime = Date.parse(right.createdAt);
    const leftTime = Date.parse(left.createdAt);
    return rightTime - leftTime;
  });

  return ranked.slice(0, limit);
}

/**
 * @param {unknown} value
 */
export function sanitizeOrderHistoryStore(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return emptyStore();
  }

  if (value.schemaVersion !== ORDER_HISTORY_SCHEMA_VERSION) {
    return emptyStore();
  }

  if (!Array.isArray(value.orders)) {
    return emptyStore();
  }

  const orders = [];

  for (const record of value.orders) {
    const clean = sanitizeHistoryRecord(record);
    if (clean) {
      orders.push(clean);
    }
  }

  return {
    schemaVersion: ORDER_HISTORY_SCHEMA_VERSION,
    orders: retainNewestOrders(orders),
  };
}

/**
 * Pure snapshot builder. Returns null when no valid lines exist.
 *
 * @param {object} [options]
 * @param {Array<{ productId?: string, name?: string, nameAtSave?: string, unit?: string, quantity?: number }>} [options.cart]
 * @param {string} [options.note]
 * @param {string} [options.now]
 * @param {string} [options.id]
 */
export function createOrderHistoryRecord({
  cart = [],
  note = "",
  now,
  id,
} = {}) {
  const lines = sanitizeHistoryLines(
    (cart ?? []).map((line) => ({
      productId: line?.productId,
      quantity: line?.quantity,
      unit: line?.unit,
      nameAtSave: line?.nameAtSave ?? line?.name,
    }))
  );

  if (lines.length === 0) {
    return null;
  }

  const timestamp = isValidIsoTimestamp(now) ? now : new Date().toISOString();
  const historyId = isValidHistoryId(id) ? id : createHistoryId();

  return {
    id: historyId,
    createdAt: timestamp,
    lastUsedAt: timestamp,
    source: ORDER_HISTORY_SOURCE,
    note: typeof note === "string" ? note : "",
    lines,
  };
}

/**
 * Prepends a record and keeps the newest 10 by createdAt.
 * Identical baskets are kept as separate records.
 *
 * @param {unknown} store
 * @param {unknown} record
 */
export function appendOrderHistoryRecord(store, record) {
  const sanitizedStore = sanitizeOrderHistoryStore(store);
  const clean = sanitizeHistoryRecord(record);

  if (!clean) {
    return sanitizedStore;
  }

  return {
    schemaVersion: ORDER_HISTORY_SCHEMA_VERSION,
    orders: retainNewestOrders([clean, ...sanitizedStore.orders]),
  };
}

function serializeHistoryRecord(record) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    source: record.source,
    note: record.note,
    lines: record.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unit: line.unit,
      nameAtSave: line.nameAtSave,
    })),
  };
}

function loadOrderHistoryStore() {
  const result = readJson(ORDER_HISTORY_STORAGE_KEY);
  if (!result.ok || result.value === undefined) {
    return emptyStore();
  }

  return sanitizeOrderHistoryStore(result.value);
}

function persistOrderHistoryStore(store) {
  return writeJson(ORDER_HISTORY_STORAGE_KEY, {
    schemaVersion: ORDER_HISTORY_SCHEMA_VERSION,
    orders: (store.orders ?? []).map(serializeHistoryRecord),
  });
}

/**
 * Load sanitized history. Corrupt / missing / unsupported schema → [].
 * Does not require the live catalogue.
 */
export function loadOrderHistory() {
  try {
    return loadOrderHistoryStore().orders;
  } catch {
    return [];
  }
}

/**
 * Snapshot the current cart + note as a prepared-for-whatsapp record.
 *
 * Contract: never throws. Persistence failure is ignored so WhatsApp
 * handoff can continue. Empty or unsanitizable carts are skipped.
 *
 * @param {{ cart?: object[], note?: string }} [input]
 * @returns {{ ok: boolean, record?: object }}
 */
export function saveOrderHistorySnapshot({ cart, note } = {}) {
  try {
    const record = createOrderHistoryRecord({ cart, note });
    if (!record) {
      return { ok: false };
    }

    const next = appendOrderHistoryRecord(loadOrderHistoryStore(), record);
    persistOrderHistoryStore(next);
    return { ok: true, record };
  } catch {
    return { ok: false };
  }
}

/**
 * Update lastUsedAt on one existing record. Does not change createdAt,
 * lines, note, source, or createdAt ordering. Persistence failure is ignored.
 *
 * @param {string} historyId
 * @param {string} [now]
 * @returns {{ ok: boolean, record?: object }}
 */
export function touchHistoryLastUsedAt(historyId, now) {
  try {
    if (!isValidHistoryId(historyId)) {
      return { ok: false };
    }

    const timestamp = isValidIsoTimestamp(now) ? now : new Date().toISOString();
    const store = loadOrderHistoryStore();
    let updated = null;

    const orders = store.orders.map((record) => {
      if (record.id !== historyId) {
        return record;
      }

      updated = {
        ...record,
        lastUsedAt: timestamp,
      };
      return updated;
    });

    if (!updated) {
      return { ok: false };
    }

    persistOrderHistoryStore({
      schemaVersion: ORDER_HISTORY_SCHEMA_VERSION,
      orders: retainNewestOrders(orders),
    });
    return { ok: true, record: updated };
  } catch {
    return { ok: false };
  }
}
