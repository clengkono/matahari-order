import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { buildCustomerCatalog } from "./scripts/buildCustomerCatalog.js";
import {
  STUDIO_TRASH_WATCH_GLOBS,
  isStudioTrashRequestUrl,
  shouldIgnoreStudioWatchPath,
} from "./scripts/viteStudioIgnore.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

function customerCatalogPlugin() {
  return {
    name: "matahari-customer-catalog",
    buildStart() {
      const result = buildCustomerCatalog();
      if (!result.ok) {
        const details = Array.isArray(result.validationErrors)
          ? `\n${result.validationErrors.slice(0, 20).join("\n")}`
          : "";
        throw new Error(
          `${result.error || "Customer catalogue build failed."}${details}`
        );
      }
    },
  };
}

function denyStudioTrashPlugin() {
  function deny(req, res, next) {
    if (isStudioTrashRequestUrl(req.url || "")) {
      res.statusCode = 404;
      res.end("Not found.");
      return;
    }
    next();
  }

  return {
    name: "matahari-deny-studio-trash",
    configureServer(server) {
      server.middlewares.use(deny);
    },
    configurePreviewServer(server) {
      server.middlewares.use(deny);
    },
    closeBundle() {
      const trashInDist = join(ROOT, "dist", "product-images", ".trash");
      if (existsSync(trashInDist)) {
        rmSync(trashInDist, { recursive: true, force: true });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), customerCatalogPlugin(), denyStudioTrashPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        ...STUDIO_TRASH_WATCH_GLOBS,
        shouldIgnoreStudioWatchPath,
      ],
    },
    proxy: {
      "/api/studio": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
