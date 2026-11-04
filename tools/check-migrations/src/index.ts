import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface MigrationProblem {
  file: string;
  table?: string;
  message: string;
}

const CREATE_TABLE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.]+))/gi;

/** Ambil nama tabel dari pernyataan CREATE TABLE di satu berkas SQL. */
export function extractTableNames(sql: string): string[] {
  const names: string[] = [];
  // Buang komentar baris agar contoh di komentar tidak ikut terbaca.
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  for (const match of withoutComments.matchAll(CREATE_TABLE)) {
    const raw = match[1] ?? match[2] ?? match[3];
    if (!raw) continue;
    const name = raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : raw;
    names.push(name.replace(/^"|"$/g, ""));
  }
  return names;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function sqlFiles(dir: string): string[] {
  if (!isDirectory(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...sqlFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      result.push(path);
    }
  }
  return result;
}

/**
 * Periksa bahwa setiap tabel yang dibuat migrasi sebuah game berawalan
 * `<gameId>_`. Nama tabel inti tidak diperiksa di sini.
 */
export function checkGameMigrations(
  root: string,
  gameId: string,
): MigrationProblem[] {
  const problems: MigrationProblem[] = [];
  const dbDir = join(root, "games", gameId, "db");
  const prefix = `${gameId}_`;

  for (const file of sqlFiles(dbDir)) {
    const sql = readFileSync(file, "utf8");
    for (const table of extractTableNames(sql)) {
      if (!table.startsWith(prefix)) {
        problems.push({
          file: relative(root, file),
          table,
          message: `${relative(root, file)}: tabel "${table}" harus berawalan "${prefix}"`,
        });
      }
    }
  }

  return problems;
}

export function checkRoot(root: string): MigrationProblem[] {
  const gamesDir = join(root, "games");
  if (!isDirectory(gamesDir)) return [];

  const problems: MigrationProblem[] = [];
  for (const gameId of readdirSync(gamesDir)) {
    if (!isDirectory(join(gamesDir, gameId))) continue;
    problems.push(...checkGameMigrations(root, gameId));
  }
  return problems;
}

export function runCheck(root: string): number {
  const problems = checkRoot(root);
  if (problems.length === 0) {
    console.log("migrations: semua tabel game memakai awalan yang benar.");
    return 0;
  }
  console.error(`migrations: ditemukan ${problems.length} masalah.`);
  for (const problem of problems) console.error(`- ${problem.message}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith(join("check-migrations", "src", "index.ts"));

if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? process.cwd());
  process.exitCode = runCheck(root);
}
