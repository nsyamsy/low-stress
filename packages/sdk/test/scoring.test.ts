import { describe, expect, it } from "vitest";
import {
  compareScores,
  isBetterScore,
  isPlausibleRun,
} from "../src/scoring";

describe("compareScores", () => {
  it("menganggap skor lebih tinggi lebih baik", () => {
    expect(compareScores("higher", 10, 5)).toBeLessThan(0);
    expect(compareScores("higher", 5, 10)).toBeGreaterThan(0);
    expect(compareScores("higher", 5, 5)).toBe(0);
  });

  it("menganggap skor lebih rendah lebih baik", () => {
    expect(compareScores("lower", 5, 10)).toBeLessThan(0);
    expect(compareScores("lower", 10, 5)).toBeGreaterThan(0);
  });
});

describe("isBetterScore", () => {
  it("rekor pertama selalu lebih baik", () => {
    expect(isBetterScore("higher", 10, null)).toBe(true);
    expect(isBetterScore("lower", 10, undefined)).toBe(true);
  });

  it("seri tidak menggantikan rekor", () => {
    expect(isBetterScore("higher", 10, 10)).toBe(false);
  });
});

describe("isPlausibleRun", () => {
  it("menerima run dalam batas", () => {
    expect(
      isPlausibleRun(
        { score: 18, durationMs: 20_000 },
        { minScore: 0, maxScore: 100, maxScorePerSecond: 2 },
      ),
    ).toBe(true);
  });

  it("menolak skor di atas batas", () => {
    expect(isPlausibleRun({ score: 101, durationMs: 20_000 }, { maxScore: 100 })).toBe(
      false,
    );
  });

  it("menolak skor per detik yang mustahil", () => {
    expect(
      isPlausibleRun(
        { score: 100, durationMs: 1_000 },
        { maxScorePerSecond: 2 },
      ),
    ).toBe(false);
  });

  it("menolak nilai pecahan dan negatif", () => {
    expect(isPlausibleRun({ score: 1.5, durationMs: 1_000 }, {})).toBe(false);
    expect(isPlausibleRun({ score: -1, durationMs: 1_000 }, {})).toBe(false);
  });
});
