/**
 * Guarded migration: legacy product-images/.../cigarettes/<id> → canonical
 * product-images/{cards,details,originals}/<id>.
 *
 * Default is dry-run. Live apply requires --apply.
 * Does not regenerate image bytes.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, runCatalogTransaction } from "./catalogTransaction.js";
import { rebuildCustomerCatalogAfterStudioWrite } from "./studioImageCatalog.js";
import {
  canonicalCardAbs,
  canonicalDetailAbs,
  canonicalOriginalAbs,
  originalExtensionFromPublicUrl,
  plannedCanonicalImage,
  publicUrlToAbs,
} from "./imagePaths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEFAULT_CATALOG_DIR = join(ROOT, "src", "catalog");
const DEFAULT_PUBLIC_DIR = join(ROOT, "public");
const KINDS = ["card", "detail", "original"];

function isRegularFile(abs) {
  try {
    return Boolean(abs) && existsSync(abs) && statSync(abs).isFile();
  } catch {
    return false;
  }
}

function sameBytes(leftAbs, rightAbs) {
  if (!isRegularFile(leftAbs) || !isRegularFile(rightAbs)) {
    return false;
  }
  const left = readFileSync(leftAbs);
  const right = readFileSync(rightAbs);
  return Buffer.compare(left, right) === 0;
}

function kindAbs(kind, publicImages, productId, originalExt) {
  if (kind === "card") {
    return canonicalCardAbs(publicImages, productId);
  }
  if (kind === "detail") {
    return canonicalDetailAbs(publicImages, productId);
  }
  return canonicalOriginalAbs(publicImages, productId, originalExt);
}

export function planProductImageNormalization(product, publicImages) {
  const planned = plannedCanonicalImage(product);
  if (!planned) {
    return { status: "skip", productId: product?.id ?? null, files: [] };
  }

  const files = [];
  const originalExt =
    originalExtensionFromPublicUrl(product.image.original) || "png";

  for (const kind of KINDS) {
    const fromUrl = product.image[kind];
    const toUrl = planned[kind];
    const fromAbs = publicUrlToAbs(fromUrl, publicImages);
    const toAbs = kindAbs(kind, publicImages, product.id, originalExt);
    const fromExists = isRegularFile(fromAbs);
    const toExists = existsSync(toAbs);
    const identical = fromAbs && toAbs && fromAbs === toAbs;
    const bytesMatch =
      identical || (fromExists && toExists && sameBytes(fromAbs, toAbs));

    let status = "move";
    if (identical && fromExists) {
      status = "already-canonical";
    } else if (!fromExists && toExists) {
      status = "dest-only";
    } else if (!fromExists && !toExists) {
      status = "missing";
    } else if (toExists && fromExists && !bytesMatch) {
      status = "conflict";
    } else if (toExists && bytesMatch) {
      status = "already-copied";
    }

    files.push({
      kind,
      fromUrl,
      toUrl,
      fromAbs,
      toAbs,
      fromExists,
      toExists,
      bytesMatch,
      status,
    });
  }

  const conflict = files.some((file) => file.status === "conflict");
  const missing = files.some((file) => file.status === "missing");
  const already =
    files.every(
      (file) =>
        file.status === "already-canonical" || file.status === "already-copied"
    ) && files.every((file) => file.toUrl === product.image[file.kind]);
  const metadataOnly =
    !conflict &&
    !missing &&
    files.every(
      (file) =>
        file.status === "already-canonical" ||
        file.status === "already-copied" ||
        file.status === "dest-only"
    ) &&
    files.some((file) => file.toUrl !== product.image[file.kind]);

  let status = "migrate";
  if (conflict) {
    status = "conflict";
  } else if (missing) {
    status = "missing";
  } else if (already) {
    status = "already-canonical";
  } else if (metadataOnly) {
    status = "metadata-only";
  }

  return {
    status,
    productId: product.id,
    name: product.name,
    current: {
      card: product.image.card,
      detail: product.image.detail,
      original: product.image.original,
    },
    planned,
    files,
  };
}

export function planNormalizeImageStorage(options = {}) {
  const catalogDir = options.catalogDir ?? DEFAULT_CATALOG_DIR;
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR;
  const publicImages = join(publicDir, "product-images");
  const catalog = options.catalog ?? loadCatalog({ catalogDir });

  const products = [];
  for (const product of catalog.products) {
    if (!product.image) {
      continue;
    }
    products.push(planProductImageNormalization(product, publicImages));
  }

  const migrate = products.filter((item) => item.status === "migrate");
  const metadataOnly = products.filter((item) => item.status === "metadata-only");
  const alreadyCanonical = products.filter(
    (item) => item.status === "already-canonical"
  );
  const conflicts = products.filter((item) => item.status === "conflict");
  const missing = products.filter((item) => item.status === "missing");
  const ready =
    conflicts.length === 0 &&
    missing.length === 0 &&
    migrate.length + metadataOnly.length + alreadyCanonical.length ===
      products.length;

  return {
    ready,
    publicImages,
    catalogDir,
    totalImaged: products.length,
    migrate,
    metadataOnly,
    alreadyCanonical,
    conflicts,
    missing,
    products,
    needsCatalogueWrite: migrate.length + metadataOnly.length > 0,
  };
}

function copyPreparedFile(file) {
  if (file.status === "already-canonical" || file.status === "already-copied") {
    return { copied: false, prepared: true };
  }
  if (file.status === "dest-only") {
    return { copied: false, prepared: true };
  }
  mkdirSync(dirname(file.toAbs), { recursive: true });
  copyFileSync(file.fromAbs, file.toAbs);
  if (!sameBytes(file.fromAbs, file.toAbs)) {
    throw new Error(`Copied ${file.kind} bytes do not match the source.`);
  }
  return { copied: true, prepared: true };
}

function removePreparedCopies(copiedAbs) {
  for (const abs of copiedAbs) {
    try {
      if (existsSync(abs)) {
        unlinkSync(abs);
      }
    } catch {
      // Best-effort rollback of prepared destinations.
    }
  }
}

function removeLegacySources(files) {
  const removed = [];
  for (const file of files) {
    if (!file.fromAbs || file.fromAbs === file.toAbs) {
      continue;
    }
    if (!existsSync(file.fromAbs)) {
      continue;
    }
    if (!sameBytes(file.fromAbs, file.toAbs)) {
      continue;
    }
    unlinkSync(file.fromAbs);
    removed.push(file.fromAbs);
  }
  return removed;
}

export function removeEmptyLegacyImageDirs(publicImages) {
  const removed = [];
  const candidates = [
    join(publicImages, "cards", "cigarettes"),
    join(publicImages, "details", "cigarettes"),
    join(publicImages, "originals", "cigarettes"),
  ];

  for (const dir of candidates) {
    if (!existsSync(dir)) {
      continue;
    }
    const entries = readdirSync(dir);
    const leftover = entries.filter((name) => name !== ".gitkeep");
    if (leftover.length === 0) {
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    }
  }

  return removed;
}

export function applyNormalizeImageStorage(options = {}) {
  const dryRun = options.dryRun !== false && options.apply !== true;
  const plan = planNormalizeImageStorage(options);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      ready: plan.ready,
      plan,
      transaction: null,
      copied: [],
      removedSources: [],
      removedDirs: [],
    };
  }

  if (!plan.ready) {
    return {
      ok: false,
      dryRun: false,
      ready: false,
      plan,
      error: plan.conflicts.length
        ? "Destination conflict: a canonical file already exists with different bytes."
        : "A source image file is missing. Migration stopped.",
    };
  }

  if (!plan.needsCatalogueWrite) {
    const removedDirs = removeEmptyLegacyImageDirs(plan.publicImages);
    return {
      ok: true,
      dryRun: false,
      ready: true,
      plan,
      noop: true,
      transaction: { ok: true, noop: true },
      copied: [],
      removedSources: [],
      removedDirs,
    };
  }

  const toMigrate = [...plan.migrate, ...plan.metadataOnly];
  const copiedAbs = [];
  const preparedByProduct = new Map();

  try {
    for (const item of toMigrate) {
      const prepared = [];
      for (const file of item.files) {
        const result = copyPreparedFile(file);
        if (result.copied) {
          copiedAbs.push(file.toAbs);
        }
        prepared.push(file);
      }
      preparedByProduct.set(item.productId, prepared);
    }
  } catch (error) {
    removePreparedCopies(copiedAbs);
    return {
      ok: false,
      dryRun: false,
      ready: true,
      plan,
      error: error.message || "Could not prepare destination image files.",
      rolledBackCopies: true,
    };
  }

  const productIds = toMigrate.map((item) => item.productId);
  const plannedById = new Map(toMigrate.map((item) => [item.productId, item.planned]));

  const transaction = runCatalogTransaction({
    action: "normalize-image-storage",
    productIds,
    summary: `Normalized image storage for ${productIds.length} products`,
    catalogDir: options.catalogDir ?? plan.catalogDir,
    backupsDir: options.backupsDir,
    validateOptions: options.validateOptions ?? {
      publicDir: options.publicDir ?? DEFAULT_PUBLIC_DIR,
    },
    testHooks: options.testHooks,
    mutate(catalog) {
      if (options.forceMetadataError) {
        throw new Error(
          typeof options.forceMetadataError === "string"
            ? options.forceMetadataError
            : "forced metadata failure"
        );
      }
      for (const product of catalog.products) {
        const planned = plannedById.get(product.id);
        if (!planned) {
          continue;
        }
        product.image = {
          card: planned.card,
          detail: planned.detail,
          original: planned.original,
        };
      }
    },
  });

  if (!transaction.ok) {
    removePreparedCopies(copiedAbs);
    return {
      ok: false,
      dryRun: false,
      ready: true,
      plan,
      error: transaction.error || "Catalogue metadata update failed.",
      transaction,
      rolledBackCopies: true,
    };
  }

  const removedSources = [];
  for (const item of toMigrate) {
    removedSources.push(...removeLegacySources(item.files));
  }

  const removedDirs = removeEmptyLegacyImageDirs(plan.publicImages);

  let customerCatalog = null;
  if (!options.skipCustomerRebuild && !transaction.noop) {
    customerCatalog = rebuildCustomerCatalogAfterStudioWrite({
      catalogDir: options.catalogDir ?? plan.catalogDir,
      outputPath: options.customerOutputPath,
      validateOptions: options.validateOptions ?? {
        publicDir: options.publicDir ?? DEFAULT_PUBLIC_DIR,
      },
    });
  }

  return {
    ok: true,
    dryRun: false,
    ready: true,
    plan,
    noop: Boolean(transaction.noop),
    transaction,
    copied: copiedAbs,
    removedSources,
    removedDirs,
    customerCatalog,
    preparedByProduct,
  };
}

function printPlan(plan) {
  console.log("Normalize product image storage");
  console.log("-------------------------------");
  console.log(`Imaged products: ${plan.totalImaged}`);
  console.log(`Migrate files:   ${plan.migrate.length}`);
  console.log(`Metadata only:   ${plan.metadataOnly.length}`);
  console.log(`Already canonical: ${plan.alreadyCanonical.length}`);
  console.log(`Conflicts:       ${plan.conflicts.length}`);
  console.log(`Missing files:   ${plan.missing.length}`);
  console.log(`Ready:           ${plan.ready ? "READY" : "NOT READY"}`);

  if (plan.conflicts.length) {
    console.log("");
    console.log("Conflicts:");
    for (const item of plan.conflicts) {
      for (const file of item.files.filter((entry) => entry.status === "conflict")) {
        console.log(`  ${item.productId} ${file.kind}: ${file.fromAbs} → ${file.toAbs}`);
      }
    }
  }

  if (plan.missing.length) {
    console.log("");
    console.log("Missing:");
    for (const item of plan.missing) {
      for (const file of item.files.filter((entry) => entry.status === "missing")) {
        console.log(`  ${item.productId} ${file.kind}: ${file.fromUrl}`);
      }
    }
  }

  if (plan.migrate.length) {
    console.log("");
    console.log("Would move:");
    for (const item of plan.migrate) {
      console.log(`  ${item.productId} (${item.name})`);
      for (const file of item.files) {
        console.log(`    ${file.kind}: ${file.fromUrl} → ${file.toUrl}`);
      }
    }
  }
}

function isLaunchedDirectly() {
  const entry = process.argv[1] && resolve(process.argv[1]);
  return Boolean(entry) && resolve(fileURLToPath(import.meta.url)) === entry;
}

if (isLaunchedDirectly()) {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  if (apply && !process.argv.includes("--apply")) {
    console.error("Refusing to apply without --apply.");
    process.exit(1);
  }

  const result = applyNormalizeImageStorage({ dryRun, apply });
  printPlan(result.plan);
  if (!result.ok) {
    console.error(result.error || "Migration failed.");
    process.exitCode = 1;
  } else if (result.dryRun) {
    console.log("");
    console.log("Dry-run only. Re-run with --apply to write.");
  } else if (result.noop) {
    console.log("");
    console.log("Already canonical. No catalogue changes.");
  } else {
    console.log("");
    console.log(`Applied. Backup: ${result.transaction?.backupId || "(none)"}`);
    console.log(`Files copied: ${result.copied.length}`);
    console.log(`Legacy files removed: ${result.removedSources.length}`);
  }
}
