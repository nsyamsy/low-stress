import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRoot, flattenKeys } from "../src/index";

const roots: string[] = [];

function fixture(id: unknown, en: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "ls-i18n-"));
  roots.push(root);
  const dir = join(root, "packages", "i18n", "src", "locales", "common");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "id.json"), JSON.stringify(id));
  writeFileSync(join(dir, "en.json"), JSON.stringify(en));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("flattenKeys", () => {
  it("membuat kunci bertitik", () => {
    expect(flattenKeys({ a: { b: "x" }, c: "y" })).toEqual(["a.b", "c"]);
  });
});

describe("checkRoot", () => {
  it("lolos bila kunci id dan en identik", () => {
    const root = fixture({ a: { b: "Satu" } }, { a: { b: "One" } });
    expect(checkRoot(root)).toEqual([]);
  });

  it("gagal bila kunci hanya ada di id", () => {
    const root = fixture({ a: "Satu", b: "Dua" }, { a: "One" });
    const problems = checkRoot(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.key).toBe("b");
  });

  it("gagal bila kunci hanya ada di en", () => {
    const root = fixture({ a: "Satu" }, { a: "One", c: "Three" });
    expect(checkRoot(root).some((problem) => problem.key === "c")).toBe(true);
  });

  it("gagal bila berkas bahasa hilang", () => {
    const root = mkdtempSync(join(tmpdir(), "ls-i18n-"));
    roots.push(root);
    const dir = join(root, "packages", "i18n", "src", "locales", "common");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "id.json"), JSON.stringify({ a: "Satu" }));
    expect(checkRoot(root).some((problem) => problem.kind === "missing")).toBe(
      true,
    );
  });
});
