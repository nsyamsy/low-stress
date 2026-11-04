export const GAMES_TIME_ZONE = "Asia/Jakarta";
export const GAMES_TIME_LABEL = "WIB";
export const MAX_WINDOWS = 6;

export interface TimeWindow {
  /** "HH:MM", 24 jam. Jam mulai termasuk dalam jendela, jam selesai tidak. */
  start: string;
  end: string;
}

export interface GamesSchedule {
  /** false = game selalu terbuka tanpa batasan jadwal. */
  enabled: boolean;
  /** Satu sampai enam jendela waktu per hari. Jendela boleh melewati tengah malam (misal 22:00–02:00). */
  windows: TimeWindow[];
  /** Hari ketika jendela dibuka: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu. */
  days: number[];
}

export const DEFAULT_SCHEDULE: GamesSchedule = {
  enabled: false,
  windows: [{ start: "12:00", end: "13:00" }],
  days: [1, 2, 3, 4, 5],
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(timeStr: string): number {
  return Number(timeStr.slice(0, 2)) * 60 + Number(timeStr.slice(3, 5));
}

/**
 * Validasi dan bersihkan objek jadwal.
 * Mengembalikan null jika jadwal tidak valid.
 */
export function parseSchedule(raw: unknown): GamesSchedule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const rawWindows = Array.isArray(obj.windows)
    ? obj.windows
    : typeof obj.start === "string" && typeof obj.end === "string"
      ? [{ start: obj.start, end: obj.end }]
      : [];

  if (rawWindows.length === 0 || rawWindows.length > MAX_WINDOWS) return null;

  const windows: TimeWindow[] = [];
  for (const w of rawWindows) {
    if (typeof w !== "object" || w === null) return null;
    const start = typeof (w as Record<string, unknown>).start === "string" ? (w as Record<string, unknown>).start as string : "";
    const end = typeof (w as Record<string, unknown>).end === "string" ? (w as Record<string, unknown>).end as string : "";
    if (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end) {
      return null;
    }
    windows.push({ start, end });
  }

  windows.sort((a, b) => a.start.localeCompare(b.start));

  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const days = [
    ...new Set(
      rawDays.filter(
        (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6,
      ),
    ),
  ].sort((a, b) => a - b);

  if (days.length === 0) return null;

  return {
    enabled: obj.enabled === true,
    windows,
    days,
  };
}

/**
 * Mengambil bagian tanggal dan waktu di zona waktu Asia/Jakarta (WIB).
 */
export function getJakartaDateParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GAMES_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month")); // 1-12
  const dayOfMonth = Number(get("day"));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday"),
  );
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));

  return {
    year,
    month,
    dayOfMonth,
    weekday,
    hour,
    minute,
    second,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/**
 * Cek apakah satu jendela waktu sedang terbuka.
 * Jendela yang melewati tengah malam tetap terbuka setelah tengah malam di bawah hari mulainya.
 */
export function isSingleWindowOpen(
  window: TimeWindow,
  days: number[],
  dayOfWeek: number,
  minutesSinceMidnight: number,
): boolean {
  const start = toMinutes(window.start);
  const end = toMinutes(window.end);

  if (start < end) {
    // Jendela biasa dalam hari yang sama
    return (
      days.includes(dayOfWeek) &&
      minutesSinceMidnight >= start &&
      minutesSinceMidnight < end
    );
  }

  // Jendela melintasi tengah malam (misal 22:00 - 02:00)
  // Sebelum tengah malam di hari jadwal dimulai:
  if (minutesSinceMidnight >= start) {
    return days.includes(dayOfWeek);
  }
  // Setelah tengah malam: dimulai pada hari kemarin ((dayOfWeek + 6) % 7)
  if (minutesSinceMidnight < end) {
    return days.includes((dayOfWeek + 6) % 7);
  }

  return false;
}

/**
 * Cek apakah jadwal mengizinkan bermain pada waktu `now`.
 * Jika jadwal dinonaktifkan (`enabled: false`), selalu mengembalikan true.
 */
export function isScheduleOpen(
  schedule: GamesSchedule,
  now: Date = new Date(),
): boolean {
  if (!schedule.enabled) return true;
  const { weekday, minutesSinceMidnight } = getJakartaDateParts(now);
  return schedule.windows.some((w) =>
    isSingleWindowOpen(w, schedule.days, weekday, minutesSinceMidnight),
  );
}

/**
 * Deskripsi jendela waktu, contoh: "12:00–13:00, 17:30–08:30 WIB"
 */
export function describeWindows(windows: TimeWindow[]): string {
  return `${windows.map((w) => `${w.start}–${w.end}`).join(", ")} ${GAMES_TIME_LABEL}`;
}

/**
 * Hitung waktu pembukaan berikutnya dalam bentuk objek Date, bila saat ini sedang tutup.
 * Menghasilkan null jika jadwal terbuka atau tidak ada jendela pembukaan valid.
 */
export function getNextOpeningTime(
  schedule: GamesSchedule,
  now: Date = new Date(),
): Date | null {
  if (!schedule.enabled) return null;
  if (isScheduleOpen(schedule, now)) return null;
  if (schedule.windows.length === 0 || schedule.days.length === 0) return null;

  const currentJakarta = getJakartaDateParts(now);
  const nowMs = now.getTime();

  let earliestCandidateMs = Infinity;

  // Telusuri 8 hari ke depan (hari ini + 7 hari berikutnya)
  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const targetWeekday = (currentJakarta.weekday + dayOffset) % 7;
    if (!schedule.days.includes(targetWeekday)) continue;

    // Hitung tanggal target di WIB
    const baseDate = new Date(
      Date.UTC(
        currentJakarta.year,
        currentJakarta.month - 1,
        currentJakarta.dayOfMonth + dayOffset,
      ),
    );
    const y = baseDate.getUTCFullYear();
    const m = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(baseDate.getUTCDate()).padStart(2, "0");

    for (const w of schedule.windows) {
      // Waktu pembukaan window di WIB (+07:00)
      const candidateDate = new Date(`${y}-${m}-${d}T${w.start}:00+07:00`);
      const candidateMs = candidateDate.getTime();
      if (candidateMs > nowMs && candidateMs < earliestCandidateMs) {
        earliestCandidateMs = candidateMs;
      }
    }
  }

  return Number.isFinite(earliestCandidateMs) ? new Date(earliestCandidateMs) : null;
}
