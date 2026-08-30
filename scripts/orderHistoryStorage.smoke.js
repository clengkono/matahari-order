/**
 * Stage 7B.2 order-history storage smoke.
 * Does not write src/catalog or public/product-images.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORDER_HISTORY_MAX_QUANTITY,
  ORDER_HISTORY_MAX_RECORDS,
  ORDER_HISTORY_SCHEMA_VERSION,
  ORDER_HISTORY_SOURCE,
  ORDER_HISTORY_STORAGE_KEY,
  appendOrderHistoryRecord,
  createHistoryId,
  createOrderHistoryRecord,
  loadOrderHistory,
  saveOrderHistorySnapshot,
  sanitizeHistoryLine,
  sanitizeHistoryRecord,
  sanitizeOrderHistoryStore,
} from "../src/utils/orderHistoryStorage.js";
import { buildWhatsAppMessage } from "../src/utils/whatsapp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APP_SOURCE = join(ROOT, "src", "App.jsx");
const DRAFT_SOURCE = join(ROOT, "src", "utils", "orderDraftStorage.js");
const HISTORY_SOURCE = join(ROOT, "src", "utils", "orderHistoryStorage.js");
const WHATSAPP_SOURCE = join(ROOT, "src", "utils", "whatsapp.js");
const CART_STORAGE_KEY = "matahari-order:cart";
const ORDER_NOTE_STORAGE_KEY = "matahari-order:order-note";

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
  const memory = {
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
  globalThis.localStorage = memory;
  return data;
}

function sampleCart() {
  return [
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
  ];
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

function isoAt(offsetMs) {
  return new Date(Date.UTC(2026, 7, 1, 0, 0, 0) + offsetMs).toISOString();
}

try {
  const appSource = readFileSync(APP_SOURCE, "utf8");
  const draftSource = readFileSync(DRAFT_SOURCE, "utf8");
  const historySource = readFileSync(HISTORY_SOURCE, "utf8");
  const whatsAppSource = readFileSync(WHATSAPP_SOURCE, "utf8");

  const store = installMemoryLocalStorage();

  assert(
    "1. empty storage → empty history",
    loadOrderHistory().length === 0
  );

  const snapshot = saveOrderHistorySnapshot({
    cart: sampleCart(),
    note: "antar pagi",
  });
  assert("2. valid snapshot saves", snapshot.ok && snapshot.record != null);

  const saved = loadOrderHistory();
  const first = saved[0];
  assert(
    "3. cart lines map to productId / quantity / unit / nameAtSave",
    saved.length === 1 &&
      first.lines.length === 2 &&
      first.lines[0].productId === "prod-glory-16" &&
      first.lines[0].quantity === 1 &&
      first.lines[0].unit === "Slof" &&
      first.lines[0].nameAtSave === "Glory 16" &&
      first.lines[1].productId === "prod-aqua-15l" &&
      first.lines[1].quantity === 2 &&
      first.lines[1].unit === "Karton" &&
      first.lines[1].nameAtSave === "Aqua 1.5 L" &&
      !Object.hasOwn(first.lines[0], "name") &&
      !Object.hasOwn(first.lines[0], "image")
  );

  assert("4. overall note preserved", first.note === "antar pagi");
  assert(
    "5. source = prepared-for-whatsapp",
    first.source === ORDER_HISTORY_SOURCE &&
      first.source === "prepared-for-whatsapp" &&
      !Object.hasOwn(first, "sent") &&
      !Object.hasOwn(first, "completed") &&
      !Object.hasOwn(first, "received")
  );

  assert(
    "6. createdAt valid",
    typeof first.createdAt === "string" && Number.isFinite(Date.parse(first.createdAt))
  );
  assert(
    "7. lastUsedAt initially equals createdAt",
    first.lastUsedAt === first.createdAt
  );
  assert(
    "8. stable oh_ id created",
    typeof first.id === "string" &&
      first.id.startsWith("oh_") &&
      first.id.length > 3 &&
      createHistoryId().startsWith("oh_")
  );

  const raw = JSON.parse(store.get(ORDER_HISTORY_STORAGE_KEY));
  store.set(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(raw));
  const reloaded = loadOrderHistory();
  assert(
    "9. reload round-trip works",
    reloaded.length === 1 &&
      reloaded[0].id === first.id &&
      reloaded[0].note === "antar pagi" &&
      reloaded[0].lines[0].nameAtSave === "Glory 16" &&
      raw.schemaVersion === ORDER_HISTORY_SCHEMA_VERSION
  );

  const second = saveOrderHistorySnapshot({
    cart: sampleCart(),
    note: "antar pagi",
  });
  const afterTwin = loadOrderHistory();
  assert(
    "10. two IDENTICAL snapshots remain two records",
    second.ok &&
      afterTwin.length === 2 &&
      afterTwin[0].id !== afterTwin[1].id &&
      JSON.stringify(afterTwin[0].lines) === JSON.stringify(afterTwin[1].lines) &&
      afterTwin[0].note === afterTwin[1].note &&
      !historySource.includes("reuseCount")
  );

  store.clear();
  for (let index = 0; index < ORDER_HISTORY_MAX_RECORDS; index += 1) {
    const record = createOrderHistoryRecord({
      cart: [
        {
          productId: `prod-item-${index}`,
          name: `Item ${index}`,
          unit: "Karton",
          quantity: 1,
        },
      ],
      note: "",
      now: isoAt(index * 1000),
      id: `oh_seed_${index}`,
    });
    const next = appendOrderHistoryRecord(
      { schemaVersion: 1, orders: loadOrderHistory() },
      record
    );
    store.set(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(next));
  }
  const ten = loadOrderHistory();
  assert(
    "11. newest 10 retained",
    ten.length === 10 &&
      ten[0].id === "oh_seed_9" &&
      ten[9].id === "oh_seed_0"
  );

  const eleventh = createOrderHistoryRecord({
    cart: [
      {
        productId: "prod-item-10",
        name: "Item 10",
        unit: "Karton",
        quantity: 1,
      },
    ],
    now: isoAt(10 * 1000),
    id: "oh_seed_10",
  });
  const capped = appendOrderHistoryRecord(
    { schemaVersion: 1, orders: ten },
    eleventh
  );
  store.set(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(capped));
  const afterCap = loadOrderHistory();
  assert(
    "12. 11th drops oldest",
    afterCap.length === 10 &&
      afterCap[0].id === "oh_seed_10" &&
      afterCap.some((row) => row.id === "oh_seed_1") &&
      !afterCap.some((row) => row.id === "oh_seed_0")
  );

  store.set(ORDER_HISTORY_STORAGE_KEY, "{not-json");
  assert(
    "13. malformed JSON → safe empty history",
    loadOrderHistory().length === 0
  );

  const validKeep = createOrderHistoryRecord({
    cart: sampleCart(),
    now: isoAt(5000),
    id: "oh_keep_valid",
  });
  store.set(
    ORDER_HISTORY_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      orders: [
        validKeep,
        { not: "a record" },
        {
          id: "oh_bad_source",
          createdAt: isoAt(4000),
          lastUsedAt: isoAt(4000),
          source: "sent",
          note: "",
          lines: validKeep.lines,
        },
      ],
    })
  );
  const isolated = loadOrderHistory();
  assert(
    "14. corrupt order dropped while valid order survives",
    isolated.length === 1 && isolated[0].id === "oh_keep_valid"
  );

  const mixedLines = sanitizeHistoryRecord({
    id: "oh_mixed_lines",
    createdAt: isoAt(3000),
    lastUsedAt: isoAt(3000),
    source: ORDER_HISTORY_SOURCE,
    note: "",
    lines: [
      {
        productId: "prod-glory-16",
        quantity: 1,
        unit: "Slof",
        nameAtSave: "Glory 16",
      },
      { productId: "prod-bad", quantity: 1 },
      null,
    ],
  });
  assert(
    "15. corrupt line handled safely",
    mixedLines != null &&
      mixedLines.lines.length === 1 &&
      mixedLines.lines[0].productId === "prod-glory-16" &&
      sanitizeHistoryLine(null) === null
  );

  assert("16. quantity 0 rejected", sanitizeHistoryLine({
    productId: "prod-glory-16",
    quantity: 0,
    unit: "Slof",
    nameAtSave: "Glory 16",
  }) === null);

  assert("17. negative quantity rejected", sanitizeHistoryLine({
    productId: "prod-glory-16",
    quantity: -2,
    unit: "Slof",
    nameAtSave: "Glory 16",
  }) === null);

  assert("18. non-integer quantity rejected", sanitizeHistoryLine({
    productId: "prod-glory-16",
    quantity: 1.5,
    unit: "Slof",
    nameAtSave: "Glory 16",
  }) === null);

  assert(
    "19. quantity >9999 rejected",
    sanitizeHistoryLine({
      productId: "prod-glory-16",
      quantity: ORDER_HISTORY_MAX_QUANTITY + 1,
      unit: "Slof",
      nameAtSave: "Glory 16",
    }) === null &&
      sanitizeHistoryLine({
        productId: "prod-glory-16",
        quantity: ORDER_HISTORY_MAX_QUANTITY,
        unit: "Slof",
        nameAtSave: "Glory 16",
      }) != null
  );

  store.set(
    ORDER_HISTORY_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 99,
      orders: [validKeep],
    })
  );
  assert(
    "20. unsupported schema version safe",
    loadOrderHistory().length === 0 &&
      sanitizeOrderHistoryStore({ schemaVersion: 99, orders: [validKeep] })
        .orders.length === 0
  );

  const retiredId = "prod-retired-item-that-is-not-in-catalogue";
  const retired = createOrderHistoryRecord({
    cart: [
      {
        productId: retiredId,
        name: "Old Product Name",
        unit: "Slof",
        quantity: 3,
      },
    ],
    now: isoAt(8000),
    id: "oh_retired_product",
  });
  store.set(
    ORDER_HISTORY_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, orders: [retired] })
  );
  const retiredLoaded = loadOrderHistory();
  assert(
    "21. product missing from current catalogue is NOT removed by storage sanitizer",
    retiredLoaded.length === 1 &&
      retiredLoaded[0].lines[0].productId === retiredId &&
      retiredLoaded[0].lines[0].nameAtSave === "Old Product Name" &&
      !historySource.includes("productById") &&
      !historySource.includes("availableUnits")
  );

  store.clear();
  saveOrderHistorySnapshot({ cart: sampleCart(), note: "antar pagi" });
  const persisted = JSON.parse(store.get(ORDER_HISTORY_STORAGE_KEY));
  const forbidden = hasForbiddenValueKey(persisted);
  assert(
    "22. no prices / totals / POS data stored",
    forbidden == null &&
      !historySource.includes("posCode") &&
      !historySource.includes("conversion") &&
      persisted.orders[0].lines.every(
        (line) =>
          Object.keys(line).join(",") === "productId,quantity,unit,nameAtSave"
      )
  );

  const originalGetItem = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = () => {
    throw new Error("read blocked");
  };
  let readThrew = false;
  let readResult;
  try {
    readResult = loadOrderHistory();
  } catch {
    readThrew = true;
  }
  globalThis.localStorage.getItem = originalGetItem;
  assert(
    "23. localStorage read failure does not throw",
    readThrew === false && Array.isArray(readResult) && readResult.length === 0
  );

  const originalSetItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    throw new Error("quota");
  };
  let writeThrew = false;
  let writeResult;
  try {
    writeResult = saveOrderHistorySnapshot({
      cart: sampleCart(),
      note: "quota",
    });
  } catch {
    writeThrew = true;
  }
  globalThis.localStorage.setItem = originalSetItem;
  assert(
    "24. localStorage write failure does not throw",
    writeThrew === false && writeResult.ok === true
  );

  let handoffCalled = false;
  const fakeOpenWhatsApp = (cart, note) => {
    handoffCalled = true;
    return { ok: true, reason: undefined, cart, note };
  };
  globalThis.localStorage.setItem = () => {
    throw new Error("quota again");
  };
  let sequenceThrew = false;
  let handoffResult;
  try {
    saveOrderHistorySnapshot({ cart: sampleCart(), note: "keep going" });
    handoffResult = fakeOpenWhatsApp(sampleCart(), "keep going");
  } catch {
    sequenceThrew = true;
  }
  globalThis.localStorage.setItem = originalSetItem;
  assert(
    "25. history failure does not prevent WhatsApp handoff path",
    sequenceThrew === false &&
      handoffCalled === true &&
      handoffResult.ok === true
  );

  store.clear();
  const draftCartJson = JSON.stringify(sampleCart());
  store.set(CART_STORAGE_KEY, draftCartJson);
  store.set(ORDER_NOTE_STORAGE_KEY, JSON.stringify("draft note"));
  saveOrderHistorySnapshot({ cart: sampleCart(), note: "history note" });
  assert(
    "26. current cart persistence semantics unchanged",
    store.get(CART_STORAGE_KEY) === draftCartJson &&
      store.get(ORDER_NOTE_STORAGE_KEY) === JSON.stringify("draft note") &&
      store.has(ORDER_HISTORY_STORAGE_KEY) &&
      CART_STORAGE_KEY !== ORDER_HISTORY_STORAGE_KEY &&
      draftSource.includes(`"${CART_STORAGE_KEY}"`) &&
      draftSource.includes(`"${ORDER_NOTE_STORAGE_KEY}"`) &&
      !draftSource.includes(ORDER_HISTORY_STORAGE_KEY)
  );

  const waMessage = buildWhatsAppMessage(sampleCart(), "antar pagi");
  assert(
    "27. WhatsApp message output unchanged",
    waMessage ===
      "☐ 1 slof Glory 16\n☐ 2 karton Aqua 1.5 L\n\nCatatan:\nantar pagi" &&
      whatsAppSource.includes("☐ ${item.quantity}") &&
      !whatsAppSource.includes("saveOrderHistorySnapshot")
  );

  const sendStart = appSource.indexOf("const handleSendWhatsApp");
  const sendEnd = appSource.indexOf("const handleReturnFromWhatsAppHandoff");
  const sendBlock = appSource.slice(sendStart, sendEnd);
  const confirmStart = appSource.indexOf("const handleConfirmWhatsAppSent");
  const confirmEnd = appSource.indexOf("const clearDraftIfCartWillEmpty");
  const confirmBlock = appSource.slice(confirmStart, confirmEnd);
  const snapshotAt = sendBlock.indexOf("saveOrderHistorySnapshot({ cart, note: orderNote })");
  const openAt = sendBlock.indexOf("openWhatsAppWithOrder(cart, orderNote)");
  assert(
    "28. cart is not cleared when handoff opens",
    snapshotAt !== -1 &&
      openAt !== -1 &&
      snapshotAt < openAt &&
      !sendBlock.includes("clearCart(") &&
      confirmBlock.includes("clearCart()") &&
      sendBlock.includes("saveOrderHistorySnapshot")
  );

  const emptyRecord = createOrderHistoryRecord({ cart: [], note: "x" });
  assert(
    "empty cart does not create a history record",
    emptyRecord === null &&
      saveOrderHistorySnapshot({ cart: [], note: "x" }).ok === false
  );

  console.log("");
  console.log(
    `Order history storage smoke: ${results.length}/${results.length} passed`
  );
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(
    `Order history storage smoke failed after ${passed}/${results.length} checks`
  );
  console.error(error.message || error);
  process.exitCode = 1;
}
