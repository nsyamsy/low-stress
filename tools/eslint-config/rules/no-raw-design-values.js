/**
 * Menolak nilai desain mentah (hex, rgb/hsl, dan ukuran berunit) yang ditulis
 * langsung di kode UI. Semua nilai harus lewat token di packages/ui.
 *
 * Aturan ini sengaja hanya memeriksa string literal dan template literal.
 * Angka mentah pada atribut SVG (mis. viewBox) tidak diperiksa; aset logo
 * dikecualikan lewat konfigurasi.
 */

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\s*\(/i;
const UNIT_VALUE = /(?:^|[^\w-])\d+(?:\.\d+)?(?:px|rem|em|vh|vw|vmin|vmax)\b/;

function findViolation(value) {
  if (typeof value !== "string") return null;
  if (HEX_COLOR.test(value)) return "hex color";
  if (COLOR_FUNCTION.test(value)) return "color function";
  if (UNIT_VALUE.test(value)) return "unit value";
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw design values (hex colors, color functions, unit sizes) in UI code.",
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
