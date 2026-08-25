/**
 * Assemble customer-visible products from the authoritative six-file catalogue.
 *
 * Used by the customer-catalogue generator (scripts/buildCustomerCatalog.js).
 * The customer app must not import this module — it would pull variants.json
 * and units.json into the production bundle. Runtime reads
 * src/catalog/generated/customerCatalog.json instead.
 *
 * Do not add static JSON imports here.
 */

function isUnitActive(unit) {
  return !unit || unit.active !== false;
}

/**
 * Assembles the customer-facing product list from catalogue JSON.
 * Shape matches the previous demo products.js records.
 * Only active units are exposed to the ordering UI.
 */
export function assembleProducts({
  products = [],
  variants = [],
  units = [],
} = {}) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return variants.map((variant) => {
    const product = productById.get(variant.productId);

    const availableUnits = (variant.availableUnitIds ?? [])
      .map((unitId) => unitById.get(unitId))
      .filter((unit) => unit && isUnitActive(unit))
      .map((unit) => unit.name);

    const defaultUnitRecord = unitById.get(variant.defaultUnitId);
    const defaultUnit = defaultUnitRecord
      ? defaultUnitRecord.name
      : variant.defaultUnitId;

    const availableUnitIdSet = new Set(variant.availableUnitIds ?? []);
    const customerUnitHints = (variant.customerUnitHints ?? [])
      .map((hint) => {
        if (!availableUnitIdSet.has(hint?.fromUnitId)) {
          return null;
        }
        if (!availableUnitIdSet.has(hint?.toUnitId)) {
          return null;
        }

        const fromUnit = unitById.get(hint.fromUnitId);
        const toUnit = unitById.get(hint.toUnitId);

        if (!fromUnit || !toUnit) {
          return null;
        }

        if (!isUnitActive(fromUnit) || !isUnitActive(toUnit)) {
          return null;
        }

        if (
          typeof hint.quantity !== "number" ||
          !Number.isFinite(hint.quantity) ||
          hint.quantity <= 0
        ) {
          return null;
        }

        return {
          fromUnit: fromUnit.name,
          toUnit: toUnit.name,
          quantity: hint.quantity,
        };
      })
      .filter(Boolean);

    return {
      id: variant.id,
      name: variant.name || product?.name || "",
      category: product?.category ?? "",
      favorite: Boolean(product?.favorite),
      pattern: product?.pattern ?? null,
      availableUnits,
      defaultUnit,
      defaultQuantity: variant.defaultQuantity ?? 1,
      image: product?.image ?? null,
      customerUnitHints,
    };
  });
}
