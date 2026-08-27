# Matahari Catalogue Studio

Local development tool for assigning product images across the full catalogue (2,256 products).

**LOCAL ONLY.** The Studio UI and image service are not authenticated and must never be publicly deployed as-is.

---

## Start Studio

From the project root:

```bash
npm run studio
```

This starts:

1. the local image service on `127.0.0.1:8787`
2. Vite on the usual development port (typically `5173`)

### Studio URL

Open:

[http://127.0.0.1:5173/studio](http://127.0.0.1:5173/studio)

The customer app remains at:

[http://127.0.0.1:5173/](http://127.0.0.1:5173/)

### Separate commands (optional)

If you prefer two terminals:

```bash
npm run studio:api
npm run dev
```

Then open `/studio` in the Vite app.

---

## Images workflow

1. Open the **Images** tab.
2. Search any catalogue product by customer-facing name, alias, product ID, POS name, or POS code.
3. Filter by **Missing image**, **Has image**, **Category**, or **Recently updated**.
4. Use arrow keys and Enter, or click, to select a product. The result list shows at most 40 rows; narrow the search instead of scrolling the whole catalogue.
5. Review **Current image**, **Detail image**, **Original stored**, and **Watermark: Matahari Langowan**.
6. Add an image by drag-and-drop, **Choose File**, or clipboard paste.
7. Confirm the preview: source plus generated card/detail. Original stays clean; card/detail get the watermark.
8. If the product already has an image, confirm the additional replace step.

Keyboard:

- `Ctrl+F` focuses the current tab’s product search (does not open browser find)
- Images: `Ctrl+F` focuses the all-product image search
- Queue: `Ctrl+F` focuses the missing-image search
- Products: `Ctrl+F` focuses the full-catalogue product search
- `Ctrl+V` pastes an image when the clipboard contains image data
- `Enter` confirms save when a confirmation dialog is open
- `Escape` cancels preview or confirmation

---

## Queue workflow

1. Open the **Queue** tab.
2. By default the queue lists **all** products that are still missing images (not only Rokok).
3. Review completed / total / missing counts. Search and category-filter the missing list.
4. Assign an image with the same drop / file / paste flow.
5. After a successful save, that product leaves the missing queue and Studio opens the next missing product.
6. Use **Previous missing** and **Next missing** (or Left / Right arrow keys) to move through missing products.

Keyboard:

- Left / Right arrow keys navigate missing products when focus is not inside a text field

---

## Clipboard paste

Copy an image (not plain text) and press `Ctrl+V` while Studio is focused.

- Image clipboard data is accepted
- Arbitrary text is ignored as an image source

---

## Accepted formats

- JPEG
- PNG
- WebP

Maximum source size: **15 MB**

Unsupported types and invalid image bytes are rejected with a readable error.

EXIF orientation is applied (`sharp.rotate()`). Generated card and detail then run a **conservative excess-background trim** when the four corners look like the same light or transparent background. A small safety margin is kept around the detected content, then the extract is contained (`fit: inside`) onto a warm canvas `#EDE8E1` so the product occupies about 80–90% of the square when the source permits. If trim is not confident, generation falls back to containing the full oriented image. Generated outputs may scale up after trim/contain (needed so a small original still fills the 900px detail canvas). Stored originals are never trimmed, stretched, or watermarked. WebP quality is 82.

Do not switch customer CSS to `object-fit: cover` to fake a tighter crop.

---

## Photography recommendations

- Photograph the full retail pack against a plain surface
- Keep the pack upright and fully in frame
- Prefer even lighting without harsh glare
- Avoid cropping away brand marks or pack edges
- High-resolution phone photos are fine; Studio will generate card and detail sizes

Studio preserves the whole package using `fit: contain` on a warm neutral background matching the app (`#EDE8E1`). Conservative edge trimming only removes confidently empty light/transparent margin; internal white on labels is not removed.

---

## Storage locations

The on-disk bucket is still named `cigarettes/` for historical reasons. It is **not** a category folder. Category edits do not move files. Filenames are the product ID.

Original uploads (unwatermarked):

`public/product-images/originals/cigarettes/<product-id>-original.<ext>`

Generated card images (360 × 360 WebP, watermarked):

`public/product-images/cards/cigarettes/<product-id>.webp`

Generated detail images (900 × 900 WebP, watermarked):

`public/product-images/details/cigarettes/<product-id>.webp`

Browser paths written into the catalogue look like:

- `/product-images/cards/cigarettes/<product-id>.webp`
- `/product-images/details/cigarettes/<product-id>.webp`
- `/product-images/originals/cigarettes/<product-id>-original.<ext>`

Existing files were not moved. New uploads for any category use the same layout.

Removed images are copied (not served to customers) to:

`public/product-images/.trash/<timestamp>/<product-id>/`

That folder holds the archived original/card/detail files plus `manifest.json` (`productId`, `removedAt`, source paths). It is gitignored. Vite can still serve a guessed URL under `/product-images/.trash/…`; customer catalogue JSON never includes those paths.

---

## Replacement behavior

Replacing an image:

1. Requires the normal assign confirmation
2. Requires an additional explicit replace confirmation (no silent overwrite)
3. Overwrites generated card and detail files for that product ID
4. Writes a new original file and removes an older original with a different extension when needed
5. Updates `products.json` through the catalogue transaction layer
6. Rebuilds `src/catalog/generated/customerCatalog.json` only after that transaction succeeds

If the JSON transaction fails after binaries were written, Studio restores the previous card/detail/original files (or deletes a first-time assign). Residual risk: a crash after JSON success but before prior-file cleanup can leave temporary `.prior.bak` files next to the finals; the live catalogue and generated images are still the new versions.

---

## Catalogue backups and customer catalogue

Image assignment writes card/detail/original files first (temp/prior safety), then updates `products.json` through the catalogue transaction layer (`scripts/catalogTransaction.js`).

That layer:

1. mutates the catalogue in memory
2. runs the same `validateCatalog()` rules as `npm run catalog:check`
3. copies only changed JSON files into a timestamped backup set
4. writes temps and replaces live files
5. rolls all changed JSON files back if any replace fails
6. appends `src/catalog/backups/changelog.jsonl` on success

After a successful image metadata write (and after a successful Products-tab name/category save that is not a no-op), Studio calls `buildCustomerCatalog()` directly. You do **not** need a separate CLI regenerate for the customer app to see the new image paths.

If customer-catalogue rebuild fails, Studio reports a warning. Do not treat that as a full success — run `npm run catalog:customer-build`.

Failed and no-op writes do not rebuild.

---

## Remove image

Studio shows a secondary **Remove image** action only when the selected product already has an assigned image. Confirming:

1. Copies original/card/detail into `.trash/<timestamp>/<product-id>/` with a manifest
2. If that archive fails, stops. Catalogue metadata is unchanged
3. Runs a `remove-image` catalogue transaction (validation, backup, lock, changelog, rollback)
4. If the JSON write fails, copies archived files back to the active paths and leaves metadata unchanged
5. If the JSON write succeeds, deletes the active original/card/detail files
6. Rebuilds `customerCatalog.json` through `buildCustomerCatalog()`
7. The product immediately appears in Missing Images; the customer app uses the no-image fallback after refresh

The product row itself is never deleted. Units, mappings, aliases, recommendations, IDs, and names are not written.

Residual crash windows:

- After a successful JSON write and before active files are unlinked: metadata has no image, old files may still sit on disk unused
- If unlink fails after JSON success: same — customer JSON has no paths; leftover files are orphans
- After copy-to-trash and before JSON: extra trash copy only; live image still assigned
- Guessable HTTP access to `.trash` under `public/` if someone knows the timestamp path

There is no Trash UI in this stage.

---

## Watermark

- Asset: `scripts/assets/matahari-langowan-watermark.svg`
- Config: `scripts/watermarkConfig.js`
- Applied to **card** and **detail** only (upper-right, ~19% width, opacity 0.32)
- **Original is never watermarked**
- **Regenerate** rebuilds card/detail from the stored original using the current framing and watermark config. The original file is not rewritten
- Future watermark or framing changes can be applied the same way: keep clean originals, change config, regenerate card/detail
- `node scripts/regenerateProductImages.js --all` is still refused. A later guarded “Regenerate All” can loop the existing single-product `regenerateDerivedImages()` helper

---

## Stop all services

In the terminal running `npm run studio`, press `Ctrl+C`.

That stops both the image service and Vite.

If you started them separately, stop each terminal with `Ctrl+C`.

---

## Restore with Git

If a catalogue edit needs undoing and Git still has the previous `products.json`:

```bash
git checkout -- src/catalog/products.json
```

Or restore a Studio backup set from `src/catalog/backups/<timestamp>/` by copying the JSON files in that folder back over the live catalogue files.

Generated image files under `public/product-images/` may also need manual cleanup or restore from Git if they were committed.

---

## Why this must remain local-only

- The image service binds only to `127.0.0.1`
- There is no authentication
- The service can write catalogue JSON and image files on disk
- Exposing it on a public network interface would allow untrusted image and catalogue writes

Do not reverse-proxy it to the internet. Do not bind it to `0.0.0.0`. Do not deploy Version 1 as a public admin tool.

---

## Products tab

The Products tab edits **customer-facing** name and category for the full catalogue.

- Editable: customer-facing name, category
- Read-only: product ID, variant ID, aliases, photo, POS name, POS code
- Alias chips are display-only in this stage (no add/remove)
- Category is a dropdown of the nine IDs from `CATEGORY_CONFIG` in `src/config/categories.js`, plus any extra values already present in `products.json`. There is no free-text category creation, and Studio does not edit `src/config/categories.js`. Keep Studio’s list in sync by importing `CURATED_CATEGORY_IDS` from that file.
- Saves go through the catalogue transaction layer (`update-product-metadata`)
- A name change updates `products.json` name, matching `variants.json` names, and `mappings.productName` only
- POS name, POS code, IDs, aliases, image paths, units, favorites, and recommendations are not written
- Changing category does not move or delete image files
- After a successful name/category save, Studio rebuilds the generated customer catalogue. If that rebuild warns, run `npm run catalog:customer-build`.

Keyboard: `Ctrl+F` on the Products tab focuses the Products search, not the image search.

---

## API (local image service)

Backwards-compatible cigarette routes still exist. Images/Queue now use all-product routes:

- `GET /api/studio/images` — all products, image stats, categories, recent assign-image IDs
- `POST /api/studio/images/preview` — generate card/detail previews without writing files
- `POST /api/studio/products/:id/image` — assign/replace
- `POST /api/studio/products/:id/image/regenerate` — rebuild card/detail from original using current framing and watermark rules
- `POST /api/studio/products/:id/image/remove` — `{ confirm: true }` archives files, removes image metadata, rebuilds the customer catalogue
- `GET /api/studio/cigarettes` — Rokok-only list (compat)
- `POST /api/studio/cigarettes/:id/image` — same assign handler as the all-product route
