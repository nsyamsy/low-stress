import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE = join(ROOT, "packages/ui/assets/logo/logo-icon.svg");
const OUT_DIR = join(ROOT, "apps/web/public/icons");

interface IconTarget {
  size: number;
  name: string;
  /** Latar belakang penuh untuk ikon maskable. */
  background?: string;
  /** Ruang kosong di sekeliling burung, dalam persen. */
  padding?: number;
}

const TARGETS: IconTarget[] = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 180, name: "apple-touch-icon.png", background: "#2F5D55", padding: 0.14 },
  { size: 512, name: "icon-maskable-512.png", background: "#2F5D55", padding: 0.18 },
];

async function renderIcon(target: IconTarget): Promise<void> {
  const output = join(OUT_DIR, target.name);

  if (!target.background) {
    await sharp(SOURCE, { density: 384 })
      .resize(target.size, target.size, { fit: "contain" })
      .png()
      .toFile(output);
    console.log(`icons: ${target.name} (${target.size}px)`);
    return;
  }

  const inner = Math.round(target.size * (1 - (target.padding ?? 0) * 2));
  const bird = await sharp(SOURCE, { density: 384 })
    .resize(inner, inner, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: target.size,
      height: target.size,
      channels: 4,
      background: target.background,
    },
  })
    .composite([{ input: bird, gravity: "centre" }])
    .png()
    .toFile(output);
  console.log(`icons: ${target.name} (${target.size}px, maskable)`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const target of TARGETS) {
    await renderIcon(target);
  }

  const favicon = join(ROOT, "apps/web/public/favicon.png");
  await sharp(SOURCE, { density: 384 })
    .resize(64, 64, { fit: "contain" })
    .png()
    .toFile(favicon);
  console.log("icons: favicon.png (64px)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
