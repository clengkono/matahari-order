# Matahari Order — Project Specification

## 1. Product vision

Matahari Order is a customer-facing wholesale ordering application for an existing Indonesian wholesale business.

Customers currently order through WhatsApp. The application should make those orders:

- faster
- easier
- clearer
- less ambiguous
- larger and more complete

The app should help customers choose the correct product, quantity, and unit before sending the final order.

## 2. Core principle

The application is a price-free ordering catalogue.

Customer-facing categories are the nine IDs in `src/config/categories.js`. The customer app reads a generated compact catalogue; the six `src/catalog/*.json` files remain authoritative.

It is not intended to replace the store's POS.

The POS remains the internal source for:

- prices
- stock
- purchase cost
- unit conversion
- barcodes
- transactions

Matahari Order only needs customer-facing ordering information.

## 3. Current technology

- React
- Vite
- JavaScript / JSX
- Plain CSS
- React Context for cart state
- Static product data during the MVP stage

## 4. Existing visual identity

The current approved style uses:

- professional orange
- white surfaces
- warm neutral background
- dark charcoal text
- subtle layered shadows
- rounded cards
- mobile-first spacing

The design should feel:

- friendly
- practical
- trustworthy
- modern
- fast

## 5. Product data model

Each product should support:

```js
{
  id,
  name,
  category,
  favorite,
  availableUnits,
  defaultUnit,
  defaultQuantity
}
```

Example:

```js
{
  id: 1,
  name: "Glory",
  category: "Rokok",
  favorite: true,
  availableUnits: ["Bungkus", "Slof", "Dus"],
  defaultUnit: "Slof",
  defaultQuantity: 1
}
```

The app does not need to store POS conversion factors.

## 6. Preferred ordering behavior

When a customer sees a product, its most common order is already selected.

Examples:

- Glory: `1 Slof`
- Troy: `1 Slof`
- Apache: `1 Slof`
- Chief: `1 Slof`
- Aqua 1.5 L: `1 Karton`

Customers can:

- tap `Tambah` to add the default order immediately
- tap the product card to change unit or quantity

## 7. Home screen direction

The home screen should contain:

- Matahari Order header
- search field
- one `Sering Dipesan` section
- approximately nine products in a responsive 3-column grid
- product cards showing:
  - image or placeholder
  - product name
  - default quantity and unit
  - compact `Tambah` button
- `Tambahkan Semua`
- compact cart count indicator
- category section where appropriate

Do not duplicate `Sering Dipesan` and `Produk Favorit`.

## 8. Product detail interaction

Tapping a product card opens a bottom sheet.

The bottom sheet contains:

- product image or placeholder
- product name
- available units
- selected quantity
- minus and plus controls
- `Tambah ke Keranjang`

Initial values:

- unit = product `defaultUnit`
- quantity = product `defaultQuantity`

Rules:

- exactly one unit is selected
- quantity minimum is 1
- backdrop tap closes the sheet
- Escape closes the sheet
- adding closes the sheet
- no prices are shown

## 9. Cart behavior

The existing `CartContext` is the cart foundation.

A cart line is unique by:

- product ID
- selected unit

Rules:

- same product + same unit = merge quantities
- same product + different unit = separate cart line
- cart count = total quantity across all cart lines

The full cart interface is a future release.

## 10. Tambahkan Semua

`Tambahkan Semua` adds every product currently displayed in the `Sering Dipesan` section using:

- its `defaultQuantity`
- its `defaultUnit`

If search filters the section, only currently visible products are added.

The button is disabled if no products are visible.

## 11. Search

Search remains:

- case-insensitive
- based on product name

If there are no matches, show:

`Produk tidak ditemukan.`

## 12. Planned releases

### Release 0.3 — Smart Ordering Foundation

- reusable ProductCard
- responsive 3-column grid
- default unit and quantity
- quick add
- product bottom sheet
- functional add-to-cart
- cart count indicator
- Tambahkan Semua
- empty search state

### Release 0.4 — Cart Review

- cart drawer or cart screen
- update quantities
- remove items
- clear cart
- notes

### Release 0.5 — WhatsApp Ordering

- order summary
- customer-friendly formatting
- open WhatsApp with prepared message

## 13. Out of scope for Release 0.3

- prices
- POS conversion factors
- backend
- authentication
- routing
- localStorage
- inventory synchronization
- category filtering
- full cart UI
- WhatsApp export
