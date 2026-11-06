import { describe, expect, it } from "vitest";
import { manifest } from "../manifest";

describe("RT-10: Riot Game Manifest & Scaffolding", () => {
  it("has valid multiplayer manifest with required permissions", () => {
    expect(manifest.id).toBe("riot");
    expect(manifest.mode).toBe("multiplayer");
    expect(manifest.mobile.supported).toBe(true);
    expect(manifest.permissions).toContain("scores");
    expect(manifest.permissions).toContain("realtime");
    expect(manifest.permissions).toContain("db");

    // Public title check (owner decision 2026-11-06: no "Riot" in player-facing text)
    expect(manifest.title.id).toBe("Gaduh di Stasiun Hening");
    expect(manifest.title.en).toBe("Uproar on the Silent Station");
    expect(manifest.title.id).not.toMatch(/riot/i);
    expect(manifest.title.en).not.toMatch(/riot/i);
    expect(manifest.description.id).not.toMatch(/riot/i);
    expect(manifest.description.en).not.toMatch(/riot/i);
  });

  it("loads client lazily", async () => {
    expect(typeof manifest.client).toBe("function");
    const clientModule = await manifest.client();
    expect(clientModule).toBeDefined();
    expect(clientModule.default).toBeDefined();
  });
});
