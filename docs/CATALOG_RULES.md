# Matahari Order — Catalogue Rules

## Purpose

Catalogue rules define how raw POS-like rows become customer-facing products.

The POS remains the source system. Matahari Order only needs a clean ordering catalogue:

- one product customers recognise
- clear unit choices
- sensible defaults
- preserved links back to POS codes

## Customer-facing categories

Approved top-level taxonomy (Stage 5B.2A), in homepage order:

1. Makanan Ringan
2. Bahan Makanan
3. Minuman
4. Perawatan Diri
5. Kebutuhan Rumah
6. Alat & Perlengkapan
7. Kesehatan
8. Rokok
9. Bayi & Anak

`src/config/categories.js` is the authoritative list. Catalogue Studio reads the same IDs. Do not add Lainnya. Empty categories stay hidden until they have products.

Search and category screens cap how many rows mount (`Tampilkan lainnya`) so a large catalogue does not render hundreds of rows at once. Matching and ranking still run over the full result set.

---

## Authoritative vs generated customer catalogue

The six POS/identity files in `src/catalog/` remain the source of truth:

- `products.json`
- `variants.json`
- `units.json`
- `aliases.json`
- `mappings.json`
- `recommendations.json`

Curated product-family membership for customer **Produk Serupa** lives in a separate file:

- `productFamilies.json`

Do not store family membership on recommendations, aliases, variants, or mappings. Family membership is owner-curated; the customer app must not guess it from similar names.

Studio, `catalog:check`, catalogue transactions, import tools, and POS mappings use the six identity files. `catalog:check` also validates `productFamilies.json`. Catalogue transactions do not rewrite families in Stage 6A.

The customer app imports the generated artefact `src/catalog/generated/customerCatalog.json`.

- Do not edit the generated file by hand.
- Regenerate with `npm run catalog:customer-build`.
- `npm run build` regenerates it before Vite.
- Catalogue transactions do not rewrite it (avoids smoke tests mutating the live artefact). After Studio edits, regenerate before customer testing.

A later Option B could fetch this JSON at runtime (or via a PWA cache). That is not implemented yet.

---

## Pattern A — Fixed Product

Pattern A is used when each POS item name already maps to one customer-facing product.

Examples:

- `GLORY 16` + `BKS` / `SLOF` / `BAL` → product **Glory 16**
- `APACHE 12` + `BKS` / `SLOF` → product **Apache 12**
- `APACHE 16` + `BKS` / `SLOF` → product **Apache 16**

Different cigarette sizes or types stay separate products.

Do not merge:

- Glory 16 with Glory 12
- Apache 12 with Apache 16
- Magnum Filter with Magnum Mild

---

## Ordering flow

Customer ordering follows:

**Product → Unit → Quantity**

1. Choose the product
2. Choose the unit
3. Choose the quantity

The catalogue stores customer-facing units only. It does not store POS conversion factors or prices.

---

## Cigarette examples

| POS name | POS unit | Customer product | Customer unit |
| --- | --- | --- | --- |
| GLORY 16 | BKS | Glory 16 | Bungkus |
| GLORY 16 | 1/2 SLOF | Glory 16 | ½ Slof |
| GLORY 16 | SLOF | Glory 16 | Slof |
| GLORY 16 | BAL | Glory 16 | Bal |
| TROY | BKS | Troy | Bungkus |
| TROY | SLOF | Troy | Slof |
| APACHE 12 | BKS | Apache 12 | Bungkus |
| APACHE 12 | SLOF | Apache 12 | Slof |
| APACHE 16 | BKS | Apache 16 | Bungkus |
| APACHE 16 | SLOF | Apache 16 | Slof |

Default unit preference for the cigarette preview:

1. Slof
2. Karton
3. Dus
4. Bungkus
5. first active unit

---

## Core rules

### Specific sizes and types remain separate products

Cigarette size and type are part of the product identity.

`Apache 12` and `Apache 16` are different catalogue products.

### Obsolete units are deactivated, not deleted

If a unit should not appear for customers, mark it inactive.

Example: `Bal` may remain in the catalogue mapping as inactive.

Do not delete the unit option or its POS mappings.

### POS mappings remain preserved

Every source POS row keeps its mapping:

- POS code
- POS name
- POS unit

Source rows are never deleted by the builder.

### Customer-facing unit names are normalized

| POS unit | Catalogue unit |
| --- | --- |
| BKS | Bungkus |
| 5BKS | 5 Bungkus |
| 1/2 SLOF or ½ SLOF | ½ Slof |
| SLOF | Slof |
| BAL | Bal |
| BLK | Balok |
| DOS or DUS | Dus |
| PCS | Pcs |
| PAK | Pak |
| 1/2PAK or ½ PAK | ½ Pak |
| KTN or KARTON | Karton |
| 1/2KTN or ½ KTN | ½ Karton |

Catalogue unit labels use title case.

---

## Future patterns

Later releases may add other grouping patterns, for example:

- **Pattern B** — shared brand with customer-selected variant
- **Pattern C** — beverage pack sizes with Karton defaults
- Excel import into the builder
- Reviewed promotion from preview output into `src/catalog`

Those patterns must still preserve POS mappings, avoid prices, and keep conversion factors out of the customer catalogue.
