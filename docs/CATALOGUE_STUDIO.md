# Matahari Catalogue Studio

Local development tool for assigning product images across the full catalogue (2,256 products).

**LOCAL ONLY.** The Studio UI and image service are not authenticated and must never be publicly deployed as-is.

Owner daily steps (start, add photos, publish): [OWNER_STUDIO.md](OWNER_STUDIO.md)

---

## Start Studio

Everyday (Windows): double-click `Start Matahari Studio.cmd`, or use the Desktop shortcut after running `Create Matahari Desktop Shortcuts.cmd`.

That starts the local services, waits until they are ready, and opens:

[http://127.0.0.1:5173/studio](http://127.0.0.1:5173/studio)

Equivalent npm command (still available):

```bash
npm run studio:start
```

Low-level start without the browser wait (still available):

```bash
npm run studio
```

This starts:

1. the local image service on `127.0.0.1:8787`
2. Vite on `127.0.0.1:5173`

The customer app remains at:

[http://127.0.0.1:5173/](http://127.0.0.1:5173/)

If Studio is already running, the one-click launcher opens `/studio` again and does not start a second copy.

### Separate commands (optional)

If you prefer two terminals:

```bash
npm run studio:api
npm run dev
```

Then open `/studio` in the Vite app.

### Publish photos to GitHub

Everyday: double-click `Publish Matahari Changes.cmd`, review the summary, press **Y**.

Equivalent npm command:

```bash
npm run studio:publish
```

Publish is never automatic when Studio closes. It only sends owner image/catalogue files after checks and confirmation. After validation rebuilds the customer catalogue, Publish re-reads git status and includes `src/catalog/generated/customerCatalog.json` when that generated file changed. Source-code files still block everyday publish. Underlying `git` / `npm run catalog:*` commands remain available.

---

## Images workflow

1. Open Studio — **Queue** is the default tab for fast missing-image entry. Use **Images** to browse the full catalogue.
2. Search any catalogue product by customer-facing name, alias, product ID, POS name, or POS code. Stronger customer-name matches sort first.
3. Filter by **Missing image**, **Has image**, **Category**, or **Recently updated**. If the selected product is outside the new filter, Studio selects the first visible match.
4. The result list shows 40 rows at a time, with **Show 40 more** if needed. Prefer search or Next missing over scrolling the whole catalogue.
5. For a missing product, paste (`Ctrl+V`), drop, or **Choose file**. Preview source + generated card/detail, then **Confirm & Save**. Nothing is saved until that click (or Enter in the confirm dialog).
6. After a successful Queue save, Studio shows `✓ {name} image saved` and opens the next missing product in the current filter. A customer-catalogue rebuild warning stays on the saved product and does not auto-advance.
7. If the product already has an image, confirm the additional replace step. Fast-entry keys cannot skip that step.

Keyboard:

- `/` or `Ctrl+F` focuses the current tab’s product search (does not open browser find)
- Queue: `Ctrl+F` / `/` focuses the missing-image search
- Images: `Ctrl+F` / `/` focuses the all-product image search
- Products: `Ctrl+F` / `/` focuses the full-catalogue product search
- `Ctrl+V` pastes an image when a product is selected and you are not typing in a field
- Left / Right (Queue) previous / next missing in the current filtered list, not while typing or while a confirm dialog is open
- `Enter` confirms save only in the assign/replace dialog, and not while typing
- `Escape` cancels preview or confirmation
- There is no keyboard shortcut for Remove image

---

## Queue workflow

1. Studio opens on the **Queue** tab. Missing images is the default filter.
2. Progress reads like `8 selesai · 2.248 belum ada gambar`, plus `12 of 2248` on the selected product.
3. Assign an image with paste / drop / file. Review the preview. Confirm & Save.
4. That product leaves the missing list. Studio selects the next missing product in the current search/filter and focuses the paste target.
5. **Previous missing** / **Next missing** (or Left / Right) stay inside the current filtered result set.
6. **Continue where I left off** jumps to the next missing product after the most recently assigned image.
7. If a search/filter has no remaining missing products after save, Studio clears the search and continues the missing queue.

---

## Clipboard paste

Copy an image (not plain text) and press `Ctrl+V` while a product is selected and you are not typing in search.

- Image clipboard data is accepted
- Arbitrary text is ignored as an image source
- Paste while a search/input is focused does **not** assign an image
- Multiple dropped/pasted files: only the first image is used, with a notice. No bulk auto-match.

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

Active images are stored by product ID only. There is no category folder, and the historical `cigarettes/` bucket is not used for new or migrated files.

Original uploads (unwatermarked):

`public/product-images/originals/<product-id>-original.<ext>`

Generated card images (360 × 360 WebP, watermarked):

`public/product-images/cards/<product-id>.webp`

Generated detail images (900 × 900 WebP, watermarked):

`public/product-images/details/<product-id>.webp`

Browser paths written into the catalogue look like:

- `/product-images/cards/<product-id>.webp`
- `/product-images/details/<product-id>.webp`
- `/product-images/originals/<product-id>-original.<ext>`

The customer catalogue exposes **card + detail only**. Original remains Studio/internal metadata.

Category edits do not move files. Product ID is the stable image identity.

Removed images are copied (not served to customers) to:

`public/product-images/.trash/<timestamp>/<product-id>/`

That folder holds the archived original/card/detail files plus `manifest.json` (`productId`, `removedAt`, source paths). It is gitignored. Vite does not watch `.trash` (avoids a Windows `EBUSY` crash when files are archived). The Studio Vite middleware also 404s `/product-images/.trash/…`. Customer catalogue JSON never includes those paths.

Stage 5F migration copies files first, then updates `products.json` in a catalogue transaction, then deletes leftover `cigarettes/` files. If the process dies after the copy and before the JSON write, both locations can exist while metadata still points at the old path. Re-run the guarded migration; it is written to continue safely. If JSON succeeds and process dies before deleting leftovers, metadata is already canonical and a second run is a no-op besides leftover cleanup.

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

The transaction set includes the identity/POS files plus owner-curated `productFamilies.json` and `productDefaults.json`. `variants.json` defaults remain the import fallback; owner-confirmed defaults live only in `productDefaults.json` and win in the generated customer catalogue.

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
- Guessable HTTP access to `.trash` is blocked in Vite dev/preview (404) and stripped from `dist` on build. A generic static server pointed at `public/` could still expose it.

Known future cleanup (not changed in Stage 6B.3): card and detail both archive as `prod-<id>.webp` in the same `.trash` folder, so one can overwrite the other. Live catalogue assignment is still correct. Distinct archive filenames belong in a later image-archive cleanup, not a storage redesign here.

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

In the window started by **Start Matahari Studio** (or `npm run studio`), press `Ctrl+C`.

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
- Vite is also bound to `127.0.0.1`
- There is no authentication
- The service can write catalogue JSON and image files on disk
- Image files live in this Git working tree (`public/product-images/`)
- Catalogue transactions assume a local owner on this computer
- Publish uses the owner’s existing Git login; it does not store GitHub passwords or tokens

Do not reverse-proxy it to the internet. Do not bind it to `0.0.0.0`. Do not expose port 8787. Do not add tunnel tooling. Do not deploy Version 1 as a public admin tool.

---

## Future remote collaboration (not in this stage)

Remote Studio access is **not** implemented. These local assumptions currently block it:

- images are stored on the local filesystem and committed through Git
- catalogue writes go to the local working tree
- there is no authentication or authorization
- the Studio API binds to `127.0.0.1` only
- the catalogue transaction system assumes a local owner
- image paths in the catalogue point at repo files

A later remote-collaboration stage would need all of:

- authentication
- roles and permissions
- centralized image storage or a controlled write service
- a hosted catalogue mutation service
- an audit trail

Do not treat opening a tunnel or binding `0.0.0.0` as a substitute for those.

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

Keyboard: `Ctrl+F` (and `/`) focuses the search on the current tab — Products, Defaults, Families, Queue, or Images.

---

## Defaults tab

Review and confirm customer-facing default units. The list is large; filter **Needs review** first.

- **Needs review** — no owner row yet. The dropdown still shows the current automatic fallback. That fallback is not missing or broken.
- **Configured / Confirmed** — the owner has saved a default, even if it matches the automatic fallback.
- Choose a unit from that product’s available units only. The save is immediate (no page-wide Save).
- **Confirm** saves the unit currently shown. Use this when the fallback is already correct — changing the dropdown is not required.
- **Use automatic default** clears the owner row. The effective unit returns to the import fallback.
- If a save reports that the customer catalogue could not be rebuilt, treat it as a partial success. The owner setting was stored; run `npm run catalog:customer-build` (or Publish’s validation) before publishing.

Owner changes are published later with **Publish Matahari Changes**.

---

## Families tab

Manage Produk Serupa groups. Family id is not shown and cannot be edited.

- **Create family** starts a local draft. Save/Create stays disabled until the name is non-empty and there are at least 2 members. Nothing is POSTed until then.
- Edit an existing family locally, then **Save changes**. Removing a member does not PATCH a one-member family.
- **Add product** searches the existing owner product list (name, aliases, id, POS name, POS code). A product already in another family cannot be added; the other family name is shown. There is no silent move.
- **Delete family** asks for confirmation. Products are not deleted — only the Produk Serupa relationship is removed.
- A `customerCatalog.ok: false` response is a partial-success warning, not a normal save.

Publish later with **Publish Matahari Changes**.

---

## Defaults and families (local API)

Studio remains **local-only** (`127.0.0.1:8787`, no authentication).

Owner default units live in `src/catalog/productDefaults.json`. A row means the owner confirmed that unit (`ownerConfigured: true`), even when it matches the import/heuristic fallback. `DELETE` removes that row; the effective default returns to the variant/import fallback. There is no customer-facing “owner configured” flag.

Product families continue to live in `src/catalog/productFamilies.json`. Writes are catalogue transactions: validate, persist atomically, then rebuild the generated customer catalogue. A no-op write does not rebuild. Recommendations are not rewritten. Deleting a family does not delete member products.

`GET /api/studio/products` remains the owner product picker.

If a source write succeeds and the customer rebuild then fails, Studio reports `customerCatalog.ok: false` and a warning. The source change is not rolled back. The Defaults and Families tabs must show that as a prominent partial-success warning, not an ordinary successful-save indicator. Run `npm run catalog:customer-build`. Do not add rollback-after-rebuild.

---

## API (local image service)

Backwards-compatible cigarette routes still exist. Images/Queue now use all-product routes:

- `GET /api/studio/images` — all products, image stats, categories, recent assign-image IDs
- `POST /api/studio/images/preview` — generate card/detail previews without writing files
- `GET /api/studio/products` — owner product list for Products/Images and future pickers
- `GET /api/studio/products/:id` — one owner product row
- `PATCH /api/studio/products/:id` — customer-facing name and/or category
- `POST /api/studio/products/:id/image` — assign/replace
- `POST /api/studio/products/:id/image/regenerate` — rebuild card/detail from original using current framing and watermark rules
- `POST /api/studio/products/:id/image/remove` — `{ confirm: true }` archives files, removes image metadata, rebuilds the customer catalogue
- `GET /api/studio/defaults` — owner default-unit rows (`availableUnits`, `currentDefaultUnit`, `ownerDefaultUnit`, `ownerConfigured`)
- `PATCH /api/studio/products/:id/default-unit` — `{ "defaultUnitName": "Pak" }` confirms an owner override
- `DELETE /api/studio/products/:id/default-unit` — clear that override; missing override is a no-op
- `GET /api/studio/families` — families and member identity (no prices or conversions)
- `POST /api/studio/families` — `{ "name", "members" }` (minimum 2, no cross-family members)
- `PATCH /api/studio/families/:id` — name and/or members; id is immutable
- `DELETE /api/studio/families/:id` — remove the family only
- `GET /api/studio/cigarettes` — Rokok-only list (compat)
- `POST /api/studio/cigarettes/:id/image` — same assign handler as the all-product route
