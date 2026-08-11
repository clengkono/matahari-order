/**
 * Curated Pencarian Populer chips (Release 0.10).
 *
 * Static list for now. Designed so this module can later be replaced by
 * analytics, customer-specific frequent searches, business-curated terms,
 * or Master Product Knowledge keywords — without changing chip UI wiring.
 *
 * Terms were validated against the current alias-aware productSearch pipeline.
 * Grocery-style starters (rokok, wafer, susu, minuman, permen, biskuit) were
 * dropped where they returned zero catalogue hits; kopi kept only 1 weak
 * alias hit and was replaced with broader useful terms.
 */
export const POPULAR_SEARCHES = [
  "camel",
  "kretek",
  "mild",
  "nation",
  "surya",
  "mie",
  "masako",
  "teh",
];
