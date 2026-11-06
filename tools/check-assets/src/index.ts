import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface AssetProblem {
  file: string;
  gameId: string;
  message: string;
}

const DISALLOWED_LICENSE_TERMS = [
  "-NC",
  "-ND",
  "NONCOMMERCIAL",
  "NON-COMMERCIAL",
  "NODERIVATIVES",
  "NO-DERIVATIVES",
];

const ASSET_EXTENSIONS = new Set([
  ".glb",
  ".gltf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ogg",
  ".mp3",
  ".wav",
  ".bin",
]);

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findAssetFiles(dir: string): string[] {
  if (!isDirectory(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findAssetFiles(full));
    } else if (entry.isFile()) {
      const ext = entry.name.toLowerCase().slice(entry.name.lastIndexOf("."));
      if (ASSET_EXTENSIONS.has(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

/**
 * Periksa direktori `games/<gameId>/assets` terhadap `LICENSES.md`.
 */
export function checkGameAssets(root: string, gameId: string): AssetProblem[] {
  const problems: AssetProblem[] = [];
  const assetsDir = join(root, "games", gameId, "assets");
  if (!isDirectory(assetsDir)) return [];

  const files = findAssetFiles(assetsDir);
  if (files.length === 0) return [];

  const licenseFile = join(assetsDir, "LICENSES.md");
  if (!existsSync(licenseFile)) {
    problems.push({
      file: relative(root, assetsDir),
      gameId,
      message: `${relative(root, assetsDir)} memuat ${files.length} aset tetapi tidak memiliki berkas LICENSES.md`,
    });
    return problems;
  }

  const licenseContent = readFileSync(licenseFile, "utf8");
  const licenseUpper = licenseContent.toUpperCase();

  // Cek lisensi terlarang (NC / ND)
  for (const term of DISALLOWED_LICENSE_TERMS) {
    if (licenseUpper.includes(term)) {
      problems.push({
        file: relative(root, licenseFile),
        gameId,
        message: `${relative(root, licenseFile)} memuat lisensi terlarang (${term}). NC (NonCommercial) dan ND (NoDerivatives) dilarang.`,
      });
      break;
    }
  }

  // Cek bahwa setiap file tercatat di LICENSES.md
  for (const file of files) {
    const relName = relative(assetsDir, file).replace(/\\/g, "/");
    const baseName = relName.split("/").pop() ?? relName;

    // Cari apakah nama file disebut di LICENSES.md
    if (!licenseContent.includes(relName) && !licenseContent.includes(baseName)) {
      problems.push({
        file: relative(root, file),
        gameId,
        message: `Berkas aset "${relName}" tidak tercatat di ${relative(root, licenseFile)}`,
      });
    }
  }

  return problems;
}

export function checkRootAssets(root: string): AssetProblem[] {
  const gamesDir = join(root, "games");
  if (!isDirectory(gamesDir)) return [];

  const problems: AssetProblem[] = [];
  for (const gameId of readdirSync(gamesDir)) {
    const gamePath = join(gamesDir, gameId);
    if (!isDirectory(gamePath)) continue;
    problems.push(...checkGameAssets(root, gameId));
  }
  return problems;
}

export function runAssetCheck(root: string): number {
  const problems = checkRootAssets(root);
  if (problems.length === 0) {
    console.log("assets: semua berkas aset terdaftar dan memenuhi aturan lisensi.");
    return 0;
  }
  console.error(`assets: ditemukan ${problems.length} masalah aset/lisensi:`);
  for (const p of problems) {
    console.error(`- [${p.gameId}] ${p.message}`);
  }
  return 1;
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith(join("check-assets", "src", "index.ts"));

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  process.exitCode = runAssetCheck(root);
}
