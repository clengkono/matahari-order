/**
 * Local Matahari Studio health probes.
 * Fingerprints 127.0.0.1:5173 and 127.0.0.1:8787 without killing processes.
 */

export const STUDIO_HOST = "127.0.0.1";
export const FRONTEND_PORT = 5173;
export const API_PORT = 8787;
export const STUDIO_URL = `http://${STUDIO_HOST}:${FRONTEND_PORT}/studio`;
export const FRONTEND_URL = `http://${STUDIO_HOST}:${FRONTEND_PORT}/`;
export const API_HEALTH_URL = `http://${STUDIO_HOST}:${API_PORT}/api/studio/health`;

export function looksLikeStudioApi(status, body) {
  if (status !== 200) {
    return false;
  }

  let json = body;
  if (typeof body === "string") {
    try {
      json = JSON.parse(body);
    } catch {
      return false;
    }
  }

  if (!json || json.ok !== true) {
    return false;
  }

  if (json.service === "matahari-studio") {
    return true;
  }

  return typeof json.warning === "string" && json.warning.includes("LOCAL ONLY");
}

export function looksLikeStudioFrontend(status, body) {
  if (status !== 200 || typeof body !== "string") {
    return false;
  }

  const lower = body.toLowerCase();
  const hasRoot = lower.includes('id="root"') || lower.includes("id='root'");
  const hasMatahariHint =
    lower.includes("matahari") ||
    lower.includes("/src/main.jsx") ||
    lower.includes("vite");

  return hasRoot && hasMatahariHint;
}

export function friendlyProbeError(kind, port, url) {
  if (kind === "connection-refused") {
    return `Nothing is answering on port ${port} (${url}).`;
  }
  if (kind === "timeout") {
    return `Port ${port} did not respond in time (${url}). Another program may be stuck there.`;
  }
  return `Could not reach ${url}.`;
}

export async function probeUrl(url, { timeoutMs = 1500 } = {}) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
      cache: "no-store",
    });
    const text = await response.text();
    return {
      reachable: true,
      status: response.status,
      body: text,
      error: null,
    };
  } catch (error) {
    const nestedCode = error.cause && error.cause.code;
    const code = nestedCode || error.code;
    let kind = "network";
    if (code === "ECONNREFUSED") {
      kind = "connection-refused";
    } else if (
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      kind = "timeout";
    }

    return {
      reachable: false,
      status: 0,
      body: "",
      error: kind,
    };
  }
}

function classifyProbe(probe, looksLike) {
  if (!probe.reachable) {
    return probe.error === "connection-refused" ? "closed" : "pending";
  }
  return looksLike(probe.status, probe.body) ? "matahari" : "foreign";
}

function classifyApi(probe) {
  return classifyProbe(probe, looksLikeStudioApi);
}

function classifyFrontend(probe) {
  return classifyProbe(probe, looksLikeStudioFrontend);
}

export async function inspectStudioPorts(options = {}) {
  const timeoutMs = options.timeoutMs ?? 1500;
  const [apiProbe, studioProbe, rootProbe] = await Promise.all([
    probeUrl(API_HEALTH_URL, { timeoutMs }),
    probeUrl(STUDIO_URL, { timeoutMs }),
    probeUrl(FRONTEND_URL, { timeoutMs }),
  ]);

  let frontendProbe = studioProbe;
  let frontend = classifyFrontend(studioProbe);
  if (frontend !== "matahari" && frontend !== "foreign") {
    frontendProbe = rootProbe;
    frontend = classifyFrontend(rootProbe);
  }

  return {
    api: classifyApi(apiProbe),
    frontend,
    apiProbe,
    frontendProbe,
  };
}

export function formatReadyBanner() {
  return [
    "Matahari Studio",
    "✓ Customer/Studio frontend ready",
    "✓ Catalogue service ready",
    "Opening Studio...",
  ].join("\n");
}

export function explainApiFailure(inspect) {
  const lines = [
    "✗ Catalogue service is not ready",
    friendlyProbeError(
      inspect.apiProbe?.error || "network",
      API_PORT,
      API_HEALTH_URL
    ),
    "",
    "Likely causes:",
    "• Start Matahari Studio was not used, or it is still starting",
    "• Another program is using port 8787",
    "• Node could not start the local catalogue service",
  ];
  return lines.join("\n");
}

export function explainFrontendFailure(inspect) {
  const lines = [
    "✗ Customer/Studio frontend is not ready",
    friendlyProbeError(
      inspect.frontendProbe?.error || "network",
      FRONTEND_PORT,
      STUDIO_URL
    ),
    "",
    "Likely causes:",
    "• Vite did not finish starting",
    "• Another program is using port 5173",
    "• Project libraries are missing (run npm install in this folder)",
  ];
  return lines.join("\n");
}

export function explainForeignPort(port, role) {
  return [
    `Port ${port} is already in use, but it does not look like Matahari ${role}.`,
    "Close that other program, then try Start Matahari Studio again.",
    "This launcher will not stop unknown programs.",
  ].join("\n");
}
