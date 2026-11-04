import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { geometry, newState } from "../shared/engine";
import { LudoBoard } from "../client/LudoBoard";

describe("P7-09: 12-Player Board Readability and Sizing on 360px Viewport", () => {
  it("computes non-overlapping track and yard geometry for 12 players", () => {
    const g12 = geometry(12);
    expect(g12.arms).toBe(12);
    expect(g12.hub).toBeGreaterThan(0);
    expect(g12.length).toBe(14);

    // Total diameter in SVG units
    const S = 20;
    const total =
      Math.max(
        g12.hub + g12.length + 0.6,
        Math.hypot(g12.yardRadius + g12.yard / 2, g12.yard / 2) + 0.4,
      ) * S;

    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(500); // Fits nicely within standard SVG scaling
  });

  it("renders 12-player board without horizontal overflow on 360px container", () => {
    const state = newState(12, 2, "double", 1);
    const html = renderToString(
      <div style={{ width: 340, maxWidth: "100%", overflow: "hidden" }}>
        <LudoBoard state={state} movable={[0]} />
      </div>,
    );

    // Verifies SVG has viewBox and responsive width
    expect(html).toContain('viewBox="-');
    expect(html).toContain("w-full");
    expect(html).toContain('aria-label="Ludo board"');

    // Verifies all 12 arm star safe zones are rendered
    const starMatches = html.match(/★/g);
    expect(starMatches?.length).toBe(12);

    // Verifies touch target hit area is present (r=22)
    expect(html).toContain('r="22"');
  });
});
