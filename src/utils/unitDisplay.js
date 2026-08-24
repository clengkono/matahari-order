/**
 * Customer-facing unit labels.
 * Canonical unit names/IDs stay unchanged; this is display-only.
 */

const SHORT_UNIT_LABELS = {
  Bungkus: "Bks",
};

/**
 * Lowercase the first alphabetic letter of a unit label.
 * "Slof" → "slof"
 * "½ Slof" → "½ slof"
 * "5 Bungkus" → "5 bungkus"
 */
export function lowercaseUnitLabel(label) {
  if (label == null || label === "") {
    return label;
  }

  return String(label).replace(/\p{L}/u, (letter) =>
    letter.toLocaleLowerCase("id-ID")
  );
}

function applyShortUnitLabel(unit) {
  if (unit == null || unit === "") {
    return unit;
  }

  return SHORT_UNIT_LABELS[unit] ?? unit;
}

/** UI display label: existing short forms, then lowercase first letter. */
export function getCartUnitDisplayLabel(unit) {
  return lowercaseUnitLabel(applyShortUnitLabel(unit));
}

export function formatUnitQuantity(quantity, unit) {
  return `${quantity} ${getCartUnitDisplayLabel(unit)}`;
}
