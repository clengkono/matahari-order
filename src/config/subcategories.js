/**
 * Customer-facing subcategory taxonomy (presentation/discovery only).
 *
 * Top-level category IDs stay in categories.js and products.json.
 * This file does not change POS identity, mappings, units, or names.
 *
 * Subcategory labels come from Stage 5B.1C classification preview
 * (scripts/previewCatalogCategories.js). Rokok uses the analytical
 * buckets already defined there.
 */

export const SEMUA_SUBCATEGORY_ID = "semua";
export const LAINNYA_SUBCATEGORY_ID = "lainnya";

export const SUBCATEGORY_CONFIG = {
  "Makanan Ringan": [
    { id: "biskuit-wafer", label: "Biskuit & Wafer", icon: "🍪" },
    { id: "keripik-snack", label: "Keripik & Snack", icon: "🍟" },
    { id: "kacang-kuaci", label: "Kacang & Kuaci", icon: "🥜" },
    { id: "permen-cokelat", label: "Permen & Cokelat", icon: "🍬" },
    { id: "roti-kue", label: "Roti & Kue", icon: "🍞" },
    { id: "sosis-siap-makan", label: "Sosis & Siap Makan", icon: "🌭" },
  ],
  "Bahan Makanan": [
    { id: "mie-instan", label: "Mie & Makanan Instan", icon: "🍜" },
    { id: "mie-kering-pasta", label: "Mie Kering & Pasta", icon: "🍝" },
    { id: "bumbu-penyedap", label: "Bumbu & Penyedap", icon: "🧂" },
    { id: "kecap-saus", label: "Kecap, Saus & Sambal", icon: "🫙" },
    { id: "minyak-goreng", label: "Minyak Goreng", icon: "🫙" },
    { id: "beras", label: "Beras", icon: "🌾" },
    { id: "tepung-pati", label: "Tepung & Pati", icon: "🥣" },
    { id: "gula-garam-santan", label: "Gula, Garam & Santan", icon: "🍚" },
    { id: "mentega-keju", label: "Mentega & Keju", icon: "🧈" },
    { id: "bahan-kue", label: "Bahan Kue", icon: "🧁" },
    { id: "bahan-siap-pakai", label: "Bahan Masak Siap Pakai", icon: "🥫" },
  ],
  Minuman: [
    { id: "air-mineral", label: "Air Mineral", icon: "💧" },
    { id: "kopi", label: "Kopi", icon: "☕" },
    { id: "teh-siap", label: "Teh Siap Minum", icon: "🧋" },
    { id: "teh-bubuk", label: "Teh Celup / Bubuk", icon: "🍵" },
    { id: "soda", label: "Soda", icon: "🥤" },
    { id: "jus-buah", label: "Jus & Rasa Buah", icon: "🧃" },
    { id: "bubuk-minuman", label: "Minuman Bubuk", icon: "🥛" },
    { id: "energi-isotonik", label: "Energi & Isotonik", icon: "⚡" },
    { id: "sirup", label: "Sirup", icon: "🍯" },
    { id: "herbal", label: "Herbal", icon: "🌿" },
    { id: "alkohol", label: "Alkohol", icon: "🍺" },
  ],
  "Perawatan Diri": [
    { id: "sabun-mandi", label: "Sabun & Mandi", icon: "🧼" },
    { id: "rambut", label: "Perawatan Rambut", icon: "🧴" },
    { id: "mulut", label: "Perawatan Mulut", icon: "🪥" },
    { id: "kulit-wajah", label: "Kulit & Wajah", icon: "✨" },
    { id: "deodoran-wangi", label: "Deodoran & Wangi", icon: "🌸" },
    { id: "wanita", label: "Perawatan Wanita", icon: "🩷" },
    { id: "cukur", label: "Cukur", icon: "🪒" },
    { id: "kapas", label: "Kapas", icon: "☁️" },
  ],
  "Kebutuhan Rumah": [
    { id: "cuci-pakaian", label: "Cuci Pakaian", icon: "👕" },
    { id: "cuci-piring", label: "Cuci Piring", icon: "🍽️" },
    { id: "pembersih", label: "Pembersih Rumah", icon: "🧹" },
    { id: "anti-serangga", label: "Anti Serangga", icon: "🦟" },
    { id: "tisu", label: "Tisu", icon: "🧻" },
    { id: "sabun-rumah", label: "Sabun Rumah", icon: "🧼" },
    { id: "alat-kebersihan", label: "Alat Kebersihan", icon: "🧽" },
  ],
  "Alat & Perlengkapan": [
    { id: "plastik-kemasan", label: "Plastik & Kemasan", icon: "📦" },
    { id: "atk-sekolah", label: "ATK & Sekolah", icon: "✏️" },
    { id: "mainan-pesta", label: "Mainan & Pesta", icon: "🎈" },
    { id: "perlengkapan-rumah", label: "Perlengkapan Rumah", icon: "🔧" },
  ],
  Kesehatan: [
    { id: "obat", label: "Obat", icon: "💊" },
    { id: "vitamin", label: "Vitamin & Suplemen", icon: "🧡" },
    { id: "minyak-balsem", label: "Minyak Medis & Balsem", icon: "🟢" },
    { id: "p3k", label: "P3K & Antiseptik", icon: "🩹" },
  ],
  Rokok: [
    { id: "kretek", label: "Kretek", icon: "🚬" },
    { id: "mild", label: "Mild", icon: "🚬" },
    { id: "filter", label: "Filter", icon: "🚬" },
    { id: "rasa-menthol", label: "Rasa / Menthol", icon: "❄️" },
  ],
  "Bayi & Anak": [
    { id: "popok", label: "Popok", icon: "🧷" },
    { id: "susu-formula", label: "Susu Formula & Ibu", icon: "🍼" },
    { id: "makanan-bayi", label: "Makanan Bayi", icon: "🥣" },
    { id: "perawatan-bayi", label: "Perawatan Bayi", icon: "💛" },
  ],
};

export const SEMUA_TILE = {
  id: SEMUA_SUBCATEGORY_ID,
  label: "Semua",
  icon: "▦",
};

export const LAINNYA_TILE = {
  id: LAINNYA_SUBCATEGORY_ID,
  label: "Lainnya",
  icon: "·",
};

export function getSubcategoryPresentation(categoryId, subcategoryId) {
  if (subcategoryId === SEMUA_SUBCATEGORY_ID) {
    return SEMUA_TILE;
  }
  if (subcategoryId === LAINNYA_SUBCATEGORY_ID) {
    return LAINNYA_TILE;
  }
  const list = SUBCATEGORY_CONFIG[categoryId] ?? [];
  return list.find((entry) => entry.id === subcategoryId) ?? null;
}
