import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      // Allow shared/ files outside web/ to resolve preact from web/node_modules
      "preact": path.resolve(__dirname, "node_modules/preact"),
      "preact/hooks": path.resolve(__dirname, "node_modules/preact/hooks"),
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": "http://localhost:8080",
      "/auth": "http://localhost:8080",
      "/health": "http://localhost:8080",
      "/debug": "http://localhost:8080",
      "/admin": "http://localhost:8080",
    },
  },
});
