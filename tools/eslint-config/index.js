import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import path from "node:path";
import tseslint from "typescript-eslint";

import gameWorkspaceImports from "./rules/game-workspace-imports.js";
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
];

const BOUNDARY_POLICIES = [
  // Paket inti tidak boleh bergantung pada aplikasi, game, atau tool.
  { from: { element: { type: "app" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package"] } } }] },
  // Game hanya boleh memakai sdk, ui, dan i18n. Impor di dalam game yang sama
  // diabaikan oleh plugin karena masih satu elemen.
  { from: { element: { type: "game" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n"] } } }] },
  { from: { element: { type: "tool" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package"] } } }] },
  { from: { element: { type: "package" } }, allow: [{ to: { element: { type: ["sdk", "ui", "i18n", "db", "package"] } } }] },
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
    // Larangan nilai desain mentah berlaku untuk kode UI. Aset logo adalah
    // pengecualian yang didokumentasikan: warnanya adalah bagian dari merek.
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}",
      "games/*/client/**/*.{ts,tsx}",
      "games/*/shared/**/*.{ts,tsx}",
    ],
    ignores: ["packages/ui/src/components/Logo.tsx"],
    rules: {
      "low-stress/no-raw-design-values": "error",
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
