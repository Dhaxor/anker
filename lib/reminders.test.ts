import { describe, expect, test } from "bun:test";
import { pickReminder, buildReminder, type ReminderContext } from "./reminders";
import { isoDay } from "./streak";

const DAY = 86_400_000;
const NOW = new Date(2026, 6, 25, 20, 0, 0).getTime();
const day = (offset: number) => isoDay(NOW - offset * DAY);

const base: ReminderContext = { activeDays: [], dueCount: 0, streak: 0, now: NOW };

describe("pickReminder", () => {
  test("says nothing to someone who already studied today", () => {
    expect(
      pickReminder({ ...base, activeDays: [day(0), day(1)], dueCount: 40, streak: 9 })
    ).toBe("none");
  });

  test("warns when a real streak is about to break", () => {
    expect(pickReminder({ ...base, activeDays: [day(1)], streak: 5, dueCount: 0 })).toBe(
      "streak-at-risk"
    );
  });

  test("does not send a streak warning to someone with no streak", () => {
    expect(pickReminder({ ...base, activeDays: [day(1)], streak: 0, dueCount: 0 })).toBe("none");
  });

  test("does not invent a streak warning after the streak is already gone", () => {
    expect(pickReminder({ ...base, activeDays: [day(4)], streak: 0, dueCount: 3 })).toBe(
      "due-reviews"
    );
  });

  test("falls back to due reviews when there is work but no streak at stake", () => {
    expect(pickReminder({ ...base, dueCount: 12 })).toBe("due-reviews");
  });

  test("stays silent when there is genuinely nothing to say", () => {
    expect(pickReminder(base)).toBe("none");
  });

  test("prefers the streak warning over the generic nudge", () => {
    expect(
      pickReminder({ ...base, activeDays: [day(1)], streak: 3, dueCount: 25 })
    ).toBe("streak-at-risk");
  });
});

describe("buildReminder", () => {
  test("returns nothing for the silent case", () => {
    expect(buildReminder("none", base)).toBeNull();
  });

  test("streak copy names the streak and asks for something small", () => {
    const r = buildReminder("streak-at-risk", { ...base, streak: 12 })!;
    expect(r.title).toContain("12");
    expect(r.body.length).toBeLessThan(90);
    expect(r.hour).toBe(19);
  });

  test("due copy is singular for one card and plural otherwise", () => {
    expect(buildReminder("due-reviews", { ...base, dueCount: 1 })!.body).toContain("Eine Frage");
    const many = buildReminder("due-reviews", { ...base, dueCount: 8 })!.body;
    expect(many).toContain("8 Fragen");
  });

  test("always schedules in the evening", () => {
    for (const kind of ["streak-at-risk", "due-reviews"] as const) {
      const r = buildReminder(kind, { ...base, streak: 2, dueCount: 2 })!;
      expect(r.hour).toBeGreaterThanOrEqual(17);
      expect(r.hour).toBeLessThan(22);
      expect(r.minute).toBeGreaterThanOrEqual(0);
      expect(r.minute).toBeLessThan(60);
    }
  });
});
