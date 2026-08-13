/**
 * Device-local draft order (Stage 3A).
 * Never transmitted — localStorage only.
 *
 * Persists cart lines and the order note. Does not persist UI state
 * (search, category, ProductInfo, Pesanan Saya open/closed).
 */

import { normalizeOneUnitPerProduct } from "./cartHelpers";

export const CART_STORAGE_KEY = "matahari-order:cart";
export const ORDER_NOTE_STORAGE_KEY = "matahari-order:order-note";

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
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
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private-mode failures — in-memory state still works.
  }
}

function removeKey(key) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore removal failures.
  }
}

/**
 * Validate one stored line against the current assembled catalogue.
 * Uses the live product name. Invalid lines return null.
 *
 * @param {unknown} line
 * @param {Map<string, object>} productById
 * @returns {{ productId: string, name: string, unit: string, quantity: number } | null}
 */
export function sanitizeStoredLine(line, productById) {
  if (line == null || typeof line !== "object") {
    return null;
  }

  const productId = line.productId;
  if (!isNonEmptyString(productId)) {
    return null;
  }

  const product = productById.get(productId);
  if (!product) {
    return null;
  }

  const availableUnits = Array.isArray(product.availableUnits)
    ? product.availableUnits
    : [];

  if (availableUnits.length === 0) {
    return null;
  }

  const unit = line.unit;
  if (!isNonEmptyString(unit) || !availableUnits.includes(unit)) {
    return null;
  }

  if (!isPositiveInteger(line.quantity)) {
    return null;
  }

  const name = isNonEmptyString(product.name) ? product.name : line.name;
  if (!isNonEmptyString(name)) {
    return null;
  }

  return {
    productId,
    name,
    unit,
    quantity: line.quantity,
  };
}

/**
 * Sanitize a stored cart value. Corrupt input → [].
 * Duplicate productIds collapse via one-product / one-unit normalization.
 *
 * @param {unknown} value
 * @param {Array<{ id: string, name: string, availableUnits: string[] }>} products
 * @returns {Array<{ productId: string, name: string, unit: string, quantity: number }>}
 */
export function sanitizeStoredCart(value, products) {
  if (!Array.isArray(value) || !Array.isArray(products)) {
    return [];
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const restored = [];

  for (const line of value) {
    const clean = sanitizeStoredLine(line, productById);
    if (clean) {
      restored.push(clean);
    }
  }

  return normalizeOneUnitPerProduct(restored).filter((line) =>
    isPositiveInteger(line.quantity)
  );
}

function serializeCart(cart) {
  return (cart ?? []).map((line) => ({
    productId: line.productId,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
  }));
}

/**
 * Load the persisted cart. Invalid / corrupt storage → [].
 *
 * @param {Array<{ id: string, name: string, availableUnits: string[] }>} products
 */
export function loadStoredCart(products) {
  const result = readJson(CART_STORAGE_KEY);
  if (!result.ok || result.value === undefined) {
    return [];
  }

  return sanitizeStoredCart(result.value, products);
}

/**
 * Persist the current cart. Empty cart writes [].
 *
 * @param {Array<{ productId: string, name: string, unit: string, quantity: number }>} cart
 */
export function saveStoredCart(cart) {
  writeJson(CART_STORAGE_KEY, serializeCart(cart));
}

export function clearStoredCart() {
  removeKey(CART_STORAGE_KEY);
}

/**
 * Load the persisted order note. Non-string / corrupt → "".
 */
export function loadStoredOrderNote() {
  const result = readJson(ORDER_NOTE_STORAGE_KEY);
  if (!result.ok || result.value === undefined) {
    return "";
  }

  if (typeof result.value !== "string") {
    return "";
  }

  return result.value;
}

/**
 * @param {string} note
 */
export function saveStoredOrderNote(note) {
  writeJson(ORDER_NOTE_STORAGE_KEY, typeof note === "string" ? note : "");
}

export function clearStoredOrderNote() {
  removeKey(ORDER_NOTE_STORAGE_KEY);
}
