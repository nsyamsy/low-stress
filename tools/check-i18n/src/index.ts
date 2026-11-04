import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface NamespaceFiles {
  /** Nama namespace, mis. `common` atau `game.demo`. */
  namespace: string;
  idPath: string;
  enPath: string;
}

export interface LocaleProblem {
  namespace: string;
  kind: "missing" | "extra" | "invalid" | "no-files";
  key?: string;
  message: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function flattenKeys(
  value: unknown,
  prefix = "",
  out: string[] = [],
): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) out.push(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      flattenKeys(child, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function localeDirFiles(dir: string): { id?: string; en?: string } {
  if (!isDirectory(dir)) return {};
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  return {
    id: files.includes("id.json") ? join(dir, "id.json") : undefined,
    en: files.includes("en.json") ? join(dir, "en.json") : undefined,
  };
}

/** Kumpulkan semua namespace yang seharusnya punya pasangan id/en. */
export function collectNamespaces(root: string): NamespaceFiles[] {
  const result: NamespaceFiles[] = [];

  const coreLocales = join(root, "packages", "i18n", "src", "locales");
  if (isDirectory(coreLocales)) {
    for (const namespace of readdirSync(coreLocales)) {
      const files = localeDirFiles(join(coreLocales, namespace));
      result.push({
        namespace,
        idPath: files.id ?? join(coreLocales, namespace, "id.json"),
        enPath: files.en ?? join(coreLocales, namespace, "en.json"),
      });
    }
  }

  const gamesDir = join(root, "games");
  if (isDirectory(gamesDir)) {
    for (const game of readdirSync(gamesDir)) {
      const locales = join(gamesDir, game, "locales");
      if (!isDirectory(locales)) continue;
      const files = localeDirFiles(locales);
      result.push({
        namespace: `game.${game}`,
        idPath: files.id ?? join(locales, "id.json"),
        enPath: files.en ?? join(locales, "en.json"),
      });
    }
  }

  return result;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function checkRoot(root: string): LocaleProblem[] {
  const problems: LocaleProblem[] = [];

  for (const entry of collectNamespaces(root)) {
    const label = `${entry.namespace} (${relative(root, entry.idPath)})`;
    let idKeys: string[];
    let enKeys: string[];

    try {
      idKeys = flattenKeys(readJson(entry.idPath)).sort();
    } catch (error) {
      problems.push({
        namespace: entry.namespace,
        kind: "missing",
        message: `${label}: id.json tidak ada atau bukan JSON valid (${String(error)})`,
      });
      continue;
    }

    try {
      enKeys = flattenKeys(readJson(entry.enPath)).sort();
    } catch (error) {
      problems.push({
        namespace: entry.namespace,
        kind: "missing",
        message: `${label}: en.json tidak ada atau bukan JSON valid (${String(error)})`,
      });
      continue;
    }

    const idSet = new Set(idKeys);
    const enSet = new Set(enKeys);
    for (const key of idKeys) {
      if (!enSet.has(key)) {
        problems.push({
          namespace: entry.namespace,
          kind: "extra",
          key,
          message: `${entry.namespace}: kunci "${key}" ada di id.json tetapi tidak di en.json`,
        });
      }
    }
    for (const key of enKeys) {
      if (!idSet.has(key)) {
        problems.push({
          namespace: entry.namespace,
          kind: "extra",
          key,
          message: `${entry.namespace}: kunci "${key}" ada di en.json tetapi tidak di id.json`,
        });
      }
    }
  }

  return problems;
}

export function runCheck(root: string): number {
  const problems = checkRoot(root);
  if (problems.length === 0) {
    console.log("i18n: semua kunci id dan en cocok.");
    return 0;
  }
  console.error(`i18n: ditemukan ${problems.length} masalah.`);
  for (const problem of problems) console.error(`- ${problem.message}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith(join("check-i18n", "src", "index.ts"));

if (invokedDirectly) {
  const root = resolve(process.argv[2] ?? process.cwd());
  process.exitCode = runCheck(root);
}
