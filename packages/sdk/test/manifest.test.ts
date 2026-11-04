import { describe, expect, it } from "vitest";
import {
  assertGameManifest,
  isGameId,
  type GameManifest,
} from "../src/manifest";

const base: GameManifest = {
  id: "demo",
  version: "0.1.0",
  title: { id: "Demo", en: "Demo" },
  description: { id: "Contoh", en: "Example" },
  icon: "icon.svg",
  mode: "solo",
  mobile: { supported: true, orientation: "portrait" },
  client: async () => ({ default: () => null }),
};

describe("isGameId", () => {
  it("menerima slug yang sah", () => {
    expect(isGameId("flappy-bird")).toBe(true);
    expect(isGameId("demo2")).toBe(true);
  });

  it("menolak slug yang tidak sah", () => {
    expect(isGameId("Demo")).toBe(false);
    expect(isGameId("-demo")).toBe(false);
    expect(isGameId("demo_game")).toBe(false);
    expect(isGameId("")).toBe(false);
  });
});

describe("assertGameManifest", () => {
  it("meloloskan manifest lengkap", () => {
    expect(() => assertGameManifest(base)).not.toThrow();
  });

  it("menolak manifest tanpa id valid", () => {
    expect(() => assertGameManifest({ ...base, id: "Bad Id" })).toThrow(
      /id game tidak valid/,
    );
  });

  it("menolak manifest tanpa client lazy", () => {
    expect(() =>
      assertGameManifest({ ...base, client: undefined }),
    ).toThrow(/client/);
  });

  it("menolak arah skor yang tidak dikenal", () => {
    expect(() =>
      assertGameManifest({
        ...base,
        scoring: { direction: "sideways" },
      }),
    ).toThrow(/scoring.direction/);
  });
});
