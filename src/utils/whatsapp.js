import { WHATSAPP_DESTINATION_NUMBER } from "../config/whatsappDestination.js";

function lowercaseFirstCharacter(value) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function formatOrderLine(item) {
  const unit = lowercaseFirstCharacter(item.unit);
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

export function openWhatsAppWithOrder(cart, note = "") {
  if (!cart.length) {
    return;
  }

  try {
    const message = buildWhatsAppMessage(cart, note);
    const url = buildWhatsAppUrl(message);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // Popup blocked or unavailable — cart and note stay unchanged.
  }
}
