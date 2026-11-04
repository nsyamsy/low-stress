import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureCommercialSchema } from "@/lib/commercial";
import { isPrivilegedRole } from "@/lib/role-constants";

// When the games (Quick Tool, Memory Match, Team Sync) can be played. The clock is Western Indonesia Time:
// the office runs on it, and the server's own time zone is not something a schedule should depend on.

export const GAMES_TIME_ZONE = "Asia/Jakarta";
export const GAMES_TIME_LABEL = "WIB";
const SETTING_KEY = "games_schedule";

export interface TimeWindow {
  /** "HH:MM", 24 hours. The start is inside the window, the end is not. */
  start: string;
  end: string;
}

export interface GamesSchedule {
  /** Off = the games are always available. */
  enabled: boolean;
  /** One or more windows a day; the games are open in any of them. A window may cross midnight (17:30–08:30). */
  windows: TimeWindow[];
  /** Days the windows open on, 0 = Sunday … 6 = Saturday. */
  days: number[];
}

export const MAX_WINDOWS = 6;
export const DEFAULT_SCHEDULE: GamesSchedule = { enabled: false, windows: [{ start: "12:00", end: "13:00" }], days: [1, 2, 3, 4, 5] };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A posted (or stored) schedule, cleaned; null when it cannot be used. The first version stored one start and end. */
export function parseSchedule(raw: unknown): GamesSchedule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const rawWindows = Array.isArray(o.windows) ? o.windows : typeof o.start === "string" ? [{ start: o.start, end: o.end }] : [];
  if (rawWindows.length === 0 || rawWindows.length > MAX_WINDOWS) return null;
  const windows: TimeWindow[] = [];
  for (const w of rawWindows) {
    const start = typeof w?.start === "string" ? w.start : "";
    const end = typeof w?.end === "string" ? w.end : "";
    if (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end) return null;
    windows.push({ start, end });
  }
  windows.sort((x, y) => x.start.localeCompare(y.start));
  const days = Array.isArray(o.days) ? [...new Set(o.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  if (days.length === 0) return null;
  return { enabled: o.enabled === true, windows, days };
}

export async function loadSchedule(): Promise<GamesSchedule> {
  await ensureCommercialSchema();
  const res = await db.execute(sql`SELECT value FROM commercial_app_settings WHERE key = ${SETTING_KEY}`);
  return parseSchedule((res.rows[0] as { value?: unknown } | undefined)?.value) ?? DEFAULT_SCHEDULE;
}

export async function saveSchedule(schedule: GamesSchedule) {
  await ensureCommercialSchema();
  await db.execute(sql`
    INSERT INTO commercial_app_settings (key, value, updated_at) VALUES (${SETTING_KEY}, ${JSON.stringify(schedule)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `);
}

/** "12:00–13:00, 17:30–08:30" */
export const describeWindows = (windows: TimeWindow[]) => windows.map((w) => `${w.start}–${w.end}`).join(", ");

/** Day of the week (0 = Sunday) and minutes since midnight of `now` in the games time zone. */
function localClock(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: GAMES_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Is one window open? It starts on a chosen day; one that crosses midnight stays open after midnight under the day it started on. */
function windowOpen(window: TimeWindow, days: number[], day: number, minutes: number): boolean {
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);
  if (start < end) return days.includes(day) && minutes >= start && minutes < end;
  if (minutes >= start) return days.includes(day);
  if (minutes < end) return days.includes((day + 6) % 7);
  return false;
}

/** Are the games open at `now`? Any of the windows will do; with the limit switched off they always are. */
export function isWindowOpen(schedule: GamesSchedule, now: Date = new Date()): boolean {
  if (!schedule.enabled) return true;
  const { day, minutes } = localClock(now);
  return schedule.windows.some((w) => windowOpen(w, schedule.days, day, minutes));
}

/** The games are closed for this user right now? Administrators can always play, so they can test and look after them. */
export async function gamesClosedResponse(auth: { role: string }): Promise<NextResponse | null> {
  if (isPrivilegedRole(auth.role)) return null;
  const schedule = await loadSchedule();
  if (isWindowOpen(schedule)) return null;
  return NextResponse.json(
    { error: `The games are closed right now. They open ${describeWindows(schedule.windows)} ${GAMES_TIME_LABEL}.`, closed: true },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}
