/**
 * Menolak teks UI literal berhuruf yang ditulis langsung di dalam JSX atau
 * atribut teks aksesibilitas (`aria-label`, `title`, `placeholder`, `alt`),
 * sesuai Agents.md §5.2 ("Tidak ada teks UI yang ditulis langsung di komponen.
 * Semua lewat kunci i18n.").
 *
 * Pengecualian sah yang didokumentasikan:
 * - Tanda baca, angka, simbol matematika, atau satuan teknis singkat
 *   (mis. "WIB", "Hz", "ms", "fps", "KB/s", "s", "m", "x", "×", "%", "/").
 * - Halaman galeri komponen khusus pengembangan (`ShowcasePage.tsx`) dan
 *   halaman spike benchmark (`games/riot/spike/**`).
 */

const HAS_LETTERS = /[A-Za-z\u00C0-\u024F]{2,}/;

// Satuan teknis/singkatan universal yang bukan kalimat bahasa manusia
const ALLOWED_TOKENS = new Set([
  "WIB",
  "UTC",
  "FPS",
  "fps",
  "Hz",
  "ms",
  "KB",
  "MB",
  "px",
  "em",
  "rem",
  "dvh",
  "vh",
  "vw",
  "ID",
  "EN",
  "VS",
  "vs",
  "OK",
  "CPU",
  "3D",
  "2D",
  "WASD",
  "ESC",
  "Esc",
]);

const CHECKED_JSX_ATTRIBUTES = new Set([
  "aria-label",
  "title",
  "placeholder",
  "alt",
]);

function isDisallowedLiteralText(raw) {
  if (typeof raw !== "string") return false;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  if (!HAS_LETTERS.test(trimmed)) return false;

  // Abaikan token teknis tunggal atau kombinasi simbol + satuan (mis. "15 Hz", "300px", "(WIB)")
  const cleaned = trimmed.replace(/[0-9()[\]{}:.,/+×•\-–—%#@!~|<>'"`]+/g, " ").trim();
  if (!cleaned) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.every((w) => w.length <= 1 || ALLOWED_TOKENS.has(w))) {
    return false;
  }

  return true;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded UI text literals in JSX children and user-facing attributes. Use i18n keys instead.",
    },
    schema: [],
    messages: {
      jsxLiteral:
        'Hardcoded JSX text "{{text}}" is not allowed (Agents.md §5.2). Use an i18n translation key instead.',
      jsxAttributeLiteral:
        'Hardcoded text "{{text}}" in JSX attribute "{{attr}}" is not allowed (Agents.md §5.2). Use an i18n translation key instead.',
    },
  },
  create(context) {
    return {
      JSXText(node) {
        if (isDisallowedLiteralText(node.value)) {
          const text = node.value.replace(/\s+/g, " ").trim();
          context.report({
            node,
            messageId: "jsxLiteral",
            data: { text: text.slice(0, 40) },
          });
        }
      },
      JSXAttribute(node) {
        const attrName =
          node.name?.type === "JSXIdentifier" ? node.name.name : null;
        if (!attrName || !CHECKED_JSX_ATTRIBUTES.has(attrName)) return;
        if (!node.value) return;

        if (node.value.type === "Literal" && typeof node.value.value === "string") {
          if (isDisallowedLiteralText(node.value.value)) {
            context.report({
              node: node.value,
              messageId: "jsxAttributeLiteral",
              data: {
                attr: attrName,
                text: node.value.value.trim().slice(0, 40),
              },
            });
          }
        } else if (
          node.value.type === "JSXExpressionContainer" &&
          node.value.expression?.type === "Literal" &&
          typeof node.value.expression.value === "string"
        ) {
          if (isDisallowedLiteralText(node.value.expression.value)) {
            context.report({
              node: node.value.expression,
              messageId: "jsxAttributeLiteral",
              data: {
                attr: attrName,
                text: node.value.expression.value.trim().slice(0, 40),
              },
            });
          }
        }
      },
    };
  },
};

export default rule;
