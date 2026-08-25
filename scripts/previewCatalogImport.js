/**
 * Stage 5B.1 — Catalogue import preview / reconciliation.
 *
 * Reads imports/Matahari_Product_List_FINAL.xlsx and the live catalogue,
 * then writes review artifacts under tmp/catalog-import-preview/.
 *
 * Does NOT modify src/catalog, does not import, does not call catalog:import-seed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOMEPAGE_FEATURED_PRODUCT_IDS } from "../src/config/homepageFeatured.js";
import { CATALOG_FILES, loadCatalog } from "./catalogTransaction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKBOOK_PATH = join(ROOT, "imports", "Matahari_Product_List_FINAL.xlsx");
const CATALOG_DIR = join(ROOT, "src", "catalog");
const PREVIEW_DIR = join(ROOT, "tmp", "catalog-import-preview");
const XLSX_EXTRACT_DIR = join(PREVIEW_DIR, "_xlsx");

const FORBIDDEN_COLUMNS = new Set(["Jenis", "Harga Pokok", "Harga Jual"]);
const HEADER_LABELS = {
  kodeItem: "Kode Item",
  namaItem: "Nama Item",
  stok: "Stok",
  satuan: "Satuan",
  qtyPerPaket: "Qty/Paket",
};

const DEFAULT_UNIT_PREFERENCE = ["Slof", "Karton", "Dus", "Bungkus", "Pak", "Pack"];

const POS_UNIT_TO_CUSTOMER = {
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
};

function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function hashFile(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function hashCatalogFiles() {
  const hashes = {};
  for (const fileName of CATALOG_FILES) {
    hashes[fileName] = hashFile(join(CATALOG_DIR, fileName));
  }
  return hashes;
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

function cellText(value) {
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

function loadWorkbook(xlsxPath, extractDir) {
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

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/½/g, "1-2")
    .replace(/¼/g, "1-4")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compactUnitKey(value) {
  return cellText(value)
    .toUpperCase()
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/\s+/g, "");
}

function proposedCustomerUnitName(posUnit) {
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

function unitsEquivalent(a, b) {
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

function normalizeNameKey(value) {
  return cellText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactNameKey(value) {
  return normalizeNameKey(value).replace(/ /g, "");
}

function nameWithoutParentheticals(value) {
  return cellText(value).replace(/\([^)]*\)/g, " ");
}

function namesStronglyMatch(a, b) {
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

function relatedWorkbookCandidates(currentName, workbookProducts) {
  const compactCurrent = compactNameKey(currentName);
  const firstToken = normalizeNameKey(currentName).split(" ")[0] || "";
  const seen = new Set();
  const related = [];

  function add(product, reason) {
    if (!product.posCode || seen.has(product.posCode)) {
      return;
    }
    seen.add(product.posCode);
    related.push({
      posCode: product.posCode,
      posName: product.posName,
      units: uniqueSorted(product.rows.map((row) => row.posUnit)),
      reason,
    });
  }

  if (compactCurrent.length >= 4) {
    for (const product of workbookProducts) {
      const compact = compactNameKey(product.posName);
      if (
        compact &&
        (compact === compactCurrent ||
          compact.startsWith(compactCurrent) ||
          compactCurrent.startsWith(compact))
      ) {
        add(product, "compact-name prefix/containment; not a safe match");
      }
    }
  }

  if (firstToken.length >= 4) {
    for (const product of workbookProducts) {
      const token = normalizeNameKey(product.posName).split(" ")[0];
      if (token === firstToken) {
        add(product, "same first name token; not a safe match");
      }
    }
  }

  return related.slice(0, 20);
}

function groupWorkbookProducts(dataRows) {
  const byCode = new Map();
  for (const row of dataRows) {
    const code = row.posCode;
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

  return [...byCode.values()]
    .filter((group) => group.posCode)
    .map((group) => {
      const names = [...group.names.entries()].sort((a, b) => b[1] - a[1]);
      return {
        posCode: group.posCode,
        posName: names[0]?.[0] || "",
        allNames: names.map(([name, count]) => ({ name, count })),
        rows: group.rows.map((row) => ({
          sourceRow: row.sourceRow,
          posUnit: row.posUnit,
          qtyPerPackage: row.qtyPerPackage,
          qtyRaw: row.qtyRaw,
          baseUnit: row.baseUnit,
        })),
      };
    });
}

function validateWorkbook(dataRows, products) {
  const missingProductCode = [];
  const missingProductName = [];
  const missingUnit = [];
  const invalidQty = [];
  const forbiddenColumnValues = [];
  const codesToNames = new Map();
  const namesToCodes = new Map();
  const duplicateUnitRows = [];
  const exactDuplicateRows = [];
  const inconsistentBaseUnits = [];
  const seenExact = new Map();

  for (const row of dataRows) {
    if (!row.posCode) {
      missingProductCode.push(row.sourceRow);
    }
    if (!row.posName) {
      missingProductName.push(row.sourceRow);
    }
    if (!row.posUnit) {
      missingUnit.push(row.sourceRow);
    }
    if (!row.qtyOk) {
      invalidQty.push({
        sourceRow: row.sourceRow,
        posCode: row.posCode,
        reason: row.qtyReason,
        raw: row.qtyRaw,
      });
    }
    if (Object.keys(row.forbiddenValues).length > 0) {
      forbiddenColumnValues.push({
        sourceRow: row.sourceRow,
        posCode: row.posCode,
        values: row.forbiddenValues,
      });
    }

    if (row.posCode) {
      const names = codesToNames.get(row.posCode) ?? new Set();
      if (row.posName) {
        names.add(row.posName);
      }
      codesToNames.set(row.posCode, names);
    }

    if (row.posName) {
      const codes = namesToCodes.get(row.posName) ?? new Set();
      if (row.posCode) {
        codes.add(row.posCode);
      }
      namesToCodes.set(row.posName, codes);
    }

    if (row.posCode && row.posUnit) {
      const exactKey = [
        row.posCode,
        row.posName,
        row.posUnit,
        row.qtyRaw,
        row.baseUnit,
      ].join("::");
      if (seenExact.has(exactKey)) {
        exactDuplicateRows.push({
          posCode: row.posCode,
          posName: row.posName,
          posUnit: row.posUnit,
          qtyRaw: row.qtyRaw,
          baseUnit: row.baseUnit,
          firstSourceRow: seenExact.get(exactKey),
          duplicateSourceRow: row.sourceRow,
        });
      } else {
        seenExact.set(exactKey, row.sourceRow);
      }
    }
  }

  for (const product of products) {
    const unitKeys = new Map();
    const baseUnits = new Set();
    for (const row of product.rows) {
      if (row.baseUnit) {
        baseUnits.add(row.baseUnit);
      }
      if (!row.posUnit) {
        continue;
      }
      const key = compactUnitKey(row.posUnit);
      if (!unitKeys.has(key)) {
        unitKeys.set(key, []);
      }
      unitKeys.get(key).push(row);
    }
    for (const [unitKey, rows] of unitKeys) {
      if (rows.length > 1) {
        duplicateUnitRows.push({
          posCode: product.posCode,
          posName: product.posName,
          unitKey,
          sourceRows: rows.map((row) => row.sourceRow),
          qtyValues: [...new Set(rows.map((row) => row.qtyRaw))],
        });
      }
    }
    if (baseUnits.size > 1) {
      inconsistentBaseUnits.push({
        posCode: product.posCode,
        posName: product.posName,
        baseUnits: [...baseUnits],
        sourceRows: product.rows.map((row) => row.sourceRow),
      });
    }
  }

  const productCodesWithMultipleNames = [...codesToNames.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([posCode, names]) => ({
      posCode,
      names: [...names],
    }));

  const namesWithMultipleProductCodes = [...namesToCodes.entries()]
    .filter(([, codes]) => codes.size > 1)
    .map(([posName, codes]) => ({
      posName,
      posCodes: [...codes],
    }));

  return {
    totalDataRows: dataRows.length,
    uniqueProductCodes: codesToNames.size,
    uniqueNames: namesToCodes.size,
    missingProductCode,
    missingProductName,
    missingUnit,
    invalidQty,
    forbiddenColumnValues,
    productCodesWithMultipleNames,
    namesWithMultipleProductCodes,
    duplicateUnitRows,
    exactDuplicateRows,
    inconsistentBaseUnits,
  };
}

function catalogIndex(catalog) {
  const productById = new Map(catalog.products.map((product) => [product.id, product]));
  const variantByProductId = new Map(
    catalog.variants.map((variant) => [variant.productId, variant])
  );
  const unitsByProductId = new Map();
  const unitById = new Map(catalog.units.map((unit) => [unit.id, unit]));

  for (const unit of catalog.units) {
    if (!unit.productId) {
      continue;
    }
    const list = unitsByProductId.get(unit.productId) ?? [];
    list.push(unit);
    unitsByProductId.set(unit.productId, list);
  }

  const mappingsByProductId = new Map();
  const mappingsByPosCode = new Map();
  for (const mapping of catalog.mappings) {
    const productList = mappingsByProductId.get(mapping.productId) ?? [];
    productList.push(mapping);
    mappingsByProductId.set(mapping.productId, productList);

    const code = cellText(mapping.posCode);
    if (!code) {
      continue;
    }
    const codeList = mappingsByPosCode.get(code) ?? [];
    codeList.push(mapping);
    mappingsByPosCode.set(code, codeList);
  }

  const aliasesByProductId = new Map();
  for (const alias of catalog.aliases) {
    const targetId = alias.productId || alias.variantId;
    if (!targetId) {
      continue;
    }
    const list = aliasesByProductId.get(targetId) ?? [];
    list.push(alias);
    aliasesByProductId.set(targetId, list);
  }

  const recoIn = new Map();
  const recoOut = new Map();
  for (const edge of catalog.recommendations) {
    const outgoing = recoOut.get(edge.sourceProductId) ?? [];
    outgoing.push(edge);
    recoOut.set(edge.sourceProductId, outgoing);
    const incoming = recoIn.get(edge.targetProductId) ?? [];
    incoming.push(edge);
    recoIn.set(edge.targetProductId, incoming);
  }

  const homepage = new Set(HOMEPAGE_FEATURED_PRODUCT_IDS);

  return {
    productById,
    variantByProductId,
    unitsByProductId,
    unitById,
    mappingsByProductId,
    mappingsByPosCode,
    aliasesByProductId,
    recoIn,
    recoOut,
    homepage,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "id")
  );
}

function classifyUnitMatch(workbookUnit, catalogPosUnits, catalogUnitNames) {
  if (catalogPosUnits.some((unit) => unit === workbookUnit)) {
    return "exact-existing-unit-match";
  }
  if (catalogPosUnits.some((unit) => unitsEquivalent(unit, workbookUnit))) {
    return "equivalent-spelling-case-match";
  }
  if (catalogUnitNames.some((unit) => unitsEquivalent(unit, workbookUnit))) {
    return "equivalent-spelling-case-match";
  }
  return "workbook-unit-missing-from-app";
}

function reconcileUnits(workbookProduct, catalogProduct, index) {
  const mappings = index.mappingsByProductId.get(catalogProduct.id) ?? [];
  const variant = index.variantByProductId.get(catalogProduct.id);
  const catalogUnits = [
    ...(index.unitsByProductId.get(catalogProduct.id) ?? []),
    ...(variant?.availableUnitIds ?? [])
      .map((unitId) => index.unitById.get(unitId))
      .filter(Boolean),
  ];
  const uniqueCatalogUnits = [];
  const seenUnitIds = new Set();
  for (const unit of catalogUnits) {
    if (!unit?.id || seenUnitIds.has(unit.id)) {
      continue;
    }
    seenUnitIds.add(unit.id);
    uniqueCatalogUnits.push(unit);
  }

  const catalogPosUnits = uniqueSorted(mappings.map((mapping) => mapping.posUnit));
  const catalogUnitNames = uniqueSorted(uniqueCatalogUnits.map((unit) => unit.name));
  const workbookUnits = workbookProduct.rows;

  const unitRows = workbookUnits.map((row) => ({
    sourceRow: row.sourceRow,
    posUnit: row.posUnit,
    qtyPerPackage: row.qtyPerPackage,
    baseUnit: row.baseUnit,
    classification: classifyUnitMatch(row.posUnit, catalogPosUnits, catalogUnitNames),
  }));

  const matchedCatalogUnitIds = new Set();
  for (const unit of uniqueCatalogUnits) {
    const mappingUnits = mappings
      .filter((mapping) => mapping.unitId === unit.id)
      .map((mapping) => mapping.posUnit);
    const matched = workbookUnits.some(
      (row) =>
        mappingUnits.some((posUnit) => unitsEquivalent(posUnit, row.posUnit)) ||
        unitsEquivalent(unit.name, row.posUnit)
    );
    if (matched) {
      matchedCatalogUnitIds.add(unit.id);
    }
  }

  const appUnitsMissingFromWorkbook = uniqueCatalogUnits
    .filter((unit) => !matchedCatalogUnitIds.has(unit.id))
    .map((unit) => ({
      unitId: unit.id,
      unitName: unit.name,
      active: unit.active !== false,
      classification: "app-unit-missing-from-workbook",
    }));

  const qtyByCompactUnit = new Map();
  for (const row of workbookUnits) {
    const key = compactUnitKey(row.posUnit);
    const list = qtyByCompactUnit.get(key) ?? [];
    list.push(row);
    qtyByCompactUnit.set(key, list);
  }
  const quantityPackageMismatches = [...qtyByCompactUnit.values()]
    .filter((rows) => new Set(rows.map((row) => String(row.qtyPerPackage))).size > 1)
    .map((rows) => ({
      posUnit: rows[0].posUnit,
      qtyValues: uniqueSorted(rows.map((row) => String(row.qtyPerPackage))),
      sourceRows: rows.map((row) => row.sourceRow),
      classification: "quantity-package-mismatch",
    }));

  const ambiguous = [];
  for (const row of workbookUnits) {
    const matchingCatalogUnits = uniqueCatalogUnits.filter(
      (unit) =>
        unitsEquivalent(unit.name, row.posUnit) ||
        mappings.some(
          (mapping) =>
            mapping.unitId === unit.id && unitsEquivalent(mapping.posUnit, row.posUnit)
        )
    );
    if (matchingCatalogUnits.length > 1) {
      ambiguous.push({
        posUnit: row.posUnit,
        sourceRow: row.sourceRow,
        catalogUnitIds: matchingCatalogUnits.map((unit) => unit.id),
        classification: "ambiguous",
      });
    }
  }

  const classifications = new Set(unitRows.map((row) => row.classification));
  if (appUnitsMissingFromWorkbook.length > 0) {
    classifications.add("app-unit-missing-from-workbook");
  }
  if (quantityPackageMismatches.length > 0) {
    classifications.add("quantity-package-mismatch");
  }
  if (ambiguous.length > 0) {
    classifications.add("ambiguous");
  }

  let summary = "exact-existing-unit-match";
  if (classifications.has("ambiguous")) {
    summary = "ambiguous";
  } else if (classifications.has("quantity-package-mismatch")) {
    summary = "quantity-package-mismatch";
  } else if (
    classifications.has("workbook-unit-missing-from-app") ||
    classifications.has("app-unit-missing-from-workbook")
  ) {
    summary = "unit-set-differs";
  } else if (classifications.has("equivalent-spelling-case-match")) {
    summary = "equivalent-spelling-case-match";
  }

  return {
    summary,
    workbookUnits: unitRows,
    appUnitsMissingFromWorkbook,
    quantityPackageMismatches,
    ambiguous,
    catalogPosUnits,
    catalogUnitNames,
  };
}

function productSnapshot(product, index) {
  const mappings = index.mappingsByProductId.get(product.id) ?? [];
  const aliases = index.aliasesByProductId.get(product.id) ?? [];
  const incoming = index.recoIn.get(product.id) ?? [];
  const outgoing = index.recoOut.get(product.id) ?? [];
  return {
    productId: product.id,
    customerName: product.name,
    category: product.category || "",
    favorite: Boolean(product.favorite),
    posCodes: uniqueSorted(mappings.map((mapping) => mapping.posCode)),
    posNames: uniqueSorted(mappings.map((mapping) => mapping.posName)),
    hasImage: Boolean(product.image?.card || product.image?.detail || product.image?.original),
    image: product.image ?? null,
    aliasCount: aliases.length,
    recommendationIncomingCount: incoming.length,
    recommendationOutgoingCount: outgoing.length,
    recommendationCount: incoming.length + outgoing.length,
    homepageFeatured: index.homepage.has(product.id),
    currentlyInRecommendations: incoming.length > 0 || outgoing.length > 0,
  };
}

function chooseDefaultUnit(unitNames) {
  for (const preferred of DEFAULT_UNIT_PREFERENCE) {
    if (unitNames.includes(preferred)) {
      return preferred;
    }
  }
  return unitNames[0] ?? null;
}

function proposeProductId(posName, posCode, usedIds) {
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows, columns) {
  const header = columns.join(",");
  const lines = rows.map((row) =>
    columns.map((column) => csvEscape(row[column])).join(",")
  );
  return `${[header, ...lines].join("\n")}\n`;
}

function fileSizeBytes(fileName) {
  return readFileSync(join(CATALOG_DIR, fileName)).length;
}

function renderReviewMarkdown(report) {
  const v = report.validation;
  const r = report.reconciliation;
  const lines = [];
  const add = (text = "") => lines.push(text);

  add("# Stage 5B.1 — Catalogue Import Preview");
  add();
  add("Preview / reconciliation only. Live `src/catalog/*.json` was not modified.");
  add();
  add(`Workbook: \`${report.source.workbookPath}\``);
  add(`Sheet: \`${report.source.sheetName}\``);
  add(`Generated from HEAD \`${report.source.head}\``);
  add();
  add("## Counts");
  add();
  add(`- Total source data rows: **${v.totalDataRows}**`);
  add(`- Unique POS products (Kode Item): **${v.uniqueProductCodes}**`);
  add(`- Unique POS names: **${v.uniqueNames}**`);
  add(`- Exact POS-code matches: **${r.exactPosMatches.length}**`);
  add(`- Likely name-only matches: **${r.likelyNameMatches.length}**`);
  add(`- Ambiguous matches: **${r.ambiguousMatches.length}**`);
  add(`- New POS products: **${r.newPosProducts.length}**`);
  add(`- Current catalogue products absent from workbook: **${r.currentNotInSource.length}**`);
  add();
  add("## Source validation");
  add();
  add(`- Missing product code: ${v.missingProductCode.length}`);
  add(`- Missing product name: ${v.missingProductName.length}`);
  add(`- Missing unit: ${v.missingUnit.length}`);
  add(`- Invalid/non-positive Qty/Paket: ${v.invalidQty.length}`);
  add(`- Product codes with multiple names: ${v.productCodesWithMultipleNames.length}`);
  add(`- Names with multiple product codes: ${v.namesWithMultipleProductCodes.length}`);
  add(`- Duplicate unit rows within one code: ${v.duplicateUnitRows.length}`);
  add(`- Suspicious exact duplicate rows: ${v.exactDuplicateRows.length}`);
  add(`- Inconsistent base unit for the same POS product: ${v.inconsistentBaseUnits.length}`);
  add(`- Non-empty forbidden columns (Jenis / Harga): ${v.forbiddenColumnValues.length}`);
  add();
  add("Ambiguous source data was **not** auto-repaired.");
  add();

  add("## Duplicate POS names (different codes)");
  add();
  if (r.duplicateSourceNames.length === 0) {
    add("None.");
  } else {
    for (const entry of r.duplicateSourceNames) {
      add(`### ${entry.posName}`);
      add();
      for (const product of entry.products) {
        const units = product.rows
          .map((row) => `${row.posUnit} (Qty/Paket ${row.qtyPerPackage}, base ${row.baseUnit}, row ${row.sourceRow})`)
          .join("; ");
        add(`- \`${product.posCode}\`: ${units}`);
      }
      add();
      add("Do not merge automatically. Owner must decide whether these are distinct products.");
      add();
    }
  }

  add("## Exact POS-code matches");
  add();
  add(`${r.exactPosMatches.length} current catalogue products matched a workbook Kode Item via mappings.posCode.`);
  add();
  add("Stable IDs, images, aliases, recommendations, favorites, homepage featured flags, and customer-facing names are preserved in this preview.");
  add();
  if (r.customerNameDiffersFromPos.length > 0) {
    add("### Customer name vs POS name differences");
    add();
    add("Customer-facing `products.name` was **not** overwritten.");
    add();
    for (const row of r.customerNameDiffersFromPos) {
      add(
        `- \`${row.productId}\`: customer **${row.customerName}** vs workbook POS **${row.workbookPosName}** (current mappings.posName: ${row.currentPosName || "—"})`
      );
    }
    add();
  }

  add("## Likely name-only matches");
  add();
  if (r.likelyNameMatches.length === 0) {
    add("None.");
  } else {
    add("No POS-code identity match. Normalized names strongly match. These look like **POS recodes** of the same cigarette, not grocery matches. Not safe to rewrite mappings.posCode without owner review.");
    add();
    for (const row of r.likelyNameMatches) {
      add(
        `- \`${row.currentProductId}\` **${row.currentCustomerName}** ↔ workbook \`${row.posCode}\` **${row.posName}** (${row.reason})`
      );
    }
  }
  add();

  add("## Ambiguous matches");
  add();
  if (r.ambiguousMatches.length === 0) {
    add("None.");
  } else {
    for (const row of r.ambiguousMatches) {
      add(`- ${row.notes}`);
    }
  }
  add();

  add("## Current products not in the final workbook");
  add();
  add("These are **not** deleted. Status: `CURRENT_NOT_IN_FINAL_SOURCE`.");
  add();
  if (r.currentNotInSource.length === 0) {
    add("None.");
  } else {
    add("| Product ID | Customer name | POS code(s) | Category | Image | Aliases | Reco in/out | Homepage |");
    add("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of r.currentNotInSource) {
      add(
        `| \`${row.productId}\` | ${row.customerName} | ${row.posCodes.join(", ") || "—"} | ${row.category} | ${row.hasImage ? "yes" : "no"} | ${row.aliasCount} | ${row.recommendationIncomingCount}/${row.recommendationOutgoingCount} | ${row.homepageFeatured ? "yes" : "no"} |`
      );
    }
    add();
    add("Related workbook SKUs below are **not** safe matches. They are listed for owner review only.");
    add();
    for (const row of r.currentNotInSource) {
      const related = row.relatedWorkbookCandidates ?? [];
      if (related.length === 0) {
        add(`- \`${row.productId}\` **${row.customerName}**: no similar POS name found.`);
        continue;
      }
      add(
        `- \`${row.productId}\` **${row.customerName}**: ${related
          .map((item) => `\`${item.posCode}\` ${item.posName}`)
          .join("; ")}`
      );
    }
    add();
    add("### Recommendation dependencies");
    add();
    if (r.recommendationDependencies.length === 0) {
      add("None.");
    } else {
      for (const edge of r.recommendationDependencies) {
        add(
          `- ${edge.sourceProductId} → ${edge.targetProductId} (weight ${edge.weight}, ${edge.source}) because \`${edge.missingProductId}\` is not in the final workbook`
        );
      }
    }
  }
  add();

  add("## Unit reconciliation (matched products)");
  add();
  add(`- Exact existing unit match (all units): ${r.unitSummary.exact}`);
  add(`- Equivalent spelling/case only: ${r.unitSummary.equivalent}`);
  add(`- Unit set differs (workbook missing in app and/or app missing in workbook): ${r.unitSummary.unitSetDiffers}`);
  add(`- Quantity/package mismatch: ${r.unitSummary.quantityMismatch}`);
  add(`- Ambiguous unit mapping: ${r.unitSummary.ambiguous}`);
  add();
  add("Stage 5A lowercase unit display is UI-only and was not used as POS identity.");
  add("Current catalogue does not store Qty/Paket; quantity mismatches are workbook-internal conflicts on the same Satuan.");
  add();

  add("## New POS products");
  add();
  add(`${r.newPosProducts.length} workbook products are not represented in the current catalogue.`);
  add();
  add("- Proposed IDs are deterministic slugs from the POS name, with POS-code suffix on collision.");
  add("- POS code remains the permanent external identity.");
  add("- Category is staging-only: `NEEDS_CATEGORY`.");
  add("- No aliases, images, or recommendation edges were invented.");
  add("- These IDs were **not** written to the live catalogue.");
  add();
  add(`- Proposed ID collisions / awkward slugs: ${r.idProposalIssues.length}`);
  add(`- New products whose POS name already covers basic search: ${r.newProductsWithNameSearchCoverage.length} (all of them, by having a non-empty name)`);
  add();

  add("## Category gaps");
  add();
  add("The workbook has no trustworthy category column.");
  add(`Every new product is marked \`NEEDS_CATEGORY\` (${r.newPosProducts.length} products).`);
  add("Matched existing products keep their current category.");
  add("Do not add an Uncategorized category to the customer app.");
  add();

  add("## Estimated customer-visible size after eventual import");
  add();
  add(`If every new product is later categorized and promoted, and no current product is removed:`);
  add();
  add(`- Current customer-visible products: **${report.scale.currentProductCount}**`);
  add(`- Plus new POS products: **${r.newPosProducts.length}**`);
  add(`- Minus current products absent from workbook (only if owner later removes them): **${r.currentNotInSource.length}**`);
  add(`- High estimate (keep all current + add all new): **${report.scale.highEstimateVisible}**`);
  add(`- If absent current products are removed and all new products are added: **${report.scale.ifAbsentRemoved}**`);
  add();
  add("New products must not become customer-visible until a category is assigned.");
  add();

  add("## Performance concerns at ~2,249 products");
  add();
  add("Audit only — no virtualization/pagination/search work was done in 5B.1.");
  add();
  add(`- Current catalogue JSON bytes: **${report.scale.currentJsonBytes.toLocaleString("en")}**`);
  add(`- Rough imported JSON bytes (order-of-magnitude): **${report.scale.estimatedImportedJsonBytes.toLocaleString("en")}**`);
  add("- `assembleProducts()` maps every variant once at module load. ~2,249 records is still cheap on load; the JSON parse/bundle size is the larger cost.");
  add("- `searchProducts()` scans every product name, then every alias, on each query. ~2,249 names + ~193 aliases is acceptable; alias growth later would dominate before name scan does.");
  add("- Homepage `Sering Dipesan` stays a fixed 6-ID list, so homepage cards do not grow with catalogue size.");
  add("- Category mode currently renders **every** product in that category as a `SearchResultRow`. After categorization, a large category (hundreds/thousands of SKUs) would mount a very large DOM list.");
  add("- Search results also render every hit with no cap. Short queries like `a` or `ka` could return hundreds of rows.");
  add("- Recommendations still iterate ~147 edges; fine. They will not cover new products until a later sales-derived pass.");
  add("- Studio Products tab lists the full catalogue; 2,249 rows will feel heavy without virtualization.");
  add("- React itself is not the first bottleneck; unbounded list rendering and bundled JSON size are.");
  add();

  add("## Idempotence");
  add();
  add("Re-running this preview against the same workbook and unchanged live catalogue produces the same reconciliation classifications, proposed IDs, and unit diffs. Only extract scratch files under `tmp/catalog-import-preview/_xlsx/` are rewritten.");
  add();
  add("The eventual importer must key identities as:");
  add();
  add("- product: existing id if POS code already mapped, else deterministic `prod-{slug}` / collision suffix");
  add("- unit: `{productId}__{unitSlug}`");
  add("- mapping: `{posCode} + {posUnit}`");
  add("- alias: never auto-created; existing alias ids preserved");
  add();
  add("A second apply of the same workbook must not duplicate products, units, mappings, or aliases, and must not mint new IDs for products that already exist.");
  add();

  add("## Safety against the bootstrap importer");
  add();
  add("`catalog:import-seed` / `scripts/importCatalogSeed.js` is a destructive full replace. It rewrites products/variants/units/mappings/aliases from `rkk.catalog-seed.json` and wipes image metadata and expanded aliases. Stage 5B must not call it. Stage 5B.2 must merge by POS code through `runCatalogTransaction()`.");
  add();
  add("`scripts/catalogBuilder.js` `buildPreview()` groups by product **name** and always generates new IDs. That is unsafe for this workbook (duplicate names, 2,249 SKUs, existing stable IDs). Only parsing helpers such as slug/unit label maps are reusable.");
  add();

  add("## Stage 5B.2 importer design");
  add();
  add("1. Read `imports/Matahari_Product_List_FINAL.xlsx` with the same parser as this preview.");
  add("2. Dry-run by default: write a full diff under `tmp/` and exit 0 if valid.");
  add("3. Reconcile by `mappings.posCode ↔ Kode Item`. Never rename existing product/variant IDs.");
  add("4. For exact POS matches: keep customer name, category, favorite, image paths, aliases, recommendations; update `mappings.posName` / `posUnit` from the workbook; add missing units only after owner policy.");
  add("5. For name-only / ambiguous / current-not-in-source: leave live rows untouched until owner decisions are encoded.");
  add("6. For new POS products: create deterministic IDs, product-scoped units, mappings, no aliases, no images, no recommendations. Do **not** put them in the customer-visible assembly until category is assigned.");
  add("7. Recommended gate: keep uncategorized new products in a staging file, or a non-visible status that `assembleProducts()` skips. Do not invent Uncategorized.");
  add("8. Apply live writes only through `runCatalogTransaction()`, then `validateCatalog()` (already inside the transaction).");
  add("9. Repeatable: identity maps make a second run a no-op / POS-field update, not a duplicate insert.");
  add("10. Produce a complete diff: products added/unchanged, units added, mappings added/updated, aliases untouched, recommendations untouched unless an owner-approved removal happens later.");
  add();

  add("## Owner decisions required before Stage 5B.2");
  add();
  for (const decision of report.ownerDecisions) {
    add(`- ${decision}`);
  }
  add();

  add("## Live catalogue hashes");
  add();
  add("Before:");
  for (const [file, hash] of Object.entries(report.hashes.before)) {
    add(`- \`${file}\`: \`${hash}\``);
  }
  add();
  add("After:");
  for (const [file, hash] of Object.entries(report.hashes.after)) {
    add(`- \`${file}\`: \`${hash}\``);
  }
  add();
  add(report.hashes.unchanged ? "Live catalogue JSON is unchanged." : "WARNING: live catalogue JSON changed.");
  add();
  add("## Preview files");
  add();
  for (const file of report.previewFiles) {
    add(`- \`tmp/catalog-import-preview/${file}\``);
  }
  add();

  return `${lines.join("\n")}\n`;
}

function main() {
  mkdirSync(PREVIEW_DIR, { recursive: true });
  const hashesBefore = hashCatalogFiles();
  const catalog = loadCatalog({ catalogDir: CATALOG_DIR });
  const index = catalogIndex(catalog);
  const workbook = loadWorkbook(WORKBOOK_PATH, XLSX_EXTRACT_DIR);
  const workbookProducts = groupWorkbookProducts(workbook.dataRows);
  const validation = validateWorkbook(workbook.dataRows, workbookProducts);
  const workbookByCode = new Map(
    workbookProducts.map((product) => [product.posCode, product])
  );

  const matchedCurrentIds = new Set();
  const representedPosCodes = new Set();
  const exactPosMatches = [];
  const ambiguousMatches = [];
  const unitDifferences = [];
  const customerNameDiffersFromPos = [];

  for (const product of catalog.products) {
    const mappings = index.mappingsByProductId.get(product.id) ?? [];
    const mappedCodes = uniqueSorted(mappings.map((mapping) => cellText(mapping.posCode)));
    const matchedWorkbook = mappedCodes
      .map((code) => workbookByCode.get(code))
      .filter(Boolean);
    const uniqueWorkbookCodes = uniqueSorted(matchedWorkbook.map((item) => item.posCode));

    if (uniqueWorkbookCodes.length > 1) {
      ambiguousMatches.push({
        status: "AMBIGUOUS",
        currentProductId: product.id,
        currentCustomerName: product.name,
        posCodes: uniqueWorkbookCodes,
        notes: `Current product ${product.id} maps to multiple workbook Kode Item values: ${uniqueWorkbookCodes.join(", ")}`,
      });
      matchedCurrentIds.add(product.id);
      for (const code of uniqueWorkbookCodes) {
        representedPosCodes.add(code);
      }
      continue;
    }

    if (uniqueWorkbookCodes.length === 1) {
      const otherProducts = (index.mappingsByPosCode.get(uniqueWorkbookCodes[0]) ?? [])
        .map((mapping) => mapping.productId)
        .filter((id) => id !== product.id);
      if (otherProducts.length > 0) {
        ambiguousMatches.push({
          status: "AMBIGUOUS",
          currentProductId: product.id,
          currentCustomerName: product.name,
          posCode: uniqueWorkbookCodes[0],
          otherProductIds: uniqueSorted(otherProducts),
          notes: `Workbook code ${uniqueWorkbookCodes[0]} is mapped to multiple catalogue products`,
        });
        matchedCurrentIds.add(product.id);
        representedPosCodes.add(uniqueWorkbookCodes[0]);
        continue;
      }

      const workbookProduct = matchedWorkbook[0];
      const snapshot = productSnapshot(product, index);
      const units = reconcileUnits(workbookProduct, product, index);
      const currentPosName = uniqueSorted(mappings.map((mapping) => mapping.posName)).join(" | ");
      const nameDiffers = normalizeNameKey(product.name) !== normalizeNameKey(workbookProduct.posName);

      const match = {
        status: "EXACT_POS_MATCH",
        ...snapshot,
        workbookPosCode: workbookProduct.posCode,
        workbookPosName: workbookProduct.posName,
        currentPosName,
        customerNameDiffersFromWorkbookPosName: nameDiffers,
        unitStatus: units.summary,
        preserved: {
          productId: true,
          variantId: true,
          imagePaths: true,
          aliases: true,
          recommendations: true,
          customerFacingName: true,
          favorite: true,
          homepageFeatured: snapshot.homepageFeatured,
          category: true,
        },
      };
      exactPosMatches.push(match);
      matchedCurrentIds.add(product.id);
      representedPosCodes.add(workbookProduct.posCode);
      unitDifferences.push({
        productId: product.id,
        customerName: product.name,
        posCode: workbookProduct.posCode,
        ...units,
      });
      if (nameDiffers) {
        customerNameDiffersFromPos.push({
          productId: product.id,
          customerName: product.name,
          currentPosName,
          workbookPosName: workbookProduct.posName,
          posCode: workbookProduct.posCode,
        });
      }
    }
  }

  const unmatchedCurrent = catalog.products.filter(
    (product) => !matchedCurrentIds.has(product.id)
  );
  const unmatchedWorkbook = workbookProducts.filter(
    (product) => !representedPosCodes.has(product.posCode) && product.posCode
  );

  const likelyNameMatches = [];
  const claimedWorkbookCodes = new Set();
  const claimedCurrentIds = new Set();

  for (const product of unmatchedCurrent) {
    const hits = unmatchedWorkbook.filter((candidate) =>
      namesStronglyMatch(product.name, candidate.posName)
    );
    if (hits.length > 1) {
      ambiguousMatches.push({
        status: "AMBIGUOUS",
        currentProductId: product.id,
        currentCustomerName: product.name,
        candidates: hits.map((hit) => ({ posCode: hit.posCode, posName: hit.posName })),
        notes: `Current product ${product.id} (${product.name}) has multiple strong workbook name candidates`,
      });
      claimedCurrentIds.add(product.id);
      for (const hit of hits) {
        claimedWorkbookCodes.add(hit.posCode);
      }
      continue;
    }
    if (hits.length === 1) {
      const hit = hits[0];
      const reverse = unmatchedCurrent.filter(
        (other) =>
          other.id !== product.id && namesStronglyMatch(other.name, hit.posName)
      );
      if (reverse.length > 0) {
        ambiguousMatches.push({
          status: "AMBIGUOUS",
          currentProductId: product.id,
          currentCustomerName: product.name,
          posCode: hit.posCode,
          posName: hit.posName,
          otherProductIds: reverse.map((other) => other.id),
          notes: `Workbook ${hit.posCode} (${hit.posName}) strongly matches multiple current products`,
        });
        claimedCurrentIds.add(product.id);
        claimedWorkbookCodes.add(hit.posCode);
        continue;
      }
      likelyNameMatches.push({
        status: "LIKELY_NAME_MATCH_ONLY",
        currentProductId: product.id,
        currentCustomerName: product.name,
        category: product.category || "",
        posCode: hit.posCode,
        posName: hit.posName,
        currentPosCodes: uniqueSorted(
          (index.mappingsByProductId.get(product.id) ?? []).map((mapping) => mapping.posCode)
        ),
        reason: "normalized/compact/parenthetical-stripped names match; no POS code match",
        ...productSnapshot(product, index),
        unitStatus: reconcileUnits(hit, product, index).summary,
      });
      claimedCurrentIds.add(product.id);
      claimedWorkbookCodes.add(hit.posCode);
    }
  }

  const currentNotInSource = unmatchedCurrent
    .filter((product) => !claimedCurrentIds.has(product.id))
    .map((product) => ({
      status: "CURRENT_NOT_IN_FINAL_SOURCE",
      ...productSnapshot(product, index),
      relatedWorkbookCandidates: relatedWorkbookCandidates(
        product.name,
        unmatchedWorkbook
      ),
    }));

  const usedIds = new Set(catalog.products.map((product) => product.id));
  const newPosProducts = unmatchedWorkbook
    .filter((product) => !claimedWorkbookCodes.has(product.posCode))
    .map((product) => {
      const idPlan = proposeProductId(product.posName, product.posCode, usedIds);
      const proposedUnitNames = uniqueSorted(
        product.rows.map((row) => proposedCustomerUnitName(row.posUnit))
      );
      const defaultUnitName = chooseDefaultUnit(proposedUnitNames);
      return {
        status: "NEW_POS_PRODUCT",
        posCode: product.posCode,
        posName: product.posName,
        category: "NEEDS_CATEGORY",
        proposedProductId: idPlan.proposedProductId,
        proposedVariantId: idPlan.proposedProductId,
        idIssues: idPlan.issues,
        image: "absent",
        aliases: [],
        recommendations: [],
        proposedUnits: product.rows.map((row) => ({
          sourceRow: row.sourceRow,
          posUnit: row.posUnit,
          qtyPerPackage: row.qtyPerPackage,
          baseUnit: row.baseUnit,
          proposedCustomerUnitName: proposedCustomerUnitName(row.posUnit),
          proposedUnitId: `${idPlan.proposedProductId}__${slugify(proposedCustomerUnitName(row.posUnit) || row.posUnit)}`,
        })),
        proposedDefaultUnitName: defaultUnitName,
        nameSearchCoverage: Boolean(product.posName),
        rows: product.rows,
      };
    });

  const duplicateSourceNames = validation.namesWithMultipleProductCodes.map((entry) => ({
    posName: entry.posName,
    posCodes: entry.posCodes,
    products: entry.posCodes.map((code) => workbookByCode.get(code)).filter(Boolean),
  }));

  const recommendationDependencies = [];
  const missingIds = new Set(currentNotInSource.map((row) => row.productId));
  for (const edge of catalog.recommendations) {
    if (missingIds.has(edge.sourceProductId) || missingIds.has(edge.targetProductId)) {
      recommendationDependencies.push({
        ...edge,
        missingProductId: missingIds.has(edge.sourceProductId)
          ? edge.sourceProductId
          : edge.targetProductId,
      });
    }
  }

  const unitSummary = {
    exact: unitDifferences.filter((row) => row.summary === "exact-existing-unit-match").length,
    equivalent: unitDifferences.filter((row) => row.summary === "equivalent-spelling-case-match").length,
    unitSetDiffers: unitDifferences.filter((row) => row.summary === "unit-set-differs").length,
    quantityMismatch: unitDifferences.filter((row) => row.summary === "quantity-package-mismatch").length,
    ambiguous: unitDifferences.filter((row) => row.summary === "ambiguous").length,
  };

  const idProposalIssues = newPosProducts.filter((product) => product.idIssues.length > 0);

  const currentJsonBytes = CATALOG_FILES.reduce(
    (sum, fileName) => sum + fileSizeBytes(fileName),
    0
  );
  const scale = {
    currentProductCount: catalog.products.length,
    currentVariantCount: catalog.variants.length,
    currentUnitCount: catalog.units.length,
    currentAliasCount: catalog.aliases.length,
    currentMappingCount: catalog.mappings.length,
    currentRecommendationCount: catalog.recommendations.length,
    currentJsonBytes,
    highEstimateVisible: catalog.products.length + newPosProducts.length,
    ifAbsentRemoved:
      catalog.products.length - currentNotInSource.length + newPosProducts.length,
    estimatedImportedJsonBytes: Math.round(
      currentJsonBytes * ((catalog.products.length + newPosProducts.length) / Math.max(catalog.products.length, 1))
    ),
  };

  const ownerDecisions = [
    `Assign categories for ${newPosProducts.length} new POS products before any become customer-visible (staging marker NEEDS_CATEGORY only).`,
    `Decide fate of ${currentNotInSource.length} current products absent from the final workbook (keep, hide, or later remove). They must not be auto-deleted.`,
    `Review ${likelyNameMatches.length} likely name-only matches. These look like POS recodes of existing cigarettes (AVE20→AV20, KABEL→KBL16, REGION→RKSP16, ZENIXB20→ZB20, ZenPTH→ZP20). Confirm before replacing mappings.posCode.`,
    `Review ${ambiguousMatches.length} ambiguous matches; do not auto-merge.`,
    `Review ${duplicateSourceNames.length} duplicate POS-name / different-code case(s), including Rose Brand Tepung Tapioka 500G; do not auto-merge.`,
    `Approve unit-set differences on matched products (${unitSummary.unitSetDiffers} products). Cigarette exact matches currently have identical POS units; grocery pack-size mapping is a later owner choice.`,
    "Confirm that customer-facing names stay as they are when they differ from POS names (Camel Blue 16 vs Camel Biru 16, Rexo Filter Merah 20 vs Rexo Merah 20, 52 Kretek 20 vs 52 (Lima Dua) Kretek 20, etc.).",
    "Confirm mappings.posName may be updated to the workbook POS name on exact matches in 5B.2.",
    "Review related workbook SKUs for current products not in the final source (Sergio Filter 20, Zenix Coffee 20, Zenix Sultan 20, Aqua/Masako/Energen/Indomie pack sizes). Do not auto-merge generic grocery products onto one pack size.",
    "Teh Botol Sosro and DSS Magnum Mild 16/20 were not found under similar POS names. Confirm discontinued vs renamed.",
    "Do not invent aliases for new products in 5B.2; alias enrichment is a later stage.",
    "Do not generate images or move watermarked files for new products in 5B.2.",
    "Do not build recommendation edges for new products until a later sales/manual pass.",
    "Decide whether 5B.2 applies unit additions to matched cigarettes immediately or waits for an explicit unit-policy pass.",
    "Performance/virtualization of category and search lists is out of scope until after owner accepts the imported visible set.",
  ];

  const reconciliation = {
    exactPosMatches,
    likelyNameMatches,
    ambiguousMatches,
    newPosProducts: newPosProducts.map((product) => ({
      status: product.status,
      posCode: product.posCode,
      posName: product.posName,
      proposedProductId: product.proposedProductId,
    })),
    currentNotInSource,
    duplicateSourceNames: duplicateSourceNames.map((entry) => ({
      posName: entry.posName,
      posCodes: entry.posCodes,
    })),
    unitSummary,
    customerNameDiffersFromPos,
    recommendationDependencies,
    idProposalIssues: idProposalIssues.map((product) => ({
      posCode: product.posCode,
      posName: product.posName,
      proposedProductId: product.proposedProductId,
      issues: product.idIssues,
    })),
    newProductsWithNameSearchCoverage: newPosProducts.filter(
      (product) => product.nameSearchCoverage
    ).length,
    preservedForExactMatches: {
      productIds: true,
      variantIds: true,
      images: true,
      aliases: true,
      recommendations: true,
      customerFacingNames: true,
      categories: true,
      favorites: true,
      homepageFeatured: true,
    },
  };

  const reviewRows = [
    ...exactPosMatches.map((row) => ({
      status: row.status,
      posCode: row.workbookPosCode,
      posName: row.workbookPosName,
      currentProductId: row.productId,
      currentCustomerName: row.customerName,
      category: row.category,
      unitStatus: row.unitStatus,
      image: row.hasImage ? "yes" : "no",
      aliasCount: row.aliasCount,
      recommendationCount: row.recommendationCount,
      notes: row.customerNameDiffersFromWorkbookPosName
        ? "customer name differs from POS name; preserved"
        : "POS code match; stable id preserved",
    })),
    ...likelyNameMatches.map((row) => ({
      status: row.status,
      posCode: row.posCode,
      posName: row.posName,
      currentProductId: row.currentProductId,
      currentCustomerName: row.currentCustomerName,
      category: row.category,
      unitStatus: row.unitStatus,
      image: row.hasImage ? "yes" : "no",
      aliasCount: row.aliasCount,
      recommendationCount: row.recommendationCount,
      notes: row.reason,
    })),
    ...currentNotInSource.map((row) => ({
      status: row.status,
      posCode: row.posCodes.join("|"),
      posName: row.posNames.join("|"),
      currentProductId: row.productId,
      currentCustomerName: row.customerName,
      category: row.category,
      unitStatus: "",
      image: row.hasImage ? "yes" : "no",
      aliasCount: row.aliasCount,
      recommendationCount: row.recommendationCount,
      notes: "not automatically deleted; owner review required",
    })),
    ...ambiguousMatches.map((row) => ({
      status: row.status,
      posCode: row.posCode || (row.posCodes || []).join("|"),
      posName: row.posName || "",
      currentProductId: row.currentProductId || "",
      currentCustomerName: row.currentCustomerName || "",
      category: "",
      unitStatus: "",
      image: "",
      aliasCount: "",
      recommendationCount: "",
      notes: row.notes,
    })),
    ...newPosProducts.map((row) => ({
      status: row.status,
      posCode: row.posCode,
      posName: row.posName,
      currentProductId: row.proposedProductId,
      currentCustomerName: "",
      category: row.category,
      unitStatus: "new-units-not-imported",
      image: "absent",
      aliasCount: 0,
      recommendationCount: 0,
      notes: row.idIssues.length
        ? `proposed id; issues: ${row.idIssues.join(", ")}`
        : "proposed deterministic id; not written",
    })),
  ];

  const sourceSummary = {
    workbookPath: "imports/Matahari_Product_List_FINAL.xlsx",
    sheetName: workbook.sheetName,
    headerRow: workbook.headerRow,
    columns: workbook.columns,
    totalDataRows: validation.totalDataRows,
    uniqueProductCodes: validation.uniqueProductCodes,
    uniqueNames: validation.uniqueNames,
    skippedEmptyRows: workbook.skippedEmptyRows.length,
    note: "One Kode Item is one POS product. Rows under the same code are selling-unit mappings. Product codes are strings. Names and codes were trimmed but not silently corrected. Jenis / Harga Pokok / Harga Jual were not used.",
    validation,
  };

  writeJson(join(PREVIEW_DIR, "source-summary.json"), sourceSummary);
  writeJson(join(PREVIEW_DIR, "reconciliation.json"), {
    exactPosMatchCount: exactPosMatches.length,
    likelyNameMatchCount: likelyNameMatches.length,
    ambiguousMatchCount: ambiguousMatches.length,
    newPosProductCount: newPosProducts.length,
    currentNotInSourceCount: currentNotInSource.length,
    duplicateSourceNameCount: duplicateSourceNames.length,
    unitSummary,
    customerNameDifferenceCount: customerNameDiffersFromPos.length,
    idProposalIssues: idProposalIssues.map((product) => ({
      posCode: product.posCode,
      posName: product.posName,
      proposedProductId: product.proposedProductId,
      issues: product.idIssues,
    })),
    preservedForExactMatches: reconciliation.preservedForExactMatches,
    ownerDecisions,
  });
  writeJson(join(PREVIEW_DIR, "matched-existing.json"), exactPosMatches);
  writeJson(join(PREVIEW_DIR, "new-products.json"), newPosProducts);
  writeJson(join(PREVIEW_DIR, "current-not-in-source.json"), currentNotInSource);
  writeJson(join(PREVIEW_DIR, "unit-differences.json"), unitDifferences);
  writeJson(join(PREVIEW_DIR, "ambiguous-matches.json"), {
    ambiguousMatches,
    likelyNameMatches,
  });
  writeJson(join(PREVIEW_DIR, "duplicate-source-names.json"), duplicateSourceNames);

  const csvColumns = [
    "status",
    "posCode",
    "posName",
    "currentProductId",
    "currentCustomerName",
    "category",
    "unitStatus",
    "image",
    "aliasCount",
    "recommendationCount",
    "notes",
  ];
  writeFileSync(
    join(PREVIEW_DIR, "review.csv"),
    toCsv(reviewRows, csvColumns),
    "utf8"
  );

  const hashesAfter = hashCatalogFiles();
  const unchanged = CATALOG_FILES.every(
    (fileName) => hashesBefore[fileName] === hashesAfter[fileName]
  );

  const previewFiles = [
    "source-summary.json",
    "reconciliation.json",
    "matched-existing.json",
    "new-products.json",
    "current-not-in-source.json",
    "unit-differences.json",
    "ambiguous-matches.json",
    "duplicate-source-names.json",
    "review.csv",
    "IMPORT_REVIEW.md",
  ];

  const report = {
    source: {
      workbookPath: "imports/Matahari_Product_List_FINAL.xlsx",
      sheetName: workbook.sheetName,
      head: "2f67c20 Add Stage 5A customer UI polish",
    },
    validation,
    reconciliation: {
      ...reconciliation,
      exactPosMatches,
      likelyNameMatches,
      ambiguousMatches,
      newPosProducts,
      currentNotInSource,
      duplicateSourceNames,
      unitSummary,
      customerNameDiffersFromPos,
      recommendationDependencies,
      idProposalIssues,
      newProductsWithNameSearchCoverage: newPosProducts.filter(
        (product) => product.nameSearchCoverage
      ),
    },
    scale,
    ownerDecisions,
    hashes: { before: hashesBefore, after: hashesAfter, unchanged },
    previewFiles,
  };

  writeFileSync(join(PREVIEW_DIR, "IMPORT_REVIEW.md"), renderReviewMarkdown(report), "utf8");

  console.log("Stage 5B.1 catalogue import preview");
  console.log(`Workbook     : ${sourceSummary.workbookPath}`);
  console.log(`Data rows    : ${validation.totalDataRows}`);
  console.log(`Unique codes : ${validation.uniqueProductCodes}`);
  console.log(`Exact POS    : ${exactPosMatches.length}`);
  console.log(`Name-only    : ${likelyNameMatches.length}`);
  console.log(`Ambiguous    : ${ambiguousMatches.length}`);
  console.log(`New POS      : ${newPosProducts.length}`);
  console.log(`Not in source: ${currentNotInSource.length}`);
  console.log(`Name diffs   : ${customerNameDiffersFromPos.length}`);
  console.log(`Live JSON    : ${unchanged ? "UNCHANGED" : "CHANGED"}`);
  console.log(`Preview dir  : tmp/catalog-import-preview/`);

  if (!unchanged) {
    process.exitCode = 1;
  }
}

main();
