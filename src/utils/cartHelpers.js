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
 * Formats cart lines for WhatsApp export (Release 0.5).
 * Example output:
 *   2 Dus Glory
 *   3 Bungkus Masako
 */
export function formatCartForWhatsApp(cart) {
  return cart
    .map((line) => `${line.quantity} ${line.unit} ${line.name}`)
    .join("\n");
}
