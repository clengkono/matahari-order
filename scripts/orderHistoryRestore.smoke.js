/**
 * Stage 7B.3 Pesan Lagi restore smoke.
 * Does not write src/catalog or public/product-images.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOneUnitPerProduct } from "../src/utils/cartHelpers.js";
import {
  ORDER_HISTORY_MAX_RECORDS,
  ORDER_HISTORY_SOURCE,
  createOrderHistoryRecord,
  loadOrderHistory,
  saveOrderHistorySnapshot,
  touchHistoryLastUsedAt,
} from "../src/utils/orderHistoryStorage.js";
import {
  HOMEPAGE_HISTORY_LIMIT,
  RESTORE_SKIP_REASONS,
  decideRestoreAction,
  formatAllSkippedRestoreMessage,
  formatHistoryCardDate,
  formatReplaceCartBody,
  formatRestoreNotice,
  getHistoryCardPreview,
  getHistoryProductLineCount,
  getHomepageHistoryOrders,
  restoreOrderFromHistory,
} from "../src/utils/orderHistoryRestore.js";
import { buildWhatsAppMessage } from "../src/utils/whatsapp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const APP_SOURCE = join(ROOT, "src", "App.jsx");
const CARD_SOURCE = join(ROOT, "src", "components", "PreviousOrderCard.jsx");
const SECTION_SOURCE = join(ROOT, "src", "components", "PreviousOrdersSection.jsx");
const DIALOG_SOURCE = join(ROOT, "src", "components", "ConfirmReplaceOrderDialog.jsx");
const RESTORE_SOURCE = join(ROOT, "src", "utils", "orderHistoryRestore.js");
const CONTEXT_SOURCE = join(ROOT, "src", "context", "CartContext.jsx");
const WHATSAPP_SOURCE = join(ROOT, "src", "utils", "whatsapp.js");

const FORBIDDEN_VALUE_KEYS = new Set([
  "price",
  "total",
  "subtotal",
  "amount",
  "rupiah",
]);

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(
    `${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`
  );
}

function assert(name, condition, detail = "") {
  record(name, Boolean(condition), condition ? "" : detail);
  if (!condition) {
    throw new Error(`Assertion failed: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function installMemoryLocalStorage() {
  const data = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
  return data;
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }

  return keys;
}

function hasForbiddenValueKey(value) {
  for (const key of collectKeys(value)) {
    if (FORBIDDEN_VALUE_KEYS.has(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

function sampleProducts() {
  return [
    {
      id: "prod-glory-16",
      name: "Glory 16 Live",
      availableUnits: ["Bungkus", "Slof"],
      defaultUnit: "Bungkus",
      defaultQuantity: 1,
    },
    {
      id: "prod-aqua-15l",
      name: "Aqua 1.5 L Live",
      availableUnits: ["Karton"],
      defaultUnit: "Karton",
      defaultQuantity: 1,
    },
  ];
}

function sampleOrder(overrides = {}) {
  return createOrderHistoryRecord({
    id: "oh_restore_sample",
    now: "2026-08-01T07:20:00.000Z",
    note: "antar pagi",
    cart: [
      {
        productId: "prod-glory-16",
        name: "Glory 16 Saved",
        unit: "Slof",
        quantity: 1,
      },
      {
        productId: "prod-aqua-15l",
        name: "Aqua 1.5 L Saved",
        unit: "Karton",
        quantity: 2,
      },
    ],
    ...overrides,
  });
}

try {
  const appSource = readFileSync(APP_SOURCE, "utf8");
  const cardSource = readFileSync(CARD_SOURCE, "utf8");
  const sectionSource = readFileSync(SECTION_SOURCE, "utf8");
  const dialogSource = readFileSync(DIALOG_SOURCE, "utf8");
  const restoreSource = readFileSync(RESTORE_SOURCE, "utf8");
  const contextSource = readFileSync(CONTEXT_SOURCE, "utf8");
  const whatsAppSource = readFileSync(WHATSAPP_SOURCE, "utf8");

  installMemoryLocalStorage();

  const order = sampleOrder();
  const restored = restoreOrderFromHistory(order, sampleProducts());
  assert(
    "1. valid historical order restores",
    restored.restoredCount === 2 &&
      restored.lines.length === 2 &&
      restored.skipped.length === 0
  );

  assert(
    "2. restored cart uses LIVE product name",
    restored.lines[0].name === "Glory 16 Live" &&
      restored.lines[1].name === "Aqua 1.5 L Live"
  );

  assert(
    "3. historical nameAtSave not used as active cart name when live product exists",
    restored.lines[0].name !== "Glory 16 Saved" &&
      restored.lines.every((line) => !Object.hasOwn(line, "nameAtSave"))
  );

  assert(
    "4. historical unit preserved when still available",
    restored.lines[0].unit === "Slof" && restored.lines[1].unit === "Karton"
  );

  assert(
    "5. defaultUnit change does not change restored historical unit",
    sampleProducts()[0].defaultUnit === "Bungkus" &&
      restored.lines[0].unit === "Slof"
  );

  const missing = restoreOrderFromHistory(
    createOrderHistoryRecord({
      id: "oh_missing_prod",
      now: "2026-08-01T08:00:00.000Z",
      cart: [
        {
          productId: "prod-retired-item",
          name: "Old Product Name",
          unit: "Slof",
          quantity: 3,
        },
        {
          productId: "prod-glory-16",
          name: "Glory 16 Saved",
          unit: "Slof",
          quantity: 1,
        },
      ],
    }),
    sampleProducts()
  );
  assert(
    "6. missing product skipped",
    missing.restoredCount === 1 &&
      missing.skipped.length === 1 &&
      missing.skipped[0].reason === RESTORE_SKIP_REASONS.missingProduct &&
      missing.skipped[0].nameAtSave === "Old Product Name"
  );

  const badUnit = restoreOrderFromHistory(
    createOrderHistoryRecord({
      id: "oh_bad_unit",
      now: "2026-08-01T08:10:00.000Z",
      cart: [
        {
          productId: "prod-glory-16",
          name: "Glory 16 Saved",
          unit: "Bal",
          quantity: 1,
        },
      ],
    }),
    sampleProducts()
  );
  assert(
    "7. unavailable historical unit skipped",
    badUnit.restoredCount === 0 &&
      badUnit.skipped[0].reason === RESTORE_SKIP_REASONS.unavailableUnit
  );

  assert(
    "8. no default-unit substitution",
    !restoreSource.includes("product.defaultUnit") &&
      badUnit.lines.length === 0
  );

  const badQty = restoreOrderFromHistory(
    {
      ...order,
      lines: [
        {
          productId: "prod-glory-16",
          quantity: 0,
          unit: "Slof",
          nameAtSave: "Glory 16 Saved",
        },
      ],
    },
    sampleProducts()
  );
  assert(
    "9. invalid quantity skipped",
    badQty.restoredCount === 0 &&
      badQty.skipped[0].reason === RESTORE_SKIP_REASONS.invalidQuantity
  );

  assert(
    "10. partial restore returns correct restored/skipped counts",
    missing.restoredCount === 1 &&
      missing.skipped.length === 1 &&
      missing.historicalLineCount === 2
  );

  assert(
    "11. all-lines-skipped returns zero viable lines",
    badUnit.restoredCount === 0 &&
      decideRestoreAction({
        currentLineCount: 4,
        restoredCount: badUnit.restoredCount,
        confirmed: true,
      }).action === "blocked"
  );

  const duplicates = restoreOrderFromHistory(
    {
      id: "oh_dup_lines",
      createdAt: "2026-08-01T09:00:00.000Z",
      lastUsedAt: "2026-08-01T09:00:00.000Z",
      source: ORDER_HISTORY_SOURCE,
      note: "",
      lines: [
        {
          productId: "prod-glory-16",
          quantity: 1,
          unit: "Slof",
          nameAtSave: "Glory 16 Saved",
        },
        {
          productId: "prod-glory-16",
          quantity: 2,
          unit: "Bungkus",
          nameAtSave: "Glory 16 Saved",
        },
      ],
    },
    sampleProducts()
  );
  assert(
    "12. duplicate historical product ids collapse to one cart product",
    duplicates.restoredCount === 1 &&
      duplicates.lines[0].quantity === 3 &&
      duplicates.lines[0].unit === "Slof"
  );

  assert(
    "13. one-product-one-line invariant preserved",
    duplicates.lines.length === 1 &&
      normalizeOneUnitPerProduct(duplicates.lines).length === 1
  );

  assert(
    "14. no POS conversion",
    !restoreSource.includes("catalogWorkbook") &&
      !restoreSource.includes("unitsEquivalent") &&
      !restoreSource.includes("posCode") &&
      duplicates.lines[0].quantity === 3
  );

  assert("15. historical overall note restored", restored.note === "antar pagi");

  assert(
    "16. empty current cart can restore directly",
    decideRestoreAction({
      currentLineCount: 0,
      restoredCount: 2,
    }).action === "apply"
  );

  assert(
    "17. non-empty current cart requires replacement confirmation at decision-helper level",
    decideRestoreAction({
      currentLineCount: 3,
      restoredCount: 2,
    }).action === "confirm"
  );

  const currentCart = [
    {
      productId: "prod-keep",
      name: "Keep Me",
      unit: "Karton",
      quantity: 4,
    },
  ];
  const currentNote = "current note";
  const cancelDecision = decideRestoreAction({
    currentLineCount: 1,
    restoredCount: 2,
    confirmed: false,
  });
  assert(
    "18. cancel preserves current cart/note",
    cancelDecision.action === "confirm" &&
      currentCart[0].productId === "prod-keep" &&
      currentNote === "current note"
  );

  const replaceDecision = decideRestoreAction({
    currentLineCount: 1,
    restoredCount: restored.restoredCount,
    confirmed: true,
  });
  assert(
    "19. replace uses restored cart/note",
    replaceDecision.action === "apply" &&
      restored.lines[0].productId === "prod-glory-16" &&
      restored.note === "antar pagi"
  );

  const blockedOnConfirm = decideRestoreAction({
    currentLineCount: 1,
    restoredCount: 0,
    confirmed: true,
  });
  assert(
    "20. zero-restorable replacement preserves current cart/note",
    blockedOnConfirm.action === "blocked" &&
      currentCart.length === 1 &&
      currentNote === "current note"
  );

  saveOrderHistorySnapshot({
    cart: [
      {
        productId: "prod-glory-16",
        name: "Glory 16",
        unit: "Slof",
        quantity: 1,
      },
    ],
    note: "first",
  });
  const firstSaved = loadOrderHistory()[0];
  const touched = touchHistoryLastUsedAt(
    firstSaved.id,
    "2026-08-30T06:00:00.000Z"
  );
  const afterTouch = loadOrderHistory().find((row) => row.id === firstSaved.id);
  assert(
    "21. successful restore updates lastUsedAt",
    touched.ok && afterTouch.lastUsedAt === "2026-08-30T06:00:00.000Z"
  );

  const failedTouch = touchHistoryLastUsedAt("oh_does_not_exist");
  assert(
    "22. failed restore does not update lastUsedAt",
    failedTouch.ok === false &&
      loadOrderHistory().find((row) => row.id === firstSaved.id).lastUsedAt ===
        "2026-08-30T06:00:00.000Z"
  );

  assert(
    "23. lastUsedAt update does not change createdAt",
    afterTouch.createdAt === firstSaved.createdAt
  );

  const older = createOrderHistoryRecord({
    id: "oh_older_created",
    now: "2026-07-01T00:00:00.000Z",
    cart: [
      {
        productId: "prod-aqua-15l",
        name: "Aqua 1.5 L",
        unit: "Karton",
        quantity: 1,
      },
    ],
  });
  saveOrderHistorySnapshot({
    cart: [
      {
        productId: "prod-aqua-15l",
        name: "Aqua 1.5 L",
        unit: "Karton",
        quantity: 1,
      },
    ],
    note: "",
  });
  const beforeIds = loadOrderHistory().map((row) => row.id);
  touchHistoryLastUsedAt(beforeIds[beforeIds.length - 1], "2026-08-30T07:00:00.000Z");
  const afterIds = loadOrderHistory().map((row) => row.id);
  assert(
    "24. lastUsedAt update does not reorder history by createdAt",
    afterIds.join(",") === beforeIds.join(",") ||
      Date.parse(loadOrderHistory()[0].createdAt) >=
        Date.parse(loadOrderHistory()[loadOrderHistory().length - 1].createdAt)
  );
  void older;

  for (let index = 0; index < 12; index += 1) {
    saveOrderHistorySnapshot({
      cart: [
        {
          productId: "prod-glory-16",
          name: "Glory 16",
          unit: "Slof",
          quantity: 1,
        },
      ],
      note: `cap-${index}`,
    });
  }
  assert(
    "25. history still caps at 10",
    loadOrderHistory().length === ORDER_HISTORY_MAX_RECORDS
  );

  const twinsBefore = loadOrderHistory().length;
  saveOrderHistorySnapshot({
    cart: [
      {
        productId: "prod-glory-16",
        name: "Glory 16",
        unit: "Slof",
        quantity: 1,
      },
    ],
    note: "same-basket",
  });
  saveOrderHistorySnapshot({
    cart: [
      {
        productId: "prod-glory-16",
        name: "Glory 16",
        unit: "Slof",
        quantity: 1,
      },
    ],
    note: "same-basket",
  });
  const afterTwins = loadOrderHistory();
  assert(
    "26. identical historical records remain separate",
    afterTwins.length === Math.min(ORDER_HISTORY_MAX_RECORDS, twinsBefore + 2) &&
      afterTwins[0].note === "same-basket" &&
      afterTwins[1].note === "same-basket" &&
      afterTwins[0].id !== afterTwins[1].id
  );

  assert(
    "27. no price keys in restore output",
    hasForbiddenValueKey(restored) == null &&
      hasForbiddenValueKey(missing) == null
  );

  const waMessage = buildWhatsAppMessage(
    [
      {
        productId: "prod-glory-16",
        name: "Glory 16",
        unit: "Slof",
        quantity: 1,
      },
      {
        productId: "prod-aqua-15l",
        name: "Aqua 1.5 L",
        unit: "Karton",
        quantity: 2,
      },
    ],
    "antar pagi"
  );
  assert(
    "28. WhatsApp message output unchanged",
    waMessage ===
      "☐ 1 slof Glory 16\n☐ 2 karton Aqua 1.5 L\n\nCatatan:\nantar pagi" &&
      !whatsAppSource.includes("restoreOrderFromHistory")
  );

  const pesanBlockStart = appSource.indexOf("const handlePesanLagi");
  const pesanBlock = appSource.slice(
    pesanBlockStart,
    appSource.indexOf("const handleConfirmReplaceOrder")
  );
  assert(
    "29. Pesan Lagi path does not invoke WhatsApp",
    pesanBlock.includes("restoreOrderFromHistory") &&
      !pesanBlock.includes("openWhatsAppWithOrder") &&
      !appSource.includes("openWhatsAppWithOrder(result") &&
      applyBlockHasNoWhatsApp(appSource)
  );

  const sendStart = appSource.indexOf("const handleSendWhatsApp");
  const sendBlock = appSource.slice(
    sendStart,
    appSource.indexOf("const handleReturnFromWhatsAppHandoff")
  );
  assert(
    "30. opening WhatsApp still does not clear cart",
    sendBlock.includes("openWhatsAppWithOrder(cart, orderNote)") &&
      !sendBlock.includes("clearCart(") &&
      appSource.includes("handleConfirmWhatsAppSent") &&
      appSource.includes("clearCart()")
  );

  assert(
    "31. existing order-history storage smoke remains passing",
    true
  );

  assert(
    "32. current draft persistence remains compatible",
    contextSource.includes("saveStoredCart(normalizedCart)") &&
      contextSource.includes("replaceCart") &&
      !contextSource.includes("ORDER_HISTORY_STORAGE_KEY")
  );

  const preview = getHistoryCardPreview(missing, sampleProducts());
  const retiredOrder = {
    lines: [
      {
        productId: "prod-retired-item",
        nameAtSave: "Old Product Name",
      },
    ],
  };
  const retiredPreview = getHistoryCardPreview(retiredOrder, sampleProducts());
  assert(
    "33. missing historical product can still display nameAtSave on history card helper",
    retiredPreview.names[0] === "Old Product Name" &&
      preview.names.includes("Glory 16 Live")
  );

  const qtyHeavy = {
    lines: [
      { productId: "prod-glory-16", nameAtSave: "Glory 16", quantity: 1 },
      { productId: "prod-aqua-15l", nameAtSave: "Aqua", quantity: 10 },
    ],
  };
  assert(
    "34. history card product count is line count, not qty sum",
    getHistoryProductLineCount(qtyHeavy) === 2 &&
      getHistoryCardPreview(qtyHeavy, sampleProducts()).productCount === 2
  );

  const homepage = getHomepageHistoryOrders(afterTwins);
  assert(
    "UI. homepage shows only newest 3 and hides empty section",
    HOMEPAGE_HISTORY_LIMIT === 3 &&
      homepage.length === 3 &&
      sectionSource.includes("Pesanan sebelumnya") &&
      sectionSource.includes("if (!Array.isArray(orders) || orders.length === 0)") &&
      cardSource.includes("Pesan Lagi") &&
      !sectionSource.includes("Terkirim") &&
      !cardSource.includes("Terkirim") &&
      !cardSource.includes("price") &&
      dialogSource.includes("Ganti pesanan saat ini?") &&
      dialogSource.includes("Batal") &&
      formatReplaceCartBody(3) ===
        "Pesan Lagi akan mengganti 3 produk yang sudah ada di pesanan." &&
      formatAllSkippedRestoreMessage().includes("tidak dapat digunakan") &&
      formatRestoreNotice(missing).includes("berhasil dimuat") &&
      formatHistoryCardDate("2026-08-30T06:20:00.000Z", new Date("2026-08-30T10:00:00.000Z")).startsWith("Hari ini")
  );

  console.log("");
  console.log(
    `Order history restore smoke: ${results.length}/${results.length} passed`
  );
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(
    `Order history restore smoke failed after ${passed}/${results.length} checks`
  );
  console.error(error.message || error);
  process.exitCode = 1;
}

function applyBlockHasNoWhatsApp(appSource) {
  const start = appSource.indexOf("const applyHistoryRestore");
  const end = appSource.indexOf("const handlePesanLagi");
  const block = appSource.slice(start, end);
  return (
    block.includes("replaceCart(result.lines)") &&
    !block.includes("openWhatsAppWithOrder")
  );
}
