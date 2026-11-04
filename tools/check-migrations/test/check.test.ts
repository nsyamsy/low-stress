import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkRoot, extractTableNames } from "../src/index";

const tempDirs: string[] = [];

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "low-stress-migrations-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("extractTableNames", () => {
  it("reads plain, quoted, and schema-qualified table names", () => {
    const sql = `
      CREATE TABLE demo_scores (id int);
      create table if not exists "demo_players" (id int);
      CREATE TABLE public.demo_runs (id int);
    `;
    expect(extractTableNames(sql)).toEqual(["demo_scores", "demo_players", "demo_runs"]);
  });

  it("ignores commented-out statements", () => {
    expect(extractTableNames("-- CREATE TABLE other_scores (id int);")).toEqual([]);
  });
});

describe("checkRoot", () => {
  it("accepts game tables with the game prefix", () => {
    const root = makeRoot();
    const dbDir = join(root, "games", "demo", "db");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "0000_init.sql"), "CREATE TABLE demo_scores (id int);");

    expect(checkRoot(root)).toEqual([]);
  });

  it("rejects game tables without the game prefix", () => {
    const root = makeRoot();
    const dbDir = join(root, "games", "demo", "db");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "0000_init.sql"), "CREATE TABLE scores (id int);");

    const problems = checkRoot(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.table).toBe("scores");
  });
});
