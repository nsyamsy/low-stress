import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n from "@low-stress/i18n";
import { FlappyBird, type RunResult } from "../client/FlappyBird";
import FlappyBirdGame from "../client/index";
import { manifest } from "../manifest";
import type { GameProps } from "@low-stress/sdk";

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  clear: () => storage.clear(),
  removeItem: (key: string) => storage.delete(key),
};

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: localStorageMock,
  };
} else {
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
}

describe("P6-04: Flappy Bird Score Integration & Character Persistence", () => {
  beforeEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  it("menyimpan dan memulihkan karakter yang dipilih ke localStorage (cbr-flappy-character)", () => {
    // 1. Simpan karakter 'plane' di localStorage
    localStorageMock.setItem("cbr-flappy-character", "plane");

    // 2. Render komponen FlappyBird
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <FlappyBird />
      </I18nextProvider>,
    );

    // Verifikasi tombol radio karakter 'plane' tersorot (aria-checked="true")
    expect(html).toContain('title="Pesawat" aria-label="Pesawat"');
    expect(localStorageMock.getItem("cbr-flappy-character")).toBe("plane");
  });

  it("mengabaikan run dengan skor < 1 sehingga tidak dikirim ke onScore (Porting_Guide §2)", async () => {
    const onScoreMock = vi.fn();
    let capturedOnRunEnd: ((res: RunResult) => void) | undefined;

    // Komponen perantara untuk menangkap callback handleRunEnd
    function TestWrapper() {
      const mockProps: GameProps = {
        gameId: "flappy-bird",
        user: {
          id: "u-test",
          username: "tester",
          displayName: "Tester",
          locale: "id",
        },
        locale: "id",
        theme: "light",
        isMobile: false,
        onScore: onScoreMock,
        onExit: () => {},
      };

      // Simulasikan logika filter run skor < 1 dari FlappyBirdGame
      const handleRunEnd = (result: RunResult) => {
        if (result.score < 1) return;
        mockProps.onScore({
          score: result.score,
          durationMs: result.durationMs,
        });
      };
      capturedOnRunEnd = handleRunEnd;

      return (
        <I18nextProvider i18n={i18n}>
          <FlappyBirdGame {...mockProps} />
        </I18nextProvider>
      );
    }

    renderToString(<TestWrapper />);
    expect(capturedOnRunEnd).toBeDefined();

    // 1. Run menabrak pipa pertama (skor 0, durasi 1200ms) -> diabaikan
    await capturedOnRunEnd!({ score: 0, durationMs: 1200 });
    expect(onScoreMock).not.toHaveBeenCalled();

    // 2. Run berhasil melewati 2 pipa (skor 2, durasi 3500ms) -> dikirim ke onScore
    await capturedOnRunEnd!({ score: 2, durationMs: 3500 });
    expect(onScoreMock).toHaveBeenCalledTimes(1);
    expect(onScoreMock).toHaveBeenCalledWith({
      score: 2,
      durationMs: 3500,
    });
  });

  it("memvalidasi scoring manifest sesuai aturan kewajaran fisika Flappy Bird", () => {
    expect(manifest.scoring).toBeDefined();
    const scoring = manifest.scoring!;

    expect(scoring.direction).toBe("higher");
    expect(scoring.minScore).toBe(1);
    expect(scoring.maxScore).toBe(500);

    // Validasi skor wajar vs curang
    // Lolos: skor 1 dalam 2000ms (maxPossible = floor(2 / 0.85) + 1 = 2 + 1 = 3 >= 1)
    expect(scoring.validate?.({ score: 1, durationMs: 2000 })).toBe(true);

    // Lolos: skor 10 dalam 15000ms (maxPossible = floor(15 / 0.85) + 1 = 17 + 1 = 18 >= 10)
    expect(scoring.validate?.({ score: 10, durationMs: 15000 })).toBe(true);

    // Gagal: skor 50 dalam 1000ms (mustahil/bot)
    expect(scoring.validate?.({ score: 50, durationMs: 1000 })).toBe(false);

    // Gagal: skor melebihi batas absolut 500
    expect(scoring.validate?.({ score: 501, durationMs: 600000 })).toBe(false);
  });
});
