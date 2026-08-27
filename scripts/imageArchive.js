/**
 * Recoverable archive for Studio image removal.
 * Copies active original/card/detail into a non-catalogue trash folder.
 * LOCAL ONLY.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export function makeTrashStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function uniqueTrashDir(trashRoot, productId, stamp = makeTrashStamp()) {
  let destDir = join(trashRoot, stamp, productId);
  let suffix = 1;
  while (existsSync(destDir)) {
    suffix += 1;
    destDir = join(trashRoot, `${stamp}-${suffix}`, productId);
  }
  return destDir;
}

function archiveFailure(cause) {
  const error = new Error(
    "Could not archive the image files. The product image was left unchanged."
  );
  error.status = 500;
  error.userSafe = true;
  error.cause = cause;
  return error;
}

/**
 * Copy assigned image files into trash and write a manifest.
 * Does not delete active files. Throws if the archive cannot be created.
 */
export function archiveAssignedImageFiles({
  product,
  resolvePath,
  trashRoot,
}) {
  if (!product?.id) {
    const error = new Error("Product ID is required to archive images.");
    error.status = 400;
    error.userSafe = true;
    throw error;
  }

  if (!trashRoot) {
    throw archiveFailure(new Error("Trash root is required."));
  }

  let destDir;
  try {
    destDir = uniqueTrashDir(trashRoot, product.id);
    mkdirSync(destDir, { recursive: true });
  } catch (error) {
    throw archiveFailure(error);
  }

  const files = [];

  try {
    for (const kind of ["original", "card", "detail"]) {
      const publicUrl = product.image?.[kind];
      if (typeof publicUrl !== "string" || !publicUrl) {
        continue;
      }

      const fromAbs = resolvePath(publicUrl);
      if (!fromAbs || !existsSync(fromAbs)) {
        continue;
      }

      const destAbs = join(destDir, basename(fromAbs));
      copyFileSync(fromAbs, destAbs);
      const sourceSize = statSync(fromAbs).size;
      if (!existsSync(destAbs) || statSync(destAbs).size !== sourceSize) {
        throw new Error(`Failed to archive ${kind} image.`);
      }

      files.push({
        kind,
        publicUrl,
        fromAbs,
        archivedAbs: destAbs,
        bytes: sourceSize,
      });
    }

    const manifest = {
      productId: product.id,
      productName: product.name ?? null,
      removedAt: new Date().toISOString(),
      action: "remove-image",
      sourcePaths: {
        original: product.image?.original ?? null,
        card: product.image?.card ?? null,
        detail: product.image?.detail ?? null,
      },
      files: files.map((file) => ({
        kind: file.kind,
        originalPath: file.publicUrl,
        archivedPath: file.archivedAbs,
        bytes: file.bytes,
      })),
    };

    writeFileSync(
      join(destDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    return { destDir, manifest, files };
  } catch (error) {
    throw archiveFailure(error);
  }
}

export function restoreArchivedImageFiles(archive) {
  if (!archive?.files?.length) {
    return;
  }

  for (const file of archive.files) {
    if (!file.archivedAbs || !existsSync(file.archivedAbs) || !file.fromAbs) {
      continue;
    }
    mkdirSync(dirname(file.fromAbs), { recursive: true });
    copyFileSync(file.archivedAbs, file.fromAbs);
  }
}
