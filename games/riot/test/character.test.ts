import { describe, expect, it } from "vitest";

import {
  CHARACTER_ACCESSORIES,
  DEFAULT_MOCHI_CUSTOMIZATION,
  MOCHI_ACCENT_COLORS,
  MOCHI_BODY_COLORS,
  MOCHI_SPECIES,
  mochiAccentColor,
  mochiBodyColor,
  sanitizeCharacterCustomization,
} from "../shared/character";

describe("skema kustomisasi karakter (RT-40/RT-41)", () => {
  it("memiliki 6 spesies Mochi orisinal", () => {
    expect(MOCHI_SPECIES).toHaveLength(6);
    expect(new Set(MOCHI_SPECIES).size).toBe(6);
  });

  it("memiliki 12 warna badan dan 8 warna aksen", () => {
    expect(MOCHI_BODY_COLORS).toHaveLength(12);
    expect(MOCHI_ACCENT_COLORS).toHaveLength(8);
    for (const c of [...MOCHI_BODY_COLORS, ...MOCHI_ACCENT_COLORS]) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });

  it("memiliki 8 aksesori termasuk helm dan topi luar angkasa", () => {
    expect(CHARACTER_ACCESSORIES).toHaveLength(8);
    expect(CHARACTER_ACCESSORIES).toContain("space_helmet");
    expect(CHARACTER_ACCESSORIES).toContain("space_hat");
  });

  it("sanitize mengembalikan bawaan untuk input rusak", () => {
    for (const raw of [null, undefined, "x", 42, [], {}]) {
      const res = sanitizeCharacterCustomization(raw);
      expect(res).toEqual(DEFAULT_MOCHI_CUSTOMIZATION);
    }
  });

  it("sanitize menjepit index warna dan mengabaikan nilai asing", () => {
    const res = sanitizeCharacterCustomization({
      type: "mochi",
      species: "crab",
      bodyColorIndex: 999,
      accentColorIndex: -5,
      accessory: "bukan-aksesori",
    });
    expect(res).toMatchObject({
      type: "mochi",
      species: "crab",
      bodyColorIndex: MOCHI_BODY_COLORS.length - 1,
      accentColorIndex: 0,
      accessory: null,
    });
  });

  it("sanitize menolak spesies tidak dikenal", () => {
    const res = sanitizeCharacterCustomization({ type: "mochi", species: "amongus" });
    expect(res.type === "mochi" && res.species).toBe("orb");
  });

  it("sanitize humanoid menjepit palet dan memvalidasi varian tubuh", () => {
    const res = sanitizeCharacterCustomization({
      type: "humanoid",
      bodyVariant: "Character-Male-A!!",
      paletteIndex: 42,
      accessory: "goggles",
    });
    expect(res).toEqual({
      type: "humanoid",
      bodyVariant: "character-male-a",
      paletteIndex: 7,
      accessory: "goggles",
    });
  });

  it("warna turunan selalu berada dalam palet", () => {
    const custom = sanitizeCharacterCustomization({
      bodyColorIndex: 3,
      accentColorIndex: 2,
    });
    if (custom.type !== "mochi") throw new Error("unexpected");
    expect(mochiBodyColor(custom)).toBe(MOCHI_BODY_COLORS[3]);
    expect(mochiAccentColor(custom)).toBe(MOCHI_ACCENT_COLORS[2]);
  });
});
