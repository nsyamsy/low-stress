/**
 * Kerangka sensor kata kasar.
 *
 * Modul ini adalah satu-satunya implementasi sensor yang dipakai chat publik,
 * chat Ludo, dan nama tampilan. Fase 1 hanya menyiapkan kontrak dan algoritma
 * dasarnya; daftar kata lengkap dan pengelolaan lewat tabel `banned_words`
 * dikerjakan pada Fase 8.
 */

export interface ProfanityOptions {
  /** Kata tambahan yang ikut disensor. */
  extraWords?: readonly string[];
  /** Kata yang tidak boleh disensor meskipun polanya cocok. */
  allowWords?: readonly string[];
  /** Karakter pengganti. Bawaan `*`. */
  mask?: string;
}

const LEET_MAP: Record<string, string> = {
  "@": "a",
  "4": "a",
  $: "s",
  "5": "s",
  "0": "o",
  "1": "i",
  "!": "i",
  "3": "e",
  "7": "t",
  "+": "t",
  "8": "b",
};

/**
 * Daftar bawaan ringkas. Daftar penuh bahasa Indonesia dan English ditambahkan
 * pada Fase 8 (P8-01) dan dapat diperluas admin lewat `banned_words`.
 */
export const BUILTIN_BANNED_WORDS: readonly string[] = [
  "anjing",
  "anjir",
  "bangsat",
  "babi",
  "brengsek",
  "kontol",
  "memek",
  "ngentot",
  "pepek",
  "peler",
  "jancok",
  "asu",
  "idiot",
  "bitch",
  "fuck",
  "fucking",
  "shit",
  "cunt",
  "asshole",
  "bastard",
  "dick",
];

/**
 * Kata wajar yang mirip kata kasar. Daftar ini mencegah salah sensor pada
 * kata seperti "anjingan" (nama hewan) atau "bass" di dalam kata lain.
 */
export const BUILTIN_ALLOW_WORDS: readonly string[] = [
  "analisis",
  "analog",
  "asumsi",
  "bass",
  "class",
  "document",
  "grass",
  "pass",
  "scunthorpe",
  "shiitake",
  "sussex",
];

/** Lowercase, buang aksen, dan ganti karakter leet. */
export function normalizeProfanityText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[@4$501!3+78]/g, (char) => LEET_MAP[char] ?? char);
}

/** Ringkas huruf berulang: `aanjiing` -> `anjing`. */
export function collapseRepeatedLetters(input: string): string {
  return input.replace(/([a-z])\1+/g, "$1");
}

/**
 * Normalisasi untuk pencocokan: huruf kecil, tanpa aksen, leet, tanpa simbol
 * dan spasi, lalu huruf berulang diringkas.
 */
export function canonicalize(input: string): string {
  return collapseRepeatedLetters(
    normalizeProfanityText(input).replace(/[^a-z]/g, ""),
  );
}

/** Kumpulan kata efektif setelah menggabungkan bawaan, tambahan, dan pengecualian. */
export function resolveBannedWords(options: ProfanityOptions = {}): string[] {
  const allow = new Set(
    [...BUILTIN_ALLOW_WORDS, ...(options.allowWords ?? [])].map(canonicalize),
  );
  const merged = new Set(
    [...BUILTIN_BANNED_WORDS, ...(options.extraWords ?? [])].map(canonicalize),
  );
  for (const allowed of allow) merged.delete(allowed);
  return [...merged];
}

/**
 * Sensor teks. Setiap kata yang cocok diganti karakter mask sepanjang kata
 * aslinya. Token yang seluruhnya berupa kata yang diizinkan dilewati.
 */
export function censorProfanity(
  input: string,
  options: ProfanityOptions = {},
): string {
  const mask = options.mask ?? "*";
  const words = resolveBannedWords(options);
  if (words.length === 0) return input;

  return input.replace(/\S+/g, (token) => {
    const canonical = canonicalize(token);
    if (canonical.length === 0) return token;
    if (words.some((word) => canonical.includes(word))) {
      return mask.repeat(token.length);
    }
    return token;
  });
}

/** Apakah teks mengandung kata kasar menurut daftar yang berlaku. */
export function containsProfanity(
  input: string,
  options: ProfanityOptions = {},
): boolean {
  const words = resolveBannedWords(options);
  if (words.length === 0) return false;
  return input.split(/\s+/).some((token) => {
    const canonical = canonicalize(token);
    return canonical.length > 0 && words.some((word) => canonical.includes(word));
  });
}
