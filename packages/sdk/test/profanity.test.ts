import { describe, expect, it } from "vitest";
import {
  canonicalize,
  censorProfanity,
  containsProfanity,
  normalizeProfanityText,
} from "../src/profanity";

describe("normalisasi sensor", () => {
  it("menghapus aksen, simbol, leet, dan huruf berulang", () => {
    expect(canonicalize("B@ng$at")).toBe("bangsat");
    expect(canonicalize("aanjiing")).toBe("anjing");
    expect(canonicalize("  A N J I N G  ")).toBe("anjing");
    expect(normalizeProfanityText("FüCk")).toBe("fuck");
  });
});

describe("censorProfanity", () => {
  it("menyensor kata kasar dengan panjang sama", () => {
    expect(censorProfanity("dasar b@ng$at kamu")).toBe("dasar ******* kamu");
    expect(censorProfanity("aanjiing")).toBe("********");
  });

  it("tidak menyensor kata wajar yang mirip", () => {
    expect(censorProfanity("analisis class document")).toBe(
      "analisis class document",
    );
  });

  it("menghormati daftar kata tambahan dan pengecualian", () => {
    expect(censorProfanity("kata terlarang", { extraWords: ["terlarang"] })).toBe(
      "kata *********",
    );
    expect(
      censorProfanity("anjing", { allowWords: ["anjing"] }),
    ).toBe("anjing");
  });
});

describe("containsProfanity", () => {
  it("mendeteksi kata kasar", () => {
    expect(containsProfanity("hello shit world")).toBe(true);
    expect(containsProfanity("hello world")).toBe(false);
  });
});
