import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Klien Riot memuat React + socket.io-client + grafik Three.js secara
    // lazy; transform vite-node-nya bisa melewati 5 detik di mesin lambat.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
