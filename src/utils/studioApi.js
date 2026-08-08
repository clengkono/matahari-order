const STUDIO_API = "/api/studio";

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }
  return data;
}

export async function fetchCigaretteCatalogue() {
  const response = await fetch(`${STUDIO_API}/cigarettes`, {
    cache: "no-store",
  });
  return parseJson(response);
}

export async function assignProductImage({
  productId,
  mimeType,
  base64Data,
  replaceConfirmed = false,
}) {
  const response = await fetch(
    `${STUDIO_API}/cigarettes/${encodeURIComponent(productId)}/image`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mimeType,
        data: base64Data,
        replaceConfirmed,
      }),
    }
  );
  return parseJson(response);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) {
    return "No file selected.";
  }

  if (typeof file.type === "string" && file.type && !ACCEPTED_MIME.has(file.type)) {
    return "Unsupported file type. Use JPEG, PNG, or WebP.";
  }

  if (file.size > MAX_BYTES) {
    return "File exceeds 15 MB limit.";
  }

  // Clipboard or odd browsers may omit type — allow by extension as a soft check.
  if (!file.type) {
    const name = (file.name || "").toLowerCase();
    const okExt =
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png") ||
      name.endsWith(".webp");
    if (name && !okExt) {
      return "Unsupported file type. Use JPEG, PNG, or WebP.";
    }
  }

  return null;
}

export function mimeFromFile(file) {
  if (file?.type && ACCEPTED_MIME.has(file.type)) {
    return file.type;
  }

  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return file?.type || "image/jpeg";
}

export async function clipboardImageFile(clipboardData) {
  if (!clipboardData) {
    return null;
  }

  const items = clipboardData.items;
  if (items) {
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          return file;
        }
      }
    }
  }

  const files = clipboardData.files;
  if (files) {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        return file;
      }
    }
  }

  return null;
}
