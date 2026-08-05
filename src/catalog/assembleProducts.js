import aliasesData from "./aliases.json";
import productsData from "./products.json";
import unitsData from "./units.json";
import variantsData from "./variants.json";

/**
 * Assembles the customer-facing product list from catalogue JSON.
 * Shape matches the previous demo products.js records.
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

    const availableUnits = (variant.availableUnitIds ?? []).map((unitId) => {
      const unit = unitById.get(unitId);
      return unit ? unit.name : unitId;
    });

    const defaultUnitRecord = unitById.get(variant.defaultUnitId);
    const defaultUnit = defaultUnitRecord
      ? defaultUnitRecord.name
      : variant.defaultUnitId;

    return {
      id: variant.id,
      name: variant.name || product?.name || "",
      category: product?.category ?? "",
      favorite: Boolean(product?.favorite),
      availableUnits,
      defaultUnit,
      defaultQuantity: variant.defaultQuantity ?? 1,
    };
  });
}

export const products = assembleProducts();
export const aliases = aliasesData;
export const catalogProducts = productsData;
export const catalogVariants = variantsData;
export const catalogUnits = unitsData;

export default products;
