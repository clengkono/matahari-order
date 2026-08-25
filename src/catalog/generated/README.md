# Generated customer catalogue

This folder is produced by `npm run catalog:customer-build`.

- **Authoritative source** remains `src/catalog/*.json` (the six-file catalogue).
- **`customerCatalog.json` is generated.** Do not edit it by hand.
- Catalogue Studio, `catalog:check`, transactions, import tools, and POS mappings continue to use the six source files.
- The customer app imports only this artefact.

## Regenerate

```bash
npm run catalog:customer-build
```

`npm run build` regenerates it before Vite so production cannot ship a stale copy.

After Catalogue Studio edits, run `catalog:customer-build` (or `npm run build`) before testing the customer app, because transactions do not rewrite this file.
