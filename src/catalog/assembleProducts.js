import aliasesData from "./aliases.json";
import mappingsData from "./mappings.json";
import productsData from "./products.json";
import unitsData from "./units.json";
import variantsData from "./variants.json";

function isUnitActive(unit) {
  return !unit || unit.active !== false;
}

/**
 * Assembles the customer-facing product list from catalogue JSON.
 * Shape matches the previous demo products.js records.
 * Only active units are exposed to the ordering UI.
 */
export function assembleProducts({
  products = productsData,
  variants = variantsData,
  units = unitsData,
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
    };
  });
}

export const products = assembleProducts();
export const aliases = aliasesData;
export const catalogProducts = productsData;
export const catalogVariants = variantsData;
export const catalogUnits = unitsData;
export const catalogMappings = mappingsData;

export default products;
