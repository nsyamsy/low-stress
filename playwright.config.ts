import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

function resolveExistingChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const msPlaywright = join(localAppData, "ms-playwright");
    if (existsSync(msPlaywright)) {
      const dirs = readdirSync(msPlaywright)
        .filter((d) => d.startsWith("chromium-"))
        .sort()
        .reverse();
      for (const d of dirs) {
        const winExe = join(msPlaywright, d, "chrome-win64", "chrome.exe");
        if (existsSync(winExe)) return winExe;
        const win32Exe = join(msPlaywright, d, "chrome-win", "chrome.exe");
        if (existsSync(win32Exe)) return win32Exe;
      }
    }
  }
  return undefined;
}

const executablePath = resolveExistingChromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    trace: "off",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: "pnpm --filter @low-stress/server exec tsx ../../e2e/server.ts",
    url: "http://localhost:4173/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
