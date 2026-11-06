import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createGame } from "../src/index";

const ROOT = resolve(import.meta.dirname, "../../..");
const DEMO_DIR = join(ROOT, "games", "test-demo-r3f");

describe("RT-04: new-game generator with --engine r3f", () => {
  it("generates a new game with r3f engine template and dependencies", () => {
    // Clean up if exists
    if (existsSync(DEMO_DIR)) {
      rmSync(DEMO_DIR, { recursive: true, force: true });
    }

    try {
      createGame({ slug: "test-demo-r3f", engine: "r3f" });

      expect(existsSync(DEMO_DIR)).toBe(true);
      expect(existsSync(join(DEMO_DIR, "manifest.ts"))).toBe(true);
      expect(existsSync(join(DEMO_DIR, "client", "index.tsx"))).toBe(true);

      const pkg = JSON.parse(readFileSync(join(DEMO_DIR, "package.json"), "utf8"));
      expect(pkg.dependencies.three).toBeDefined();
      expect(pkg.devDependencies["@types/three"]).toBeDefined();

      const clientContent = readFileSync(join(DEMO_DIR, "client", "index.tsx"), "utf8");
      expect(clientContent).toContain('import("three")');
    } finally {
      if (existsSync(DEMO_DIR)) {
        rmSync(DEMO_DIR, { recursive: true, force: true });
      }
    }
  });
});
