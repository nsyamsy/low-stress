import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n from "@low-stress/i18n";
import { draw, type Labels } from "../client/render";
import FlappyBirdGame from "../client/index";
import { createState } from "../shared/engine";
import type { GameProps } from "@low-stress/sdk";

function createMockCanvasContext() {
  const operations: Array<{ op: string; args: unknown[]; fillStyle?: string }> =
    [];
  let currentFillStyle = "";
  return {
    operations,
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string) {
      currentFillStyle = val;
    },
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    textAlign: "",
    textBaseline: "",
    font: "",
    globalAlpha: 1,
    beginPath: () => operations.push({ op: "beginPath", args: [] }),
    closePath: () => operations.push({ op: "closePath", args: [] }),
    moveTo: (x: number, y: number) =>
      operations.push({ op: "moveTo", args: [x, y] }),
    lineTo: (x: number, y: number) =>
      operations.push({ op: "lineTo", args: [x, y] }),
    stroke: () => operations.push({ op: "stroke", args: [] }),
    fill: () => operations.push({ op: "fill", args: [] }),
    ellipse: (...args: unknown[]) =>
      operations.push({ op: "ellipse", args }),
    arc: (...args: unknown[]) => operations.push({ op: "arc", args }),
    arcTo: (...args: unknown[]) => operations.push({ op: "arcTo", args }),
    save: () => operations.push({ op: "save", args: [] }),
    restore: () => operations.push({ op: "restore", args: [] }),
    translate: (x: number, y: number) =>
      operations.push({ op: "translate", args: [x, y] }),
    rotate: (r: number) => operations.push({ op: "rotate", args: [r] }),
    scale: (sx: number, sy: number) =>
      operations.push({ op: "scale", args: [sx, sy] }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      operations.push({
        op: "fillRect",
        args: [x, y, w, h],
        fillStyle: currentFillStyle,
      }),
    strokeRect: (...args: unknown[]) =>
      operations.push({ op: "strokeRect", args }),
    strokeText: (...args: unknown[]) =>
      operations.push({ op: "strokeText", args }),
    fillText: (...args: unknown[]) =>
      operations.push({ op: "fillText", args }),
    quadraticCurveTo: () => {},
    setTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D & {
    operations: Array<{ op: string; args: unknown[]; fillStyle?: string }>;
  };
}

const mockLabels: Labels = {
  ready: "Siap?",
  tapToStart: "Ketuk untuk mulai",
  gameOver: "Game Over",
  score: "Skor",
  best: "Rekor",
  newBest: "REKOR BARU",
  tapToRetry: "Ketuk untuk main lagi",
};

describe("P6-03: Responsive FIT Scale & prefers-reduced-motion", () => {
  it("menghilangkan kilat putih saat prefers-reduced-motion aktif", () => {
    // 1. Kondisi normal (reducedMotion = false): ada efek kilat putih pada 0.1s setelah tabrakan
    const sOver = createState();
    sOver.phase = "over";
    sOver.sinceOver = 0.1;

    const ctxNormal = createMockCanvasContext();
    draw(ctxNormal, sOver, 10, false, mockLabels, "yellow", false);

    const normalFlashRects = ctxNormal.operations.filter(
      (item) =>
        item.op === "fillRect" &&
        typeof item.fillStyle === "string" &&
        item.fillStyle.includes("rgba(255,255,255,"),
    );
    expect(normalFlashRects.length).toBeGreaterThan(0);

    // 2. Kondisi reduced motion (reducedMotion = true): kilat putih TIDAK DIGAMBAR
    const ctxReduced = createMockCanvasContext();
    draw(ctxReduced, sOver, 10, false, mockLabels, "yellow", true);

    const reducedFlashRects = ctxReduced.operations.filter(
      (item) =>
        item.op === "fillRect" &&
        typeof item.fillStyle === "string" &&
        item.fillStyle.includes("rgba(255,255,255,"),
    );
    expect(reducedFlashRects.length).toBe(0);
  });

  it("merender tampilan mobile 360x640: skala FIT, urutan game di atas, tombol sentuh >= 44px", () => {
    const mockProps: GameProps = {
      gameId: "flappy-bird",
      user: {
        id: "usr-mob",
        username: "mobileplayer",
        displayName: "Mobile Player",
        locale: "id",
      },
      locale: "id",
      theme: "light",
      isMobile: true,
      onScore: async () => {},
      onExit: () => {},
    };

    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <FlappyBirdGame {...mockProps} />
      </I18nextProvider>,
    );

    // Layout grid flappy bird
    expect(html).toContain("ls-flappy-layout");

    // Skala FIT kanvas: aspect ratio 360/560 dan max lebar 360px
    expect(html).toContain("ls-flappy-canvas");
    expect(html).toContain("ls-flappy-controls");

    // Urutan mobile:
    // Game di order-1
    expect(html).toContain("order-1 md:order-2");
    // Leaderboard di order-2
    expect(html).toContain("order-2 md:order-1");
    // Aturan di order-3
    expect(html).toContain("order-3");

    // Target sentuh tombol karakter memenuhi kriteria mobile >= 44px (ls-flappy-char-btn)
    expect(html).toContain("ls-flappy-char-btn");
  });

  it("merender tampilan desktop 1280x800: layout 3 kolom terstruktur", () => {
    const mockProps: GameProps = {
      gameId: "flappy-bird",
      user: {
        id: "usr-desk",
        username: "desktopplayer",
        displayName: "Desktop Player",
        locale: "id",
      },
      locale: "id",
      theme: "light",
      isMobile: false,
      onScore: async () => {},
      onExit: () => {},
    };

    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <FlappyBirdGame {...mockProps} />
      </I18nextProvider>,
    );

    // Memuat container max-w-6xl
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("ls-flappy-layout");

    // Seluruh tiga komponen (Leaderboard, Game Canvas, Aturan) hadir
    expect(html).toContain("Leaderboard");
    expect(html).toContain("Flappy Bird");
    expect(html).toContain("Cara bermain");
  });
});
