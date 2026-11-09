import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

import gameWorkspaceImports from "./rules/game-workspace-imports.js";
import noJsxLiteral from "./rules/no-jsx-literal.js";
import noRawDesignValues from "./rules/no-raw-design-values.js";

const projectRoot = path.resolve(import.meta.dirname, "../..");

const BOUNDARY_ELEMENTS = [
  { type: "sdk", pattern: "packages/sdk" },
  { type: "ui", pattern: "packages/ui" },
  { type: "i18n", pattern: "packages/i18n" },
  { type: "db", pattern: "packages/db" },
  { type: "game", pattern: "games/*", capture: ["gameId"] },
  { type: "app", pattern: "apps/*", capture: ["app"] },
  { type: "tool", pattern: "tools/*", capture: ["tool"] },
  { type: "package", pattern: "packages/*", capture: ["package"] },
  { type: "e2e", pattern: "e2e" },
];

const BOUNDARY_POLICIES = [
  // Paket inti tidak boleh bergantung pada aplikasi, game, atau tool.
  { from: { element: { type: "app" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package"] } } }] },
  // Game hanya boleh memakai sdk, ui, dan i18n. Impor di dalam game yang sama
  // diabaikan oleh plugin karena masih satu elemen.
  { from: { element: { type: "game" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n"] } } }] },
  { from: { element: { type: "tool" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package"] } } }] },
  { from: { element: { type: "package" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package"] } } }] },
  { from: { element: { type: "e2e" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package", "app", "tool"] } } }] },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/*.d.ts",
      "packages/db/migrations/**",
      "apps/web/public/**",
      "reference/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: {
      boundaries,
      "low-stress": {
        rules: {
          "no-raw-design-values": noRawDesignValues,
          "no-jsx-literal": noJsxLiteral,
          "game-workspace-imports": gameWorkspaceImports,
        },
      },
    },
    settings: {
      "low-stress/project-root": projectRoot,
      "boundaries/root-path": projectRoot,
      "boundaries/elements": BOUNDARY_ELEMENTS,
      "import/resolver": {
        node: {
          extensions: [".js", ".mjs", ".cjs", ".ts", ".tsx", ".json"],
        },
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        { default: "disallow", policies: BOUNDARY_POLICIES },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}", "games/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Larangan nilai desain mentah berlaku untuk kode UI.
    // Pengecualian sah (Agents.md §5.1, Porting_Guide.md §0, R-05):
    // - Aset logo merek (`packages/ui/src/components/Logo.tsx`)
    // - Visual asli di dalam kanvas/papan/dadu/pion/kartu game yang diporting.
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
      "games/*/client/**/*.{ts,tsx}",
      "games/*/shared/**/*.{ts,tsx}",
    ],
    ignores: [
      "packages/ui/src/components/Logo.tsx",
      "games/memory-match/client/MemoryMatch.tsx",
      "games/memory-match/client/deck.ts",
      "games/riot/client/characters/**",
      "games/riot/spike/**",
    ],
    rules: {
      "low-stress/no-raw-design-values": "error",
    },
  },
  {
    // Larangan teks UI literal di JSX (Agents.md §5.2 & D-06).
    files: [
      "apps/web/src/**/*.tsx",
      "games/*/client/**/*.tsx",
    ],
    ignores: [
      "apps/web/src/pages/ShowcasePage.tsx",
      "games/riot/spike/**",
    ],
    rules: {
      "low-stress/no-jsx-literal": "error",
    },
  },
  {
    files: ["games/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "low-stress/game-workspace-imports": "error",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-undef": "off",
    },
  },
);
