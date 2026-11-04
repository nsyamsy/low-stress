/**
 * Aturan isolasi game pada tingkat spesifier impor.
 *
 * - Game hanya boleh mengimpor paket workspace `@low-stress/sdk`,
 *   `@low-stress/ui`, dan `@low-stress/i18n`.
 * - Impor relatif tidak boleh keluar dari folder game itu sendiri.
 *
 * Aturan `boundaries/element-types` menangani isolasi berbasis path; aturan ini
 * melengkapinya untuk spesifier paket workspace dan jalur relatif.
 */

import path from "node:path";

const ALLOWED_WORKSPACE_PACKAGES = new Set(["sdk", "ui", "i18n"]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function gameRootFor(filename, projectRoot) {
  const relative = toPosix(path.relative(projectRoot, filename));
  const match = /^games\/([^/]+)\//.exec(relative);
  if (!match) return null;
  return {
    id: match[1],
    root: path.join(projectRoot, "games", match[1]),
  };
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Games may only import @low-stress/sdk, @low-stress/ui and @low-stress/i18n, and may not import files outside their own folder.",
    },
    schema: [],
    messages: {
      forbiddenPackage:
        'Game "{{game}}" may not import "{{source}}". Allowed workspace packages: @low-stress/sdk, @low-stress/ui, @low-stress/i18n.',
      outsideGame:
        'Game "{{game}}" may not import "{{source}}" because it resolves outside games/{{game}}/.',
    },
  },
  create(context) {
    const projectRoot = context.settings["low-stress/project-root"] ?? process.cwd();
    const filename = context.filename;
    const game = gameRootFor(filename, projectRoot);
    if (!game) return {};

    function check(node) {
      const source = node.source?.value;
      if (typeof source !== "string") return;

      const workspace = /^@low-stress\/([^/]+)/.exec(source);
      if (workspace) {
        if (!ALLOWED_WORKSPACE_PACKAGES.has(workspace[1])) {
          context.report({
            node,
            messageId: "forbiddenPackage",
            data: { game: game.id, source },
          });
        }
        return;
      }

      if (source.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filename), source);
        const relativeToGame = path.relative(game.root, resolved);
        const escapes =
          relativeToGame.startsWith("..") || path.isAbsolute(relativeToGame);
        if (escapes) {
          context.report({
            node,
            messageId: "outsideGame",
            data: { game: game.id, source },
          });
        }
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default rule;
