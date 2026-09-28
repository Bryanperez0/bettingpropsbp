/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `netlify dev` serves functions on 8888 and proxies Vite. Plain `vite` has no API.
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
