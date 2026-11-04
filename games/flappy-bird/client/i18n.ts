import { useTranslation } from "react-i18next";
import i18n from "i18next";
import idLocales from "../locales/id.json";
import enLocales from "../locales/en.json";

// Daftarkan namespace game.flappy-bird ke i18n
if (
  typeof i18n.hasResourceBundle === "function" &&
  !i18n.hasResourceBundle("id", "game.flappy-bird")
) {
  i18n.addResourceBundle("id", "game.flappy-bird", idLocales, true, true);
  i18n.addResourceBundle("en", "game.flappy-bird", enLocales, true, true);
  i18n.addResourceBundle(
    "id",
    "translation",
    { "game.flappy-bird": idLocales },
    true,
    true,
  );
  i18n.addResourceBundle(
    "en",
    "translation",
    { "game.flappy-bird": enLocales },
    true,
    true,
  );
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export function useFlappyTranslation() {
  const { t, i18n: i18nInstance } = useTranslation();
  const lang = i18nInstance?.language?.startsWith("en") ? "en" : "id";
  const dict = lang === "en" ? enLocales : idLocales;

  return {
    t: (key: string, params?: Record<string, string | number>) => {
      const translated = t(`game.flappy-bird.${key}`, params);
      if (
        translated &&
        translated !== `game.flappy-bird.${key}` &&
        translated !== key
      ) {
        return translated;
      }
      let val = getNestedValue(dict as Record<string, unknown>, key) || key;
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
