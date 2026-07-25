import { describe, expect, test } from "bun:test";
import {
  canUse,
  examsRemaining,
  shouldPrompt,
  FREE_EXAM_ALLOWANCE,
  type EntitlementState,
} from "./entitlement";

const free: EntitlementState = { pro: false, examsTaken: 0 };
const pro: EntitlementState = { pro: true, examsTaken: 99 };

describe("free tier", () => {
  test("practice is never gated — the catalogue is public government content", () => {
    expect(canUse("practice", free)).toBe(true);
    expect(canUse("practice", { pro: false, examsTaken: 500 })).toBe(true);
  });

  test("the first mock exam is free, the second is not", () => {
    expect(canUse("exam", { pro: false, examsTaken: 0 })).toBe(true);
    expect(canUse("exam", { pro: false, examsTaken: FREE_EXAM_ALLOWANCE })).toBe(false);
    expect(canUse("exam", { pro: false, examsTaken: 7 })).toBe(false);
  });

  test("readiness is free — it is the hook, not the product", () => {
    expect(canUse("readiness", free)).toBe(true);
    expect(canUse("readiness", { pro: false, examsTaken: 99 })).toBe(true);
  });

  test("weak-spot targeting is paid", () => {
    expect(canUse("weakSpots", free)).toBe(false);
  });

  test("reports how many free exams are left", () => {
    expect(examsRemaining({ pro: false, examsTaken: 0 })).toBe(FREE_EXAM_ALLOWANCE);
    expect(examsRemaining({ pro: false, examsTaken: FREE_EXAM_ALLOWANCE })).toBe(0);
    expect(examsRemaining({ pro: false, examsTaken: 99 })).toBe(0);
  });
});

describe("pro tier", () => {
  test("unlocks everything", () => {
    for (const f of ["practice", "exam", "weakSpots", "readiness"] as const) {
      expect(canUse(f, pro)).toBe(true);
    }
  });

  test("has unlimited exams", () => {
    expect(examsRemaining(pro)).toBe(Infinity);
  });

  test("is never prompted to upgrade", () => {
    expect(shouldPrompt(pro, { justFinishedExam: true })).toBe(false);
    expect(shouldPrompt(pro, { troubleSpotCount: 50 })).toBe(false);
    expect(shouldPrompt(pro, { questionsSeen: 460 })).toBe(false);
  });
});

describe("prompt timing", () => {
  test("does not prompt a brand new user with nothing invested", () => {
    expect(shouldPrompt(free, {})).toBe(false);
    expect(shouldPrompt(free, { questionsSeen: 3, troubleSpotCount: 1 })).toBe(false);
  });

  test("prompts right after the free exam, when the score has just landed", () => {
    expect(shouldPrompt(free, { justFinishedExam: true })).toBe(true);
  });

  test("prompts once real weak spots have accumulated", () => {
    expect(shouldPrompt(free, { troubleSpotCount: 4 })).toBe(false);
    expect(shouldPrompt(free, { troubleSpotCount: 5 })).toBe(true);
  });

  test("prompts after sustained study, not on day 0", () => {
    expect(shouldPrompt(free, { questionsSeen: 59 })).toBe(false);
    expect(shouldPrompt(free, { questionsSeen: 60 })).toBe(true);
  });
});
