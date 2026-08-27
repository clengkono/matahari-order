/**
 * Presentation-only subcategory assignment.
 *
 * Uses the product's existing top-level category (never reassigns it)
 * and name tokens from Stage 5B.1C previewCatalogCategories.js.
 *
 * Uncertain products return null and remain reachable via Semua / Lainnya.
 */

import {
  LAINNYA_SUBCATEGORY_ID,
  LAINNYA_TILE,
  SEMUA_TILE,
  SUBCATEGORY_CONFIG,
} from "../config/subcategories.js";
import { normalizeSearchText } from "./productSearch.js";

function includesAny(n, parts) {
  return parts.some((part) => n.includes(part));
}

function startsAny(n, parts) {
  return parts.some((part) => n.startsWith(part));
}

function snackSub(n) {
  if (n.startsWith("roti") || includesAny(n, ["kue basah", "bolu"])) {
    return "roti-kue";
  }
  if (n.includes("sosis")) {
    return "sosis-siap-makan";
  }
  if (
    includesAny(n, [
      "kuaci",
      "kwaci",
      "kacang",
      "garuda ",
      "yami",
      "kacang ",
    ])
  ) {
    return "kacang-kuaci";
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
      "coklat",
      "cokelat",
      "chocolatos",
      "choco",
      "beng beng",
      "fox passion",
      "fox berries",
      "fox fruits",
      "okky jelly candy",
      "ting ting",
      "chacha",
      "mentos",
    ])
  ) {
    return "permen-cokelat";
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
      "qtela",
      "piattos",
      "pilus",
      "siip",
      "chitato",
      "lays",
      "cheetos",
      "jaipong",
      "rosta",
      "mlaku",
      "go potato",
      "pop korn",
      "corn stick",
      "corn shots",
      "snack",
    ])
  ) {
    return "keripik-snack";
  }
  if (
    includesAny(n, [
      "wafer",
      "biskuit",
      "biscuit",
      "good time",
      "oreo",
      "roma",
      "gery",
      "nabati",
      "tango",
      "nextar",
      "hatari",
      "biskuat",
      "khong guan",
      "gabin",
      "marie",
      "regal",
      "wafello",
      "better ",
      "top wafer",
      "top triple choc",
      "pocky",
      "hello panda",
    ])
  ) {
    return "biskuit-wafer";
  }
  return null;
}

function bahanSub(n) {
  if (
    includesAny(n, [
      "bihun",
      "soun",
      "kwetiau",
      "spaghetti",
      "makaroni",
      "laksa",
      "sedani",
      "lafonte",
    ])
  ) {
    return "mie-kering-pasta";
  }
  if (
    startsAny(n, [
      "mie ",
      "sarimi",
      "indomie",
      "pop mie",
      "ekomie",
    ]) ||
    includesAny(n, ["wings mie", "sedaap mie"])
  ) {
    return "mie-instan";
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
    ])
  ) {
    return "bumbu-penyedap";
  }
  if (
    startsAny(n, [
      "kecap",
      "sambal",
      "saos",
      "saus ",
      "bango",
      "delmonte",
      "cuka ",
      "saori",
      "mayo",
    ]) ||
    includesAny(n, ["abc kecap", "abc sambal", "indofood sambal"])
  ) {
    return "kecap-saus";
  }
  if (
    includesAny(n, ["minyak goreng", "minyakita"]) ||
    startsAny(n, [
      "bimoli",
      "filma",
      "tropical",
      "sunco",
      "minyak fitri",
      "wings biru",
      "simas",
      "kunci mas",
    ])
  ) {
    return "minyak-goreng";
  }
  if (n.includes("beras") && !n.includes("tepung")) {
    return "beras";
  }
  if (
    startsAny(n, [
      "tepung",
      "terigu",
      "maizenaku",
      "maizena",
      "kanji",
      "tapioka",
    ]) ||
    n.includes("rose brand")
  ) {
    return "tepung-pati";
  }
  if (
    startsAny(n, [
      "gula ",
      "garam",
      "santan",
      "kara ",
      "gulaku",
      "gulavit",
    ])
  ) {
    return "gula-garam-santan";
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
      "meg keju",
    ])
  ) {
    return "mentega-keju";
  }
  if (
    startsAny(n, [
      "ragi",
      "nutrijell",
      "agar",
      "meses",
      "soda kue",
      "baking",
      "vanili",
      "selai ",
    ])
  ) {
    return "bahan-kue";
  }
  if (
    startsAny(n, [
      "ma ling",
      "mili jagung",
      "ikan blek",
      "telur ayam",
      "straw mushrooms",
    ])
  ) {
    return "bahan-siap-pakai";
  }
  return null;
}

function minumanSub(n) {
  if (n.startsWith("top black in white") || (n.startsWith("top ") && n.includes("kopi"))) {
    return "kopi";
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
    ])
  ) {
    return "air-mineral";
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
      "golda",
      "top kopi",
    ]) ||
    includesAny(n, ["abc kopi", "abc white coffee", "abc mocca"])
  ) {
    return "kopi";
  }
  if (
    startsAny(n, ["teh ", "mountea", "nu green tea", "frestea"]) ||
    includesAny(n, ["teh kotak", "teh pucuk", "sosro", "sariwangi"])
  ) {
    return includesAny(n, [
      "sachet",
      "celup",
      "sariwangi",
      "sarimurni",
    ])
      ? "teh-bubuk"
      : "teh-siap";
  }
  if (startsAny(n, ["coca cola", "sprite", "fanta", "pepsi", "tebs"])) {
    return "soda";
  }
  if (
    startsAny(n, [
      "extra joss",
      "kuku bima",
      "krating",
      "pocari",
      "mizone",
      "hydro coco",
      "hemaviton energy",
      "hemaviton jreng",
      "m150",
    ])
  ) {
    return "energi-isotonik";
  }
  if (n.startsWith("abc sirup") || n.startsWith("sirup ") || n.startsWith("marjan")) {
    return "sirup";
  }
  if (startsAny(n, ["bir ", "green sands", "guinness", "smirnoff", "rum"])) {
    return "alkohol";
  }
  if (startsAny(n, ["adem sari", "larutan ", "cap kaki tiga", "kiranti"])) {
    return "herbal";
  }
  if (
    startsAny(n, [
      "pop ice",
      "jasjus",
      "nutrisari",
      "fruitea",
    ])
  ) {
    return "bubuk-minuman";
  }
  if (
    startsAny(n, ["energen", "hilo", "ovaltine", "drink beng", "koko drink"])
  ) {
    return "bubuk-minuman";
  }
  if (
    startsAny(n, [
      "ale ale",
      "okky jelly drink",
      "ichitan",
      "you c1000",
      "fruit tea",
      "floridina",
      "buavita",
      "nipis madu",
    ])
  ) {
    return "jus-buah";
  }
  return null;
}

function perawatanSub(n) {
  if (
    includesAny(n, [
      "head shoulders",
      "sunsilk",
      "pantene",
      "clear ",
      "zinc ",
      "emeron",
      "rejoice",
      "makarizo",
      "shampo",
      "shampoo",
      "conditioner",
      "minyak rambut",
      "cat rambut",
      "hair",
    ])
  ) {
    return "rambut";
  }
  if (
    includesAny(n, [
      "odol",
      "sikat gigi",
      "pasta gigi",
      "pepsodent",
      "ciptadent",
      "close up",
      "sensodyne",
      "formula gigi",
      "listerine",
      "obat kumur",
    ])
  ) {
    return "mulut";
  }
  if (includesAny(n, ["pembalut", "softex", "charm ", "kotex", "pantyliner", "laurier"])) {
    return "wanita";
  }
  if (includesAny(n, ["cukur", "gillette", "pisau cukur", "gunting kuku"])) {
    return "cukur";
  }
  if (
    includesAny(n, [
      "deodoran",
      "deodorant",
      "rexona",
      "parfum",
      "cologne",
      "posh ",
      "casablanca",
    ])
  ) {
    return "deodoran-wangi";
  }
  if (
    includesAny(n, [
      "sabun mandi",
      "lifebuoy",
      "lux ",
      "giv ",
      "nuvo",
      "dettol",
      "zen ",
      "biore",
      "zest",
      "shower",
      "sabun cair",
    ])
  ) {
    return "sabun-mandi";
  }
  if (includesAny(n, ["kapas"])) {
    return "kapas";
  }
  if (
    includesAny(n, [
      "pelembab",
      "lotion",
      "face",
      "wajah",
      "garnier",
      "ponds",
      "pond s",
      "nivea",
      "citra",
      "wardah",
      "marina",
      "vaseline",
      "top lady",
      "bedak",
      "bedak tabur",
    ]) &&
    !includesAny(n, ["bayi", "baby", "herocyn"])
  ) {
    return "kulit-wajah";
  }
  return null;
}

function rumahSub(n) {
  if (includesAny(n, ["obat nyamuk", "baygon", "hit ", "autan", "mosquito"])) {
    return "anti-serangga";
  }
  if (n.startsWith("kucing angora") || n.startsWith("kucing batang")) {
    return "sabun-rumah";
  }
  if (includesAny(n, ["sunlight", "mama lemon", "cuci piring"])) {
    return "cuci-piring";
  }
  if (
    includesAny(n, [
      "rinso",
      "daia",
      "attack",
      "so klin",
      "soklin",
      "boom ",
      "downy",
      "molto",
      "pelembut",
      "deterjen",
      "detergent",
    ])
  ) {
    return "cuci-pakaian";
  }
  if (includesAny(n, ["tisu", "tissue", "paseo", "nice ", "multi tisu"])) {
    return "tisu";
  }
  if (
    includesAny(n, [
      "wipol",
      "soklin lantai",
      "pel ",
      "sapu",
      "keset",
      "sikat wc",
    ])
  ) {
    return "alat-kebersihan";
  }
  if (
    includesAny(n, [
      "wipol",
      "bayclin",
      "pemutih",
      "pembersih",
      "harpic",
      "vixal",
      "super pel",
      "karbol",
    ])
  ) {
    return "pembersih";
  }
  return null;
}

function alatSub(n) {
  if (
    startsAny(n, [
      "buku ",
      "amplop",
      "bolpen",
      "pulpen",
      "pensil",
      "spidol",
      "penghapus",
      "penggaris",
      "crayon",
      "hekter",
      "selotip",
    ]) ||
    includesAny(n, ["sinar dunia", "tip ex", "stapler", "atk"])
  ) {
    return "atk-sekolah";
  }
  if (
    startsAny(n, [
      "plastik ",
      "polybag",
      "tas ",
      "kresek",
      "mika ",
      "sedotan",
      "lakban",
      "foam ",
      "karung",
      "kertas nasi",
      "sendok plastik",
    ])
  ) {
    return "plastik-kemasan";
  }
  if (
    startsAny(n, [
      "balon",
      "lilin angka",
      "kelereng",
      "kartu remi",
      "shuttlecock",
    ]) ||
    includesAny(n, ["pesta", "mainan"])
  ) {
    return "mainan-pesta";
  }
  if (
    startsAny(n, [
      "sandal",
      "payung",
      "jas hujan",
      "senar",
      "gomala",
      "benang",
      "terpal",
      "tali ",
      "paku ",
      "ember",
      "hanger",
      "baterai",
      "lampu ",
      "senter",
      "korek",
      "gunting",
    ])
  ) {
    return "perlengkapan-rumah";
  }
  return null;
}

function kesehatanSub(n) {
  if (
    includesAny(n, [
      "vitamin",
      "imboost",
      "enervon",
      "cdr",
      "hemaviton",
      "fatigon",
      "sangobion",
      "vitacimin",
      "entrasol",
      "madu",
      "madurasa",
    ])
  ) {
    return "vitamin";
  }
  if (
    includesAny(n, [
      "balsem",
      "balpirik",
      "kayu putih",
      "fresh care",
      "koyo",
      "geliga",
      "gpu",
      "plossa",
      "cap lang",
      "minyak angin",
    ])
  ) {
    return "minyak-balsem";
  }
  if (
    includesAny(n, [
      "betadine",
      "alkohol",
      "hansaplast",
      "herocyn",
      "kalpanax",
      "rivanol",
      "masker",
      "sensi",
    ])
  ) {
    return "p3k";
  }
  if (
    includesAny(n, [
      "paracetamol",
      "bodrex",
      "paramex",
      "amoxicillin",
      "obat ",
      "demacolin",
      "neozep",
      "mylanta",
      "entrostop",
    ])
  ) {
    return "obat";
  }
  return null;
}

function rokokSub(n) {
  if (n.includes("kretek")) {
    return "kretek";
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
      "coffee",
      "shiver",
      "cappuccino",
    ])
  ) {
    return "rasa-menthol";
  }
  if (includesAny(n, ["mild", "lights", "slims", " mld"])) {
    return "mild";
  }
  if (includesAny(n, ["filter", "putih", "bold"])) {
    return "filter";
  }
  return null;
}

function bayiSub(n) {
  if (
    includesAny(n, [
      "pampers",
      "sweety",
      "mamy poko",
      "mamypoko",
      "baby happy",
      "popok",
      "makuku",
      "merries",
    ])
  ) {
    return "popok";
  }
  if (
    includesAny(n, [
      "lactogen",
      "bebelac",
      "nutrilon",
      "s26",
      "sgm",
      "prenagen",
      "morinaga",
    ])
  ) {
    return "susu-formula";
  }
  if (includesAny(n, ["puffs", "cerelac", "sun baby"]) || n.includes("bubur bayi")) {
    return "makanan-bayi";
  }
  if (
    includesAny(n, [
      "zwitsal",
      "my baby",
      "cussons baby",
      "johnson baby",
      "minyak telon",
      "telon",
      "bedak",
    ])
  ) {
    return "perawatan-bayi";
  }
  return null;
}

const CLASSIFIERS = {
  "Makanan Ringan": snackSub,
  "Bahan Makanan": bahanSub,
  Minuman: minumanSub,
  "Perawatan Diri": perawatanSub,
  "Kebutuhan Rumah": rumahSub,
  "Alat & Perlengkapan": alatSub,
  Kesehatan: kesehatanSub,
  Rokok: rokokSub,
  "Bayi & Anak": bayiSub,
};

/**
 * @param {string} name
 * @param {string} category existing top-level category
 * @returns {string | null} subcategory id or null if unclassified
 */
export function classifySubcategory(name, category) {
  const classifier = CLASSIFIERS[category];
  if (!classifier) {
    return null;
  }
  return classifier(normalizeSearchText(name));
}

export function isLainnyaSubcategory(subcategoryId) {
  return subcategoryId == null || subcategoryId === LAINNYA_SUBCATEGORY_ID;
}

export function productMatchesSubcategory(product, subcategoryId) {
  if (!subcategoryId || subcategoryId === "semua") {
    return true;
  }
  const assigned = classifySubcategory(product?.name, product?.category);
  if (subcategoryId === LAINNYA_SUBCATEGORY_ID) {
    return assigned == null;
  }
  return assigned === subcategoryId;
}

export function buildSubcategoryTiles(
  categoryId,
  products,
  config = SUBCATEGORY_CONFIG
) {
  const counts = new Map();
  let unclassified = 0;

  for (const product of products ?? []) {
    const id = classifySubcategory(product.name, product.category);
    if (!id) {
      unclassified += 1;
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const defined = (config[categoryId] ?? [])
    .map((entry) => ({
      ...entry,
      count: counts.get(entry.id) ?? 0,
    }))
    .filter((entry) => entry.count > 0);

  const tiles = [{ ...SEMUA_TILE, count: products.length }, ...defined];

  if (unclassified > 0) {
    tiles.push({ ...LAINNYA_TILE, count: unclassified });
  }

  return tiles;
}
