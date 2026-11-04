import { describe, expect, it } from "vitest";
import {
  BUILTIN_BANNED_WORDS_EN,
  BUILTIN_BANNED_WORDS_ID,
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
    expect(canonicalize("k0nt0l")).toBe("kontol");
    expect(canonicalize("b.a.n.g.s.a.t")).toBe("bangsat");
  });
});

describe("censorProfanity", () => {
  it("menyensor kata kasar dengan panjang sama", () => {
    expect(censorProfanity("dasar b@ng$at kamu")).toBe("dasar ******* kamu");
    expect(censorProfanity("aanjiing")).toBe("********");
    expect(censorProfanity("b.a.n.g.s.a.t")).toBe("*************");
    expect(censorProfanity("b a n g s a t")).toBe("*************");
  });

  it("menyensor kata kasar bahasa Indonesia dan English", () => {
    expect(censorProfanity("kamu tolol dan bego")).toBe("kamu ***** dan ****");
    expect(censorProfanity("what the fuck is this shit")).toBe(
      "what the **** is this ****",
    );
    expect(censorProfanity("dasar bajingan")).toBe("dasar ********");
  });

  it("tidak menyensor kata wajar yang mirip (anti-salah-sensor)", () => {
    expect(censorProfanity("analisis class document")).toBe(
      "analisis class document",
    );
    expect(censorProfanity("santai di pantai melihat teratai")).toBe(
      "santai di pantai melihat teratai",
    );
    expect(censorProfanity("masuk tepat pada detik dan titik akhir")).toBe(
      "masuk tepat pada detik dan titik akhir",
    );
    expect(censorProfanity("asumsi kita tentang compass dan glass")).toBe(
      "asumsi kita tentang compass dan glass",
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

  it("memiliki daftar bawaan bahasa Indonesia dan English yang lengkap", () => {
    expect(BUILTIN_BANNED_WORDS_ID.length).toBeGreaterThan(20);
    expect(BUILTIN_BANNED_WORDS_EN.length).toBeGreaterThan(20);
    expect(BUILTIN_BANNED_WORDS_ID).toContain("bangsat");
    expect(BUILTIN_BANNED_WORDS_EN).toContain("fuck");
  });
});

describe("containsProfanity", () => {
  it("mendeteksi kata kasar", () => {
    expect(containsProfanity("hello shit world")).toBe(true);
    expect(containsProfanity("b@ng$at lu")).toBe(true);
    expect(containsProfanity("b a n g s a t")).toBe(true);
    expect(containsProfanity("hello world")).toBe(false);
    expect(containsProfanity("analisis data santai")).toBe(false);
  });
});
