import { describe, expect, it } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  resolveReducedMotion,
} from "../client/reduced-motion";

describe("RT-52: prefers-reduced-motion", () => {
  it("mengembalikan true hanya bila preferensi reduce aktif", () => {
    expect(resolveReducedMotion(true)).toBe(true);
  });

  it("mengembalikan false untuk no-preference, null, dan undefined", () => {
    expect(resolveReducedMotion(false)).toBe(false);
    expect(resolveReducedMotion(null)).toBe(false);
    expect(resolveReducedMotion(undefined)).toBe(false);
  });

  it("memakai query media reduce standar", () => {
    expect(REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
  });
});
