# Owner decisions before Stage 5B.3

This file records owner-approved catalogue decisions. Encoding them here and in `imports/*.json` does **not** change the live customer catalogue.

Live shop today: **91 products**. Stage 5B.3 apply is still blocked until the remaining items in this file are resolved and a live apply is explicitly requested.

---

## How decisions are recorded

- `APPROVE` / `KEEP` / `KEEP UNKNOWN` / `KEEP RAW / unresolved`
- Category names are one of: Makanan Ringan, Bahan Makanan, Minuman, Perawatan Diri, Kebutuhan Rumah, Alat & Perlengkapan, Kesehatan, Rokok, Bayi & Anak
- Do not guess. Unresolved identity stays held.

---

## A. Five cigarette POS-code changes (recode) — APPROVED

Customer names stay the same. Old codes are gone from the Excel file. No other current product uses the new codes. Units match.

| Current name | Old POS code | New POS code | Owner decision |
| --- | --- | --- | --- |
| Ave 20 | AVE20 | AV20 | APPROVE |
| Kabel 16 | KABEL | KBL16 | APPROVE |
| Region Kretek Sari Poci 16 | REGION | RKSP16 | APPROVE |
| Zenix Bold 20 | ZENIXB20 | ZB20 | APPROVE |
| Zenix Putih 20 | ZenPTH | ZP20 | APPROVE |

Encoded in `imports/catalog-recode-decisions.json` (`approved: true`). Stage 5B.2C applies these in the **proposed** catalogue: mapping `posCode` / `posName` change to the new POS identity; product ID, variant ID, customer name, category, image, aliases, recommendations, and units are preserved. Live `src/catalog` is unchanged until Stage 5B.3 apply.

---

## B. Unit words customers would see

### Owner-approved mappings

| Excel unit | Customer word | Owner decision |
| --- | --- | --- |
| Gtg | Gantung | APPROVE |
| Gln | Galon | APPROVE |
| Lbr | Lembar | APPROVE |
| 5KG | 5 Kg | APPROVE |
| Krg | Karung | APPROVE |
| Ikt | Ikat | APPROVE |
| Tpl | Toples | APPROVE |

Encoded in `imports/catalog-unit-decisions.json` (`approved: true`). The importer merges these into customer-facing unit labels.

### Already mapped — no new word needed

| Excel unit | Already means | Owner decision |
| --- | --- | --- |
| Kg | Kg | LEAVE (now in default-unit preference; no warning) |
| Gram | Gram | LEAVE (now in default-unit preference; no warning) |
| BLK | Balok | LEAVE (now in default-unit preference; no warning) |

### Keep raw / unresolved — do not guess

| Excel unit | What they are | Owner decision |
| --- | --- | --- |
| Kpl | All 14 “Senar” fishing-line SKUs | KEEP RAW / unresolved. Investigation: keep `Kpl` rather than guessing Gulungan / Keping / Kumparan. |
| Lyr | 4 balloon SKUs | KEEP RAW / unresolved. Investigation: keep `Lyr`. Do not map to Pak. Layer is not evidenced. |

Unresolved tokens do **not** hold the product. They only leave the displayed unit as the raw POS token.

### Prepared recommendation — awaiting owner approval

| Excel unit | Recommended customer word | Products | Confidence | Owner decision |
| --- | --- | --- | --- | --- |
| PSG | Pasang | 28 (21 sandal, 5 baterai, 2 Yeye) | HIGH | **APPROVE** |

Evidence: sandals use PSG=1, ½ lusin=6, lusin=12. Batteries with PCS use PSG=2 cells (one pair). Panasonic `/2B` packs use PSG=1 as the pair blister. Not encoded as `approved: true` until the owner says APPROVE.

OWNER DECISION (PSG → Pasang):
**APPROVE** (Stage 5B.3)

---

## C. 40 held products (MEDIUM) — APPROVED by family

| Family | How many | Category | Owner decision |
| --- | --- | --- | --- |
| Gunting (scissors, not nail clippers) | 14 | Alat & Perlengkapan | APPROVE |
| Gunting kuku | 5 | Perawatan Diri | APPROVE |
| Kapas | 5 | Perawatan Diri | APPROVE |
| Lilin | 5 | Alat & Perlengkapan | APPROVE |
| Minuman herbal (Adem Sari / Larutan) | 4 | Minuman | APPROVE |
| Top Lady Coklat / Hitam | 2 | Perawatan Diri | APPROVE |
| Wings Gelas Biru | 2 | Bahan Makanan | APPROVE |
| Menara MLD 16 | 1 | Rokok | APPROVE |
| Nestle Cap Nona Plain 370G | 1 | Minuman | APPROVE |
| Homa Tusuk Gigi Isi 24 | 1 | Alat & Perlengkapan | APPROVE |

Encoded in `imports/catalog-held-product-decisions.json`.

---

## D. LOW / Lainnya products

| Name | POS code | Category | Owner decision |
| --- | --- | --- | --- |
| Gomala No.5 | GML5 | Alat & Perlengkapan | APPROVE |
| Gomala No.6 | GML6 | Alat & Perlengkapan | APPROVE |
| Gomala No.7 | GML7 | Alat & Perlengkapan | APPROVE |
| Gomala Youvella No.8 | GML8 | Alat & Perlengkapan | APPROVE |
| Gomala No.9 | GML9 | Alat & Perlengkapan | APPROVE |
| Gomala Youvella No.10 | GML10 | Alat & Perlengkapan | APPROVE |
| Rackus | CM063 | Kebutuhan Rumah | APPROVE |
| Kucing Batang Merah 60 | KB60 | Kebutuhan Rumah | APPROVE |
| Kucing Batang Merah 72 | KB | Kebutuhan Rumah | APPROVE |
| Kertas Kaf | CM267 | Alat & Perlengkapan | APPROVE |
| Speed | 1087 | — | KEEP UNKNOWN. Keep held / non-visible. Do not guess. |

---

## E. 11 current products not in the new Excel file — KEEP for now

Nothing will be removed in this stage.

| Current name | Product ID | Owner decision |
| --- | --- | --- |
| DSS Magnum Mild 16 | prod-dss-magnum-mild-16 | KEEP for now |
| DSS Magnum Mild 20 | prod-dss-magnum-mild-20 | KEEP for now |
| Sergio Filter | prod-sergio-filter | KEEP for now |
| Zenix Coffee | prod-zenix-coffee | KEEP for now |
| Zenix Sultan | prod-zenix-sultan | KEEP for now |
| Aqua 1.5 L | prod-aqua-15l | KEEP for now |
| Masako Ayam | prod-masako-ayam | KEEP for now |
| Masako Sapi | prod-masako-sapi | KEEP for now |
| Energen Vanilla | prod-energen-vanilla | KEEP for now |
| Teh Botol Sosro | prod-teh-botol-sosro | KEEP for now |
| Indomie Goreng | prod-indomie-goreng | KEEP for now |

Encoded in `imports/catalog-preservation-decisions.json`.

---

## F. Internal POS name spelling (13 cigarettes) — APPROVED

This only updates the hidden POS name used to match Excel. **Customers still see the current product name.**

Examples:

- Customer still sees **Camel Blue 16**; POS name would become Camel Biru 16
- Customer still sees **52 Kretek 20**; POS name would become 52 (Lima Dua) Kretek 20

Full list: `imports/decisions/pos-name-update-review.csv`

OWNER DECISION: **APPROVE** (all 13 `mappings.posName` updates, customer-facing names unchanged).

---

## G. Classifier correction — Kucing Angora Gelas (KGBK) — APPROVED

| Field | Value |
| --- | --- |
| POS code | KGBK |
| Current erroneous classification | Minuman / Air Mineral |
| Corrected top-level category | Kebutuhan Rumah |
| Cause | Classifier matched the word “Gelas” as mineral water |
| Identity | Preserved. Unrelated data is not changed. |

Encoded in `imports/catalog-held-product-decisions.json` (`categoryCorrections`) and in `scripts/previewCatalogCategories.js`.

---

## What this does **not** do

- Does not add the full catalogue to the live shop
- Does not change prices (there are no prices)
- Does not remove any current product
- Does not guess Speed
- PSG → Pasang is owner-approved as of Stage 5B.3
- Keeps Kpl and Lyr as raw customer unit tokens

Stage 5B.3 live apply still requires an explicit apply request. Remaining owner decisions: PSG → Pasang (recommended, not approved). Speed stays held. Kpl/Lyr stay raw unless the owner later provides a word. The 11 KEEP products stay until a later fate.
