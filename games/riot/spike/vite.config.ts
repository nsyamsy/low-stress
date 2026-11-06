import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: resolve(import.meta.dirname),
  publicDir: resolve(import.meta.dirname, "public"),
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
  },
});
