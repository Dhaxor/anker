import { describe, expect, test } from "bun:test";
import { isoDay, streakFrom, streakAtRisk } from "./streak";

const DAY = 86_400_000;
// midday so the tests never straddle a local-midnight boundary
const NOW = new Date(2026, 6, 25, 12, 0, 0).getTime();
const day = (offset: number) => isoDay(NOW - offset * DAY);

describe("streakFrom", () => {
  test("no history is no streak", () => {
    expect(streakFrom([], NOW)).toBe(0);
  });

  test("counts consecutive days ending today", () => {
    expect(streakFrom([day(0)], NOW)).toBe(1);
    expect(streakFrom([day(0), day(1), day(2)], NOW)).toBe(3);
  });

  test("survives an unstarted today by counting back from yesterday", () => {
    expect(streakFrom([day(1), day(2)], NOW)).toBe(2);
  });

  test("breaks once two days are missed", () => {
    expect(streakFrom([day(2), day(3)], NOW)).toBe(0);
  });

  test("stops at the first gap rather than counting all active days", () => {
    // active today, yesterday, then a gap at 2, then more history
    expect(streakFrom([day(0), day(1), day(3), day(4)], NOW)).toBe(2);
  });

  test("is order-independent and tolerates duplicates", () => {
    expect(streakFrom([day(2), day(0), day(1), day(1)], NOW)).toBe(3);
  });

  test("handles a long unbroken run", () => {
    const days = Array.from({ length: 90 }, (_, i) => day(i));
    expect(streakFrom(days, NOW)).toBe(90);
  });

  test("ignores future-dated entries", () => {
    expect(streakFrom([day(-1), day(0)], NOW)).toBe(1);
  });

  test("counts across a month boundary", () => {
    const firstOfMonth = new Date(2026, 7, 1, 12, 0, 0).getTime();
    const days = [0, 1, 2].map((i) => isoDay(firstOfMonth - i * DAY));
    expect(streakFrom(days, firstOfMonth)).toBe(3);
  });
});

describe("streakAtRisk", () => {
  test("is at risk when yesterday was active but today is not", () => {
    expect(streakAtRisk([day(1)], NOW)).toBe(true);
  });

  test("is not at risk once today is done", () => {
    expect(streakAtRisk([day(0), day(1)], NOW)).toBe(false);
  });

  test("is not at risk when the streak is already broken", () => {
    expect(streakAtRisk([day(3)], NOW)).toBe(false);
  });

  test("is not at risk with no history at all", () => {
    expect(streakAtRisk([], NOW)).toBe(false);
  });
});

describe("isoDay", () => {
  test("zero-pads month and day", () => {
    expect(isoDay(new Date(2026, 0, 5, 12).getTime())).toBe("2026-01-05");
    expect(isoDay(new Date(2026, 10, 30, 12).getTime())).toBe("2026-11-30");
  });
});
