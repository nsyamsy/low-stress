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
  });

  it("loads client lazily", async () => {
    expect(typeof manifest.client).toBe("function");
    const clientModule = await manifest.client();
    expect(clientModule).toBeDefined();
    expect(clientModule.default).toBeDefined();
  });
});
