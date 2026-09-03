/**
 * Stage 7B.3 — restore a prepared-for-whatsapp history record into
 * the current cart shape. Catalogue membership is decided here, not
 * in storage sanitization.
 *
 * Never substitutes defaultUnit. Never converts quantities.
 * Never claims the WhatsApp message was sent.
 */

import { normalizeOneUnitPerProduct } from "./cartHelpers.js";
import { isValidHistoryQuantity } from "./orderHistoryStorage.js";

export const HOMEPAGE_HISTORY_LIMIT = 3;

export const RESTORE_SKIP_REASONS = Object.freeze({
  missingProduct: "missing-product",
  unavailableUnit: "unavailable-unit",
  invalidQuantity: "invalid-quantity",
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function productMap(products) {
  const map = new Map();
  if (!Array.isArray(products)) {
    return map;
  }

  for (const product of products) {
    if (product?.id) {
      map.set(product.id, product);
    }
  }

  return map;
}

function liveProductName(line, productById) {
  const product = productById.get(line?.productId);
  if (isNonEmptyString(product?.name)) {
    return product.name;
  }

  return isNonEmptyString(line?.nameAtSave) ? line.nameAtSave : "";
}

/**
 * Restore historical lines against the live customer catalogue.
 *
 * @param {object | null} order
 * @param {Array<{ id: string, name: string, availableUnits?: string[] }>} products
 */
export function restoreOrderFromHistory(order, products) {
  const historicalLines = Array.isArray(order?.lines) ? order.lines : [];
  const productById = productMap(products);
  const restored = [];
  const skipped = [];

  for (const line of historicalLines) {
    const productId = line?.productId;
    const nameAtSave = isNonEmptyString(line?.nameAtSave) ? line.nameAtSave : "";

    if (!isNonEmptyString(productId)) {
      skipped.push({
        productId: "",
        nameAtSave,
        reason: RESTORE_SKIP_REASONS.missingProduct,
      });
      continue;
    }

    const product = productById.get(productId);
    if (!product) {
      skipped.push({
        productId,
        nameAtSave,
        reason: RESTORE_SKIP_REASONS.missingProduct,
      });
      continue;
    }

    if (!isValidHistoryQuantity(line?.quantity)) {
      skipped.push({
        productId,
        nameAtSave: nameAtSave || product.name || "",
        reason: RESTORE_SKIP_REASONS.invalidQuantity,
      });
      continue;
    }

    const availableUnits = Array.isArray(product.availableUnits)
      ? product.availableUnits
      : [];

    if (!isNonEmptyString(line?.unit) || !availableUnits.includes(line.unit)) {
      skipped.push({
        productId,
        nameAtSave: nameAtSave || product.name || "",
        reason: RESTORE_SKIP_REASONS.unavailableUnit,
      });
      continue;
    }

    const name = isNonEmptyString(product.name) ? product.name : "";
    if (!name) {
      skipped.push({
        productId,
        nameAtSave,
        reason: RESTORE_SKIP_REASONS.missingProduct,
      });
      continue;
    }

    restored.push({
      productId,
      name,
      unit: line.unit,
      quantity: line.quantity,
    });
  }

  const lines = normalizeOneUnitPerProduct(restored);

  return {
    lines,
    note: typeof order?.note === "string" ? order.note : "",
    restoredCount: lines.length,
    skipped,
    historicalLineCount: historicalLines.length,
  };
}

/**
 * Decide whether Pesan Lagi may apply, must confirm, or must stop.
 * Does not mutate cart or history.
 *
 * @param {{ currentLineCount?: number, restoredCount?: number, confirmed?: boolean }} input
 */
export function decideRestoreAction({
  currentLineCount = 0,
  restoredCount = 0,
  confirmed = false,
} = {}) {
  if (!Number.isSafeInteger(restoredCount) || restoredCount < 1) {
    return { action: "blocked" };
  }

  if (
    Number.isSafeInteger(currentLineCount) &&
    currentLineCount > 0 &&
    !confirmed
  ) {
    return { action: "confirm" };
  }

  return { action: "apply" };
}

export function getHomepageHistoryOrders(
  orders,
  limit = HOMEPAGE_HISTORY_LIMIT
) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  return orders.slice(0, limit);
}

export function getHistoryProductLineCount(order) {
  return Array.isArray(order?.lines) ? order.lines.length : 0;
}

/**
 * Card names: live catalogue name when the product exists, else nameAtSave.
 */
export function getHistoryCardPreview(order, products, maxNames = 2) {
  const productById = productMap(products);
  const lines = Array.isArray(order?.lines) ? order.lines : [];
  const names = [];

  for (const line of lines) {
    const name = liveProductName(line, productById);
    if (name) {
      names.push(name);
    }
  }

  const shown = names.slice(0, maxNames);
  return {
    productCount: lines.length,
    names: shown,
    extraCount: Math.max(0, names.length - shown.length),
  };
}

export function formatHistoryCardDate(iso, now = new Date()) {
  if (!isNonEmptyString(iso)) {
    return "";
  }

  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) {
    return "";
  }

  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(":", ".");

  const startOfToday = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate()
  );
  const startOfTarget = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const dayDiff = Math.round((startOfToday - startOfTarget) / 86_400_000);

  if (dayDiff === 0) {
    return `Hari ini, ${time}`;
  }

  if (dayDiff === 1) {
    return `Kemarin, ${time}`;
  }

  const dayMonth = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(date);

  return `${dayMonth}, ${time}`;
}

export function formatReplaceCartBody(currentLineCount) {
  const count = Number.isSafeInteger(currentLineCount) ? currentLineCount : 0;
  return `Pesan Lagi akan mengganti ${count} produk yang sudah ada di pesanan.`;
}

export function formatAllSkippedRestoreMessage() {
  return "Pesanan lama ini tidak dapat digunakan karena produknya atau satuannya sudah tidak tersedia.";
}

export function formatRestoreNotice(result) {
  if (!result || result.restoredCount < 1) {
    return formatAllSkippedRestoreMessage();
  }

  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  if (skipped.length === 0) {
    return result.restoredCount === 1
      ? "1 produk dari pesanan sebelumnya dimuat."
      : `${result.restoredCount} produk dari pesanan sebelumnya dimuat.`;
  }

  const attempted =
    Number.isSafeInteger(result.historicalLineCount) &&
    result.historicalLineCount > 0
      ? result.historicalLineCount
      : result.restoredCount + skipped.length;
  const skippedLabel =
    skipped.length === 1
      ? "1 produk tidak tersedia"
      : `${skipped.length} produk tidak tersedia`;
  const named = skipped
    .map((row) => row.nameAtSave)
    .filter(isNonEmptyString)
    .slice(0, 2);
  const namesSuffix = named.length > 0 ? `: ${named.join(", ")}` : "";

  return `${result.restoredCount} dari ${attempted} produk berhasil dimuat. ${skippedLabel}${namesSuffix}.`;
}
