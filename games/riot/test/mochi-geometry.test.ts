import { describe, expect, it } from "vitest";

import {
  CHARACTER_ACCESSORIES,
  MOCHI_SPECIES,
  type MochiCustomization,
} from "../shared/character";
import {
  buildAccessoryGeometry,
  buildMochiAvatar,
  getMochiParts,
} from "../client/characters/mochi";

function custom(species: (typeof MOCHI_SPECIES)[number]): MochiCustomization {
  return {
    type: "mochi",
    species,
    bodyColorIndex: 1,
    accentColorIndex: 2,
    accessory: null,
  };
}

describe("geometri Mochi prosedural (RT-40)", () => {
  it("setiap spesies menghasilkan geometri tubuh, aksen, detail, dan wajah", async () => {
    for (const species of MOCHI_SPECIES) {
      const parts = await getMochiParts(species);
      for (const name of ["body", "accent", "detail", "face"] as const) {
        const geom = parts[name];
        expect(geom, `${species}.${name}`).not.toBeNull();
        expect(geom!.getAttribute("position").count).toBeGreaterThan(0);
      }
    }
  });

  it("setiap aksesori menghasilkan geometri", async () => {
    for (const accessory of CHARACTER_ACCESSORIES) {
      const geom = await buildAccessoryGeometry(accessory);
      expect(geom, accessory).not.toBeNull();
      expect(geom!.getAttribute("position").count).toBeGreaterThan(0);
    }
  });

  it("avatar grup berisi mesh untuk semua bagian + aksesori", async () => {
    const avatar = await buildMochiAvatar({
      ...custom("moth"),
      accessory: "space_helmet",
    });
    expect(avatar.children.length).toBe(5); // body, accent, detail, face, accessory
  });

  it("avatar hantu tetap dapat dibangun", async () => {
    const avatar = await buildMochiAvatar(custom("crab"), { ghost: true });
    expect(avatar.children.length).toBe(4);
  });
});
