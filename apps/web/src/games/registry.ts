import { assertGameManifest, type GameManifest } from "@low-stress/sdk";

/**
 * Registri game di sisi web.
 *
 * Vite memindai setiap `games/<id>/manifest.ts` saat build. Manifest hanya
 * memuat referensi lazy ke klien, sehingga bundel awal tidak ikut menarik kode
 * game. Folder dan `id` manifest wajib sama; bila tidak, build gagal dengan
 * pesan yang jelas.
 */
export type GameManifestModule = {
  manifest?: unknown;
  default?: unknown;
};

export type GameManifestModules = Record<string, GameManifestModule>;

const manifestModules = import.meta.glob<GameManifestModule>(
  "../../../../games/*/manifest.ts",
  { eager: true },
);

function gameIdFromPath(path: string): string | null {
  const match = /\/games\/([^/]+)\/manifest\.ts$/.exec(path);
  return match?.[1] ?? null;
}

/**
 * Bangun daftar manifest dari hasil pemindaian. Diekspor terpisah agar dapat
 * diuji tanpa ketergantungan pada `import.meta.glob`.
 */
export function buildGameRegistry(
  modules: GameManifestModules,
): GameManifest[] {
  const registry: GameManifest[] = [];
  const seen = new Set<string>();

  for (const [path, module] of Object.entries(modules)) {
    const folderId = gameIdFromPath(path);
    if (!folderId) {
      throw new Error(
        `registry: path manifest tidak dikenali: ${path} (harus games/<id>/manifest.ts)`,
      );
    }

    const candidate = module.manifest ?? module.default;
    assertGameManifest(candidate, `${folderId}/manifest.ts`);

    if (candidate.id !== folderId) {
      throw new Error(
        `registry: id "${candidate.id}" pada ${folderId}/manifest.ts harus sama dengan nama folder "${folderId}"`,
      );
    }
    if (seen.has(candidate.id)) {
      throw new Error(`registry: id game "${candidate.id}" terdaftar dua kali`);
    }

    seen.add(candidate.id);
    registry.push(candidate);
  }

  return registry.sort((a, b) => a.id.localeCompare(b.id));
}

/** Semua game yang ditemukan saat build, diurutkan menurut id. */
export const registeredGames: readonly GameManifest[] =
  buildGameRegistry(manifestModules);

/** Cari satu game menurut id. */
export function findGame(id: string): GameManifest | undefined {
  return registeredGames.find((game) => game.id === id);
}
