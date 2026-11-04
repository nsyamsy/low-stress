import { describe, expect, it } from "vitest";
import {
  describeWindows,
  getNextOpeningTime,
  isScheduleOpen,
  parseSchedule,
} from "../src/games/schedule";

describe("Games Schedule Engine (P4-02)", () => {
  it("parseSchedule memvalidasi dan mengurutkan jendela", () => {
    // Valid
    const parsed = parseSchedule({
      enabled: true,
      windows: [
        { start: "17:00", end: "19:00" },
        { start: "12:00", end: "13:00" },
      ],
      days: [5, 1, 2, 1], // Unik dan urut
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.windows).toEqual([
      { start: "12:00", end: "13:00" },
      { start: "17:00", end: "19:00" },
    ]);
    expect(parsed?.days).toEqual([1, 2, 5]);

    // Tidak valid: start === end
    expect(
      parseSchedule({
        enabled: true,
        windows: [{ start: "12:00", end: "12:00" }],
        days: [1],
      }),
    ).toBeNull();

    // Tidak valid: format salah
    expect(
      parseSchedule({
        enabled: true,
        windows: [{ start: "25:00", end: "12:00" }],
        days: [1],
      }),
    ).toBeNull();

    // Tidak valid: days kosong
    expect(
      parseSchedule({
        enabled: true,
        windows: [{ start: "12:00", end: "13:00" }],
        days: [],
      }),
    ).toBeNull();

    // Format legacy start/end didukung
    const legacy = parseSchedule({
      enabled: true,
      start: "08:00",
      end: "10:00",
      days: [0, 6],
    });
    expect(legacy?.windows).toEqual([{ start: "08:00", end: "10:00" }]);
    expect(legacy?.days).toEqual([0, 6]);
  });

  it("enabled: false selalu buka tanpa melihat hari dan jam", () => {
    const schedule = {
      enabled: false,
      windows: [{ start: "12:00", end: "13:00" }],
      days: [1], // Senin saja
    };

    // Hari Minggu jam 03:00 WIB
    const sundayNight = new Date("2026-11-08T20:00:00Z"); // 03:00 WIB Senin / Minggu
    expect(isScheduleOpen(schedule, sundayNight)).toBe(true);
    expect(getNextOpeningTime(schedule, sundayNight)).toBeNull();
  });

  it("jendela waktu normal (start < end) mematuhi batas inklusif start dan eksklusif end", () => {
    const schedule = {
      enabled: true,
      windows: [{ start: "12:00", end: "13:00" }],
      days: [1], // Hanya Senin (1)
    };

    // Senin 2026-11-02:
    // 11:59:59 WIB -> Tutup
    const tBefore = new Date("2026-11-02T11:59:59+07:00");
    expect(isScheduleOpen(schedule, tBefore)).toBe(false);

    // 12:00:00 WIB -> Buka (start inklusif)
    const tStart = new Date("2026-11-02T12:00:00+07:00");
    expect(isScheduleOpen(schedule, tStart)).toBe(true);

    // 12:30:00 WIB -> Buka
    const tMid = new Date("2026-11-02T12:30:00+07:00");
    expect(isScheduleOpen(schedule, tMid)).toBe(true);

    // 13:00:00 WIB -> Tutup (end eksklusif)
    const tEnd = new Date("2026-11-02T13:00:00+07:00");
    expect(isScheduleOpen(schedule, tEnd)).toBe(false);

    // Selasa 12:30:00 WIB -> Tutup (bukan hari yang dijadwalkan)
    const tTuesday = new Date("2026-11-03T12:30:00+07:00");
    expect(isScheduleOpen(schedule, tTuesday)).toBe(false);
  });

  it("jendela melintasi tengah malam (start > end) tetap buka setelah tengah malam di bawah hari mulainya", () => {
    // Misal: Senin buka jam 22:00 sampai Selasa 02:00 WIB
    const schedule = {
      enabled: true,
      windows: [{ start: "22:00", end: "02:00" }],
      days: [1], // Hanya dibuka Senin malam
    };

    // Senin 21:59 WIB -> Tutup
    const monBefore = new Date("2026-11-02T21:59:00+07:00");
    expect(isScheduleOpen(schedule, monBefore)).toBe(false);

    // Senin 22:00 WIB -> Buka
    const monStart = new Date("2026-11-02T22:00:00+07:00");
    expect(isScheduleOpen(schedule, monStart)).toBe(true);

    // Senin 23:59 WIB -> Buka
    const monLate = new Date("2026-11-02T23:59:00+07:00");
    expect(isScheduleOpen(schedule, monLate)).toBe(true);

    // Selasa 00:00 WIB -> Buka (lintas tengah malam di bawah hari Senin)
    const tueMidnight = new Date("2026-11-03T00:00:00+07:00");
    expect(isScheduleOpen(schedule, tueMidnight)).toBe(true);

    // Selasa 01:59 WIB -> Buka
    const tueEarly = new Date("2026-11-03T01:59:00+07:00");
    expect(isScheduleOpen(schedule, tueEarly)).toBe(true);

    // Selasa 02:00 WIB -> Tutup
    const tueEnd = new Date("2026-11-03T02:00:00+07:00");
    expect(isScheduleOpen(schedule, tueEnd)).toBe(false);

    // Selasa 22:30 WIB -> Tutup (Selasa malam tidak ada jadwal)
    const tueNight = new Date("2026-11-03T22:30:00+07:00");
    expect(isScheduleOpen(schedule, tueNight)).toBe(false);
  });

  it("jendela melintasi tengah malam pada hari Minggu (0) ke Senin (1)", () => {
    // Buka Minggu malam 23:00 sampai Senin pagi 01:00 WIB
    const schedule = {
      enabled: true,
      windows: [{ start: "23:00", end: "01:00" }],
      days: [0], // Minggu saja
    };

    // Minggu 2026-11-08 23:30 WIB -> Buka
    const sunNight = new Date("2026-11-08T23:30:00+07:00");
    expect(isScheduleOpen(schedule, sunNight)).toBe(true);

    // Senin 2026-11-09 00:30 WIB -> Buka
    const monMorning = new Date("2026-11-09T00:30:00+07:00");
    expect(isScheduleOpen(schedule, monMorning)).toBe(true);

    // Senin 2026-11-09 01:00 WIB -> Tutup
    const monClosed = new Date("2026-11-09T01:00:00+07:00");
    expect(isScheduleOpen(schedule, monClosed)).toBe(false);
  });

  it("getNextOpeningTime menghitung pembukaan berikutnya secara akurat", () => {
    const schedule = {
      enabled: true,
      windows: [
        { start: "12:00", end: "13:00" },
        { start: "17:00", end: "19:00" },
      ],
      days: [1, 3], // Senin (1) dan Rabu (3)
    };

    // Saat ini Senin 10:00 WIB -> pembukaan berikutnya Senin 12:00 WIB
    const mon10 = new Date("2026-11-02T10:00:00+07:00");
    const next1 = getNextOpeningTime(schedule, mon10);
    expect(next1?.toISOString()).toBe(new Date("2026-11-02T12:00:00+07:00").toISOString());

    // Saat ini Senin 14:00 WIB -> pembukaan berikutnya Senin 17:00 WIB
    const mon14 = new Date("2026-11-02T14:00:00+07:00");
    const next2 = getNextOpeningTime(schedule, mon14);
    expect(next2?.toISOString()).toBe(new Date("2026-11-02T17:00:00+07:00").toISOString());

    // Saat ini Senin 20:00 WIB -> pembukaan berikutnya Rabu 12:00 WIB
    const mon20 = new Date("2026-11-02T20:00:00+07:00");
    const next3 = getNextOpeningTime(schedule, mon20);
    expect(next3?.toISOString()).toBe(new Date("2026-11-04T12:00:00+07:00").toISOString());
  });

  it("describeWindows memformat teks jendela waktu dengan benar", () => {
    expect(
      describeWindows([
        { start: "12:00", end: "13:00" },
        { start: "18:00", end: "20:00" },
      ]),
    ).toBe("12:00–13:00, 18:00–20:00 WIB");
  });
});
