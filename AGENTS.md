# Matahari Order — Cursor Agent Instructions

## Project purpose

Matahari Order is a price-free wholesale ordering tool for existing customers in Indonesia.

Its goals are to:

- show which products are available
- help customers order faster
- make quantity and unit selection clear
- encourage larger and more complete orders
- prepare clean cart data for future WhatsApp ordering

This is not a conventional ecommerce application.

## Technology rules

- Use React with Vite.
- Use JavaScript and JSX.
- Use plain CSS only.
- Do not use Tailwind, Bootstrap, Redux, or other UI/state libraries.
- Do not install new npm packages unless explicitly instructed.
- Keep components in a flat `src/components/` folder.
- Keep `src/App.css` where it is.
- Preserve the existing orange-and-white visual identity.
- Prefer small, understandable components.
- Do not over-engineer.

## Product rules

- Never display prices.
- Do not store or display POS conversion factors.
- Each product may have its own customer-facing units.
- Each product should support:
  - `availableUnits`
  - `defaultUnit`
  - `defaultQuantity`
- `defaultUnit` must always exist inside `availableUnits`.
- Product defaults should make common wholesale orders faster.
- Examples:
  - Glory defaults to `1 Slof`
  - Aqua 1.5 L defaults to `1 Karton`

## Catalogue files

- Authoritative catalogue: `src/catalog/*.json` (identity/POS files plus owner-curated `productFamilies.json` and `productDefaults.json`).
- `variants.json` `defaultUnitId` is the import-derived fallback.
- `productDefaults.json` is the owner-curated default-unit override. A valid override wins in the customer catalogue. An invalid override is a validation error, never a silent unit substitution.
- Customer runtime: generated `src/catalog/generated/customerCatalog.json`. Do not hand-edit it.
- After catalogue edits, run `npm run catalog:customer-build`. `npm run build` regenerates it before Vite. Owner Publish includes this generated file when catalogue data changes.

## Cart rules

- Use the existing `CartContext`.
- A cart line is unique by product ID — one active unit per product.
- Same product: merge quantities onto that single line.
- Do not replace working cart helpers unless necessary.
- Do not implement prices or totals.

## Device-local stores

Do not add new localStorage keys unless explicitly requested.

Approved keys:

- `matahari-order:cart`
- `matahari-order:order-note`
- `matahari-order:recent-searches`
- `matahari-order:order-history` — prepared-for-WhatsApp Pesan Lagi occasion log
- `matahari-order:learning-profile` — separate local behavioral evidence

Order history is the occasion log. The learning profile is long-term behavioral evidence. Do not add scores, frequency fields, or recommendation state to history schema v1.

## UX rules

- Mobile-first.
- Keep the interface usable at approximately 320px width.
- Use large enough touch targets.
- Keep actions simple and fast.
- Avoid unnecessary screens and taps.
- Preserve existing search behavior.
- Keep animations subtle.
- Respect `prefers-reduced-motion`.
- Add accessible labels and `focus-visible` states where appropriate.
- Do not redesign unrelated parts of the app.

## Coding workflow

Before editing:

1. Inspect the relevant existing files.
2. Preserve completed work.
3. Limit changes to the requested release.
4. Do not create a separate planning phase unless requested.

After editing:

1. Run `npm run build`.
2. Run `npm run lint`.
3. Fix errors introduced by the changes.
4. Do not weaken lint rules to hide problems.
5. Review the diff for unrelated changes.
6. Provide a concise summary of:
   - files created
   - files modified
   - main behavior implemented
   - build result
   - lint result
   - manual tests still required

## Forbidden changes unless explicitly requested

- prices
- POS conversion values
- backend
- authentication
- routing
- new localStorage keys (unless explicitly requested)
- inventory synchronization
- category filtering
- full cart drawer
- WhatsApp export
- major redesign
- new dependencies
