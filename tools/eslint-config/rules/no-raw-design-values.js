/**
 * Menolak nilai desain mentah (hex, rgb/hsl, ukuran berunit, dan kelas palet
 * warna Tailwind mentah seperti `bg-slate-800` atau `text-amber-500`) yang
 * ditulis langsung di kode UI. Semua nilai harus lewat token di packages/ui
 * atau pemetaan `@theme` di tailwind.css (Agents.md §5.4 & R-05).
 *
 * Pengecualian sah yang didokumentasikan (Porting_Guide.md §0 & R-05):
 * - Aset logo merek (`packages/ui/src/components/Logo.tsx`)
 * - Warna asli di dalam kanvas/papan/dadu/pion/kartu game yang diporting
 *   (`games/flappy-bird/client/{render,characters}.ts`,
 *    `games/memory-match/client/{MemoryMatch.tsx,deck.ts}`,
 *    `games/ludo/{shared/engine.ts,client/{Die,LudoBoard,LudoPawn}.tsx}`,
 *    `games/riot/client/characters/**`, `games/riot/spike/**`).
 */

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\s*\(/i;
const UNIT_VALUE = /(?:^|[^\w-])\d+(?:\.\d+)?(?:px|rem|em|vh|vw|vmin|vmax)\b/;
const TAILWIND_PALETTE =
  /(?:^|[\s"'`])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|outline|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)(?:\/[0-9]{1,3})?(?=$|[\s"'`])/;

function findViolation(value) {
  if (typeof value !== "string") return null;
  if (HEX_COLOR.test(value)) return "hex color";
  if (COLOR_FUNCTION.test(value)) return "color function";
  if (UNIT_VALUE.test(value)) return "unit value";
  if (TAILWIND_PALETTE.test(value)) return "raw Tailwind color class";
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw design values (hex colors, color functions, unit sizes, raw Tailwind palette classes) in UI code.",
    },
    schema: [],
    messages: {
      rawDesignValue:
        "Raw design value ({{kind}}) is not allowed. Use a token from packages/ui instead.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        const kind = findViolation(node.value);
        if (kind) context.report({ node, messageId: "rawDesignValue", data: { kind } });
      },
      TemplateElement(node) {
        const kind = findViolation(node.value.cooked ?? node.value.raw);
        if (kind) context.report({ node, messageId: "rawDesignValue", data: { kind } });
      },
    };
  },
};

export default rule;
