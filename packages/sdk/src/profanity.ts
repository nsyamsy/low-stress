/**
 * Modul sensor kata kasar (sdk.profanity).
 *
 * Satu-satunya implementasi sensor yang dipakai chat publik, chat Ludo,
 * dan nama tampilan.
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
  "^": "a",
  $: "s",
  "5": "s",
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "7": "t",
  "+": "t",
  "8": "b",
};

/**
 * Daftar bawaan kata kasar bahasa Indonesia.
 */
export const BUILTIN_BANNED_WORDS_ID: readonly string[] = [
  "anjing",
  "anjir",
  "anjay",
  "asu",
  "babi",
  "bajingan",
  "bangsat",
  "bego",
  "brengsek",
  "bujang",
  "dancok",
  "entot",
  "goblok",
  "idiot",
  "itil",
  "jancok",
  "jancuk",
  "jembut",
  "kampret",
  "kimak",
  "kontol",
  "lonte",
  "memek",
  "ngentot",
  "pantek",
  "pepek",
  "peler",
  "perek",
  "puki",
  "tetek",
  "tolol",
];

/**
 * Daftar bawaan kata kasar bahasa English.
 */
export const BUILTIN_BANNED_WORDS_EN: readonly string[] = [
  "asshole",
  "assholes",
  "bastard",
  "bastards",
  "bitch",
  "bitches",
  "bitching",
  "blowjob",
  "bullshit",
  "cock",
  "cocks",
  "cocksucker",
  "cunt",
  "cunts",
  "dick",
  "dickhead",
  "dicks",
  "douche",
  "douchebag",
  "faggot",
  "fuck",
  "fucked",
  "fucker",
  "fuckers",
  "fucking",
  "motherfucker",
  "motherfucking",
  "nigger",
  "nigga",
  "pussy",
  "shit",
  "shits",
  "shitty",
  "slut",
  "sluts",
  "twat",
  "wanker",
  "whore",
  "whores",
];

/**
 * Daftar bawaan gabungan Indonesia dan English.
 */
export const BUILTIN_BANNED_WORDS: readonly string[] = [
  ...BUILTIN_BANNED_WORDS_ID,
  ...BUILTIN_BANNED_WORDS_EN,
];

/**
 * Kata wajar yang mirip kata kasar. Daftar ini mencegah salah sensor (masalah Scunthorpe)
 * pada kata-kata umum seperti "analisis", "class", "pantai", "titik", dll.
 */
export const BUILTIN_ALLOW_WORDS: readonly string[] = [
  "analisis",
  "analog",
  "asumsi",
  "asuh",
  "asuhan",
  "bass",
  "class",
  "document",
  "grass",
  "pass",
  "scunthorpe",
  "shiitake",
  "sussex",
  "pantai",
  "santai",
  "rantai",
  "tangkai",
  "teratai",
  "masuk",
  "kemasukan",
  "pemasukan",
  "kasut",
  "titik",
  "detik",
  "kutik",
  "merek",
  "panjat",
  "pancing",
  "kancing",
  "baju",
  "pejabat",
  "jabat",
  "kontrak",
  "kontras",
  "kontribusi",
  "konten",
  "konteks",
  "memeriksa",
  "memperoleh",
  "meminta",
  "assassin",
  "compass",
  "glass",
  "passive",
  "passion",
  "classic",
  "asset",
  "assist",
  "assistant",
  "associate",
  "assign",
  "assess",
  "assume",
  "mass",
  "embarrass",
  "title",
  "attitude",
  "petite",
  "entity",
  "competition",
  "institute",
  "peacock",
  "cocktail",
  "shuttlecock",
  "hello",
  "shell",
  "damage",
  "dickens",
  "benedict",
  "canal",
  "button",
  "butter",
  "hit",
  "white",
];

/** Lowercase, buang aksen, dan ganti karakter leet. */
export function normalizeProfanityText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[@4^$501!|3+78]/g, (char) => LEET_MAP[char] ?? char);
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

/** Kumpulan kata pengecualian yang efektif. */
export function resolveAllowWords(options: ProfanityOptions = {}): Set<string> {
  return new Set(
    [...BUILTIN_ALLOW_WORDS, ...(options.allowWords ?? [])].map(canonicalize),
  );
}

/**
 * Memeriksa apakah token canonical cocok dengan kata terlarang,
 * dengan memperhatikan daftar kata yang diizinkan (anti-salah-sensor).
 */
function isTokenProfane(
  canonical: string,
  bannedWordsList: string[],
  allowSet: Set<string>,
): boolean {
  if (canonical.length === 0) return false;
  // Jika canonical secara langsung diizinkan, abaikan
  if (allowSet.has(canonical)) return false;

  return bannedWordsList.some((banned) => {
    if (banned.length <= 3) {
      // Kata terlarang sangat pendek (<= 3 huruf, mis. "asu") harus cocok persis
      // agar tidak salah menyensor kata seperti "masuk" atau "asumsi"
      return canonical === banned;
    }
    return canonical.includes(banned);
  });
}

/**
 * Sensor teks. Setiap kata yang cocok diganti karakter mask sepanjang kata
 * aslinya.
 */
export function censorProfanity(
  input: string,
  options: ProfanityOptions = {},
): string {
  const mask = options.mask ?? "*";
  const words = resolveBannedWords(options);
  if (words.length === 0) return input;
  const allowSet = resolveAllowWords(options);

  // 1. Tangani huruf berjarak spasi yang disengaja: "b a n g s a t" atau "a n j i n g"
  let result = input.replace(
    /\b([a-zA-Z@$0-9!^|+])(?:\s+([a-zA-Z@$0-9!^|+])){2,}\b/gi,
    (match) => {
      const canonical = canonicalize(match);
      if (isTokenProfane(canonical, words, allowSet)) {
        return mask.repeat(match.length);
      }
      return match;
    },
  );

  // 2. Tangani token kata individual (termasuk yang diselingi titik/simbol: b.a.n.g.s.a.t)
  result = result.replace(/\S+/g, (token) => {
    const canonical = canonicalize(token);
    if (isTokenProfane(canonical, words, allowSet)) {
      return mask.repeat(token.length);
    }
    return token;
  });

  return result;
}

/** Apakah teks mengandung kata kasar menurut daftar yang berlaku. */
export function containsProfanity(
  input: string,
  options: ProfanityOptions = {},
): boolean {
  const words = resolveBannedWords(options);
  if (words.length === 0) return false;
  const allowSet = resolveAllowWords(options);

  // Periksa huruf berjarak spasi
  const spacedMatches = input.match(
    /\b([a-zA-Z@$0-9!^|+])(?:\s+([a-zA-Z@$0-9!^|+])){2,}\b/gi,
  );
  if (spacedMatches) {
    for (const match of spacedMatches) {
      if (isTokenProfane(canonicalize(match), words, allowSet)) {
        return true;
      }
    }
  }

  // Periksa token biasa
  return input.split(/\s+/).some((token) => {
    const canonical = canonicalize(token);
    return isTokenProfane(canonical, words, allowSet);
  });
}
