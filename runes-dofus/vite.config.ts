import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const ocrServer = process.env.OCR_SERVER ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  // The Python OCR server owns /api; in dev, forward it so captures and OCR keep working.
  // changeOrigin sets the Host header the server checks before handing out ShareX captures.
  server: { proxy: { "/api": { target: ocrServer, changeOrigin: true } } },
  test: { environment: "node" },
});
