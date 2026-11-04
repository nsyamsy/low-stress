import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { newState } from "../shared/engine";
import { LudoBoard } from "../client/LudoBoard";
import { PawnIcon } from "../client/LudoPawn";
import { Die } from "../client/Die";

describe("P7-05: Ludo Board & Pawn Rendering", () => {
  it("renders SVG board with correct viewBox and elements for 2 to 12 players", () => {
    for (const arms of [2, 4, 6, 8, 10, 12]) {
      const state = newState(arms, 2, "double", 1);
      const html = renderToString(
        <LudoBoard
          state={state}
          characters={["crown", "star", "cat", "robot", "heart", "ghost", "rocket", "pin"]}
          movable={[0]}
        />,
      );

      // SVG with role="img" and accessible aria-label
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Ludo board"');
      expect(html).toContain("viewBox=");
      expect(html).toContain("★"); // Safe zones
    }
  });

  it("renders pawn icons with accessible silhouettes for all 8 characters", () => {
    const characters = [
      "pin",
      "crown",
      "star",
      "cat",
      "robot",
      "heart",
      "ghost",
      "rocket",
    ] as const;

    for (const char of characters) {
      const html = renderToString(
        <PawnIcon id={char} color="#E8383D" dark="#A32226" size={28} />,
      );
      expect(html).toContain("viewBox=");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("#E8383D");
    }
  });

  it("renders dice faces with proper pips", () => {
    for (let pip = 1; pip <= 6; pip++) {
      const html = renderToString(<Die value={pip} rollId={1} />);
      expect(html).toContain(`aria-label="${pip}"`);
      expect(html).toContain("bg-slate-800");
    }
  });
});
