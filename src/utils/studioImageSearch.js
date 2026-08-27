/**
 * Client-side Studio Images/Queue matching and queue-entry helpers.
 * Does not change customer-app search.
 */

export const STUDIO_IMAGE_PAGE_SIZE = 40;

export function normalizeStudioQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function textOf(value) {
  return String(value ?? "").toLowerCase();
}

function aliasList(product) {
  return (product?.aliases ?? []).map((alias) => textOf(alias));
}

function hasWordStart(text, query) {
  return text.split(/[\s/_-]+/).some((part) => part.startsWith(query));
}

export function scoreStudioImageMatch(product, rawQuery) {
  const query = normalizeStudioQuery(rawQuery);
  if (!query) {
    return 0;
  }

  const name = textOf(product?.name);
  const id = textOf(product?.id);
  const posName = textOf(product?.posName);
  const posCode = textOf(product?.posCode);
  const aliases = aliasList(product);

  if (name === query) {
    return 1000;
  }
  if (name.startsWith(query)) {
    return 900;
  }
  if (hasWordStart(name, query)) {
    return 850;
  }
  if (name.includes(query)) {
    return 800;
  }

  if (aliases.some((alias) => alias === query)) {
    return 700;
  }
  if (aliases.some((alias) => alias.startsWith(query))) {
    return 650;
  }
  if (aliases.some((alias) => alias.includes(query))) {
    return 600;
  }

  if (posCode === query) {
    return 520;
  }
  if (posName === query) {
    return 510;
  }
  if (posCode.startsWith(query) || posName.startsWith(query)) {
    return 480;
  }
  if (posName.includes(query) || posCode.includes(query)) {
    return 400;
  }

  if (id === query) {
    return 350;
  }
  if (id.includes(query)) {
    return 300;
  }

  return 0;
}

export function matchesStudioImageQuery(product, rawQuery) {
  const query = normalizeStudioQuery(rawQuery);
  if (!query) {
    return true;
  }
  return scoreStudioImageMatch(product, query) > 0;
}

export function filterStudioImageProducts(
  products,
  { query = "", status = "all", category = "", recentIds = [] } = {}
) {
  const recent = new Set(recentIds);
  const matched = (products ?? []).filter((product) => {
    if (category && product.category !== category) {
      return false;
    }

    if (status === "missing" && product.hasImage) {
      return false;
    }

    if (status === "has" && !product.hasImage) {
      return false;
    }

    if (status === "recent" && !recent.has(product.id)) {
      return false;
    }

    return matchesStudioImageQuery(product, query);
  });

  const normalized = normalizeStudioQuery(query);
  if (!normalized) {
    return matched;
  }

  return matched
    .map((product, index) => ({
      product,
      index,
      score: scoreStudioImageMatch(product, normalized),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.product);
}

export function queueNeighbors(products, selectedId) {
  const list = products ?? [];
  const index = list.findIndex((product) => product.id === selectedId);
  if (index < 0) {
    return {
      previousId: null,
      nextId: list[0]?.id ?? null,
      remaining: list.length,
      position: 0,
    };
  }

  return {
    previousId: index > 0 ? list[index - 1].id : null,
    nextId: index < list.length - 1 ? list[index + 1].id : null,
    remaining: list.length,
    position: index + 1,
  };
}

export function missingNeighbors(products, selectedId) {
  return queueNeighbors(
    (products ?? []).filter((product) => !product.hasImage),
    selectedId
  );
}

export function nextProductAfterSave(filtered, savedId) {
  const list = filtered ?? [];
  const index = list.findIndex((product) => product.id === savedId);
  if (index >= 0 && index < list.length - 1) {
    return list[index + 1].id;
  }

  const remaining = list.filter((product) => product.id !== savedId);
  return remaining[0]?.id ?? null;
}

export function continueWhereLeftOff(products, recentIds = []) {
  const list = products ?? [];
  const lastId = recentIds[0];
  if (!lastId) {
    return list.find((product) => !product.hasImage)?.id ?? null;
  }

  const index = list.findIndex((product) => product.id === lastId);
  const start = index >= 0 ? index + 1 : 0;
  const later = list.slice(start).find((product) => !product.hasImage);
  if (later) {
    return later.id;
  }

  return list.find((product) => !product.hasImage)?.id ?? lastId;
}

export function selectionForFilter(filtered, selectedId) {
  const list = filtered ?? [];
  if (list.length === 0) {
    return { id: selectedId, stale: Boolean(selectedId) };
  }

  if (selectedId && list.some((product) => product.id === selectedId)) {
    return { id: selectedId, stale: false };
  }

  return { id: list[0].id, stale: Boolean(selectedId) };
}

export function isStudioTypingTarget(target) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const tag = String(target.tagName || "").toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(target.isContentEditable)
  );
}

export function pickFirstImageFile(fileList) {
  const files = Array.from(fileList ?? []).filter((file) => {
    if (!file) {
      return false;
    }
    if (typeof file.type === "string" && file.type.startsWith("image/")) {
      return true;
    }
    const name = String(file.name || "").toLowerCase();
    return (
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png") ||
      name.endsWith(".webp")
    );
  });

  return {
    file: files[0] ?? null,
    extraCount: Math.max(0, files.length - 1),
    total: files.length,
  };
}
