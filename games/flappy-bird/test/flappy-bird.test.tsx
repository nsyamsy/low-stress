import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n from "@low-stress/i18n";
import {
  CHARACTERS,
  isCharacter,
  drawCharacter,
} from "../client/characters";
import {
  FlappyBird,
} from "../client/FlappyBird";
import {
  draw,
  type Labels,
} from "../client/render";
import FlappyBirdGame from "../client/index";
import { createState } from "../shared/engine";
import type { GameProps } from "@low-stress/sdk";

// Mock canvas context untuk memverifikasi eksekusi visual Canvas 2D di Node.js
function createMockCanvasContext() {
  const operations: string[] = [];
  return {
    operations,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    textAlign: "",
    textBaseline: "",
    font: "",
    globalAlpha: 1,
    beginPath: () => operations.push("beginPath"),
    closePath: () => operations.push("closePath"),
    moveTo: (x: number, y: number) => operations.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => operations.push(`lineTo(${x},${y})`),
    stroke: () => operations.push("stroke"),
    fill: () => operations.push("fill"),
    ellipse: () => operations.push("ellipse"),
    arc: () => operations.push("arc"),
    arcTo: () => operations.push("arcTo"),
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    translate: (x: number, y: number) => operations.push(`translate(${x},${y})`),
    rotate: (r: number) => operations.push(`rotate(${r})`),
    scale: (sx: number, sy: number) => operations.push(`scale(${sx},${sy})`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      operations.push(`fillRect(${x},${y},${w},${h})`),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      operations.push(`strokeRect(${x},${y},${w},${h})`),
    strokeText: (text: string) => operations.push(`strokeText(${text})`),
    fillText: (text: string) => operations.push(`fillText(${text})`),
    quadraticCurveTo: () => operations.push("quadraticCurveTo"),
    setTransform: () => operations.push("setTransform"),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D & { operations: string[] };
}

describe("P6-02: Flappy Bird Canvas 2D & Characters", () => {
  it("mendukung 6 karakter yang valid (yellow, red, blue, bat, plane, ghost)", () => {
    expect(CHARACTERS).toEqual([
      "yellow",
      "red",
      "blue",
      "bat",
      "plane",
      "ghost",
    ]);

    for (const char of CHARACTERS) {
      expect(isCharacter(char)).toBe(true);
    }
    expect(isCharacter("dragon")).toBe(false);
    expect(isCharacter(123)).toBe(false);
    expect(isCharacter(null)).toBe(false);
  });

  it("dapat menggambar keenam karakter ke konteks Canvas 2D", () => {
    for (const char of CHARACTERS) {
      const ctx = createMockCanvasContext();
      expect(() => {
        drawCharacter(ctx, char, 0.2);
      }).not.toThrow();
      expect(ctx.operations.length).toBeGreaterThan(0);
    }
  });

  it("merender komponen FlappyBird dengan canvas dan 6 tombol karakter", () => {
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <FlappyBird defaultBest={15} />
      </I18nextProvider>,
    );

    // Kanvas dengan rasio 360/560
    expect(html).toContain("<canvas");
    expect(html).toContain("ls-flappy-canvas");
    expect(html).toContain("role=\"img\"");

    // Radiogroup 6 karakter
    expect(html).toContain("role=\"radiogroup\"");
    expect(html).toContain("role=\"radio\"");
    expect(html).toContain("Burung kuning");
    expect(html).toContain("Kelelawar");
    expect(html).toContain("Pesawat");
    expect(html).toContain("Hantu");

    // Rekor terbaik
    expect(html).toContain("15");
  });

  it("merender halaman FlappyBirdGame lengkap dengan leaderboard dan aturan", () => {
    const mockProps: GameProps = {
      gameId: "flappy-bird",
      user: {
        id: "usr-1",
        username: "pilot",
        displayName: "Top Pilot",
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
    expect(html).toContain("ls-flappy-layout");
    expect(html).toContain("Flappy Bird");
    expect(html).toContain("Cara bermain");
    expect(html).toContain("Leaderboard");
  });

  it("fungsi draw() berjalan mulus pada setiap fase (ready, playing, over)", () => {
    const labels: Labels = {
      ready: "Siap?",
      tapToStart: "Ketuk untuk mulai",
      gameOver: "Game Over",
      score: "Skor",
      best: "Rekor",
      newBest: "REKOR BARU",
      tapToRetry: "Ketuk untuk main lagi",
    };

    // 1. Fase Ready
    const sReady = createState();
    const ctxReady = createMockCanvasContext();
    expect(() => {
      draw(ctxReady, sReady, 10, false, labels, "yellow");
    }).not.toThrow();
    expect(ctxReady.operations).toContain("strokeText(Siap?)");

    // 2. Fase Playing
    const sPlaying = createState();
    sPlaying.phase = "playing";
    sPlaying.score = 5;
    const ctxPlaying = createMockCanvasContext();
    expect(() => {
      draw(ctxPlaying, sPlaying, 10, false, labels, "blue");
    }).not.toThrow();
    expect(ctxPlaying.operations).toContain("strokeText(5)");

    // 3. Fase Over dengan medali perunggu (skor 12) & rekor baru
    const sOverBronze = createState();
    sOverBronze.phase = "over";
    sOverBronze.score = 12;
    sOverBronze.sinceOver = 1.0;
    const ctxOverBronze = createMockCanvasContext();
    expect(() => {
      draw(ctxOverBronze, sOverBronze, 12, true, labels, "bat");
    }).not.toThrow();
    expect(ctxOverBronze.operations).toContain("strokeText(Game Over)");
    expect(ctxOverBronze.operations).toContain("fillText(REKOR BARU)");
    expect(ctxOverBronze.operations).toContain("fillText(★)");

    // 4. Fase Over dengan medali emas (skor 35)
    const sOverGold = createState();
    sOverGold.phase = "over";
    sOverGold.score = 35;
    sOverGold.sinceOver = 1.0;
    const ctxOverGold = createMockCanvasContext();
    expect(() => {
      draw(ctxOverGold, sOverGold, 35, false, labels, "ghost");
    }).not.toThrow();
    expect(ctxOverGold.operations).toContain("strokeText(35)");
  });
});
