/**
 * Stage 5B.1C — Persist approved 9-category classification preview.
 *
 * Reads imports/Matahari_Product_List_FINAL.xlsx and Stage 5B.1 reconciliation
 * artifacts, then writes review files under tmp/catalog-category-preview/.
 *
 * Does NOT modify src/catalog, images, recommendations, or customer UI.
 * Does NOT import products.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_FILES } from "./catalogTransaction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKBOOK_PATH = join(ROOT, "imports", "Matahari_Product_List_FINAL.xlsx");
const CATALOG_DIR = join(ROOT, "src", "catalog");
const CATEGORIES_JS = join(ROOT, "src", "config", "categories.js");
const IMAGE_DIR = join(ROOT, "public", "product-images");
const IMPORT_PREVIEW_DIR = join(ROOT, "tmp", "catalog-import-preview");
const PREVIEW_DIR = join(ROOT, "tmp", "catalog-category-preview");
const XLSX_EXTRACT_DIR = join(PREVIEW_DIR, "_xlsx");

const APPROVED_CATEGORIES = Object.freeze([
  "Makanan Ringan",
  "Bahan Makanan",
  "Minuman",
  "Perawatan Diri",
  "Kebutuhan Rumah",
  "Alat & Perlengkapan",
  "Kesehatan",
  "Rokok",
  "Bayi & Anak",
]);

const ALAT_FAMILIES = Object.freeze([
  "Plastik & Kemasan",
  "ATK & Sekolah",
  "Mainan & Pesta",
  "Perlengkapan Rumah",
]);

const CONFIDENCE_RANK = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2 });
const FORBIDDEN_COLUMNS = new Set(["Jenis", "Harga Pokok", "Harga Jual"]);
const HEADER_LABELS = {
  kodeItem: "Kode Item",
  namaItem: "Nama Item",
  stok: "Stok",
  satuan: "Satuan",
  qtyPerPaket: "Qty/Paket",
};

const SPLIT_FAMILY_KEYS = new Set([
  "abc",
  "so klin",
  "cap lang",
  "hemaviton",
  "top",
  "pop",
  "sun",
  "my",
  "good",
  "wings",
  "chocolatos",
  "gery",
  "dove",
  "nestle",
]);

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

function hashTree(dirPath) {
  const hashes = {};
  if (!existsSync(dirPath)) {
    return hashes;
  }

  function walk(current) {
    const entries = readdirSync(current).sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        hashes[relative(ROOT, full).replaceAll("\\", "/")] = hashFile(full);
      }
    }
  }

  walk(dirPath);
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
  const satuanCol = header.labels.get(HEADER_LABELS.satuan);
  const qtyCol = header.labels.get(HEADER_LABELS.qtyPerPaket);
  const baseUnitCol = nextColumn(qtyCol);
  const ignoredColumns = [...FORBIDDEN_COLUMNS]
    .filter((label) => header.labels.has(label))
    .map((label) => ({ label, column: header.labels.get(label) }));

  const dataRows = [];
  for (const row of rows) {
    if (row.sourceRow <= header.sourceRow) {
      continue;
    }
    const posCode = cellText(row.cells[kodeCol]);
    const posName = cellText(row.cells[namaCol]);
    const posUnit = cellText(row.cells[satuanCol]);
    const qtyRaw = cellText(row.cells[qtyCol]);
    const baseUnit = cellText(row.cells[baseUnitCol]);
    if (!posCode && !posName && !posUnit && !qtyRaw && !baseUnit) {
      continue;
    }
    dataRows.push({
      sourceRow: row.sourceRow,
      posCode,
      posName,
      posUnit,
      qtyPerPackage: qtyRaw,
      baseUnit,
    });
  }

  return {
    sheetName: sheetName || "Products",
    headerRow: header.sourceRow,
    ignoredColumns,
    dataRows,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "id")
  );
}

function groupWorkbookProducts(dataRows) {
  const byCode = new Map();
  for (const row of dataRows) {
    if (!row.posCode) {
      continue;
    }
    if (!byCode.has(row.posCode)) {
      byCode.set(row.posCode, {
        posCode: row.posCode,
        names: new Map(),
        rows: [],
      });
    }
    const group = byCode.get(row.posCode);
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
      sourceRows: group.rows.map((row) => row.sourceRow),
      sellingUnits: uniqueSorted(group.rows.map((row) => row.posUnit)),
      qtyPerPaket: uniqueSorted(group.rows.map((row) => row.qtyPerPackage)),
      baseUnits: uniqueSorted(group.rows.map((row) => row.baseUnit)),
    };
  });
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function startsAny(n, list) {
  return list.some((prefix) => {
    const token = prefix.trimEnd();
    if (n === token) {
      return true;
    }
    if (n.startsWith(`${token} `)) {
      return true;
    }
    if (prefix.endsWith(" ") && n.startsWith(prefix)) {
      return true;
    }
    if (token.length >= 4 && n.startsWith(token)) {
      if (token.length > 4) {
        return true;
      }
      const next = n[token.length];
      return next == null || !/[a-z]/.test(next);
    }
    return false;
  });
}

function includesAny(n, parts) {
  return parts.some((part) => n.includes(part));
}

function result(category, subcategory, confidence, reason, extra = {}) {
  const reviewNeeded =
    extra.reviewNeeded ??
    (confidence !== "HIGH" || category === "Lainnya");
  return {
    proposedCategory: category,
    proposedSubcategory: subcategory,
    confidence,
    classificationReason: reason,
    reviewNeeded,
    proposedSubfamily: extra.proposedSubfamily || "",
    notes: extra.notes || "",
  };
}

function alat(family, subfamily, confidence, reason, extra = {}) {
  return result("Alat & Perlengkapan", family, confidence, reason, {
    ...extra,
    proposedSubfamily: subfamily,
    notes: extra.notes || (subfamily ? `subfamily: ${subfamily}` : ""),
  });
}

function rokokSub(n) {
  if (n.includes("kretek")) {
    return "Kretek";
  }
  if (
    includesAny(n, [
      "menthol",
      "mentol",
      " ice",
      "purple",
      "ungu",
      "apel",
      "mangga",
      "teh manis",
      "caffe",
      "cappuccino",
      "coffee",
      "shiver",
    ])
  ) {
    return "Rasa / Menthol";
  }
  if (includesAny(n, ["mild", "lights", "slims", " mld"])) {
    return "Mild";
  }
  if (includesAny(n, ["filter", "putih", "bold"])) {
    return "Filter";
  }
  return "Umum";
}

const SNACK_PREFIXES = [
  "chiki",
  "choki",
  "chocolatos",
  "chupa chups",
  "cloud 9",
  "dilan ",
  "hello panda",
  "pocky",
  "twister",
  "taro ",
  "potabee",
  "qtella",
  "qtela",
  "french fries",
  "happydent",
  "oishi",
  "nyam nyam",
  "rolls ",
  "time break",
  "superco",
  "yeye",
  "yosan",
  "collin",
  "hot hot",
  "jocky",
  "new ski",
  "pendekar",
  "parago",
  "nougat",
  "texas ",
  "tamarin",
  "super zuper",
  "cup cup wow",
  "champion 35",
  "corn shots",
  "corn stick",
  "jaipong",
  "mlaku",
  "rosta",
  "saltcheese",
  "khong guan",
  "atb marie",
  "gabin",
  "marie raja",
  "ubm ",
  "rimba",
  "fullo",
  "kalio",
  "doraemon",
  "euro coin",
  "chocolate pie",
  "bonita",
  "coklat roman",
  "lotte",
  "poppins",
  "simon coklat",
  "ting ting",
  "padamu",
  "chacha",
  "better ",
  "gery",
  "roma",
  "yupi",
  "biskuat",
  "nabati",
  "tango",
  "oreo",
  "nextar",
  "hatari",
  "simba",
  "siip",
  "pilus",
  "richeese",
  "chitato",
  "lays",
  "cheetos",
  "piattos",
  "mentos",
  "relaxa",
  "kopiko",
  "alpen",
  "milkita",
  "lazery",
  "walens",
  "beng beng",
  "silver queen",
  "cadbury",
  "wafello",
  "interbis",
  "regal",
  "blaster",
  "big babol",
  "kis ",
  "mintz",
  "kacang ",
  "garuda ",
  "yami",
  "krepek",
  "krupuk",
  "kerupuk",
  "keripik",
  "kripik",
  "apetito",
  "antaka ",
  "kuaci",
  "fox berries",
  "fox fruits",
  "fox passion",
  "bebe ",
  "okky jelly candy",
  "fruit roll",
  "fruta gummy",
  "lollipop",
  "wafer",
  "biskuit",
  "biscuit",
  "snack",
  "permen",
  "chocopie",
  "choco pie",
  "goriorio",
  "go potato",
  "koko krunch",
  "kelloggs",
  "hunkue",
  "es lilin",
  "sosis ",
  "nyamnyam",
  "bronson",
  "cho cho",
  "ice cream lollipop",
  "fonnut",
  "hawaii lemon",
  "union jeruk",
  "tictac",
  "tic tac",
  "kiss ",
  "katom ",
  "pradami",
  "asli cup",
  "berbi",
  "lady pink hadiah",
  "sms long",
  "pon pon",
  "pino es",
  "fruity pudding",
  "good time",
  "pop korn",
  "top wafer",
  "top triple choc",
  "kino ",
  "nestle corn flakes",
];

const MEDICINE_PREFIXES = [
  "cloramphenicol",
  "ctm",
  "collagena",
  "demacolin",
  "dexamethasone",
  "entrostop",
  "entrasol",
  "gpu ",
  "inza",
  "inzana",
  "mylanta",
  "neo napacin",
  "neo rheumacyl",
  "neozep",
  "neuralgin",
  "nosib",
  "pagoda salep",
  "paraco",
  "paramex",
  "piroxicam",
  "planotab",
  "plossa",
  "ponstan",
  "puyer",
  "ranitidine",
  "rivanol",
  "salicyl",
  "salonpas",
  "sangobion",
  "simvastatin",
  "super influenza",
  "super tetra",
  "vitacimin",
  "hevit",
  "madu tj",
  "madurasa",
  "kain has",
  "masker",
  "sensi face",
  "luciana",
  "amoxicillin",
  "ampicillin",
  "amlodipine",
  "paracetamol",
  "antasida",
  "antalgin",
  "ravalgin",
  "asam mefenamat",
  "biogesic",
  "bodrex",
  "panadol",
  "oskadon",
  "decolgen",
  "mixagrip",
  "konidin",
  "promag",
  "diapet",
  "insto",
  "tempra",
  "sanmol",
  "antimo",
  "antangin",
  "tolak angin",
  "obh",
  "bisolvon",
  "komix",
  "betadine",
  "hansaplast",
  "kalpanax",
  "obat kurap",
  "alkohol 70",
  "oralit",
  "imboost",
  "enervon",
  "cdr",
  "hot in cream",
  "fresh care",
  "counterpain",
  "koyo",
  "balsem",
  "balpirik",
  "minyak kayu putih",
  "mkp ",
  "green oil",
  "herocyn",
  "alumy",
  "fatigon",
  "hemaviton",
  "vitamin",
  "geliga",
  "woods",
  "my lanta",
  "dexamethason",
  "chloramphenicol",
];

const CIGARETTE_PREFIXES = [
  "52",
  "lima dua",
  "apache",
  "ave",
  "avolution",
  "bintang mas",
  "camel",
  "chief",
  "crystal",
  "d76",
  "dio",
  "djarum",
  "dji sam soe",
  "dji ",
  "dss",
  "dunhill",
  "esse",
  "filasta",
  "gandum mas",
  "glory",
  "gopas",
  "gp1",
  "gp2",
  "gudang garam",
  "harum manis",
  "hk kretek",
  "hk ",
  "ina bold",
  "kabel",
  "l a",
  "la bold",
  "la lights",
  "la ice",
  "lucky strike",
  "magnum",
  "marlboro",
  "milta",
  "nation",
  "pitoe",
  "redjati",
  "region",
  "rexo",
  "sahara",
  "sampoerna",
  "sek delapan",
  "sek kunci",
  "sek roll",
  "sergio",
  "surya",
  "tik tok",
  "troy",
  "urban",
  "zenix",
  "wismilak",
  "mevius",
  "pall mall",
  "clas mild",
  "win mild",
  "gg mild",
  "gg filter",
  "gg surya",
  "menara mld",
  "indocock",
];

function snackSub(n) {
  if (n.startsWith("roti") || includesAny(n, ["kue basah", "bolu"])) {
    return "Roti & Kue";
  }
  if (
    includesAny(n, [
      "krupuk",
      "kerupuk",
      "krepek",
      "keripik",
      "kripik",
      "chiki",
      "taro",
      "potabee",
      "french fries",
      "qtella",
      "piattos",
      "pilus",
      "siip",
      "chitato",
      "jaipong",
      "kwaci",
      "kuaci",
      "kacang",
      "garuda",
      "yami",
      "rosta",
      "mlaku",
      "go potato",
      "corn ",
      "pop korn",
    ])
  ) {
    return "Keripik & Snack";
  }
  if (
    includesAny(n, [
      "permen",
      "yupi",
      "mentos",
      "kopiko",
      "relaxa",
      "alpen",
      "milkita",
      "lazery",
      "lollipop",
      "gummy",
      "babol",
      "chupa",
      "happydent",
      "choki",
      "silver queen",
      "cadbury",
      "fox passion",
      "fox berries",
      "fox fruits",
    ])
  ) {
    return "Permen & Cokelat";
  }
  if (n.includes("sosis")) {
    return "Sosis & Olahan Siap Makan";
  }
  return "Biskuit & Wafer";
}

function classifyName(name) {
  const n = normalizeName(name);

  // Explicit trap / previously missed identity overrides. Do not use prefix alone.
  if (n.startsWith("good time")) {
    return result(
      "Makanan Ringan",
      "Biskuit & Wafer",
      "HIGH",
      "Good Time is a biscuit (Roma family), not Good Day coffee"
    );
  }
  if (n.startsWith("pop korn")) {
    return result(
      "Makanan Ringan",
      "Keripik & Snack",
      "HIGH",
      "Pop Korn is popcorn, not Pop Ice drink mix"
    );
  }
  if (n.startsWith("top black in white")) {
    return result(
      "Minuman",
      "Kopi",
      "HIGH",
      "Top Black in White 16G sachet is Kopi Top coffee mix, not Top Chiz cheese"
    );
  }
  if (n.startsWith("top wafer") || n.startsWith("top triple choc")) {
    return result(
      "Makanan Ringan",
      "Biskuit & Wafer",
      "HIGH",
      "Top wafer/triple choc snack, not Top Kopi or Top Chiz"
    );
  }
  if (n.startsWith("top lady")) {
    return result(
      "Perawatan Diri",
      "Kulit & Wajah",
      "MEDIUM",
      "Top Lady COS-coded cosmetic; confirm vs hair colour",
      { reviewNeeded: true }
    );
  }
  if (n.startsWith("silver queen")) {
    return result(
      "Makanan Ringan",
      "Permen & Cokelat",
      "HIGH",
      "Silver Queen chocolate bar"
    );
  }
  if (n.startsWith("head shoulders") || n.includes("head shoulders")) {
    return result(
      "Perawatan Diri",
      "Perawatan Rambut",
      "HIGH",
      "Head & Shoulders shampoo"
    );
  }
  if (n.includes("bear brand")) {
    return result(
      "Minuman",
      "Susu & Minuman Susu",
      "HIGH",
      "Nestle Bear Brand sterilized milk"
    );
  }
  if (n.includes("cerelac")) {
    return result(
      "Bayi & Anak",
      "Makanan Bayi",
      "HIGH",
      "Nestle Cerelac infant cereal"
    );
  }
  if (n.includes("carnation")) {
    return result(
      "Minuman",
      "Krimer & Susu Kental",
      "HIGH",
      "Nestle Carnation condensed/evaporated milk"
    );
  }
  if (n.startsWith("gatsby")) {
    return result(
      "Perawatan Diri",
      "Perawatan Rambut",
      "HIGH",
      "Gatsby hair wax/styling"
    );
  }
  if (n.startsWith("pixy")) {
    return result(
      "Perawatan Diri",
      "Kulit & Wajah",
      "HIGH",
      "Pixy face compact/cosmetic"
    );
  }
  if (n.startsWith("fox ") && !n.startsWith("lem fox")) {
    return result(
      "Makanan Ringan",
      "Permen & Cokelat",
      "HIGH",
      "Fox's candy/mints, not stationery glue"
    );
  }
  if (n.startsWith("kino ")) {
    return result(
      "Makanan Ringan",
      "Permen & Cokelat",
      "HIGH",
      "Kino fruit candy"
    );
  }
  if (n.startsWith("cap enak")) {
    return result(
      "Minuman",
      "Krimer & Susu Kental",
      "HIGH",
      "Cap Enak condensed milk"
    );
  }
  if (n.startsWith("sagu mutiara") || n === "sagu mutiara") {
    return result(
      "Bahan Makanan",
      "Tepung & Pati",
      "HIGH",
      "Pearl sago starch for cooking"
    );
  }
  if (n.startsWith("asam jawa")) {
    return result(
      "Bahan Makanan",
      "Bumbu & Penyedap",
      "HIGH",
      "Tamarind cooking ingredient"
    );
  }
  if (n.startsWith("kayu manis") || n.startsWith("koepoe kayu manis")) {
    return result(
      "Bahan Makanan",
      "Bumbu & Penyedap",
      "HIGH",
      "Cinnamon spice"
    );
  }
  if (n.startsWith("my vla")) {
    return result(
      "Bahan Makanan",
      "Bahan Kue",
      "HIGH",
      "My Vla is pudding/custard mix, not My Baby"
    );
  }
  if (n.includes("nestle corn flakes") || n.startsWith("nestle cap nona")) {
    if (n.includes("corn flakes")) {
      return result(
        "Makanan Ringan",
        "Sereal & Olahan Siap Makan",
        "HIGH",
        "Breakfast cereal"
      );
    }
    return result(
      "Minuman",
      "Krimer & Susu Kental",
      "MEDIUM",
      "Nestle Cap Nona 370G matches condensed-milk pack size"
    );
  }
  if (n.startsWith("hevit")) {
    return result(
      "Kesehatan",
      "Vitamin & Suplemen",
      "HIGH",
      "Hevit-C vitamin C"
    );
  }
  if (n.includes("hansaplast") || n.startsWith("plester hansaplast")) {
    return result(
      "Kesehatan",
      "P3K & Antiseptik",
      "HIGH",
      "Hansaplast first-aid plaster"
    );
  }
  if (n.includes("herocyn") && !n.includes("baby")) {
    return result(
      "Kesehatan",
      "P3K & Antiseptik",
      "HIGH",
      "Herocyn is medicated powder, not ordinary body powder"
    );
  }
  if (n.includes("tjing tjau") || n.startsWith("balsem ")) {
    return result(
      "Kesehatan",
      "Minyak Medis & Balsem",
      "HIGH",
      "Medicated balm"
    );
  }
  if (n.startsWith("kraft keju") || (n.startsWith("kraft ") && n.includes("keju"))) {
    return result(
      "Bahan Makanan",
      "Mentega & Keju",
      "HIGH",
      "Kraft cheese used as a cooking/baking ingredient"
    );
  }
  if (n.includes("chocolate compound") || (n.startsWith("bella ") && includesAny(n, ["compound", "choco chips", "chips"]))) {
    return result(
      "Bahan Makanan",
      "Bahan Kue",
      "HIGH",
      "Baking chocolate / choco chips, not a ready-to-eat snack"
    );
  }
  if (
    n.startsWith("jordan roti") ||
    (n.startsWith("jordan ") && n.includes("roti"))
  ) {
    return result(
      "Makanan Ringan",
      "Roti & Kue",
      "HIGH",
      "Jordan bakery product; Jordan here is bread, not a toothbrush"
    );
  }
  if (
    includesAny(n, ["cream crackers", "crispy crackers", "saltcheese"]) ||
    n.includes(" crackers")
  ) {
    return result("Makanan Ringan", "Biskuit & Wafer", "HIGH", "Cracker biscuit");
  }
  if (n.startsWith("kwaci ") || n.startsWith("kuaci ")) {
    return result("Makanan Ringan", "Keripik & Snack", "HIGH", "Kwaci/kuaci snack seeds");
  }
  if (n.startsWith("kiko jelly") || n.includes("jelly ice stick")) {
    return result("Makanan Ringan", "Permen & Cokelat", "HIGH", "Jelly ice snack");
  }
  if (n.startsWith("l agie") || n.startsWith("lagie")) {
    return result("Makanan Ringan", "Permen & Cokelat", "HIGH", "L'Agie chocolate");
  }
  if (n.startsWith("nissin ") && includesAny(n, ["cracker", "choco", "stick"]) && !includesAny(n, ["mie", "noodle"])) {
    return result("Makanan Ringan", snackSub(n), "HIGH", "Nissin biscuit/snack, not instant noodles");
  }
  if (n.startsWith("mary queen")) {
    return result("Makanan Ringan", "Permen & Cokelat", "HIGH", "Mary Queen boxed chocolate");
  }
  if (n.startsWith("sari manis")) {
    return result("Makanan Ringan", "Permen & Cokelat", "HIGH", "Sari Manis candy");
  }
  if (n.startsWith("aneka ") && includesAny(n, ["cracker", "biskuit", "wafer", "cream"])) {
    return result("Makanan Ringan", "Biskuit & Wafer", "HIGH", "Aneka cream crackers");
  }
  if (n.includes("rautan pensil") || n.startsWith("series school")) {
    return alat("ATK & Sekolah", "Alat Tulis", "HIGH", "School pencil sharpener");
  }
  if (n.startsWith("sikat sepatu")) {
    return alat("Perlengkapan Rumah", "Perawatan Sepatu", "HIGH", "Shoe brush");
  }
  if (n.startsWith("agarasa") || n.startsWith("aga rasa")) {
    return result(
      "Bahan Makanan",
      "Bahan Kue",
      "HIGH",
      "Agarasa is flavoured agar-agar for cooking/dessert"
    );
  }
  if (n.startsWith("bolpenku") || n === "bolpen ku") {
    return alat("ATK & Sekolah", "Alat Tulis", "HIGH", "Bolpenku ballpoint pen");
  }
  if (n.startsWith("champion 35")) {
    return result("Makanan Ringan", "Biskuit & Wafer", "HIGH", "Champion 35G biscuit pack");
  }
  if (n.startsWith("permen rokok")) {
    return result(
      "Makanan Ringan",
      "Permen & Cokelat",
      "HIGH",
      "Candy cigarettes, not tobacco"
    );
  }
  if (n.startsWith("menara mld")) {
    return result("Rokok", "Mild", "MEDIUM", "MLD 16 token typical of mild cigarettes; confirm not Plastik Menara packaging");
  }

  // Packaging that looks like drinks.
  if (
    startsAny(n, [
      "gelas pop ice",
      "cup pop ice",
      "gelas kopi",
      "gelas polkadot",
      "gelas puding",
    ]) ||
    (n.startsWith("cup ") && n.includes("oz")) ||
    n.startsWith("tutup cup") ||
    n.startsWith("cup ice cream") ||
    n.startsWith("stik es") ||
    n.startsWith("sedotan pop ice") ||
    n.startsWith("tas pop ice")
  ) {
    return alat(
      "Plastik & Kemasan",
      "Gelas & Wadah Sekali Pakai",
      "HIGH",
      "Disposable cup/lid/straw/bag for drinks, not a beverage"
    );
  }

  if (n.startsWith("pita plastik") || n.startsWith("kertas kado") || n.startsWith("kertas krep") || n.startsWith("kertas metalik")) {
    return alat("Mainan & Pesta", "Kado & Pita", "HIGH", "Gift wrap / party ribbon");
  }

  if (
    startsAny(n, CIGARETTE_PREFIXES) ||
    n.startsWith("gg mild") ||
    n.startsWith("gg filter") ||
    /\b(kretek|rokok)\b/.test(n)
  ) {
    return result(
      "Rokok",
      rokokSub(n),
      "HIGH",
      "Cigarette brand or kretek/rokok token",
      { notes: "analytical subcategory only; do not import cigarette subcategories" }
    );
  }

  if (!includesAny(n, ["yupi baby", "baby bears", "my vla"])) {
    const isDiaper = includesAny(n, [
      "poko",
      "pampers",
      "sweety",
      "popok",
      "baby happy",
      "makuku",
      "merries",
    ]);
    const isFormula = includesAny(n, [
      "lactogen",
      "bebelac",
      "nutrilon",
      "s26",
      "sgm",
      "prenagen",
    ]);
    const isSunBabyFood =
      n.startsWith("sun ") &&
      includesAny(n, [
        "puffs",
        "ayam kampung",
        "beras merah",
        "brokoli",
        "kacang hijau",
        "pisang susu",
        "wortel",
        "ubi ungu",
      ]);
    if (
      includesAny(n, [
        "pampers",
        "sweety",
        "mamy poko",
        "mamypoko",
        "baby happy",
        "popok",
        "zwitsal",
        "my baby",
        "cussons baby",
        "johnson baby",
        "minyak telon",
        "telon lang",
        "sun baby",
        "lactogen",
        "bebelac",
        "nutrilon",
        "s26",
        "morinaga",
        "prenagen",
        "makuku",
        "merries",
        "rita bedak bayi",
        "bedak herocyn baby",
        "bedak cussons",
      ]) ||
      isSunBabyFood ||
      n.startsWith("sgm ") ||
      (n.includes("baby") &&
        includesAny(n, ["wipes", "powder", "sabun", "bedak", "shampoo", "lotion"]))
    ) {
      const sub = isDiaper
        ? "Popok"
        : isFormula
          ? "Susu Formula & Ibu"
          : isSunBabyFood || n.includes("puffs") || n.includes("cerelac")
            ? "Makanan Bayi"
            : "Perawatan Bayi";
      return result("Bayi & Anak", sub, "HIGH", "Baby diaper/formula/care/food");
    }
  }

  if (n.includes("obat nyamuk")) {
    return result("Kebutuhan Rumah", "Anti Serangga", "HIGH", "Mosquito coil/spray");
  }

  if (n.startsWith("hemaviton energy") || n.startsWith("hemaviton jreng")) {
    return result(
      "Minuman",
      "Energi & Isotonik",
      "HIGH",
      "Hemaviton energy drink, not the supplement tablet"
    );
  }

  if (
    startsAny(n, MEDICINE_PREFIXES) ||
    includesAny(n, [
      "amoxicillin",
      "ampicillin",
      "amlodipine",
      "paracetamol",
      "bodrex",
      "betadine",
      "alkohol 70",
      "fresh care",
      "gpu ",
      "madu tj",
      "madurasa",
      "salonpas",
      "plossa",
      "masker",
      "sensi face",
      "kain has",
    ])
  ) {
    const sub = includesAny(n, [
      "balsem",
      "balpirik",
      "kayu putih",
      "mkp",
      "fresh care",
      "hot in",
      "koyo",
      "geliga",
      "green oil",
      "gpu",
      "plossa",
      "cap lang",
    ])
      ? "Minyak Medis & Balsem"
      : includesAny(n, [
            "betadine",
            "alkohol",
            "hansaplast",
            "herocyn",
            "kalpanax",
            "rivanol",
            "salicyl",
            "masker",
            "kain has",
            "sensi",
          ])
        ? "P3K & Antiseptik"
        : includesAny(n, [
              "vitamin",
              "imboost",
              "enervon",
              "cdr",
              "hemaviton",
              "fatigon",
              "sangobion",
              "vitacimin",
              "hevit",
              "entrasol",
              "madu",
              "madurasa",
            ])
          ? "Vitamin & Suplemen"
          : "Obat";
    return result(
      "Kesehatan",
      sub,
      "HIGH",
      "Medicine / first aid / supplement / medicated oil"
    );
  }

  if (
    startsAny(n, [
      "buku ",
      "amplop",
      "bolpen",
      "pulpen",
      "pensil",
      "spidol",
      "stofmap",
      "hekter",
      "alat hekter",
      "penghapus",
      "penggaris",
      "crayon",
      "stabilo",
      "karton manila",
      "karton putih",
      "kwitansi",
      "papan ujian",
      "pisau cutter",
      "rautan",
      "serutan",
      "type x",
      "type-x",
      "snowman spidol",
      "deli penghapus",
      "jazzco",
      "isi hekter",
      "great wall isi",
      "ppl buku",
      "selotip",
      "peneti",
      "garda amplop",
      "lem fox",
    ]) ||
    includesAny(n, ["sinar dunia", "tip ex", "tipe x", "stapler", "amplop"]) ||
    (n.startsWith("kertas ") && !includesAny(n, ["nasi", "kado", "krep", "metalik", "kaf"])) ||
    n.startsWith("lem alteco") ||
    n.startsWith("lem castol") ||
    n.startsWith("lem ehabond") ||
    n.startsWith("lem inikol") ||
    n.startsWith("lem korea")
  ) {
    const subfamily = n.startsWith("buku") || n.startsWith("ppl buku")
      ? "Buku Tulis & Gambar"
      : includesAny(n, ["amplop", "kertas", "sinar dunia", "karton", "kwitansi"])
        ? "Kertas & Amplop"
        : includesAny(n, [
              "bolpen",
              "pulpen",
              "pensil",
              "spidol",
              "crayon",
              "rautan",
              "serutan",
              "penghapus",
              "type",
            ])
          ? "Alat Tulis"
          : n.startsWith("lem ")
            ? "Lem"
            : "Perlengkapan Kantor";
    return alat("ATK & Sekolah", subfamily, "HIGH", "Stationery identity");
  }

  if (
    n.startsWith("lakban") ||
    n.startsWith("solasiban") ||
    n.startsWith("total cling") ||
    n.startsWith("chili plast") ||
    n.startsWith("klir thinwall") ||
    n.startsWith("sarung tangan plastik")
  ) {
    const subfamily =
      n.startsWith("lakban") || n.startsWith("solasiban") || n.includes("cling")
        ? "Lakban & Isolasi"
        : "Wadah & Dus";
    return alat("Plastik & Kemasan", subfamily, "HIGH", "Packing film/tape/thinwall");
  }

  if (
    startsAny(n, [
      "plastik ",
      "polybag",
      "tas ",
      "kresek",
      "mika ",
      "sedotan",
      "foam ",
      "karung",
      "dos kue",
      "dos martabak",
      "dos tart",
      "kertas nasi",
      "sendok plastik",
      "sendok makan",
      "sendok puding",
      "garpu plastik",
    ])
  ) {
    const subfamily = startsAny(n, ["tas ", "plastik", "polybag", "kresek"])
      ? "Kantong & Polybag"
      : startsAny(n, ["mika", "foam", "dos ", "klir"])
        ? "Wadah & Dus"
        : startsAny(n, ["kertas nasi", "karung"])
          ? "Kertas Nasi & Karung"
          : "Alat Makan Sekali Pakai";
    return alat("Plastik & Kemasan", subfamily, "HIGH", "Packaging/disposable identity");
  }

  if (
    startsAny(n, [
      "pop ice",
      "jasjus",
      "energen",
      "hilo",
      "ovaltine",
      "nutrisari",
      "drink beng beng",
      "koko drink",
      "clevo",
      "fruitea",
      "pino es serut",
      "es kelapa",
      "gery chocolatos drink",
    ]) &&
    !n.includes("biscuit")
  ) {
    const sub = startsAny(n, ["energen", "hilo", "ovaltine", "nutrisari", "drink beng", "gery chocolatos drink"])
      ? "Minuman Bubuk Bergizi"
      : startsAny(n, ["clevo", "koko drink", "fruitea", "es kelapa", "pino"])
        ? "Jus & Rasa Buah"
        : "Minuman Bubuk";
    return result("Minuman", sub, "HIGH", "Powdered or fruit drink");
  }
  if (
    startsAny(n, [
      "aqua",
      "le minerale",
      "club gelas",
      "club botol",
      "ades",
      "ake botol",
      "ake gelas",
      "asegar",
      "kucing angora gelas",
    ])
  ) {
    return result("Minuman", "Air Mineral", "HIGH", "Mineral water");
  }
  if (
    startsAny(n, ["teh ", "mountea", "nu green tea", "frestea"]) ||
    includesAny(n, ["teh kotak", "teh pucuk", "sosro", "sariwangi"])
  ) {
    return result(
      "Minuman",
      includesAny(n, ["sachet", "dos", "celup", "sarimurni", "sariwangi", "gorontalo"])
        ? "Teh Celup / Bubuk"
        : "Teh Siap Minum",
      "HIGH",
      "Tea"
    );
  }
  if (
    startsAny(n, [
      "kopi ",
      "good day",
      "torabika",
      "nescafe",
      "kapal api",
      "luwak",
      "indocafe",
      "abc white coffee",
      "abc kopi",
      "abc mocca",
      "top kopi",
      "golda",
      "coffeemate",
    ]) ||
    (n.startsWith("top ") && n.includes("kopi"))
  ) {
    return result(
      "Minuman",
      n.includes("coffeemate") ? "Krimer" : "Kopi",
      "HIGH",
      "Coffee / creamer"
    );
  }
  if (startsAny(n, ["coca cola", "sprite", "fanta", "pepsi", "tebs"])) {
    return result("Minuman", "Soda", "HIGH", "Soft drink");
  }
  if (
    startsAny(n, [
      "ale ale",
      "okky jelly drink",
      "ichitan",
      "you c1000",
      "uc1000",
      "fruit tea",
      "floridina",
      "buavita",
      "nipis madu",
      "m150",
    ])
  ) {
    return result(
      "Minuman",
      includesAny(n, ["m150"]) ? "Energi & Isotonik" : "Jus & Rasa Buah",
      "HIGH",
      "Fruit or vitamin drink"
    );
  }
  if (
    startsAny(n, [
      "extra joss",
      "kuku bima",
      "krating",
      "pocari",
      "mizone",
      "hydro coco",
    ])
  ) {
    return result("Minuman", "Energi & Isotonik", "HIGH", "Energy/isotonic");
  }
  if (n.startsWith("abc sirup") || n.startsWith("sirup ") || n.startsWith("marjan")) {
    return result("Minuman", "Sirup", "HIGH", "Syrup");
  }
  if (
    startsAny(n, ["bir ", "green sands", "guinness", "smirnoff", "rum"]) &&
    !n.includes("essence") &&
    !n.includes("bumbu")
  ) {
    return result("Minuman", "Alkohol", "HIGH", "Alcoholic beverage");
  }
  if (startsAny(n, ["adem sari", "larutan ", "cap kaki tiga", "kiranti"])) {
    return result("Minuman", "Herbal", "MEDIUM", "Herbal drink; nearby Kesehatan overlap");
  }
  if (
    startsAny(n, [
      "dancow",
      "indomilk",
      "ultra milk",
      "frisian",
      "bendera",
      "anlene",
      "milo",
      "milku",
      "cimory",
      "greenfields",
      "yakult",
      "bear brand",
      "susu zee",
      "abc susu",
      "kremer",
      "milano kental",
      "tiga sapi kental",
      "max creamer",
    ]) ||
    (n.startsWith("ultra") &&
      includesAny(n, ["milk", "susu", "mimi", "coklat", "strawberry"]))
  ) {
    return result(
      "Minuman",
      includesAny(n, ["kental", "creamer", "kremer", "coffeemate"])
        ? "Krimer & Susu Kental"
        : "Susu & Minuman Susu",
      "HIGH",
      "Milk / creamer"
    );
  }

  if (
    startsAny(n, [
      "shampoo",
      "sunsilk",
      "pantene",
      "rejoice",
      "clear ",
      "zinc ",
      "emeron",
      "ellips",
      "miranda",
      "samantha",
      "bigen",
      "nyu sachet",
      "tancho",
      "primadona",
      "rita hair",
      "dove (",
    ]) ||
    includesAny(n, [
      "shampoo",
      "shampo",
      "conditioner",
      "hair spray",
      "hair dye",
      "pewarna rambut",
      "jepitan rambut",
      "pomade",
      "hair cream",
      "hair oil",
      "ketombe",
      "perawatan rontok",
      "daily shine",
      "total damage",
    ])
  ) {
    return result("Perawatan Diri", "Perawatan Rambut", "HIGH", "Hair care");
  }
  if (
    startsAny(n, [
      "pepsodent",
      "ciptadent",
      "pasta gigi",
      "sikat gigi",
      "close up",
      "sensodyne",
      "listerine",
      "formula sikat",
    ]) ||
    includesAny(n, ["sikat gigi", "pasta gigi", "obat kumur"])
  ) {
    return result("Perawatan Diri", "Perawatan Mulut", "HIGH", "Oral care");
  }
  if (startsAny(n, ["charm", "softex", "protex"])) {
    return result("Perawatan Diri", "Perawatan Wanita", "HIGH", "Feminine hygiene");
  }
  if (n.startsWith("silet") || includesAny(n, ["gillette", "cukur"])) {
    return result("Perawatan Diri", "Cukur", "HIGH", "Shaving");
  }
  if (
    startsAny(n, ["rexona", "pucelle", "dove original deo"]) ||
    includesAny(n, ["deodorant", "deodoran", "minyak wangi", "parfum"])
  ) {
    return result("Perawatan Diri", "Deodoran & Wangi", "HIGH", "Fragrance");
  }
  if (n.startsWith("gincu") || n.startsWith("kelly cream")) {
    return result("Perawatan Diri", "Kulit & Wajah", "HIGH", "Cosmetic");
  }
  if (n.startsWith("sabun ") && !includesAny(n, ["cuci", "colek", "daia", "rinso", "so klin"])) {
    if (includesAny(n, ["baby", "cussons baby", "zwitsal", "my baby"])) {
      return result("Bayi & Anak", "Perawatan Bayi", "HIGH", "Baby soap");
    }
    return result("Perawatan Diri", "Sabun & Mandi", "HIGH", "Bath soap");
  }
  if (startsAny(n, ["lifebuoy", "lux ", "nuvo", "dettol", "zen ", "giv ", "shinzui", "biore"])) {
    return result("Perawatan Diri", "Sabun & Mandi", "HIGH", "Body soap brand");
  }
  if (
    startsAny(n, [
      "nivea",
      "marina",
      "citra",
      "vaseline",
      "viva",
      "bedak marcks",
      "bedak doris",
      "josly cotton",
    ]) ||
    includesAny(n, ["body lotion", "hbl ", "handbody", "pelembab", "compact powder", "foundation"])
  ) {
    return result("Perawatan Diri", "Kulit & Wajah", "HIGH", "Skin/cosmetic");
  }
  if (n.startsWith("kapas ")) {
    return result("Perawatan Diri", "Kapas & Kapas Wajah", "MEDIUM", "Cotton / personal-care consumable");
  }
  if (n.startsWith("julia minyak kemiri")) {
    return result("Perawatan Diri", "Perawatan Rambut", "HIGH", "Hair oil");
  }
  if (n.startsWith("dove ")) {
    return result(
      "Perawatan Diri",
      n.includes("deo") ? "Deodoran & Wangi" : "Sabun & Mandi",
      "MEDIUM",
      "Dove personal-care family; shampoo vs soap vs deo overlap"
    );
  }

  if (startsAny(n, ["sunlight", "mama lemon", "ekonomi refill"]) || includesAny(n, ["cuci piring"])) {
    return result("Kebutuhan Rumah", "Cuci Piring", "HIGH", "Dish soap");
  }
  if (
    startsAny(n, [
      "so klin lantai",
      "wipol",
      "harpic",
      "vixal",
      "stiwal",
      "sabut",
      "sw toilet",
      "gosok panci",
      "kit black",
      "kit multi",
      "proclin",
      "bayclin",
      "so klin pemutih",
    ]) ||
    includesAny(n, ["goso belanga", "pembersih"])
  ) {
    return result("Kebutuhan Rumah", "Pembersih Rumah", "HIGH", "Household cleaner / bleach");
  }
  if (
    startsAny(n, [
      "baygon",
      "autan",
      "soffel",
      "hit ",
      "raid",
      "kapur barus",
      "bagus kapur",
      "kamper",
      "seagull naphtalene",
      "sw naphtalene",
      "lem tikus",
      "racun tikus",
    ])
  ) {
    return result(
      "Kebutuhan Rumah",
      n.includes("tikus") ? "Pengendali Hama" : "Anti Serangga",
      "HIGH",
      "Pest control"
    );
  }
  if (
    startsAny(n, [
      "downy",
      "molto",
      "stella",
      "glade",
      "vanish",
      "so soft",
      "softener sekali",
      "royale purple",
      "royale soft",
    ])
  ) {
    return result(
      "Kebutuhan Rumah",
      startsAny(n, ["downy", "molto", "so soft", "softener", "vanish"])
        ? "Pewangi & Perawatan Pakaian"
        : "Pengharum Ruangan",
      "HIGH",
      "Laundry care / air care"
    );
  }
  if (
    startsAny(n, ["rinso", "daia", "attack", "so klin", "boom ", "b29"]) ||
    includesAny(n, ["deterjen", "detergent", "detergel"])
  ) {
    return result("Kebutuhan Rumah", "Cuci Pakaian", "HIGH", "Laundry detergent");
  }
  if (startsAny(n, ["paseo", "nice tissue", "nice softpack"]) || includesAny(n, ["tissue", "tisu"])) {
    return result("Kebutuhan Rumah", "Tisu", "HIGH", "Tissue");
  }
  if (startsAny(n, ["sapu ", "nagata sikat"]) || includesAny(n, ["sikat baju", "sikat wc", "keset"])) {
    return result("Kebutuhan Rumah", "Alat Kebersihan", "HIGH", "Cleaning tool");
  }

  if (
    startsAny(n, SNACK_PREFIXES) ||
    includesAny(n, [
      "biskuit",
      "biscuit",
      "wafer",
      "permen",
      "lollipop",
      "keripik",
      "kripik",
      "kerupuk",
      "krupuk",
      "snack",
      "choco pie",
      "chocolate",
      "chocolatos",
    ]) ||
    n.startsWith("roti ")
  ) {
    return result("Makanan Ringan", snackSub(n), "HIGH", "Snack/biscuit/candy/cracker");
  }

  if (
    includesAny(n, [
      "indomie",
      "mie sedaap",
      "mie sedap",
      "sarimi",
      "supermie",
      "pop mie",
      "lemonilo",
      "ekomie",
      "wings mie",
    ]) ||
    startsAny(n, [
      "mie ",
      "sarimi",
      "indomie",
      "pop mie",
      "ekomie",
      "bihun",
      "soun",
      "kwetiau",
      "spaghetti",
      "makaroni",
      "laksa",
      "bijag",
      "lafonte",
      "sedani",
    ])
  ) {
    return result(
      "Bahan Makanan",
      includesAny(n, ["bihun", "soun", "kwetiau", "spaghetti", "makaroni", "laksa", "sedani", "lafonte"])
        ? "Mie Kering & Pasta"
        : "Mie & Makanan Instan",
      "HIGH",
      "Instant/dried noodles — meal preparation, not snack"
    );
  }
  if (
    startsAny(n, [
      "masako",
      "royco",
      "sajiku",
      "ajinomoto",
      "sasa ",
      "bumbu ",
      "kaldu",
      "penyedap",
      "desaku",
      "kobe ",
      "koepoe",
      "merica",
      "lada ",
      "ketumbar",
      "kunyit",
      "terasi",
      "vetsin",
      "maggi",
      "bawang ",
      "ladaku",
      "omaku",
      "totole",
      "sedaap bumbu",
      "antaka",
    ])
  ) {
    return result("Bahan Makanan", "Bumbu & Penyedap", "HIGH", "Seasoning");
  }
  if (
    startsAny(n, [
      "kecap",
      "sambal",
      "saos",
      "saus ",
      "abc kecap",
      "abc sambal",
      "bango",
      "indofood",
      "delmonte",
      "cuka ",
      "abc minyak wijen",
      "saori",
      "maestro mayonaise",
      "mayo",
    ])
  ) {
    return result("Bahan Makanan", "Kecap, Saus & Sambal", "HIGH", "Sauce");
  }
  if (n.startsWith("abc ") && includesAny(n, ["kecap", "sambal", "saus", "saos", "terasi"])) {
    return result("Bahan Makanan", n.includes("terasi") ? "Bumbu & Penyedap" : "Kecap, Saus & Sambal", "HIGH", "ABC cooking condiment");
  }
  if (
    includesAny(n, ["minyak goreng", "minyakita"]) ||
    startsAny(n, [
      "bimoli",
      "filma",
      "tropical",
      "sunco",
      "minyak fitri",
      "minyak amr",
      "wings biru",
      "cemerlang",
      "simas",
      "kunci mas",
      "gelon minyak",
      "goro minyak",
      "minyakita",
    ]) ||
    (n.startsWith("sania") && !n.includes("beras")) ||
    (n.startsWith("minyak ") &&
      !includesAny(n, ["kayu putih", "telon", "angin", "wangi", "rambut", "herbal", "ovit", "kemiri", "mesin"]))
  ) {
    return result("Bahan Makanan", "Minyak Goreng", "HIGH", "Cooking oil");
  }
  if (startsAny(n, ["tepung", "terigu", "maizenaku", "maizena", "rose brand", "kanji", "tapioka", "beras ", "gunung agung tepung"])) {
    return result(
      "Bahan Makanan",
      n.includes("beras") && !n.includes("tepung") ? "Beras" : "Tepung & Pati",
      "HIGH",
      "Flour/starch/rice staple"
    );
  }
  if (startsAny(n, ["gula ", "garam", "sun santan", "santan", "kara ", "gulaku", "gulavit", "palm sugar"])) {
    return result("Bahan Makanan", "Gula, Garam & Santan", "HIGH", "Sugar/salt/coconut milk");
  }
  if (
    startsAny(n, [
      "blue band",
      "mentega",
      "wijsman",
      "prochiz",
      "keju ",
      "top chiz",
      "forvita",
      "mother s choice",
      "mother choice",
      "meg keju",
      "butter gold",
    ])
  ) {
    return result("Bahan Makanan", "Mentega & Keju", "HIGH", "Butter/cheese ingredient");
  }
  if (
    startsAny(n, [
      "ragi",
      "nutrijell",
      "agar",
      "double swallow",
      "van houten",
      "meses",
      "bella ",
      "soda kue",
      "baking",
      "biji selasih",
      "bendico",
      "vanili",
      "frambozen",
      "rum essence",
      "ryoto",
      "mauri pan",
      "win molen",
      "tulip chocolate",
      "tulip dark",
      "nuri butir",
      "richoco pasta",
      "selai ",
      "hercules custard",
      "kembang tahu",
    ])
  ) {
    return result("Bahan Makanan", "Bahan Kue", "HIGH", "Baking ingredient");
  }
  if (startsAny(n, ["tusuk sate", "ma ling", "mili jagung", "straw mushrooms", "tts mushrooms", "ikan blek", "telur ayam"])) {
    return result(
      "Bahan Makanan",
      n.startsWith("tusuk") ? "Alat Masak Habis Pakai" : "Bahan Masak Siap Pakai",
      "HIGH",
      "Cooking ingredient/skewer"
    );
  }
  if (n.startsWith("wings ") && n.includes("mie")) {
    return result("Bahan Makanan", "Mie & Makanan Instan", "HIGH", "Wings noodle family");
  }
  if (n.startsWith("wings ")) {
    return result("Bahan Makanan", "Minyak Goreng", "MEDIUM", "Wings food family; confirm oil vs other grocery");
  }

  if (n.startsWith("sandal")) {
    return alat("Perlengkapan Rumah", "Sandal", "HIGH", "Footwear");
  }
  if (n.startsWith("payung") || n.startsWith("jas hujan")) {
    return alat("Perlengkapan Rumah", n.startsWith("jas") ? "Jas Hujan" : "Payung", "HIGH", "Rain gear");
  }
  if (n.startsWith("senar")) {
    return alat("Perlengkapan Rumah", "Senar & Pancing", "HIGH", "Fishing line");
  }
  if (n.startsWith("benang")) {
    return alat("Perlengkapan Rumah", "Jahit & Benang", "HIGH", "Thread");
  }
  if (
    startsAny(n, [
      "terpal",
      "tali ",
      "paku ",
      "kawat",
      "itami fitting",
      "sumbu kompor",
      "singer minyak",
      "sarung tangan",
      "goro tangan",
    ])
  ) {
    return alat("Perlengkapan Rumah", "Tali, Terpal & Hardware", "HIGH", "Hardware");
  }
  if (n.startsWith("gunting kuku")) {
    return result(
      "Perawatan Diri",
      "Cukur",
      "MEDIUM",
      "Nail clippers are personal grooming; nearby overlap with household tools"
    );
  }
  if (n.startsWith("gunting")) {
    return alat("Perlengkapan Rumah", "Alat Rumah", "MEDIUM", "Scissors: household/tailor/nail overlap");
  }
  if (startsAny(n, ["ember", "hanger", "jepitan baju"])) {
    return alat("Perlengkapan Rumah", "Alat Rumah", "HIGH", "Household utility");
  }
  if (
    startsAny(n, ["baterai", "energizer", "philips", "platinum lampu", "lampu ", "senter", "taj macis"]) ||
    n.includes("lampu my led")
  ) {
    return alat("Perlengkapan Rumah", "Lampu & Baterai", "HIGH", "Battery/bulb");
  }
  if (n.startsWith("kiwi ")) {
    return alat("Perlengkapan Rumah", "Perawatan Sepatu", "HIGH", "Shoe polish");
  }
  if (startsAny(n, ["macis", "korek"]) || n.includes("tokai")) {
    return alat("Perlengkapan Rumah", "Korek & Gas", "HIGH", "Lighter");
  }
  if (n.includes("tusuk gigi")) {
    return alat("Perlengkapan Rumah", "Alat Makan", "MEDIUM", "Toothpicks: household vs food-service overlap");
  }

  if (
    startsAny(n, [
      "balon",
      "lilin gliter",
      "lilin angka",
      "lilin bintang",
      "kelereng",
      "kartu remi",
      "shuttlecock",
      "eyeglass",
      "smiling eyeglass",
      "peluru ",
      "domino ",
      "bola ",
    ]) ||
    (n.startsWith("lilin") && includesAny(n, ["angka", "ulang", "pesta", "gliter", "ultah"]))
  ) {
    const subfamily = n.startsWith("balon")
      ? "Balon"
      : n.startsWith("lilin")
        ? "Lilin Pesta"
        : includesAny(n, ["bola", "kelereng", "shuttle", "peluru", "eyeglass", "domino"])
          ? "Mainan"
          : "Kado & Pita";
    return alat("Mainan & Pesta", subfamily, "HIGH", "Party/toy goods");
  }
  if (n.startsWith("lilin ")) {
    return alat("Perlengkapan Rumah", "Lilin Rumah", "MEDIUM", "Household candle vs party candle overlap");
  }

  if (n.startsWith("obat ")) {
    return result("Kesehatan", "Obat", "MEDIUM", "Obat-prefixed name without a specific medicine brand");
  }

  if (n.startsWith("gomala") || n === "rackus" || n === "speed" || n.startsWith("kucing batang merah") || n === "kertas kaf") {
    return result(
      "Lainnya",
      "Belum Teridentifikasi",
      "LOW",
      "Identity not safe from POS name alone; do not guess into an approved category",
      { notes: "owner/web research required" }
    );
  }

  return result(
    "Lainnya",
    "Belum Teridentifikasi",
    "LOW",
    "No strong brand/type rule from POS name"
  );
}

function familyKey(name) {
  const n = normalizeName(name);
  const multi = [
    "head shoulders",
    "silver queen",
    "so klin lantai",
    "so klin",
    "cap lang",
    "minyak telon",
    "my baby",
    "pop ice",
    "pop mie",
    "pop korn",
    "good day",
    "good time",
    "top kopi",
    "top chiz",
    "top wafer",
    "sun santan",
    "sun baby",
    "chocolatos drink",
    "gery chocolatos drink",
    "hemaviton energy",
    "hemaviton jreng",
    "abc sirup",
    "abc kecap",
    "abc sambal",
    "abc susu",
  ];
  for (const key of multi) {
    if (n.includes(key) || n.startsWith(key)) {
      return key;
    }
  }
  return n.split(" ")[0] || n;
}

function applyFamilyConsistency(records) {
  const groups = new Map();
  for (const record of records) {
    const key = familyKey(record.posName);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }

  for (const [key, group] of groups) {
    if (SPLIT_FAMILY_KEYS.has(key) || group.length < 3) {
      continue;
    }
    const classified = group.filter((item) => item.proposedCategory !== "Lainnya");
    if (classified.length < 2) {
      continue;
    }
    const signature = `${classified[0].proposedCategory}::${classified[0].proposedSubcategory}`;
    const unanimous = classified.every(
      (item) => `${item.proposedCategory}::${item.proposedSubcategory}` === signature
    );
    if (!unanimous) {
      continue;
    }
    for (const item of group) {
      if (item.proposedCategory !== "Lainnya") {
        continue;
      }
      item.proposedCategory = classified[0].proposedCategory;
      item.proposedSubcategory = classified[0].proposedSubcategory;
      item.proposedSubfamily = classified[0].proposedSubfamily;
      item.confidence = "MEDIUM";
      item.reviewNeeded = true;
      item.classificationReason = `Family consistency with ${classified.length} sibling(s) in ${classified[0].proposedCategory}`;
      item.notes = [item.notes, `familyKey=${key}`].filter(Boolean).join("; ");
    }
  }
}

function inspectLainnya(records) {
  const extra = [
    [/garda amplop|amplop garda/i, "Alat & Perlengkapan", "ATK & Sekolah", "Kertas & Amplop", "HIGH", "Envelope brand previously missed"],
    [/chocolatos/i, "Makanan Ringan", "Biskuit & Wafer", "", "HIGH", "Chocolatos wafer/snack"],
    [/head & shoulders|head and shoulders/i, "Perawatan Diri", "Perawatan Rambut", "", "HIGH", "Shampoo brand"],
  ];
  for (const record of records) {
    if (record.proposedCategory !== "Lainnya") {
      continue;
    }
    const n = normalizeName(record.posName);
    for (const [pattern, category, subcategory, subfamily, confidence, reason] of extra) {
      if (pattern.test(record.posName) || pattern.test(n)) {
        record.proposedCategory = category;
        record.proposedSubcategory = subcategory;
        record.proposedSubfamily = subfamily;
        record.confidence = confidence;
        record.reviewNeeded = confidence !== "HIGH";
        record.classificationReason = reason;
        if (category === "Alat & Perlengkapan" && subfamily) {
          record.notes = `subfamily: ${subfamily}`;
        }
        break;
      }
    }
  }
}

function sortReview(a, b) {
  if (Number(b.reviewNeeded) - Number(a.reviewNeeded) !== 0) {
    return Number(b.reviewNeeded) - Number(a.reviewNeeded);
  }
  if (CONFIDENCE_RANK[a.confidence] !== CONFIDENCE_RANK[b.confidence]) {
    return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  }
  const cat = a.proposedCategory.localeCompare(b.proposedCategory, "id");
  if (cat !== 0) {
    return cat;
  }
  return a.posName.localeCompare(b.posName, "id");
}

function classifyProducts(products) {
  const records = products.map((product) => {
    const classified = classifyName(product.posName);
    return {
      posCode: product.posCode,
      posName: product.posName,
      proposedCategory: classified.proposedCategory,
      proposedSubcategory: classified.proposedSubcategory,
      proposedSubfamily: classified.proposedSubfamily || "",
      confidence: classified.confidence,
      reviewNeeded: classified.reviewNeeded,
      classificationReason: classified.classificationReason,
      currentProductId: null,
      currentCategory: null,
      notes: classified.notes || "",
      sourceRows: product.sourceRows,
      sellingUnits: product.sellingUnits,
      qtyPerPaket: product.qtyPerPaket,
      baseUnits: product.baseUnits,
      matchStatus: "NEW",
    };
  });
  inspectLainnya(records);
  applyFamilyConsistency(records);
  return records;
}

function attachCurrentCatalogue(records, importPreview) {
  const byCode = new Map(records.map((record) => [record.posCode, record]));
  for (const row of importPreview.matchedExisting) {
    const record = byCode.get(String(row.workbookPosCode || row.posCodes?.[0] || ""));
    if (!record) {
      continue;
    }
    record.currentProductId = row.productId;
    record.currentCategory = row.category;
    record.matchStatus = "EXACT_POS_MATCH";
    const extra = "exact POS match; do not change live category/IDs/images";
    record.notes = record.notes ? `${record.notes}; ${extra}` : extra;
  }
  for (const row of importPreview.likelyNameMatches) {
    const record = byCode.get(String(row.posCode));
    if (!record) {
      continue;
    }
    record.currentProductId = row.currentProductId || row.productId;
    record.currentCategory = row.category;
    record.matchStatus = "LIKELY_NAME_MATCH";
    const extra = "likely POS recode; live product must stay unchanged until owner confirms";
    record.notes = record.notes ? `${record.notes}; ${extra}` : extra;
  }
}

function disagreements(records) {
  return records
    .filter((record) => record.currentProductId && record.currentCategory !== record.proposedCategory)
    .map((record) => ({
      posCode: record.posCode,
      posName: record.posName,
      currentProductId: record.currentProductId,
      currentCategory: record.currentCategory,
      proposedCategory: record.proposedCategory,
      proposedSubcategory: record.proposedSubcategory,
      confidence: record.confidence,
      matchStatus: record.matchStatus,
      notes: record.notes,
    }))
    .sort((a, b) => a.posName.localeCompare(b.posName, "id"));
}

function countBy(records, keyFn) {
  const counts = new Map();
  for (const record of records) {
    const key = keyFn(record);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, pct: Number(((100 * count) / records.length).toFixed(2)) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "id"));
}

function pct(count, total) {
  return Number(((100 * count) / total).toFixed(2));
}

function stableClassification(records) {
  return records
    .map((record) => ({
      posCode: record.posCode,
      posName: record.posName,
      proposedCategory: record.proposedCategory,
      proposedSubcategory: record.proposedSubcategory,
      proposedSubfamily: record.proposedSubfamily,
      confidence: record.confidence,
      reviewNeeded: record.reviewNeeded,
      classificationReason: record.classificationReason,
      currentProductId: record.currentProductId,
      currentCategory: record.currentCategory,
      notes: record.notes,
      sourceRows: record.sourceRows,
      sellingUnits: record.sellingUnits,
      qtyPerPaket: record.qtyPerPaket,
      baseUnits: record.baseUnits,
      matchStatus: record.matchStatus,
    }))
    .sort((a, b) => a.posCode.localeCompare(b.posCode, "en") || a.posName.localeCompare(b.posName, "id"));
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function renderMarkdown(report) {
  const lines = [];
  const add = (text = "") => lines.push(text);
  add("# Stage 5B.1C — Category Classification Preview");
  add();
  add("Preview / classification only. Live `src/catalog/*.json` was not modified.");
  add("Subcategories are analytical metadata for later stages. They are not in the live schema.");
  add();
  add(`Workbook: \`${report.workbookPath}\``);
  add(`HEAD: \`${report.head}\``);
  add(`Unique POS products: **${report.total}**`);
  add();
  add("## Approved 9-category taxonomy");
  add();
  for (const [index, name] of APPROVED_CATEGORIES.entries()) {
    add(`${index + 1}. ${name}`);
  }
  add();
  add("Lainnya is a temporary residual/review class only. It is not a homepage category.");
  add();
  add("## Counts per top-level category");
  add();
  add("| Category | Count | % |");
  add("|---|---:|---:|");
  for (const row of report.categoryCounts) {
    add(`| ${row.key} | ${row.count} | ${row.pct}% |`);
  }
  add();
  add("## Confidence");
  add();
  add(`- HIGH: **${report.confidence.HIGH}**`);
  add(`- MEDIUM: **${report.confidence.MEDIUM}**`);
  add(`- LOW: **${report.confidence.LOW}**`);
  add(`- reviewNeeded: **${report.reviewNeeded}**`);
  add(`- Lainnya: **${report.lainnyaCount}** (${report.lainnyaPct}%)`);
  add(`- OWNER_REVIEW.csv rows: **${report.ownerReviewCount}**`);
  add();
  add("## Alat & Perlengkapan");
  add();
  add(`Total: **${report.alat.total}**`);
  add();
  add("| Family (proposedSubcategory) | Count |");
  add("|---|---:|");
  for (const row of report.alat.families) {
    add(`| ${row.key} | ${row.count} |`);
  }
  add();
  if (report.alat.subfamilies.length > 0) {
    add("Finer subfamilies (notes / proposedSubfamily):");
    add();
    add("| Family | Subfamily | Count |");
    add("|---|---|---:|");
    for (const row of report.alat.subfamilies) {
      add(`| ${row.family} | ${row.subfamily} | ${row.count} |`);
    }
    add();
  }
  add("These four former top-level categories are merged here and must not be recreated as homepage categories.");
  add();
  add("## Taxonomy changes vs Stage 5B.1B");
  add();
  add("- Rejected label **Kebutuhan Dapur** → **Bahan Makanan**.");
  add("- Merged **Plastik & Kemasan**, **Perlengkapan Rumah**, **ATK & Sekolah**, **Mainan & Pesta** into **Alat & Perlengkapan**.");
  add("- Previous 12-category sanity check mapped roughly 398 dapur → Bahan Makanan and 161+147+92+49 = 449 into Alat & Perlengkapan. This pass does not force those counts.");
  add("- Prefix fallbacks for Good / Pop / Top / Sun / My were removed.");
  add("- Rokok is 96 vs the previous in-memory 105 because deodorant (Rexona) and candy cigarettes (Permen Rokok) are no longer classified as cigarettes. `rexo` no longer matches `rexona`.");
  add();
  add("## Known heuristic errors corrected");
  add();
  for (const item of report.heuristicCorrections) {
    add(`- **${item.posName}** (\`${item.posCode}\`) → ${item.proposedCategory} / ${item.proposedSubcategory}. ${item.classificationReason}`);
  }
  add();
  add("## Current-category disagreements");
  add();
  if (report.disagreements.length === 0) {
    add("None on workbook products joined to the live catalogue (exact POS matches and likely recodes).");
  } else {
    add("| posCode | posName | current | proposed |");
    add("|---|---|---|---|");
    for (const row of report.disagreements) {
      add(`| ${row.posCode} | ${row.posName} | ${row.currentCategory} | ${row.proposedCategory} |`);
    }
  }
  add();
  add("Live grocery SKUs that remain in the current 91-product catalogue but are absent from this workbook are listed in Stage 5B.1 `current-not-in-source.json`. They were not reclassified here.");
  add();
  add("Conceptual rename if those grocery SKUs later remain visible:");
  add();
  add("- `Bahan & Bumbu Masak` → `Bahan Makanan` (Masako, Indomie)");
  add("- `Minuman` stays `Minuman` (Aqua, Energen, Teh Botol Sosro)");
  add("- `Rokok` stays `Rokok`");
  add();
  add("## Major subcategories");
  add();
  add("| Category / Subcategory | Count |");
  add("|---|---:|");
  for (const row of report.subcategoryCounts.slice(0, 40)) {
    add(`| ${row.key} | ${row.count} |`);
  }
  add();
  add("## Most important owner-review items");
  add();
  for (const item of report.ownerHighlights) {
    add(`- **${item.posName}** (\`${item.posCode}\`) — ${item.proposedCategory} / ${item.confidence}. ${item.classificationReason}`);
  }
  add();
  add("## Determinism");
  add();
  add(`- In-memory double classify hash: \`${report.hashes.classification}\``);
  add(`- Second generator run matched: **${report.hashes.secondRunIdentical ? "yes" : "NO"}**`);
  add();
  add("## Live-catalogue safety");
  add();
  add("| File | Before | After | Same |");
  add("|---|---|---|---|");
  for (const fileName of CATALOG_FILES) {
    const same = report.hashes.catalogBefore[fileName] === report.hashes.catalogAfter[fileName];
    add(`| ${fileName} | \`${report.hashes.catalogBefore[fileName]}\` | \`${report.hashes.catalogAfter[fileName]}\` | ${same ? "yes" : "CHANGED"} |`);
  }
  add();
  add(`- categories.js: \`${report.hashes.categoriesJsBefore}\` → \`${report.hashes.categoriesJsAfter}\` (${report.hashes.categoriesJsBefore === report.hashes.categoriesJsAfter ? "unchanged" : "CHANGED"})`);
  add(`- product-images tree: ${report.hashes.imagesUnchanged ? "unchanged" : "CHANGED"}`);
  add(`- recommendations.json included in catalogue hashes above.`);
  add();
  add("## Stage 5B.2 input");
  add();
  add(report.stage5b2Ready
    ? "These persisted artifacts are sufficient input for Stage 5B.2 importer design: unique POS products, approved 9 labels, HIGH/MEDIUM/LOW, Lainnya residual, and current-product joins."
    : "These artifacts should not proceed to Stage 5B.2 until the blocking issues below are resolved.");
  add();
  add("Stage 5B.2 should assign **top-level category only**. Do not write proposedSubcategory into `src/catalog`. Do not overwrite exact POS-match live categories.");
  add();
  if (report.blockers.length > 0) {
    add("### Issues that should stop Stage 5B.2");
    add();
    for (const blocker of report.blockers) {
      add(`- ${blocker}`);
    }
    add();
  }
  add("Do not import products from this stage. Do not implement the new category UI yet.");
  add();
  return `${lines.join("\n")}\n`;
}

function loadImportPreview() {
  const matchedExisting = readJson(join(IMPORT_PREVIEW_DIR, "matched-existing.json"));
  const ambiguous = readJson(join(IMPORT_PREVIEW_DIR, "ambiguous-matches.json"));
  const reconciliation = readJson(join(IMPORT_PREVIEW_DIR, "reconciliation.json"));
  const sourceSummary = readJson(join(IMPORT_PREVIEW_DIR, "source-summary.json"));
  return {
    matchedExisting,
    likelyNameMatches: ambiguous.likelyNameMatches || [],
    reconciliation,
    sourceSummary,
  };
}

function buildOwnerHighlights(records) {
  const wanted = [
    "good time",
    "pop korn",
    "top black in white",
    "gomala",
    "rackus",
    "speed",
    "kucing batang merah",
    "kertas kaf",
    "menara mld",
    "my vla",
    "silver queen",
    "head shoulders",
    "cerelac",
    "cap enak",
    "sagu mutiara",
  ];
  const highlights = [];
  const seen = new Set();
  for (const needle of wanted) {
    for (const record of records) {
      if (normalizeName(record.posName).includes(needle) && !seen.has(record.posCode)) {
        seen.add(record.posCode);
        highlights.push(record);
      }
    }
  }
  for (const record of records) {
    if (highlights.length >= 18) {
      break;
    }
    if (record.proposedCategory === "Lainnya" && !seen.has(record.posCode)) {
      seen.add(record.posCode);
      highlights.push(record);
    }
  }
  return highlights.slice(0, 18);
}

function writeArtifacts(records, reportExtras) {
  mkdirSync(PREVIEW_DIR, { recursive: true });
  const sorted = [...records].sort(sortReview);
  const low = sorted.filter((row) => row.confidence === "LOW");
  const medium = sorted.filter((row) => row.confidence === "MEDIUM");
  const lainnya = sorted.filter((row) => row.proposedCategory === "Lainnya");
  const owner = sorted.filter(
    (row) =>
      row.confidence === "MEDIUM" ||
      row.confidence === "LOW" ||
      row.proposedCategory === "Lainnya" ||
      row.reviewNeeded
  );

  const categoryCounts = [
    ...APPROVED_CATEGORIES.map((name) => {
      const count = records.filter((row) => row.proposedCategory === name).length;
      return { key: name, count, pct: pct(count, records.length) };
    }),
    (() => {
      const count = lainnya.length;
      return { key: "Lainnya", count, pct: pct(count, records.length) };
    })(),
  ];

  const subcategoryCounts = countBy(
    records,
    (row) => `${row.proposedCategory} / ${row.proposedSubcategory}`
  );

  const alatRecords = records.filter((row) => row.proposedCategory === "Alat & Perlengkapan");
  const alatFamilies = ALAT_FAMILIES.map((name) => ({
    key: name,
    count: alatRecords.filter((row) => row.proposedSubcategory === name).length,
  }));
  const otherAlat = countBy(
    alatRecords.filter((row) => !ALAT_FAMILIES.includes(row.proposedSubcategory)),
    (row) => row.proposedSubcategory
  );
  const alatSubfamilies = countBy(
    alatRecords.filter((row) => row.proposedSubfamily),
    (row) => `${row.proposedSubcategory}||${row.proposedSubfamily}`
  ).map((row) => {
    const [family, subfamily] = row.key.split("||");
    return { family, subfamily, count: row.count };
  });

  const taxonomy = {
    stage: "5B.1C",
    approvedTopLevelCategories: [...APPROVED_CATEGORIES],
    residualReviewCategory: "Lainnya",
    lainnyaIsHomepageCategory: false,
    subcategoryPolicy: "analytical/preview metadata only; do not write into src/catalog or UI",
    rokokCustomerFacingSubcategories: false,
    alatMergedFamilies: [...ALAT_FAMILIES],
    rejectedLabels: ["Kebutuhan Dapur", "Plastik & Kemasan", "Perlengkapan Rumah", "ATK & Sekolah", "Mainan & Pesta"],
    mappingFromStage5B1B: {
      "Kebutuhan Dapur": "Bahan Makanan",
      "Plastik & Kemasan": "Alat & Perlengkapan / Plastik & Kemasan",
      "Perlengkapan Rumah": "Alat & Perlengkapan / Perlengkapan Rumah",
      "ATK & Sekolah": "Alat & Perlengkapan / ATK & Sekolah",
      "Mainan & Pesta": "Alat & Perlengkapan / Mainan & Pesta",
    },
    definitions: {
      "Makanan Ringan": "Ready-to-eat snack foods. Instant noodles are not included.",
      "Bahan Makanan": "Meal/cooking/staple/seasoning products. Replaces rejected label Kebutuhan Dapur. Beverage powders are not included merely because they are prepared in a kitchen.",
      Minuman: "Products primarily intended to be drunk, including alcohol and powder mixes. Disposable cups are not Minuman.",
      "Perawatan Diri": "Personal grooming and hygiene. Baby toiletries and laundry soap are excluded.",
      "Kebutuhan Rumah": "Household cleaning/maintenance consumables.",
      "Alat & Perlengkapan": "Durable/general merchandise, packaging, stationery, toys/party, household equipment.",
      Kesehatan: "Medicines, vitamins, first aid, medicated oils/balms. Mosquito coils and ordinary energy drinks excluded.",
      Rokok: "All cigarettes. No customer-facing subcategories.",
      "Bayi & Anak": "Clearly baby-specific products. Do not classify from an unrelated Baby token in a brand name.",
    },
  };

  const categorySummary = {
    totalUniqueProducts: records.length,
    categories: categoryCounts,
    confidence: reportExtras.confidence,
    reviewNeeded: reportExtras.reviewNeeded,
    lainnya: { count: lainnya.length, pct: pct(lainnya.length, records.length) },
    alatPerlengkapan: {
      total: alatRecords.length,
      families: [...alatFamilies, ...otherAlat.map((row) => ({ key: row.key, count: row.count }))],
    },
  };

  const webResearch = lainnya.map((row) => ({
    posCode: row.posCode,
    posName: row.posName,
    reason: row.classificationReason,
    suggestedQuestion: `What product is "${row.posName}" in an Indonesian village wholesale context?`,
  }));

  const namedUncertain = records.filter((row) =>
    /^(gomala|rackus|speed|kucing batang merah|kertas kaf|menara mld)/.test(normalizeName(row.posName))
  );
  for (const row of namedUncertain) {
    if (!webResearch.some((item) => item.posCode === row.posCode)) {
      webResearch.unshift({
        posCode: row.posCode,
        posName: row.posName,
        reason: row.classificationReason,
        suggestedQuestion: `Confirm identity of "${row.posName}" before leaving residual/Lainnya or accepting MEDIUM.`,
      });
    }
  }

  writeJson(join(PREVIEW_DIR, "taxonomy-proposal.json"), taxonomy);
  writeJson(join(PREVIEW_DIR, "category-summary.json"), categorySummary);
  writeJson(join(PREVIEW_DIR, "subcategory-summary.json"), {
    subcategories: subcategoryCounts,
    alatSubfamilies,
  });
  writeJson(join(PREVIEW_DIR, "product-classification.json"), sorted);
  writeJson(join(PREVIEW_DIR, "low-confidence-products.json"), low);
  writeJson(join(PREVIEW_DIR, "medium-confidence-products.json"), medium);
  writeJson(join(PREVIEW_DIR, "current-category-disagreements.json"), reportExtras.disagreements);
  writeJson(join(PREVIEW_DIR, "lainnya-review.json"), {
    count: lainnya.length,
    pct: pct(lainnya.length, records.length),
    products: lainnya,
  });
  writeJson(join(PREVIEW_DIR, "web-research-queue.json"), webResearch);

  writeFileSync(
    join(PREVIEW_DIR, "category-review.csv"),
    toCsv(sorted, [
      "posCode",
      "posName",
      "proposedCategory",
      "proposedSubcategory",
      "confidence",
      "reviewNeeded",
      "classificationReason",
      "currentProductId",
      "currentCategory",
      "notes",
    ]),
    "utf8"
  );

  writeFileSync(
    join(PREVIEW_DIR, "OWNER_REVIEW.csv"),
    toCsv(
      owner.map((row) => ({
        posCode: row.posCode,
        posName: row.posName,
        proposedCategory: row.proposedCategory,
        proposedSubcategory: row.proposedSubcategory,
        confidence: row.confidence,
        reason: row.classificationReason,
        ownerCategory: "",
        ownerNotes: "",
      })),
      [
        "posCode",
        "posName",
        "proposedCategory",
        "proposedSubcategory",
        "confidence",
        "reason",
        "ownerCategory",
        "ownerNotes",
      ]
    ),
    "utf8"
  );

  return {
    categoryCounts,
    subcategoryCounts,
    alat: {
      total: alatRecords.length,
      families: [...alatFamilies, ...otherAlat.map((row) => ({ key: row.key, count: row.count }))],
      subfamilies: alatSubfamilies,
    },
    ownerReviewCount: owner.length,
    lainnyaCount: lainnya.length,
    lainnyaPct: pct(lainnya.length, records.length),
  };
}

function heuristicCorrectionRows(records) {
  const needles = [
    "Good Time Double Choc",
    "Pop Korn",
    "Top Black in White",
    "Silver Queen",
    "Head & Shoulders",
    "Nestle Bear Brand",
    "Cerelac",
    "Carnation",
    "Gatsby",
    "Pixy",
    "Fox Berries",
    "Fox Fruits",
    "Fox Passion",
    "Kino Durian",
    "Kino Mangga",
    "Cap Enak",
    "Sagu Mutiara",
    "Asam Jawa",
    "Kayu Manis",
    "My Vla",
    "Chocolatos",
    "Hemaviton Energy",
    "Hemaviton Jreng",
    "Cap Lang Minyak Telon",
    "MKP Cap Lang",
    "Rexona",
    "Permen Rokok",
  ];
  const rows = [];
  const seen = new Set();
  for (const needle of needles) {
    for (const record of records) {
      if (record.posName.includes(needle) && !seen.has(record.posCode)) {
        seen.add(record.posCode);
        rows.push(record);
      }
    }
  }
  return rows;
}

function main() {
  if (!existsSync(WORKBOOK_PATH)) {
    throw new Error(`Missing workbook: ${WORKBOOK_PATH}`);
  }
  if (!existsSync(IMPORT_PREVIEW_DIR)) {
    throw new Error("Missing Stage 5B.1 artifacts under tmp/catalog-import-preview/");
  }

  const catalogBefore = hashCatalogFiles();
  const categoriesJsBefore = hashFile(CATEGORIES_JS);
  const imagesBefore = hashTree(IMAGE_DIR);

  mkdirSync(PREVIEW_DIR, { recursive: true });
  const workbook = loadWorkbook(WORKBOOK_PATH, XLSX_EXTRACT_DIR);
  const products = groupWorkbookProducts(workbook.dataRows);
  if (products.length !== 2249) {
    console.warn(`Expected 2249 unique POS products, found ${products.length}`);
  }

  const first = classifyProducts(products);
  const second = classifyProducts(products);
  const firstHash = hashJson(stableClassification(first));
  const secondHash = hashJson(stableClassification(second));
  if (firstHash !== secondHash) {
    throw new Error("In-memory classification is not deterministic.");
  }

  const importPreview = loadImportPreview();
  attachCurrentCatalogue(first, importPreview);
  const disagreementRows = disagreements(first);

  const confidence = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let reviewNeeded = 0;
  for (const row of first) {
    confidence[row.confidence] += 1;
    if (row.reviewNeeded) {
      reviewNeeded += 1;
    }
  }

  const written = writeArtifacts(first, {
    confidence,
    reviewNeeded,
    disagreements: disagreementRows,
  });

  const classificationPath = join(PREVIEW_DIR, "product-classification.json");
  const hashAfterWrite = hashFile(classificationPath);

  const rerun = classifyProducts(products);
  attachCurrentCatalogue(rerun, importPreview);
  writeArtifacts(rerun, {
    confidence,
    reviewNeeded,
    disagreements: disagreements(rerun),
  });
  const hashAfterRerun = hashFile(classificationPath);
  const secondRunIdentical = hashAfterWrite === hashAfterRerun;

  const catalogAfter = hashCatalogFiles();
  const categoriesJsAfter = hashFile(CATEGORIES_JS);
  const imagesAfter = hashTree(IMAGE_DIR);
  const catalogUnchanged = CATALOG_FILES.every(
    (fileName) => catalogBefore[fileName] === catalogAfter[fileName]
  );
  const imagesUnchanged =
    JSON.stringify(imagesBefore) === JSON.stringify(imagesAfter);

  const lainnyaCount = first.filter((row) => row.proposedCategory === "Lainnya").length;
  const blockers = [];
  if (!catalogUnchanged) {
    blockers.push("Live src/catalog hashes changed.");
  }
  if (categoriesJsBefore !== categoriesJsAfter) {
    blockers.push("src/config/categories.js changed.");
  }
  if (!imagesUnchanged) {
    blockers.push("Product images changed.");
  }
  if (!secondRunIdentical) {
    blockers.push("Classification generator was not deterministic across two runs.");
  }
  if (first.length !== 2249) {
    blockers.push(`Unique POS count is ${first.length}, expected 2249.`);
  }

  const report = {
    workbookPath: "imports/Matahari_Product_List_FINAL.xlsx",
    head: "2f67c20 Add Stage 5A customer UI polish",
    total: first.length,
    categoryCounts: written.categoryCounts,
    subcategoryCounts: written.subcategoryCounts,
    confidence,
    reviewNeeded,
    lainnyaCount,
    lainnyaPct: pct(lainnyaCount, first.length),
    ownerReviewCount: written.ownerReviewCount,
    alat: written.alat,
    disagreements: disagreementRows,
    heuristicCorrections: heuristicCorrectionRows(first),
    ownerHighlights: buildOwnerHighlights(first),
    hashes: {
      classification: firstHash,
      secondRunIdentical,
      catalogBefore,
      catalogAfter,
      categoriesJsBefore,
      categoriesJsAfter,
      imagesUnchanged,
    },
    blockers,
    stage5b2Ready: blockers.length === 0,
  };

  writeFileSync(join(PREVIEW_DIR, "CATEGORY_REVIEW.md"), renderMarkdown(report), "utf8");

  console.log("Stage 5B.1C category classification preview");
  console.log(`Unique POS     : ${first.length}`);
  console.log(`HIGH/MED/LOW   : ${confidence.HIGH}/${confidence.MEDIUM}/${confidence.LOW}`);
  console.log(`reviewNeeded   : ${reviewNeeded}`);
  console.log(`Lainnya        : ${lainnyaCount} (${pct(lainnyaCount, first.length)}%)`);
  console.log(`Alat & Perl.   : ${written.alat.total}`);
  console.log(`OWNER_REVIEW   : ${written.ownerReviewCount}`);
  console.log(`Determinism    : ${secondRunIdentical ? "OK" : "FAIL"} ${firstHash}`);
  console.log(`Live catalog   : ${catalogUnchanged ? "UNCHANGED" : "CHANGED"}`);
  console.log(`categories.js  : ${categoriesJsBefore === categoriesJsAfter ? "UNCHANGED" : "CHANGED"}`);
  console.log(`images         : ${imagesUnchanged ? "UNCHANGED" : "CHANGED"}`);
  console.log(`Preview dir    : tmp/catalog-category-preview/`);

  if (!catalogUnchanged || !secondRunIdentical) {
    process.exitCode = 1;
  }
}

main();
