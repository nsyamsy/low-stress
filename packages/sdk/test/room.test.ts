import { describe, expect, it, vi } from "vitest";
import {
  isRoomHost,
  assertRoomHost,
  computeExpirationCutoff,
  generateRoomCode,
  filterInvitableUsers,
  createIdleTimer,
} from "../src/room";

describe("RT-02: Shared Room Primitives", () => {
  it("validates room host correctly", () => {
    expect(isRoomHost("host1", "host1")).toBe(true);
    expect(isRoomHost("host1", "guest1")).toBe(false);

    expect(() => assertRoomHost("host1", "host1")).not.toThrow();
    expect(() => assertRoomHost("host1", "guest1")).toThrow(/Hanya host/);
  });

  it("computes expiration cutoff accurately", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const cutoff7Days = computeExpirationCutoff(7, now);
    expect(cutoff7Days.toISOString()).toBe("2026-10-29T12:00:00.000Z");
  });

  it("generates random room codes with expected characters and length", () => {
    const code = generateRoomCode(6);
    expect(code.length).toBe(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it("filters out users who are already in room participants list", () => {
    const users = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    const filtered = filterInvitableUsers(users, ["u2"]);
    expect(filtered).toEqual([{ id: "u1" }, { id: "u3" }]);
  });

  it("manages idle timer with reset and cancel", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const timer = createIdleTimer({ timeoutMs: 1000, onTimeout });

    vi.advanceTimersByTime(500);
    timer.reset();
    vi.advanceTimersByTime(800);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    timer.cancel();
    vi.useRealTimers();
  });
});
