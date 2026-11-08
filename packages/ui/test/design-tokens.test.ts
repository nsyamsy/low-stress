import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cn } from "../src/lib/cn";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function blockAfter(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Selektor tidak ditemukan: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function declarationNames(block: string): string[] {
  return block
    .split(";")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("--"))
    .map((line) => line.slice(0, line.indexOf(":")));
}

describe("cn", () => {
  it("menggabungkan kelas yang terisi", () => {
    expect(cn("ls-button", "ls-button--primary")).toBe(
      "ls-button ls-button--primary",
    );
  });

  it("membuang nilai kosong tanpa menyisakan spasi ganda", () => {
    expect(cn("ls-row", false, null, undefined, "ls-stack")).toBe(
      "ls-row ls-stack",
    );
  });

  it("mengembalikan string kosong bila tidak ada kelas", () => {
    expect(cn()).toBe("");
  });
});

describe("token desain", () => {
  it("mendefinisikan token warna yang sama pada mode terang dan gelap", () => {
    const light = declarationNames(blockAfter('data-theme="light"'));
    const dark = declarationNames(blockAfter('data-theme="dark"'));
    const colorPrefixes = [
      "--bg-",
      "--text-",
      "--border",
      "--primary",
      "--accent",
      "--success-",
      "--warning-",
      "--danger-",
      "--focus-ring",
    ];
    const colorTokens = (names: string[]) =>
      names.filter((name) =>
        colorPrefixes.some((prefix) => name.startsWith(prefix)),
      );

    const missing = colorTokens(light).filter(
      (token) => !colorTokens(dark).includes(token),
    );

    expect(colorTokens(light).length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("menghormati prefers-reduced-motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("memuat font dari aset lokal, bukan domain eksternal", () => {
    expect(css).toContain('src: url("/fonts/nunito-latin-variable.woff2")');
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("menjaga target ketuk minimal 44px", () => {
    const value = /--tap-min:\s*(\d+)px/.exec(css)?.[1];
    expect(Number(value)).toBeGreaterThanOrEqual(44);
  });

  it("tidak merujuk variabel CSS yang belum didefinisikan di :root", () => {
    const defined = new Set(declarationNames(blockAfter('data-theme="light"')));
    const used = Array.from(css.matchAll(/var\((--[a-z0-9-]+)\)/g)).map(
      (m) => m[1]!,
    );
    const undefinedVars = Array.from(new Set(used)).filter(
      (v) => !defined.has(v),
    );
    expect(undefinedVars).toEqual([]);
  });

  it("membatasi tinggi kanvas Flappy Bird di mobile agar pas tanpa scroll (T-18)", () => {
    const flappyCanvasBlock = blockAfter(".ls-flappy-canvas");
    expect(flappyCanvasBlock).toContain("max-height: calc(100dvh - 210px)");
    expect(flappyCanvasBlock).toContain("width: auto");
    expect(flappyCanvasBlock).toContain("margin: 0 auto");
  });

  it("memakai kontras WCAG AA pada .ls-admin-badge (T-11)", () => {
    const badgeBlock = blockAfter(".ls-admin-badge {");
    expect(badgeBlock).toContain("var(--accent-subtle)");
    expect(badgeBlock).toContain("var(--accent-text)");
  });
});
