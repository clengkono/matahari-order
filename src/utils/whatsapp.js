import { WHATSAPP_DESTINATION_NUMBER } from "../config/whatsappDestination.js";
import { lowercaseUnitLabel } from "./unitDisplay.js";

export function formatOrderLine(item) {
  const unit = lowercaseUnitLabel(item.unit);
  return `☐ ${item.quantity} ${unit} ${item.name}`;
}

export function formatOrderNote(note) {
  const trimmedNote = note?.trim() ?? "";

  if (!trimmedNote) {
    return "";
  }

  return `\n\nCatatan:\n${trimmedNote}`;
}

export function buildWhatsAppMessage(cart, note = "") {
  if (!cart.length) {
    return "";
  }

  const lines = cart.map(formatOrderLine).join("\n");
  return `${lines}${formatOrderNote(note)}`;
}

export function buildWhatsAppUrl(message) {
  const encodedMessage = encodeURIComponent(message);
  const destinationNumber = WHATSAPP_DESTINATION_NUMBER.trim();

  if (destinationNumber) {
    return `https://wa.me/${destinationNumber}?text=${encodedMessage}`;
  }

  return `https://wa.me/?text=${encodedMessage}`;
}

/**
 * Open WhatsApp with the current order.
 *
 * Success: window.open returns a Window without throwing.
 * Failure: empty cart, thrown error, or a null return (typically popup blocked).
 *
 * Limitation: some mobile browsers return null even when WhatsApp opens,
 * or return a Window when the handoff later fails. The app cannot know
 * whether the customer actually sent the message.
 *
 * @returns {{ ok: boolean, reason?: "empty" | "blocked" | "error" }}
 */
export function openWhatsAppWithOrder(cart, note = "") {
  if (!cart.length) {
    return { ok: false, reason: "empty" };
  }

  try {
    const message = buildWhatsAppMessage(cart, note);
    const url = buildWhatsAppUrl(message);
    const openedWindow = window.open(url, "_blank");

    if (openedWindow == null) {
      return { ok: false, reason: "blocked" };
    }

    try {
      openedWindow.opener = null;
    } catch {
      // Cross-origin or browser restriction — ignore.
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
