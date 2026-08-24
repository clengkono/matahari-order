/**
 * Cart line item shape:
 * { productId: string, name: string, unit: string, quantity: number }
 *
 * Uniqueness is determined by productId only — one active unit per product.
 */

export function findProductLine(cart, productId) {
  return (cart ?? []).find((line) => line.productId === productId);
}

/** @deprecated Prefer findProductLine; kept for call sites that still pass unit. */
export function findCartLine(cart, productId, unit) {
  const byProduct = findProductLine(cart, productId);
  if (!byProduct) {
    return undefined;
  }
  if (unit == null || byProduct.unit === unit) {
    return byProduct;
  }
  return undefined;
}

export function calculateCartCount(cart) {
  return (cart ?? []).reduce((total, line) => total + line.quantity, 0);
}

/**
 * Collapse legacy multi-unit lines for the same product into one line.
 * Rule: keep the first-seen unit, sum all quantities for that productId.
 * Quantities are never dropped.
 */
export function normalizeOneUnitPerProduct(cart) {
  const result = [];
  const indexByProductId = new Map();

  for (const line of cart ?? []) {
    if (!line?.productId) {
      continue;
    }

    const existingIndex = indexByProductId.get(line.productId);

    if (existingIndex === undefined) {
      indexByProductId.set(line.productId, result.length);
      result.push({
        productId: line.productId,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
      });
      continue;
    }

    const existing = result[existingIndex];
    result[existingIndex] = {
      ...existing,
      name: line.name || existing.name,
      quantity: existing.quantity + line.quantity,
    };
  }

  return result;
}

/**
 * Add to cart under the one-product / one-unit rule.
 *
 * @param {object} [options]
 * @param {boolean} [options.replaceUnit=false]
 *   false (quick-add): if product exists, add qty and keep the customer's unit
 *   true (explicit unit): if product exists, set unit to newLine.unit and add qty
 */
export function addOrMergeLine(cart, newLine, { replaceUnit = false } = {}) {
  const normalized = normalizeOneUnitPerProduct(cart);
  const existing = findProductLine(normalized, newLine.productId);

  if (existing) {
    return normalized.map((line) =>
      line.productId === newLine.productId
        ? {
            ...line,
            name: newLine.name || line.name,
            unit: replaceUnit ? newLine.unit : line.unit,
            quantity: line.quantity + newLine.quantity,
          }
        : line
    );
  }

  return [
    ...normalized,
    {
      productId: newLine.productId,
      name: newLine.name,
      unit: newLine.unit,
      quantity: newLine.quantity,
    },
  ];
}

export function removeLine(cart, productId) {
  return normalizeOneUnitPerProduct(cart).filter(
    (line) => line.productId !== productId
  );
}

/** Removes the single cart line for a product. */
export function removeProductLines(cart, productId) {
  return normalizeOneUnitPerProduct(cart).filter(
    (line) => line.productId !== productId
  );
}

export function updateLineQuantity(cart, productId, quantity) {
  const normalized = normalizeOneUnitPerProduct(cart);

  if (quantity < 1) {
    return removeProductLines(normalized, productId);
  }

  return normalized.map((line) =>
    line.productId === productId ? { ...line, quantity } : line
  );
}

/**
 * Changes the active unit on a product's single cart line.
 * Quantity is preserved. With one line per product there is no merge collision.
 */
export function changeLineUnit(cart, productId, oldUnit, newUnit) {
  if (oldUnit === newUnit) {
    return normalizeOneUnitPerProduct(cart);
  }

  const normalized = normalizeOneUnitPerProduct(cart);
  const existing = findProductLine(normalized, productId);

  if (!existing) {
    return normalized;
  }

  return normalized.map((line) =>
    line.productId === productId ? { ...line, unit: newUnit } : line
  );
}

export { getCartUnitDisplayLabel } from "./unitDisplay";
