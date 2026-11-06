import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkGameAssets } from "../src/index";
import { checkAssetSizeBudget } from "../src/pipeline";

describe("RT-03: check-assets and pipeline", () => {
  it("passes when all asset files are documented in LICENSES.md with approved licenses", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ls-assets-test-"));
    try {
      const assetsDir = join(tempDir, "games", "test-game", "assets");
      mkdirSync(assetsDir, { recursive: true });

      writeFileSync(join(assetsDir, "model.glb"), "dummy glb content");
      writeFileSync(join(assetsDir, "texture.webp"), "dummy webp content");
      writeFileSync(
        join(assetsDir, "LICENSES.md"),
        `# Assets Licenses
- model.glb: CC0 1.0 Universal by Author
- texture.webp: CC-BY 4.0 by Artist (https://example.com)
`,
      );

      const problems = checkGameAssets(tempDir, "test-game");
      expect(problems).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when an asset is missing from LICENSES.md", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ls-assets-test-"));
    try {
      const assetsDir = join(tempDir, "games", "test-game", "assets");
      mkdirSync(assetsDir, { recursive: true });

      writeFileSync(join(assetsDir, "unlisted.glb"), "dummy content");
      writeFileSync(
        join(assetsDir, "LICENSES.md"),
        `# Assets Licenses\n- other.glb: CC0\n`,
      );

      const problems = checkGameAssets(tempDir, "test-game");
      expect(problems.length).toBeGreaterThan(0);
      expect(problems[0]!.message).toContain('tidak tercatat di');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when LICENSES.md has non-commercial (NC) or no-derivatives (ND) terms", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ls-assets-test-"));
    try {
      const assetsDir = join(tempDir, "games", "test-game", "assets");
      mkdirSync(assetsDir, { recursive: true });

      writeFileSync(join(assetsDir, "model.glb"), "dummy content");
      writeFileSync(
        join(assetsDir, "LICENSES.md"),
        `# Assets Licenses\n- model.glb: CC-BY-NC 4.0\n`,
      );

      const problems = checkGameAssets(tempDir, "test-game");
      expect(problems.length).toBeGreaterThan(0);
      expect(problems[0]!.message).toContain('lisensi terlarang');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when assets exist without a LICENSES.md file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "ls-assets-test-"));
    try {
      const assetsDir = join(tempDir, "games", "test-game", "assets");
      mkdirSync(assetsDir, { recursive: true });

      writeFileSync(join(assetsDir, "orphan.glb"), "dummy content");

      const problems = checkGameAssets(tempDir, "test-game");
      expect(problems.length).toBe(1);
      expect(problems[0]!.message).toContain('tidak memiliki berkas LICENSES.md');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("validates asset budget correctly", () => {
    const valid = checkAssetSizeBudget(1024 * 1024); // 1 MB
    expect(valid.ok).toBe(true);

    const exceeded = checkAssetSizeBudget(3 * 1024 * 1024); // 3 MB (max is 2 MB)
    expect(exceeded.ok).toBe(false);
    expect(exceeded.message).toContain('melebihi batas anggaran');
  });
});
