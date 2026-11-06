/**
 * Panduan & Pipeline Kompresi Aset 3D / 2D (ROADMAP_RIOT §1 R5 & RT-03).
 *
 * Standar Anggaran:
 * - Ukuran per GLB terkompresi: <= 2 MB
 * - Total seluruh aset per game: <= 8-10 MB
 * - Tekstur atlas: <= 2048 x 2048px (WebP / Basis Universal / KTX2)
 *
 * Perintah referensi gltfpack / gltf-transform:
 * 1. gltfpack (Meshopt + Draco):
 *    npx gltfpack -i model.gltf -o model.glb -cc -tc
 * 2. gltf-transform:
 *    npx @gltf-transform/cli optimize input.glb output.glb --texture-compress webp
 */

export const ASSET_BUDGETS = {
  MAX_SINGLE_GLB_BYTES: 2 * 1024 * 1024, // 2 MB
  MAX_TEXTURE_DIMENSION: 2048,
  MAX_TOTAL_GAME_ASSETS_BYTES: 10 * 1024 * 1024, // 10 MB
} as const;

export interface BudgetCheckResult {
  ok: boolean;
  sizeBytes: number;
  maxBytes: number;
  message?: string;
}

export function checkAssetSizeBudget(
  sizeBytes: number,
  maxBytes: number = ASSET_BUDGETS.MAX_SINGLE_GLB_BYTES,
): BudgetCheckResult {
  const ok = sizeBytes <= maxBytes;
  return {
    ok,
    sizeBytes,
    maxBytes,
    message: ok
      ? undefined
      : `Ukuran aset (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) melebihi batas anggaran (${(maxBytes / 1024 / 1024).toFixed(2)} MB)`,
  };
}
