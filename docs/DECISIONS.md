# Matahari Order — Design Decisions

This document records important design decisions and the reasoning behind them.

The goal is to preserve product direction over time and prevent future refactoring from unintentionally undoing decisions that were made deliberately.

---

# Decision 1 — No Prices

Status: Permanent

The application intentionally does not display product prices.

Reason:

- Prices change frequently.
- Customers already know approximate prices.
- The POS system remains the source of truth.
- Removing prices greatly reduces maintenance.
- Customers can order without worrying about outdated pricing.

The app is an ordering tool, not a catalogue for price comparison.

---

# Decision 2 — POS Remains the Master System

Status: Permanent

The existing POS continues to manage:

- prices
- stock
- purchasing
- unit conversions
- inventory
- transactions

Matahari Order never attempts to replace the POS.

It is only the customer ordering interface.

---

# Decision 3 — Customer Units Only

Status: Permanent

The app stores only customer-facing units.

Examples:

- Bungkus
- Pack
- Karton
- Dus
- Slof
- Pcs
- Botol
- Kaleng

The application never stores conversion factors.

Example:

Good:

```
Glory

Units:
• Bungkus
• Slof
• Dus
```

Bad:

```
1 Dus = 10 Slof

1 Slof = 10 Bungkus
```

Customers don't need to know this.

Employees already understand the conversions.

---

# Decision 4 — Smart Defaults

Status: Permanent

Every product should open with the most common order already selected.

Examples:

Glory

Default:

Quantity:
1

Unit:
Slof

Aqua 1.5 L

Default:

Quantity:
1

Unit:
Karton

The customer changes these only when necessary.

Goal:

Reduce taps.

Reduce thinking.

Increase ordering speed.

---

# Decision 5 — Quick Ordering Is More Important Than Browsing

Status: Permanent

Most customers already know what they want.

The application should optimise for:

- finding products quickly
- adding products quickly
- submitting orders quickly

Not for:

- long product descriptions
- marketing
- discovery

---

# Decision 6 — Encourage Larger Orders

Status: Permanent

The application should naturally increase basket size.

Examples:

- Tambahkan Semua
- Frequently ordered products
- Smart default quantities
- Simple repeat ordering

The app should help customers remember products they normally buy.

---

# Decision 7 — One Tap Whenever Possible

Status: Permanent

Good UX requires as few taps as possible.

Examples:

Tap Tambah

↓

Immediately adds:

1 Slof Glory

without opening another screen.

Customers only open the bottom sheet when they want to change unit or quantity.

---

# Decision 8 — Bottom Sheet Is For Exceptions

Status: Permanent

The bottom sheet is not the primary workflow.

It exists only when customers need to customise:

- quantity
- unit

Otherwise Quick Add should be enough.

---

# Decision 9 — Mobile First

Status: Permanent

The application is designed primarily for phones.

Desktop support is useful for development only.

Every important action should be comfortable with one thumb.

---

# Decision 10 — Professional Simplicity

Status: Permanent

The application should feel like a professional wholesale tool.

Avoid:

- flashy animations
- excessive colours
- unnecessary graphics
- decorative effects

Prefer:

- clarity
- consistency
- speed
- reliability

---

# Decision 11 — Component Architecture

Status: Permanent

Business logic should remain separated from presentation.

Preferred structure:

components/

context/

utils/

data/

Presentation components should stay as dumb as possible.

Shared logic belongs inside Context or Utils.

---

# Decision 12 — Future AI Development

Status: Permanent

Future AI assistants should respect these principles before proposing changes.

If a future suggestion conflicts with this document, this document takes priority unless the project owner explicitly changes the decision.

Never reintroduce:

- prices
- conversion factors
- unnecessary complexity
- ecommerce behaviour

without explicit approval.

---

# Decision 13 — Nine customer categories

Status: Permanent unless the owner changes the taxonomy

The customer homepage uses nine top-level categories, defined once in `src/config/categories.js`:

Makanan Ringan, Bahan Makanan, Minuman, Perawatan Diri, Kebutuhan Rumah, Alat & Perlengkapan, Kesehatan, Rokok, Bayi & Anak.

There is no Lainnya catch-all and no subcategory UI. Unresolved import rows stay out of the live catalogue until they are classified.

---

# Decision 14 — Render caps instead of virtualization

Status: Current

Search shows 20 rows first, then +20 per `Tampilkan lainnya`. Category browse shows 24, then +24.

Search matching, ranking, aliases, recommendations, and category membership still use the full list. Only DOM rendering is capped.

Virtualization was not added: it would add a dependency, change scroll/focus behaviour on phones, and is unnecessary while a batch button keeps the first paint small.

---

# Decision 15 — Generated customer catalogue (Option D)

Status: Current

The customer production bundle consumes a compact generated catalogue, not the raw variants/units/mappings JSON.

Authoritative source remains the six `src/catalog/*.json` files. `customerCatalog.json` is generated, must not be hand-edited, and is rebuilt by `npm run catalog:customer-build` and `npm run build`.

A future Option B could serve or cache that JSON as a static fetch / PWA asset. Do not add a service worker in this stage.