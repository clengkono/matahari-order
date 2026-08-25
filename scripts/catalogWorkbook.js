/**
 * Shared POS workbook parser and unit/name helpers for catalogue import.
 *
 * Reads imports/*.xlsx via tar extract (no extra npm packages).
 * Does not write src/catalog.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_COLUMNS = new Set(["Jenis", "Harga Pokok", "Harga Jual"]);
const HEADER_LABELS = {
  kodeItem: "Kode Item",
  namaItem: "Nama Item",
  stok: "Stok",
  satuan: "Satuan",
  qtyPerPaket: "Qty/Paket",
};

export const POS_UNIT_TO_CUSTOMER = Object.freeze({
  BKS: "Bungkus",
  "5BKS": "5 Bungkus",
  "5 BKS": "5 Bungkus",
  "1/2 SLOF": "½ Slof",
  "½ SLOF": "½ Slof",
  "1/2SLOF": "½ Slof",
  SLOF: "Slof",
  BAL: "Bal",
  BLK: "Balok",
  DOS: "Dus",
  DUS: "Dus",
  PCS: "Pcs",
  PAK: "Pak",
  PACK: "Pack",
  "1/2PAK": "½ Pak",
  "1/2 PAK": "½ Pak",
  "½ PAK": "½ Pak",
  KTN: "Karton",
  KARTON: "Karton",
  "1/2KTN": "½ Karton",
  "1/2 KTN": "½ Karton",
  "½ KTN": "½ Karton",
  "1/4KTN": "¼ Karton",
  "1/4 KTN": "¼ Karton",
  BTL: "Botol",
  LSN: "Lusin",
  "1/2LSN": "½ Lusin",
  "1/2 LSN": "½ Lusin",
  "1/4LSN": "¼ Lusin",
  "1/4 LSN": "¼ Lusin",
  BOX: "Box",
  STR: "Strip",
  KG: "Kg",
  "1/2KG": "½ Kg",
  SAK: "Sak",
  "1/2SAK": "½ Sak",
  "1/2DOS": "½ Dus",
  "1/2BAL": "½ Bal",
  GRAM: "Gram",
  ONS: "Ons",
  RIM: "Rim",
  GROSS: "Gross",
  BAKI: "Baki",
});

/**
 * Customer-facing unit sort: smaller retail packs first, wholesale last.
 * Matches cigarette Pattern A ordering (Bungkus → ½ Slof → Slof).
 */
export const UNIT_SORT_ORDER = Object.freeze([
  "Bungkus",
  "5 Bungkus",
  "½ Slof",
  "Slof",
  "½ Pak",
  "Pak",
  "Pack",
  "Pcs",
  "Botol",
  "Kaleng",
  "Strip",
  "½ Lusin",
  "¼ Lusin",
  "Lusin",
  "½ Dus",
  "Dus",
  "½ Karton",
  "¼ Karton",
  "Karton",
  "½ Bal",
  "Bal",
  "Balok",
  "Box",
  "Kg",
  "½ Kg",
  "Sak",
  "½ Sak",
  "Gram",
  "Ons",
  "Rim",
  "Gross",
  "Baki",
]);

/**
 * Default-unit preference for wholesale ordering.
 *
 * CATALOG_RULES cigarette order is Slof → Karton → Dus → Bungkus.
 * Grocery live catalogue uses Karton (Aqua), Dus (Masako/Indomie), Pack (Energen).
 * Larger sellable units are preferred when present; half-units are never preferred
 * over the matching full unit. First-row workbook order is not used.
 */
export const DEFAULT_UNIT_PREFERENCE = Object.freeze([
  "Slof",
  "Karton",
  "Dus",
  "Pack",
  "Pak",
  "Lusin",
  "Bal",
  "Box",
  "Gross",
  "Sak",
  "Rim",
  "Baki",
  "Bungkus",
  "Botol",
  "Pcs",
]);

const HALF_UNIT_PREFIX = /^[½¼]/;

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractXlsx(xlsxPath, destDir) {
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }
  mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xf", xlsxPath, "-C", destDir], { stdio: "pipe" });
}

function parseSharedStrings(xml) {
  const strings = [];
  const blockRe = /<si>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = blockRe.exec(xml))) {
    const text = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXml(part[1]))
      .join("");
    strings.push(text);
  }
  return strings;
}

function parseCellValue(attrs, inner, sharedStrings) {
  const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
  const raw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];

  if (type === "s" && raw != null) {
    return sharedStrings[Number(raw)] ?? "";
  }

  if (type === "inlineStr") {
    const text = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
    return text ? decodeXml(text[1]) : "";
  }

  if (raw == null) {
    return null;
  }

  return decodeXml(raw);
}

function parseCells(rowInner, sharedStrings) {
  const cells = {};
  const cellRe =
    /<c r="([A-Z]+)\d+"([^>]*?)\s*\/>|<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
  let match;
  while ((match = cellRe.exec(rowInner))) {
    const col = match[1] || match[3];
    const attrs = match[2] || match[4] || "";
    const inner = match[5] || "";
    cells[col] = parseCellValue(attrs, inner, sharedStrings);
  }
  return cells;
}

function columnIndex(col) {
  let index = 0;
  for (const char of col) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

function columnName(index) {
  let n = index;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function nextColumn(col) {
  return columnName(columnIndex(col) + 1);
}

function parseSheetRows(sheetXml, sharedStrings) {
  const sheetData = sheetXml.match(/<sheetData>([\s\S]*?)<\/sheetData>/)?.[1];
  if (!sheetData) {
    throw new Error("Workbook sheetData is missing.");
  }

  const rows = [];
  for (const chunk of sheetData.split(/<row /).slice(1)) {
    const rowMatch = chunk.match(/^r="(\d+)"/);
    if (!rowMatch) {
      continue;
    }
    const innerMatch = chunk.match(/>([\s\S]*?)<\/row>/);
    rows.push({
      sourceRow: Number(rowMatch[1]),
      cells: parseCells(innerMatch ? innerMatch[1] : "", sharedStrings),
    });
  }
  return rows;
}

export function cellText(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function findHeader(rows) {
  for (const row of rows) {
    const labels = new Map();
    for (const [col, value] of Object.entries(row.cells)) {
      const label = cellText(value);
      if (label) {
        labels.set(label, col);
      }
    }
    if (labels.has(HEADER_LABELS.kodeItem) && labels.has(HEADER_LABELS.namaItem)) {
      return { sourceRow: row.sourceRow, labels };
    }
  }
  throw new Error("Could not find Products header row (Kode Item / Nama Item).");
}

function parseQty(value) {
  const text = cellText(value);
  if (text === "") {
    return { ok: false, reason: "missing", raw: text, value: null };
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    return { ok: false, reason: "non-numeric", raw: text, value: null };
  }
  if (numeric <= 0) {
    return { ok: false, reason: "non-positive", raw: text, value: numeric };
  }
  return { ok: true, reason: null, raw: text, value: numeric };
}

export function loadWorkbook(xlsxPath, extractDir) {
  extractXlsx(xlsxPath, extractDir);

  const workbookXml = readFileSync(join(extractDir, "xl", "workbook.xml"), "utf8");
  const sheetName =
    (workbookXml.match(/<sheet [^>]*name="([^"]+)"/) || [])[1] || "";
  if (sheetName && sheetName !== "Products") {
    throw new Error(`Expected sheet "Products", found "${sheetName}".`);
  }

  const sharedStrings = parseSharedStrings(
    readFileSync(join(extractDir, "xl", "sharedStrings.xml"), "utf8")
  );
  const sheetXml = readFileSync(
    join(extractDir, "xl", "worksheets", "sheet0.xml"),
    "utf8"
  );
  const rows = parseSheetRows(sheetXml, sharedStrings);
  const header = findHeader(rows);
  const kodeCol = header.labels.get(HEADER_LABELS.kodeItem);
  const namaCol = header.labels.get(HEADER_LABELS.namaItem);
  const stokCol = header.labels.get(HEADER_LABELS.stok);
  const satuanCol = header.labels.get(HEADER_LABELS.satuan);
  const qtyCol = header.labels.get(HEADER_LABELS.qtyPerPaket);
  const baseUnitCol = nextColumn(qtyCol);

  const ignoredColumns = [...FORBIDDEN_COLUMNS]
    .filter((label) => header.labels.has(label))
    .map((label) => ({ label, column: header.labels.get(label) }));

  const dataRows = [];
  const skippedEmptyRows = [];

  for (const row of rows) {
    if (row.sourceRow <= header.sourceRow) {
      continue;
    }

    const posCode = cellText(row.cells[kodeCol]);
    const posName = cellText(row.cells[namaCol]);
    const posUnit = cellText(row.cells[satuanCol]);
    const stok = cellText(stokCol ? row.cells[stokCol] : "");
    const qty = parseQty(row.cells[qtyCol]);
    const baseUnit = cellText(row.cells[baseUnitCol]);

    const forbiddenValues = {};
    for (const column of ignoredColumns) {
      const value = cellText(row.cells[column.column]);
      if (value !== "") {
        forbiddenValues[column.label] = value;
      }
    }

    if (!posCode && !posName && !posUnit && !qty.raw && !baseUnit) {
      skippedEmptyRows.push(row.sourceRow);
      continue;
    }

    dataRows.push({
      sourceRow: row.sourceRow,
      posCode,
      posName,
      posUnit,
      qtyPerPackage: qty.value,
      qtyRaw: qty.raw,
      qtyOk: qty.ok,
      qtyReason: qty.reason,
      baseUnit,
      stok,
      forbiddenValues,
    });
  }

  return {
    sheetName: sheetName || "Products",
    headerRow: header.sourceRow,
    columns: {
      kodeItem: kodeCol,
      namaItem: namaCol,
      stok: stokCol || null,
      satuan: satuanCol,
      qtyPerPaket: qtyCol,
      baseUnit: baseUnitCol,
      ignored: ignoredColumns,
    },
    dataRows,
    skippedEmptyRows,
  };
}

export function groupWorkbookProducts(dataRows) {
  const byCode = new Map();
  for (const row of dataRows) {
    const code = row.posCode;
    if (!code) {
      continue;
    }
    if (!byCode.has(code)) {
      byCode.set(code, {
        posCode: code,
        names: new Map(),
        rows: [],
      });
    }
    const group = byCode.get(code);
    group.rows.push(row);
    if (row.posName) {
      group.names.set(row.posName, (group.names.get(row.posName) || 0) + 1);
    }
  }

  return [...byCode.values()].map((group) => {
    const names = [...group.names.entries()].sort((a, b) => b[1] - a[1]);
    return {
      posCode: group.posCode,
      posName: names[0]?.[0] || "",
      allNames: names.map(([name, count]) => ({ name, count })),
      rows: group.rows.map((row) => ({
        sourceRow: row.sourceRow,
        posName: row.posName,
        posUnit: row.posUnit,
        qtyPerPackage: row.qtyPerPackage,
        qtyRaw: row.qtyRaw,
        qtyOk: row.qtyOk,
        qtyReason: row.qtyReason,
        baseUnit: row.baseUnit,
      })),
    };
  });
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/½/g, "1-2")
    .replace(/¼/g, "1-4")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function compactUnitKey(value) {
  return cellText(value)
    .toUpperCase()
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/\s+/g, "");
}

export function proposedCustomerUnitName(posUnit) {
  const trimmed = cellText(posUnit);
  const compact = compactUnitKey(trimmed);
  if (POS_UNIT_TO_CUSTOMER[trimmed]) {
    return POS_UNIT_TO_CUSTOMER[trimmed];
  }
  if (POS_UNIT_TO_CUSTOMER[compact]) {
    return POS_UNIT_TO_CUSTOMER[compact];
  }
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word) || word === "½" || word === "¼") {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function unitsEquivalent(a, b) {
  const keyA = compactUnitKey(a);
  const keyB = compactUnitKey(b);
  if (!keyA || !keyB) {
    return false;
  }
  if (keyA === keyB) {
    return true;
  }
  const customerA = compactUnitKey(proposedCustomerUnitName(a));
  const customerB = compactUnitKey(proposedCustomerUnitName(b));
  return Boolean(customerA && customerB && customerA === customerB);
}

export function normalizeNameKey(value) {
  return cellText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactNameKey(value) {
  return normalizeNameKey(value).replace(/ /g, "");
}

function nameWithoutParentheticals(value) {
  return cellText(value).replace(/\([^)]*\)/g, " ");
}

export function namesStronglyMatch(a, b) {
  if (!cellText(a) || !cellText(b)) {
    return false;
  }
  if (normalizeNameKey(a) === normalizeNameKey(b)) {
    return true;
  }
  if (compactNameKey(a) === compactNameKey(b)) {
    return true;
  }
  const strippedA = nameWithoutParentheticals(a);
  const strippedB = nameWithoutParentheticals(b);
  if (compactNameKey(strippedA) === compactNameKey(strippedB)) {
    return true;
  }
  return false;
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "id")
  );
}

export function sortOrderForUnit(unitName) {
  const index = UNIT_SORT_ORDER.indexOf(unitName);
  return index === -1 ? UNIT_SORT_ORDER.length + 1 : index + 1;
}

export function isHalfUnit(unitName) {
  return HALF_UNIT_PREFIX.test(cellText(unitName));
}

export function unitIdFromProductAndUnit(productId, unitName) {
  return `${productId}__${slugify(unitName)}`;
}

/**
 * Choose a default customer-facing unit from the product's unit names.
 * Returns { name, reason, questionable, flags }.
 */
export function chooseDefaultUnit(unitNames) {
  const unique = uniqueSorted(unitNames);
  const flags = [];
  const fullUnits = unique.filter((name) => !isHalfUnit(name));
  const candidates = fullUnits.length > 0 ? fullUnits : unique;

  for (const preferred of DEFAULT_UNIT_PREFERENCE) {
    if (candidates.includes(preferred)) {
      const questionable = isHalfUnit(preferred);
      if (questionable) {
        flags.push("half-unit-default");
      }
      return {
        name: preferred,
        reason: `preference:${preferred}`,
        questionable,
        flags,
      };
    }
  }

  const fallback = candidates[0] ?? unique[0] ?? null;
  flags.push("fallback-first-active");
  if (fallback && isHalfUnit(fallback)) {
    flags.push("half-unit-default");
  }
  if (fallback && !UNIT_SORT_ORDER.includes(fallback)) {
    flags.push("unrecognized-unit-name");
  }
  return {
    name: fallback,
    reason: fallback ? "fallback-first-active-non-half" : "no-units",
    questionable: true,
    flags,
  };
}

export function proposeProductId(posName, posCode, usedIds) {
  const slug = slugify(posName);
  const issues = [];
  if (!slug) {
    issues.push("empty-slug");
  } else if (slug.length < 3) {
    issues.push("short-slug");
  }
  if (/^\d+$/.test(slug)) {
    issues.push("numeric-only-slug");
  }
  if (slug.length > 60) {
    issues.push("long-slug");
  }

  let id = slug ? `prod-${slug}` : `prod-pos-${slugify(posCode) || "unknown"}`;
  if (!slug) {
    id = `prod-pos-${slugify(posCode) || "unknown"}`;
  }

  if (usedIds.has(id)) {
    issues.push("slug-collision");
    const withCode = `${id}-${slugify(posCode) || "code"}`;
    if (usedIds.has(withCode)) {
      issues.push("pos-code-suffix-collision");
      let n = 2;
      let candidate = `${withCode}-${n}`;
      while (usedIds.has(candidate)) {
        n += 1;
        candidate = `${withCode}-${n}`;
      }
      id = candidate;
    } else {
      id = withCode;
    }
  }

  usedIds.add(id);
  return { proposedProductId: id, slug, issues };
}
