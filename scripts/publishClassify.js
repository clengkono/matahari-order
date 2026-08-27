/**
 * Classify Git paths for the owner Publish workflow.
 * Pure helpers — no Git, no catalogue writes.
 */

export const SAFE_CATALOG_RELATIVE_PATHS = Object.freeze([
  "src/catalog/products.json",
  "src/catalog/variants.json",
  "src/catalog/units.json",
  "src/catalog/aliases.json",
  "src/catalog/mappings.json",
  "src/catalog/recommendations.json",
  "src/catalog/generated/customerCatalog.json",
]);

const SAFE_CATALOG_SET = new Set(SAFE_CATALOG_RELATIVE_PATHS);

export function normalizeRepoPath(input) {
  return String(input || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

export function unquoteGitPath(raw) {
  let value = String(raw || "").trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return normalizeRepoPath(value);
}

export function parseGitStatusPorcelain(text) {
  const entries = [];

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    if (!rawLine) {
      continue;
    }

    const xy = rawLine.slice(0, 2);
    const rest = rawLine.slice(3);
    if (!rest) {
      continue;
    }

    let origPath = null;
    let path;
    const arrow = rest.indexOf(" -> ");
    if (arrow !== -1 && (xy.includes("R") || xy.includes("C"))) {
      origPath = unquoteGitPath(rest.slice(0, arrow));
      path = unquoteGitPath(rest.slice(arrow + 4));
    } else {
      path = unquoteGitPath(rest);
    }

    entries.push({
      xy,
      path,
      origPath,
      untracked: xy === "??",
    });
  }

  return entries;
}

export function isTrashPath(input) {
  const parts = normalizeRepoPath(input).split("/");
  return parts.includes(".trash");
}

export function isSafeOwnerPath(input) {
  const path = normalizeRepoPath(input);
  if (!path || path.includes("..") || isTrashPath(path)) {
    return false;
  }
  if (path === "public/product-images" || path.startsWith("public/product-images/")) {
    return true;
  }
  return SAFE_CATALOG_SET.has(path);
}

export function classifyChangedPaths(paths) {
  const unique = [];
  const seen = new Set();

  for (const input of paths || []) {
    const path = normalizeRepoPath(input);
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    unique.push(path);
  }

  const owner = [];
  const developer = [];

  for (const path of unique) {
    if (isSafeOwnerPath(path)) {
      owner.push(path);
    } else {
      developer.push(path);
    }
  }

  return {
    all: unique,
    owner,
    developer,
    mixed: owner.length > 0 && developer.length > 0,
    hasDeveloper: developer.length > 0,
    hasOwner: owner.length > 0,
    empty: unique.length === 0,
  };
}

export function pathsFromPorcelain(text) {
  const paths = [];
  for (const entry of parseGitStatusPorcelain(text)) {
    paths.push(entry.path);
    if (entry.origPath) {
      paths.push(entry.origPath);
    }
  }
  return paths;
}

export function productIdFromImagePath(input) {
  const path = normalizeRepoPath(input);
  const base = path.split("/").pop() || "";
  const withoutOriginal = base.replace(/-original\.[^.]+$/i, "");
  const withoutExt = withoutOriginal.replace(/\.[^.]+$/, "");
  return withoutExt.startsWith("prod-") ? withoutExt : null;
}

export function summarizeImageChanges(paths) {
  const normalized = (paths || []).map(normalizeRepoPath);
  const imageFiles = normalized.filter(
    (path) =>
      path === "public/product-images" ||
      path.startsWith("public/product-images/")
  );
  const ids = new Set();
  for (const path of imageFiles) {
    const id = productIdFromImagePath(path);
    if (id) {
      ids.add(id);
    }
  }

  return {
    imageFileCount: imageFiles.length,
    productIds: [...ids],
    assignmentCount: ids.size,
    catalogChanged: normalized.some((path) => path.startsWith("src/catalog/")),
    productsJsonChanged: normalized.includes("src/catalog/products.json"),
  };
}

export function defaultCommitMessage(summary) {
  if (summary.assignmentCount >= 2) {
    return `Add ${summary.assignmentCount} product images`;
  }
  if (summary.assignmentCount === 1 || summary.imageFileCount > 0) {
    return "Add product images";
  }
  if (summary.catalogChanged) {
    return "Update catalogue";
  }
  return "Update catalogue";
}

export function formatPathList(paths, limit = 40) {
  const list = paths || [];
  if (list.length === 0) {
    return "(none)";
  }
  const shown = list.slice(0, limit);
  const extra = list.length - shown.length;
  const lines = shown.map((path) => `  ${path}`);
  if (extra > 0) {
    lines.push(`  … and ${extra} more`);
  }
  return lines.join("\n");
}
