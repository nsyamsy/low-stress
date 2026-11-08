/**
 * Alat ekspor GLB untuk karakter Mochi (RT-40).
 *
 * Memakai geometri prosedural yang sama dengan renderer klien
 * (`client/characters/mochi.ts`) lalu mengekspor satu GLB per spesies ke
 * `assets/models/`. Aset hasil bersifat internal (dihasilkan sendiri),
 * tetap wajib tercatat di `assets/LICENSES.md`.
 *
 * Jalankan dari akar repositori:
 *   pnpm tsx games/riot/tools/export-mochi-glb.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { Group } from "three";

// GLTFExporter mengasumsikan FileReader (API browser). Node modern punya Blob
// tetapi belum FileReader, jadi sediakan shim minimal untuk ekspor GLB.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = buf;
        this.onloadend?.();
      })
      .catch(() => this.onerror?.());
  }

  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buf) => {
        const mime = blob.type || "application/octet-stream";
        this.result = `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
        this.onloadend?.();
      })
      .catch(() => this.onerror?.());
  }
}

if (typeof globalThis.FileReader === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).FileReader = NodeFileReader;
}
import {
  MOCHI_ACCENT_COLORS,
  MOCHI_BODY_COLORS,
  MOCHI_SPECIES,
  type MochiCustomization,
} from "../shared/character";
import { buildMochiAvatar } from "../client/characters/mochi";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../assets/models");

function exportGlb(object: Group): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  return new Promise((res, rej) => {
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) res(result);
        else rej(new Error("GLTFExporter tidak menghasilkan ArrayBuffer"));
      },
      (err) => rej(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    );
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const species of MOCHI_SPECIES) {
    const custom: MochiCustomization = {
      type: "mochi",
      species,
      bodyColorIndex: 0,
      accentColorIndex: 0,
      accessory: null,
    };
    const avatar = await buildMochiAvatar(custom);
    // Nama node membantu identifikasi bagian saat inspeksi GLB.
    avatar.name = `mochi_${species}`;

    const buffer = await exportGlb(avatar);
    const outPath = resolve(OUT_DIR, `mochi-${species}.glb`);
    writeFileSync(outPath, Buffer.from(buffer));
    console.log(
      `mochi-${species}.glb ${(buffer.byteLength / 1024).toFixed(1)} KB ` +
        `(body=${MOCHI_BODY_COLORS.length} warna, aksen=${MOCHI_ACCENT_COLORS.length} warna)`,
    );
  }

  console.log(`Selesai: ${MOCHI_SPECIES.length} GLB ditulis ke ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error("Ekspor GLB gagal:", err);
  process.exitCode = 1;
});
