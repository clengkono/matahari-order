/**
 * Stage 7C.1 learning-profile storage smoke.
 * Does not write src/catalog or public/product-images.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEARNING_DUPLICATE_WINDOW_MS,
  LEARNING_MAX_PRODUCT_OBSERVATIONS,
  LEARNING_MAX_QUANTITY,
  LEARNING_MAX_RECENT_OCCASIONS,
  LEARNING_PROFILE_SCHEMA_VERSION,
  LEARNING_PROFILE_STORAGE_KEY,
  applyOrderingOccasion,
  buildOccasionFingerprint,
  clearLearningProfile,
  emptyLearningProfile,
  loadLearningProfile,
  normalizeOccasionLines,
  recordOrderingOccasion,
  sanitizeLearningProfile,
} from "../src/utils/learningProfileStorage.js";
import {
  ORDER_HISTORY_STORAGE_KEY,
  loadOrderHistory,
  saveOrderHistorySnapshot,
} from "../src/utils/orderHistoryStorage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APP_SOURCE = join(ROOT, "src", "App.jsx");
const LEARNING_SOURCE = join(ROOT, "src", "utils", "learningProfileStorage.js");
const HISTORY_SOURCE = join(ROOT, "src", "utils", "orderHistoryStorage.js");

const PROHIBITED_KEYS = new Set([
  "name",
  "nameatsave",
  "image",
  "imageurl",
  "note",
  "message",
  "whatsapp",
  "customername",
  "customerid",
  "phone",
  "address",
  "price",
  "total",
  "subtotal",
  "amount",
  "rupiah",
  "pos",
  "poscode",
  "conversion",
  "purchasecost",
  "searchhistory",
  "clicks",
  "pageviews",
  "preferredunit",
  "preferredquantity",
  "averagequantity",
  "modequantity",
  "unitconfidence",
  "quantityconfidence",
  "score",
  "embedding",
  "sent",
  "completed",
  "delivered",
  "recommendations",
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

function isoAt(offsetMs) {
  return new Date(Date.UTC(2026, 7, 1, 0, 0, 0) + offsetMs).toISOString();
}

function gloryLine(quantity = 1, unit = "Slof") {
  return {
    productId: "prod-glory-16",
    name: "Glory 16",
    unit,
    quantity,
  };
}

function aquaLine(quantity = 2, unit = "Karton") {
  return {
    productId: "prod-aqua-15l",
    name: "Aqua 1.5 L",
    unit,
    quantity,
  };
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }

  if (value && typeof value !== "object") {
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

function hasProhibitedKey(value) {
  for (const key of collectKeys(value)) {
    if (PROHIBITED_KEYS.has(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

try {
  const appSource = readFileSync(APP_SOURCE, "utf8");
  const learningSource = readFileSync(LEARNING_SOURCE, "utf8");
  const historySource = readFileSync(HISTORY_SOURCE, "utf8");

  const store = installMemoryLocalStorage();

  const empty = loadLearningProfile();
  assert(
    "1. empty storage → empty profile",
    empty.schemaVersion === LEARNING_PROFILE_SCHEMA_VERSION &&
      empty.totalOrderingOccasions === 0 &&
      empty.firstObservedAt === "" &&
      empty.lastObservedAt === "" &&
      empty.lastOccasion === null &&
      empty.recentOccasions.length === 0 &&
      Object.keys(empty.products).length === 0 &&
      JSON.stringify(empty) === JSON.stringify(emptyLearningProfile())
  );

  const firstNow = isoAt(0);
  const first = recordOrderingOccasion({
    cart: [gloryLine(1)],
    now: firstNow,
  });
  const afterFirst = loadLearningProfile();
  const glory = afterFirst.products["prod-glory-16"];
  assert(
    "2. first valid occasion recorded",
    first.ok &&
      first.status === "recorded" &&
      afterFirst.totalOrderingOccasions === 1 &&
      afterFirst.firstObservedAt === firstNow &&
      afterFirst.lastObservedAt === firstNow &&
      afterFirst.lastOccasion != null &&
      afterFirst.recentOccasions.length === 1
  );

  assert(
    "3. global total increments once",
    afterFirst.totalOrderingOccasions === 1
  );

  assert(
    "4. product orderCount increments once",
    glory != null && glory.orderCount === 1 && glory.productId === "prod-glory-16"
  );

  store.clear();
  recordOrderingOccasion({
    cart: [gloryLine(5)],
    now: firstNow,
  });
  const qtyFive = loadLearningProfile();
  assert(
    "5. quantity 5 does not mean 5 occurrences",
    qtyFive.totalOrderingOccasions === 1 &&
      qtyFive.products["prod-glory-16"].orderCount === 1
  );

  assert(
    "6. exact unit preserved",
    qtyFive.products["prod-glory-16"].recentObservations[0].unit === "Slof"
  );

  assert(
    "7. exact quantity preserved",
    qtyFive.products["prod-glory-16"].recentObservations[0].quantity === 5
  );

  store.clear();
  recordOrderingOccasion({
    cart: [gloryLine(1), aquaLine(2)],
    now: firstNow,
  });
  const multi = loadLearningProfile();
  assert(
    "8. multiple products + sorted productIds",
    JSON.stringify(multi.recentOccasions[0].productIds) ===
      JSON.stringify(["prod-aqua-15l", "prod-glory-16"]) &&
      multi.totalOrderingOccasions === 1 &&
      multi.products["prod-glory-16"].orderCount === 1 &&
      multi.products["prod-aqua-15l"].orderCount === 1
  );

  const duplicateLines = normalizeOccasionLines([
    gloryLine(2, "Dus"),
    gloryLine(3, "Slof"),
  ]);
  assert(
    "9. duplicate product lines normalize",
    duplicateLines.length === 1 &&
      duplicateLines[0].productId === "prod-glory-16" &&
      duplicateLines[0].unit === "Dus" &&
      duplicateLines[0].quantity === 5
  );

  const secondNow = isoAt(LEARNING_DUPLICATE_WINDOW_MS + 1);
  recordOrderingOccasion({
    cart: [aquaLine(1)],
    now: secondNow,
  });
  const afterSecond = loadLearningProfile();
  assert(
    "10. second different occasion recorded",
    afterSecond.totalOrderingOccasions === 2 &&
      afterSecond.recentOccasions.length === 2 &&
      afterSecond.recentOccasions[0].observedAt === secondNow &&
      afterSecond.products["prod-aqua-15l"].orderCount === 2 &&
      afterSecond.products["prod-glory-16"].orderCount === 1
  );

  store.clear();
  const twinCart = [gloryLine(1)];
  recordOrderingOccasion({ cart: twinCart, now: isoAt(0) });
  const outside = recordOrderingOccasion({
    cart: twinCart,
    now: isoAt(LEARNING_DUPLICATE_WINDOW_MS + 1),
  });
  assert(
    "11. identical outside 45s counts",
    outside.status === "recorded" &&
      loadLearningProfile().totalOrderingOccasions === 2
  );

  store.clear();
  recordOrderingOccasion({ cart: twinCart, now: isoAt(0) });
  const inside = recordOrderingOccasion({
    cart: twinCart,
    now: isoAt(10000),
  });
  const boundary = recordOrderingOccasion({
    cart: twinCart,
    now: isoAt(10000 + LEARNING_DUPLICATE_WINDOW_MS),
  });
  const afterInside = loadLearningProfile();
  assert(
    "12. identical inside 45s suppressed",
    inside.status === "suppressed" &&
      boundary.status === "suppressed" &&
      afterInside.totalOrderingOccasions === 1 &&
      afterInside.products["prod-glory-16"].orderCount === 1 &&
      afterInside.recentOccasions.length === 1
  );

  store.clear();
  saveOrderHistorySnapshot({ cart: twinCart, note: "retry" });
  recordOrderingOccasion({ cart: twinCart, now: isoAt(0) });
  saveOrderHistorySnapshot({ cart: twinCart, note: "retry" });
  recordOrderingOccasion({ cart: twinCart, now: isoAt(5000) });
  assert(
    "13. history can contain 2 twins while learning contains 1",
    loadOrderHistory().length === 2 &&
      loadLearningProfile().totalOrderingOccasions === 1 &&
      store.has(ORDER_HISTORY_STORAGE_KEY) &&
      store.has(LEARNING_PROFILE_STORAGE_KEY)
  );

  const orderA = [gloryLine(1), aquaLine(2)];
  const orderB = [aquaLine(2), gloryLine(1)];
  const fingerprintA = buildOccasionFingerprint(normalizeOccasionLines(orderA));
  const fingerprintB = buildOccasionFingerprint(normalizeOccasionLines(orderB));
  store.clear();
  recordOrderingOccasion({ cart: orderA, now: isoAt(0) });
  const reordered = recordOrderingOccasion({ cart: orderB, now: isoAt(1000) });
  assert(
    "14. reordered lines same fingerprint",
    fingerprintA === fingerprintB &&
      reordered.status === "suppressed" &&
      loadLearningProfile().totalOrderingOccasions === 1
  );

  store.clear();
  recordOrderingOccasion({
    cart: [{ ...gloryLine(1), note: "antar pagi" }],
    now: isoAt(0),
  });
  const withNoteIgnored = recordOrderingOccasion({
    cart: [{ ...gloryLine(1), note: "antar sore" }],
    now: isoAt(1000),
  });
  const noteProfile = loadLearningProfile();
  const noteKeys = hasProhibitedKey(noteProfile);
  assert(
    "15. note absent/ignored",
    withNoteIgnored.status === "suppressed" &&
      noteProfile.totalOrderingOccasions === 1 &&
      noteKeys == null &&
      !Object.hasOwn(noteProfile, "note") &&
      JSON.stringify(noteProfile).includes("prod-glory-16")
  );

  store.clear();
  for (let index = 0; index < LEARNING_MAX_PRODUCT_OBSERVATIONS + 1; index += 1) {
    recordOrderingOccasion({
      cart: [gloryLine(index + 1)],
      now: isoAt(index * (LEARNING_DUPLICATE_WINDOW_MS + 1)),
    });
  }
  const twentyOneObs = loadLearningProfile();
  const gloryObs = twentyOneObs.products["prod-glory-16"];
  assert(
    "16. 21st product observation drops oldest but lifetime count = 21",
    twentyOneObs.totalOrderingOccasions === 21 &&
      gloryObs.orderCount === 21 &&
      gloryObs.recentObservations.length === LEARNING_MAX_PRODUCT_OBSERVATIONS &&
      gloryObs.recentObservations[0].quantity === 21 &&
      gloryObs.recentObservations[19].quantity === 2 &&
      !gloryObs.recentObservations.some((row) => row.quantity === 1)
  );

  store.clear();
  const firstOccasionAt = isoAt(0);
  for (let index = 0; index < LEARNING_MAX_RECENT_OCCASIONS + 1; index += 1) {
    recordOrderingOccasion({
      cart: [
        {
          productId: `prod-item-${index}`,
          unit: "Karton",
          quantity: 1,
        },
      ],
      now: isoAt(index * (LEARNING_DUPLICATE_WINDOW_MS + 1)),
    });
  }
  const twentyOneOccasions = loadLearningProfile();
  assert(
    "17. 21st recent occasion drops oldest but lifetime total = 21",
    twentyOneOccasions.totalOrderingOccasions === 21 &&
      twentyOneOccasions.recentOccasions.length === LEARNING_MAX_RECENT_OCCASIONS &&
      twentyOneOccasions.recentOccasions[0].productIds[0] === "prod-item-20" &&
      twentyOneOccasions.recentOccasions.some(
        (row) => row.productIds[0] === "prod-item-1"
      ) &&
      !twentyOneOccasions.recentOccasions.some(
        (row) => row.productIds[0] === "prod-item-0"
      ) &&
      twentyOneOccasions.recentOccasions[19].observedAt !== firstOccasionAt
  );

  store.set(LEARNING_PROFILE_STORAGE_KEY, "{not-json");
  const malformed = loadLearningProfile();
  assert(
    "18. malformed JSON → empty profile",
    malformed.totalOrderingOccasions === 0 &&
      Object.keys(malformed.products).length === 0
  );

  store.set(
    LEARNING_PROFILE_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 99,
      totalOrderingOccasions: 4,
      products: {
        "prod-glory-16": {
          productId: "prod-glory-16",
          orderCount: 4,
          lastOrderedAt: isoAt(0),
          recentObservations: [
            { unit: "Slof", quantity: 1, orderedAt: isoAt(0) },
          ],
        },
      },
    })
  );
  assert(
    "19. unsupported schema → empty profile",
    loadLearningProfile().totalOrderingOccasions === 0 &&
      sanitizeLearningProfile({ schemaVersion: 99, products: {} })
        .totalOrderingOccasions === 0
  );

  store.set(
    LEARNING_PROFILE_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      totalOrderingOccasions: 1,
      firstObservedAt: isoAt(0),
      lastObservedAt: isoAt(0),
      lastOccasion: null,
      recentOccasions: [
        { observedAt: isoAt(0), productIds: ["prod-glory-16", "prod-aqua-15l"] },
      ],
      products: {
        "prod-glory-16": {
          productId: "prod-glory-16",
          orderCount: 2,
          lastOrderedAt: isoAt(0),
          recentObservations: [
            { unit: "Slof", quantity: 1, orderedAt: isoAt(1000) },
            { unit: "Slof", quantity: 0, orderedAt: isoAt(0) },
            { quantity: 2, orderedAt: isoAt(0) },
            null,
          ],
        },
        "prod-aqua-15l": {
          productId: "prod-aqua-15l",
          orderCount: 1,
          lastOrderedAt: isoAt(0),
          recentObservations: [
            { unit: "Karton", quantity: 2, orderedAt: isoAt(0) },
          ],
        },
      },
    })
  );
  const droppedObs = loadLearningProfile();
  assert(
    "20. malformed observation drops without losing valid sibling",
    droppedObs.products["prod-glory-16"].recentObservations.length === 1 &&
      droppedObs.products["prod-glory-16"].recentObservations[0].quantity === 1 &&
      droppedObs.products["prod-aqua-15l"].recentObservations[0].quantity === 2 &&
      droppedObs.products["prod-glory-16"].orderCount === 2
  );

  store.clear();
  const skippedQty = normalizeOccasionLines([
    gloryLine(0),
    gloryLine(-2),
    gloryLine(1.5),
    gloryLine(LEARNING_MAX_QUANTITY + 1),
    gloryLine(2),
  ]);
  assert(
    "21. qty 0, negative, fractional, >9999 skipped",
    skippedQty.length === 1 &&
      skippedQty[0].quantity === 2 &&
      recordOrderingOccasion({
        cart: [gloryLine(0), gloryLine(-1), gloryLine(1.5)],
        now: isoAt(0),
      }).status === "skipped"
  );

  const skippedId = normalizeOccasionLines([
    { productId: "", unit: "Slof", quantity: 1 },
    { unit: "Slof", quantity: 1 },
    gloryLine(1),
  ]);
  assert(
    "22. missing productId skipped",
    skippedId.length === 1 && skippedId[0].productId === "prod-glory-16"
  );

  store.clear();
  const originalSetItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    throw new Error("quota");
  };
  let writeThrew = false;
  let writeResult;
  try {
    writeResult = recordOrderingOccasion({
      cart: [gloryLine(1)],
      now: isoAt(0),
    });
  } catch {
    writeThrew = true;
  }
  globalThis.localStorage.setItem = originalSetItem;
  assert(
    "23. write failure never throws",
    writeThrew === false &&
      writeResult.status === "recorded" &&
      writeResult.ok === false
  );

  store.clear();
  const retiredId = "prod-retired-item-that-is-not-in-catalogue";
  recordOrderingOccasion({
    cart: [
      {
        productId: retiredId,
        name: "Old Product Name",
        unit: "Slof Lama",
        quantity: 3,
      },
    ],
    now: isoAt(0),
  });
  const retired = loadLearningProfile();
  assert(
    "24. unknown SKU evidence retained / no catalogue dependency",
    retired.products[retiredId] != null &&
      retired.products[retiredId].recentObservations[0].unit === "Slof Lama" &&
      retired.products[retiredId].recentObservations[0].quantity === 3 &&
      !learningSource.includes("customerCatalog") &&
      !learningSource.includes("availableUnits") &&
      !learningSource.includes("productFamilies") &&
      !learningSource.includes("productDefaults") &&
      !learningSource.includes("productById")
  );

  const persisted = JSON.parse(store.get(LEARNING_PROFILE_STORAGE_KEY));
  const prohibited = hasProhibitedKey(persisted);
  const persistedGlory = persisted.products[retiredId];
  assert(
    "25. persisted JSON contains none of prohibited fields",
    prohibited == null &&
      Object.keys(persisted).join(",") ===
        "schemaVersion,totalOrderingOccasions,firstObservedAt,lastObservedAt,lastOccasion,recentOccasions,products" &&
      Object.keys(persistedGlory).join(",") ===
        "productId,orderCount,lastOrderedAt,recentObservations" &&
      Object.keys(persistedGlory.recentObservations[0]).join(",") ===
        "unit,quantity,orderedAt" &&
      Object.keys(persisted.recentOccasions[0]).join(",") ===
        "observedAt,productIds" &&
      !learningSource.includes("preferredUnit") &&
      !learningSource.includes("preferredQuantity")
  );

  store.clear();
  recordOrderingOccasion({ cart: [gloryLine(1, "Slof")], now: isoAt(0) });
  const qtyChange = recordOrderingOccasion({
    cart: [gloryLine(2, "Slof")],
    now: isoAt(10000),
  });
  const unitChange = recordOrderingOccasion({
    cart: [gloryLine(2, "Dus")],
    now: isoAt(20000),
  });
  const addedProduct = recordOrderingOccasion({
    cart: [gloryLine(2, "Dus"), aquaLine(1)],
    now: isoAt(30000),
  });
  assert(
    "26. changed quantity/unit inside 45s counts",
    qtyChange.status === "recorded" &&
      unitChange.status === "recorded" &&
      addedProduct.status === "recorded" &&
      loadLearningProfile().totalOrderingOccasions === 4
  );

  store.clear();
  recordOrderingOccasion({ cart: twinCart, now: isoAt(0) });
  const slideA = recordOrderingOccasion({
    cart: twinCart,
    now: isoAt(20000),
  });
  const slideB = recordOrderingOccasion({
    cart: twinCart,
    now: isoAt(50000),
  });
  const slideC = recordOrderingOccasion({
    cart: twinCart,
    now: isoAt(50000 + LEARNING_DUPLICATE_WINDOW_MS + 1),
  });
  const slid = loadLearningProfile();
  assert(
    "27. sliding retry suppression",
    slideA.status === "suppressed" &&
      slideB.status === "suppressed" &&
      slideC.status === "recorded" &&
      slid.totalOrderingOccasions === 2 &&
      slid.lastOccasion.observedAt === isoAt(50000 + LEARNING_DUPLICATE_WINDOW_MS + 1)
  );

  const sendStart = appSource.indexOf("const handleSendWhatsApp");
  const sendEnd = appSource.indexOf("const handleReturnFromWhatsAppHandoff");
  const sendBlock = appSource.slice(sendStart, sendEnd);
  const confirmStart = appSource.indexOf("const handleConfirmWhatsAppSent");
  const confirmEnd = appSource.indexOf("const clearDraftIfCartWillEmpty");
  const confirmBlock = appSource.slice(confirmStart, confirmEnd);
  const historyAt = sendBlock.indexOf("saveOrderHistorySnapshot({ cart, note: orderNote })");
  const learningAt = sendBlock.indexOf("recordOrderingOccasion({ cart })");
  const reloadAt = sendBlock.indexOf("setOrderHistory(loadOrderHistory())");
  const openAt = sendBlock.indexOf("openWhatsAppWithOrder(cart, orderNote)");
  assert(
    "28. App source ordering: history → learning → WhatsApp; none in confirm-sent",
    historyAt !== -1 &&
      learningAt !== -1 &&
      reloadAt !== -1 &&
      openAt !== -1 &&
      historyAt < learningAt &&
      learningAt < reloadAt &&
      reloadAt < openAt &&
      !confirmBlock.includes("recordOrderingOccasion") &&
      appSource.includes('from "./utils/learningProfileStorage"') &&
      !appSource.includes("loadLearningProfile") &&
      !appSource.includes("clearLearningProfile") &&
      !appSource.includes("sanitizeLearningProfile")
  );

  store.clear();
  recordOrderingOccasion({ cart: twinCart, now: isoAt(60_000) });
  const negativeClock = applyOrderingOccasion(loadLearningProfile(), {
    cart: twinCart,
    now: isoAt(0),
  });
  assert(
    "29. negative clock delta does not suppress",
    negativeClock.status === "recorded" &&
      negativeClock.profile.totalOrderingOccasions === 2
  );

  store.clear();
  recordOrderingOccasion({ cart: [gloryLine(1)], now: isoAt(0) });
  const cleared = clearLearningProfile();
  const afterClear = loadLearningProfile();
  assert(
    "30. clearLearningProfile works but has no UI reference",
    cleared === true &&
      afterClear.totalOrderingOccasions === 0 &&
      !store.has(LEARNING_PROFILE_STORAGE_KEY) &&
      !appSource.includes("clearLearningProfile") &&
      historySource.includes("Pesan Lagi occasion log") &&
      LEARNING_MAX_QUANTITY === 9999
  );

  console.log("");
  console.log(
    `Learning profile storage smoke: ${results.length}/${results.length} passed`
  );
} catch (error) {
  const passed = results.filter((row) => row.passed).length;
  console.error("");
  console.error(
    `Learning profile storage smoke failed after ${passed}/${results.length} checks`
  );
  console.error(error.message || error);
  process.exitCode = 1;
}
