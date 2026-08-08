# Matahari Catalogue Studio

Local development tool for assigning product images to the cigarette catalogue.

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
2. Search cigarette products by name (case-insensitive, partial match).
3. Use arrow keys and Enter, or click, to select a product.
4. Review the current card image, or the **Missing Image** state.
5. Add an image by drag-and-drop, **Choose File**, or clipboard paste.
6. Confirm the preview prompt: **Assign this image to: &lt;Product Name&gt;**.
7. If the product already has an image, confirm the additional replace step.

Keyboard:

- `Ctrl+F` focuses Studio product search (does not open browser find)
- `Ctrl+V` pastes an image when the clipboard contains image data
- `Enter` confirms save when a confirmation dialog is open
- `Escape` cancels preview or confirmation

---

## Queue workflow

1. Open the **Queue** tab.
2. By default the queue lists cigarette products that are still missing images.
3. Review completed / total / missing counts, the current product name, and queue position.
4. Assign an image with the same drop / file / paste flow.
5. After a successful save, the queue advances to the next product missing an image.
6. Use **Previous**, **Skip**, and **Next** to move through the queue.
7. Enable **Browse all cigarette products** when you need to revisit products that already have images.

Keyboard:

- Left / Right arrow keys navigate queue products when focus is not inside a text field

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

---

## Photography recommendations

- Photograph the full retail pack against a plain surface
- Keep the pack upright and fully in frame
- Prefer even lighting without harsh glare
- Avoid cropping away brand marks or pack edges
- High-resolution phone photos are fine; Studio will generate card and detail sizes

Studio preserves the whole package using `fit: contain` on a warm neutral background matching the app (`#EDE8E1`).

---

## Storage locations

Original uploads:

`public/product-images/originals/cigarettes/<product-id>-original.<ext>`

Generated card images (360 × 360 WebP):

`public/product-images/cards/cigarettes/<product-id>.webp`

Generated detail images (900 × 900 WebP):

`public/product-images/details/cigarettes/<product-id>.webp`

Browser paths written into the catalogue look like:

- `/product-images/cards/cigarettes/<product-id>.webp`
- `/product-images/details/cigarettes/<product-id>.webp`
- `/product-images/originals/cigarettes/<product-id>-original.<ext>`

---

## Replacement behavior

Replacing an image:

1. Requires the normal assign confirmation
2. Requires an additional explicit replace confirmation
3. Overwrites generated card and detail files for that product ID
4. Writes a new original file and removes an older original with a different extension when needed
5. Creates a catalogue backup before updating `products.json`

---

## Catalogue backups and updates

Before each successful image assignment, Studio copies:

`src/catalog/products.json`

to a timestamped file in:

`src/catalog/backups/`

Example:

`src/catalog/backups/products-2026-08-05T14-30-00-000Z.json`

Catalogue writes:

- use a temporary file and rename strategy
- preserve stable product IDs
- modify only the selected product’s `image` fields (`card`, `detail`, `original`)
- leave units, aliases, mappings, variants, favorites, and POS links untouched

Image paths survive restarting Vite and the image service because files live under `public/` and metadata lives in `products.json`.

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

Or restore a Studio backup file from `src/catalog/backups/` by copying it back to `src/catalog/products.json`.

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

Version 1 shows only:

> Product management will be added later.

Naming, units, aliases, and variants remain out of scope for this release.
