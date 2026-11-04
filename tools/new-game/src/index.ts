import { existsSync, readFileSync, readdirSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isGameId } from "@low-stress/sdk";

const ENGINES = ["react", "canvas", "phaser"] as const;
type Engine = (typeof ENGINES)[number];

const ROOT = resolve(import.meta.dirname, "../../..");
const TEMPLATES = resolve(import.meta.dirname, "../templates");
const GAMES_DIR = join(ROOT, "games");

interface Options {
  slug: string;
  engine: Engine;
}

function usage(): string {
  return [
    "Pemakaian: pnpm new-game <slug> [--engine react|canvas|phaser]",
    "",
    "  <slug>   huruf kecil, angka, dan tanda hubung; diawali huruf",
    "  --engine bawaan: react",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): Options {
  let slug: string | undefined;
  let engine: Engine = "react";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) break;
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--engine") {
      const value = argv[index + 1];
      if (!value || !ENGINES.includes(value as Engine)) {
        throw new Error(`--engine harus salah satu dari: ${ENGINES.join(", ")}`);
      }
      engine = value as Engine;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Argumen tidak dikenal: ${arg}`);
    }
    if (slug) {
      throw new Error(`Hanya satu slug yang boleh diberikan (sudah ada "${slug}").`);
    }
    slug = arg;
  }

  if (!slug) throw new Error("Slug game wajib diisi.");
  if (!isGameId(slug)) {
    throw new Error(
      `Slug "${slug}" tidak valid. Gunakan huruf kecil, angka, dan tanda hubung, diawali huruf.`,
    );
  }

  return { slug, engine };
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function copyTemplateDir(
  source: string,
  destination: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): void {
  mkdirSync(destination, { recursive: true });

  for (const entry of readdirSync(source)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const from = join(source, entry);
    const to = join(destination, entry);

    if (statSync(from).isDirectory()) {
      copyTemplateDir(from, to, replacements);
      continue;
    }

    let content = readFileSync(from, "utf8");
    for (const [placeholder, value] of replacements) {
      content = content.split(placeholder).join(value);
    }
    writeFileSync(to, content);
  }
}

function addPhaserDependency(gameDir: string): void {
  const packagePath = join(gameDir, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies = { ...pkg.dependencies, phaser: "^3.90.0" };
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function main(): void {
  const { slug, engine } = parseArgs(process.argv.slice(2));
  const gameDir = join(GAMES_DIR, slug);
  const title = titleFromSlug(slug);

  mkdirSync(GAMES_DIR, { recursive: true });
  if (existsSync(gameDir)) {
    throw new Error(`Folder games/${slug} sudah ada. Hapus dulu atau pilih slug lain.`);
  }

  const replacements = [
    ["__GAME_ID__", slug],
    ["__GAME_TITLE__", title],
    ["__GAME_ENGINE__", engine],
    ["__GAME_DESCRIPTION_ID__", `Game ${title} untuk Low Stress.`],
    ["__GAME_DESCRIPTION_EN__", `${title} game for Low Stress.`],
  ] as const;

  copyTemplateDir(join(TEMPLATES, "base"), gameDir, replacements);
  copyTemplateDir(join(TEMPLATES, "engines", engine, "client"), join(gameDir, "client"), replacements);

  if (engine === "phaser") addPhaserDependency(gameDir);

  console.log(`Game dibuat: games/${slug} (engine: ${engine})`);
  console.log("Langkah berikutnya:");
  console.log("  1. pnpm install");
  console.log(`  2. Isi manifest dan kode di games/${slug}/client`);
  console.log(`  3. pnpm lint && pnpm typecheck`);
  console.log(`  4. Nyalakan game dari panel admin setelah muncul di registry.`);
}

try {
  main();
} catch (error) {
  console.error(`new-game: ${error instanceof Error ? error.message : String(error)}`);
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
