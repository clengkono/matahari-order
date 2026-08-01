/**
 * Cart line item shape:
 * { productId: number, name: string, unit: string, quantity: number }
 *
 * Uniqueness is determined by productId + unit (see master spec §10).
 */

export function getCartLineKey(productId, unit) {
  return `${productId}::${unit}`;
}

export function findCartLine(cart, productId, unit) {
  const key = getCartLineKey(productId, unit);
  return cart.find((line) => getCartLineKey(line.productId, line.unit) === key);
}

export function calculateCartCount(cart) {
  return cart.reduce((total, line) => total + line.quantity, 0);
}

export function addOrMergeLine(cart, newLine) {
  const existing = findCartLine(cart, newLine.productId, newLine.unit);

  if (existing) {
    return cart.map((line) =>
      getCartLineKey(line.productId, line.unit) ===
      getCartLineKey(newLine.productId, newLine.unit)
        ? { ...line, quantity: line.quantity + newLine.quantity }
        : line
    );
  }

  return [...cart, { ...newLine }];
}

export function removeLine(cart, productId, unit) {
  const key = getCartLineKey(productId, unit);
  return cart.filter(
    (line) => getCartLineKey(line.productId, line.unit) !== key
  );
}

export function updateLineQuantity(cart, productId, unit, quantity) {
  if (quantity < 1) {
    return removeLine(cart, productId, unit);
  }

  const key = getCartLineKey(productId, unit);

  return cart.map((line) =>
    getCartLineKey(line.productId, line.unit) === key
      ? { ...line, quantity }
      : line
  );
}

/**
 * Changes the unit on an existing cart line in place.
 * If the target unit already exists for the same product, quantities merge
 * and the old line is removed.
 */
export function changeLineUnit(cart, productId, oldUnit, newUnit) {
  if (oldUnit === newUnit) {
    return cart;
  }

  const oldLine = findCartLine(cart, productId, oldUnit);

  if (!oldLine) {
    return cart;
  }

  const existingWithNewUnit = findCartLine(cart, productId, newUnit);

  if (existingWithNewUnit) {
    const oldKey = getCartLineKey(productId, oldUnit);
    const newKey = getCartLineKey(productId, newUnit);

    return cart
      .filter((line) => getCartLineKey(line.productId, line.unit) !== oldKey)
      .map((line) =>
        getCartLineKey(line.productId, line.unit) === newKey
          ? { ...line, quantity: line.quantity + oldLine.quantity }
          : line
      );
  }

  const oldKey = getCartLineKey(productId, oldUnit);

  return cart.map((line) =>
    getCartLineKey(line.productId, line.unit) === oldKey
      ? { ...line, unit: newUnit }
      : line
  );
}
