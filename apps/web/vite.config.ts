import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      // Node-only engine parts are never reached in the browser build.
      "node:vm": "/src/shims/empty.ts",
    },
  },
  define: { "process.env": {} },
  build: { outDir: "dist", chunkSizeWarningLimit: 2000 },
});
