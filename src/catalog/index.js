/**
 * Customer runtime catalogue.
 *
 * Authoritative source: src/catalog/{products,variants,units,aliases,mappings,recommendations}.json
 * This module reads the generated artefact only. Do not import assembleProducts
 * or the raw six-file catalogue from customer UI code.
 */

import customerCatalog from "./generated/customerCatalog.json";

export const products = customerCatalog.products;
export const aliases = customerCatalog.aliases;
export const catalogRecommendations = customerCatalog.recommendations;

export default products;
