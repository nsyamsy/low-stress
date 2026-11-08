/**
 * Skema kustomisasi karakter Riot (RT-40/RT-41).
 *
 * Modul murni tanpa dependensi rendering atau database agar dapat dipakai
 * bersama oleh klien (preview & render), server (validasi), dan lapisan
 * persistensi (`riot_profiles`).
 *
 * Batasan hak cipta (ROADMAP_RIOT §0): semua spesies, warna, dan aksesori di
 * sini adalah karya asli proyek. Siluet Mochi sengaja TIDAK meniru "kacang
 * bertopi visor" dan tidak ada kemiripan dengan karakter Among Us.
 */

// ---------------------------------------------------------------------------
// Mochi (RT-40)
// ---------------------------------------------------------------------------

/** Enam spesies Mochi orisinal. Bentuk tubuh & ciri khas ditentukan prosedural. */
export const MOCHI_SPECIES = [
  "orb",
  "moth",
  "newt",
  "puff",
  "sprite",
  "crab",
] as const;

export type MochiSpecies = (typeof MOCHI_SPECIES)[number];

/** 12 warna badan Mochi (hex 0xRRGGBB). */
export const MOCHI_BODY_COLORS: readonly number[] = [
  0xf5f0e6, // krim
  0xf2c9a0, // aprikot
  0xe8a87c, // terakota muda
  0xc98d5e, // karamel
  0x9db8d2, // biru es
  0x7fa8c9, // biru langit
  0x8fc1b5, // mint
  0x6fa8a0, // teal
  0xc9d18b, // lime
  0xd9a05b, // mustard
  0xb48ec9, // ungu muda
  0xe58aa8, // pink
] as const;

/** 8 warna aksen Mochi (dipakai untuk bagian aksen tiap spesies). */
export const MOCHI_ACCENT_COLORS: readonly number[] = [
  0x2f5d55, // hijau tua
  0x1d4ed8, // biru
  0x7c3aed, // ungu
  0xdc2626, // merah
  0x0f766e, // teal gelap
  0xb45309, // cokelat
  0x4d7c0f, // olive
  0x9d174d, // magenta
] as const;

/**
 * Delapan aksesori orisinal. `space_helmet` dan `space_hat` adalah helm dan
 * topi luar angkasa yang diwajibkan RT-40.
 */
export const CHARACTER_ACCESSORIES = [
  "space_helmet",
  "space_hat",
  "antenna",
  "scarf",
  "goggles",
  "backpack",
  "earmuffs",
  "halo",
] as const;

export type CharacterAccessory = (typeof CHARACTER_ACCESSORIES)[number];

export interface MochiCustomization {
  type: "mochi";
  species: MochiSpecies;
  /** Warna badan, index ke MOCHI_BODY_COLORS. */
  bodyColorIndex: number;
  /** Warna aksen, index ke MOCHI_ACCENT_COLORS. */
  accentColorIndex: number;
  accessory: CharacterAccessory | null;
}

/**
 * Varian tubuh Humanoid (RT-41) dari paket CC0 "Mini Characters" oleh Kenney
 * (licensi tercatat di `assets/LICENSES.md`). Nilainya adalah nama berkas GLB
 * tanpa ekstensi di `assets/models/humanoid/`.
 */
export const HUMANOID_BODY_VARIANTS = [
  "character-male-a",
  "character-male-b",
  "character-male-c",
  "character-male-d",
  "character-male-e",
  "character-male-f",
  "character-male-g",
  "character-female-a",
  "character-female-b",
  "character-female-c",
  "character-female-d",
  "character-female-e",
  "character-female-f",
  "character-alien",
  "character-robot",
  "character-worker",
  "character-knight",
  "character-raider",
  "character-soldier",
  "character-zombie",
] as const;

export type HumanoidBodyVariant = (typeof HUMANOID_BODY_VARIANTS)[number];

/**
 * 8 palet tint untuk Humanoid. Indeks 0 = tanpa tint (warna asli colormap
 * Kenney). Nilai lain adalah pengali warna material (hex).
 */
export const HUMANOID_PALETTES: readonly number[] = [
  0xffffff,
  0xffd9c2,
  0xc2d9ff,
  0xd9c2ff,
  0xc2ffd9,
  0xffc2d9,
  0xffffc2,
  0xc2ffff,
] as const;

export function isHumanoidBodyVariant(value: string): value is HumanoidBodyVariant {
  return (HUMANOID_BODY_VARIANTS as readonly string[]).includes(value);
}

/**
 * Varian tubuh Humanoid (RT-41) memakai paket CC0 terverifikasi.
 * `bodyVariant` adalah id karakter dari paket (mis. "character-male-a").
 * `paletteIndex` memilih palet warna yang disediakan paket.
 */
export interface HumanoidCustomization {
  type: "humanoid";
  bodyVariant: HumanoidBodyVariant;
  paletteIndex: number;
  accessory: CharacterAccessory | null;
}

export type RiotCharacterCustomization =
  | MochiCustomization
  | HumanoidCustomization;

export const DEFAULT_MOCHI_CUSTOMIZATION: MochiCustomization = {
  type: "mochi",
  species: "orb",
  bodyColorIndex: 0,
  accentColorIndex: 0,
  accessory: null,
};

// ---------------------------------------------------------------------------
// Helper palet
// ---------------------------------------------------------------------------

export function mochiBodyColor(custom: MochiCustomization): number {
  return (
    MOCHI_BODY_COLORS[custom.bodyColorIndex % MOCHI_BODY_COLORS.length] ??
    MOCHI_BODY_COLORS[0]!
  );
}

export function mochiAccentColor(custom: MochiCustomization): number {
  return (
    MOCHI_ACCENT_COLORS[custom.accentColorIndex % MOCHI_ACCENT_COLORS.length] ??
    MOCHI_ACCENT_COLORS[0]!
  );
}

// ---------------------------------------------------------------------------
// Sanitasi (dipakai server untuk memvalidasi payload klien)
// ---------------------------------------------------------------------------

function clampIndex(value: unknown, length: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(length - 1, Math.floor(n)));
}

function sanitizeAccessory(value: unknown): CharacterAccessory | null {
  return typeof value === "string" &&
    (CHARACTER_ACCESSORIES as readonly string[]).includes(value)
    ? (value as CharacterAccessory)
    : null;
}

/**
 * Memvalidasi & menormalkan kustomisasi dari klien. Nilai yang tidak dikenal
 * jatuh ke bawaan yang aman — server tidak pernah mempercayai input mentah.
 */
export function sanitizeCharacterCustomization(
  raw: unknown,
): RiotCharacterCustomization {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_MOCHI_CUSTOMIZATION };
  }
  const r = raw as Record<string, unknown>;

  if (r.type === "humanoid") {
    const bodyVariant =
      typeof r.bodyVariant === "string" && isHumanoidBodyVariant(r.bodyVariant)
        ? r.bodyVariant
        : HUMANOID_BODY_VARIANTS[0];
    return {
      type: "humanoid",
      bodyVariant,
      paletteIndex: clampIndex(r.paletteIndex, HUMANOID_PALETTES.length),
      accessory: sanitizeAccessory(r.accessory),
    };
  }

  const species =
    typeof r.species === "string" &&
    (MOCHI_SPECIES as readonly string[]).includes(r.species)
      ? (r.species as MochiSpecies)
      : DEFAULT_MOCHI_CUSTOMIZATION.species;

  return {
    type: "mochi",
    species,
    bodyColorIndex: clampIndex(r.bodyColorIndex, MOCHI_BODY_COLORS.length),
    accentColorIndex: clampIndex(r.accentColorIndex, MOCHI_ACCENT_COLORS.length),
    accessory: sanitizeAccessory(r.accessory),
  };
}
