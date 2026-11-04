import {
  Zap,
  Target,
  Rocket,
  Diamond,
  Crown,
  Star,
  Clover,
  Flame,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import idLocales from "../locales/id.json";
import enLocales from "../locales/en.json";

// Daftarkan namespace game.memory-match ke i18n
if (
  typeof i18n.hasResourceBundle === "function" &&
  !i18n.hasResourceBundle("id", "game.memory-match")
) {
  i18n.addResourceBundle("id", "game.memory-match", idLocales, true, true);
  i18n.addResourceBundle("en", "game.memory-match", enLocales, true, true);
  i18n.addResourceBundle(
    "id",
    "translation",
    { "game.memory-match": idLocales },
    true,
    true,
  );
  i18n.addResourceBundle(
    "en",
    "translation",
    { "game.memory-match": enLocales },
    true,
    true,
  );
}

export interface RunResult {
  score: number;
  durationMs: number;
  moves: number;
  combos: number;
  timeSeconds: number;
}

// 8 Pasang Kartu Unik (Porting_Guide §3)
export const CARD_DEFS = [
  {
    id: "rocket",
    label: "Rocket",
    icon: Rocket,
    color: "from-violet-500 to-purple-600",
    textCol: "text-violet-400",
  },
  {
    id: "diamond",
    label: "Diamond",
    icon: Diamond,
    color: "from-cyan-400 to-blue-500",
    textCol: "text-cyan-400",
  },
  {
    id: "lightning",
    label: "Lightning",
    icon: Zap,
    color: "from-amber-400 to-orange-500",
    textCol: "text-amber-400",
  },
  {
    id: "target",
    label: "Target",
    icon: Target,
    color: "from-rose-500 to-red-600",
    textCol: "text-rose-400",
  },
  {
    id: "star",
    label: "Star",
    icon: Star,
    color: "from-yellow-400 to-amber-500",
    textCol: "text-yellow-400",
  },
  {
    id: "clover",
    label: "Clover",
    icon: Clover,
    color: "from-emerald-400 to-green-600",
    textCol: "text-emerald-400",
  },
  {
    id: "crown",
    label: "Crown",
    icon: Crown,
    color: "from-amber-300 to-yellow-500",
    textCol: "text-amber-300",
  },
  {
    id: "flame",
    label: "Flame",
    icon: Flame,
    color: "from-orange-500 to-red-500",
    textCol: "text-orange-400",
  },
];

export interface CardState {
  uid: number; // 0-15
  defId: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export function generateShuffledDeck(): CardState[] {
  const cards: { uid: number; defId: string }[] = [];
  CARD_DEFS.forEach((def) => {
    cards.push({ uid: 0, defId: def.id });
    cards.push({ uid: 0, defId: def.id });
  });

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = temp;
  }

  return cards.map((c, index) => ({
    uid: index,
    defId: c.defId,
    isFlipped: false,
    isMatched: false,
  }));
}

export function useGameTranslation() {
  const { t, i18n: i18nInstance } = useTranslation();
  const lang = i18nInstance?.language?.startsWith("en") ? "en" : "id";
  const dict = lang === "en" ? enLocales : idLocales;

  return {
    t: (key: string, params?: Record<string, string | number>) => {
      const translated = t(`game.memory-match.${key}`, params);
      if (
        translated &&
        translated !== `game.memory-match.${key}` &&
        translated !== key
      ) {
        return translated;
      }
      let val = (dict as Record<string, string>)[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          val = val.replace(new RegExp(`{{${k}}}`, "g"), String(v));
        }
      }
      return val;
    },
    lang,
  };
}
