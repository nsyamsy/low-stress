import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import gameWorkspaceImports from "../rules/game-workspace-imports.js";
import noRawDesignValues from "../rules/no-raw-design-values.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

function configFor(ruleName, rule) {
  const [namespace, name] = ruleName.split("/");
  return {
    files: ["**/*.{js,ts,tsx}"],
    plugins: { [namespace]: { rules: { [name]: rule } } },
    rules: { [ruleName]: "error" },
    settings: { "low-stress/project-root": PROJECT_ROOT },
  };
}

const rawValues = configFor(
  "low-stress/no-raw-design-values",
  noRawDesignValues,
);
const gameImports = configFor(
  "low-stress/game-workspace-imports",
  gameWorkspaceImports,
);

async function lint(config, code, filename) {
  const eslint = new ESLint({
    cwd: PROJECT_ROOT,
    overrideConfigFile: true,
    overrideConfig: [config],
  });
  const [result] = await eslint.lintText(code, { filePath: filename });
  return result.messages;
}

const gameFile = path.join(PROJECT_ROOT, "games", "demo", "client", "index.ts");

describe("no-raw-design-values", () => {
  it("menolak warna hex dan fungsi warna", async () => {
    const messages = await lint(
      rawValues,
      'const a = "#f2735b";\nconst b = "rgb(0 0 0)";\n',
      "a.ts",
    );
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.ruleId === "low-stress/no-raw-design-values")).toBe(true);
  });

  it("menolak ukuran berunit", async () => {
    const messages = await lint(rawValues, 'const gap = "16px";\n', "a.ts");
    expect(messages).toHaveLength(1);
  });

  it("menolak nilai mentah di template literal", async () => {
    const messages = await lint(rawValues, "const style = `padding: 4px;`;\n", "a.ts");
    expect(messages).toHaveLength(1);
  });

  it("membiarkan kelas token dan angka biasa", async () => {
    const messages = await lint(
      rawValues,
      'const className = "ls-button ls-button--primary";\nconst size = 320;\n',
      "a.ts",
    );
    expect(messages).toEqual([]);
  });
});

describe("game-workspace-imports", () => {
  it("mengizinkan paket sdk, ui, i18n dan impor di dalam game", async () => {
    const code = [
      'import { manifest } from "@low-stress/sdk";',
      'import { Button } from "@low-stress/ui";',
      'import { translate } from "@low-stress/i18n";',
      'import { score } from "./shared/score";',
    ].join("\n");
    expect(await lint(gameImports, code, gameFile)).toEqual([]);
  });

  it("menolak paket workspace lain", async () => {
    const code = 'import { db } from "@low-stress/db";\n';
    const messages = await lint(gameImports, code, gameFile);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("@low-stress/db");
  });

  it("menolak impor relatif yang keluar dari folder game", async () => {
    const code = 'import { other } from "../../other-game/client";\n';
    const messages = await lint(gameImports, code, gameFile);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("low-stress/game-workspace-imports");
  });

  it("tidak membatasi berkas di luar folder games", async () => {
    const code = 'import { db } from "@low-stress/db";\n';
    const messages = await lint(
      gameImports,
      code,
      path.join(PROJECT_ROOT, "apps", "web", "src", "main.ts"),
    );
    expect(messages).toEqual([]);
  });
});
