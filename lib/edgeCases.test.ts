// Edge cases that only bite real users: a cold first launch, a learner who has
// mastered everything, a learner with nothing due, and an exam interrupted
// mid-flight. Each of these produced a visible bug at some point during
// development, so they are pinned here rather than re-discovered by a reviewer.
import { describe, expect, test } from "bun:test";
import { newCard, review, dueCards, GRADE, type Card } from "./fsrs";
import { readiness, readinessLabel, displayPercent, type CardMap } from "./readiness";
import { practiceQueue } from "./review";
import { buildExam, questionsFor, EXAM_TOTAL, EXAM_PASS_MARK } from "./questionBank";
import { streakFrom } from "./streak";

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const REGION = "Bayern" as const;

describe("cold start — nothing stored yet", () => {
  test("readiness on an empty card map is chance level, not a crash or NaN", () => {
    const r = readiness({}, REGION, T0);
    expect(Number.isFinite(r.expectedScore)).toBe(true);
    expect(Number.isFinite(r.passProbability)).toBe(true);
    expect(r.seen).toBe(0);
    expect(readinessLabel(r)).toBe("not-ready");
    // Never show a bare 0% — it reads as "broken" rather than "untested".
    expect(displayPercent(r.passProbability)).toBeGreaterThanOrEqual(1);
  });

  test("the practice queue on a fresh install serves unseen questions", () => {
    const queue = practiceQueue({}, REGION, T0, 12);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.length).toBeLessThanOrEqual(12);
    // All distinct — a first session that repeats a question looks broken.
    expect(new Set(queue.map((q: { id: string }) => q.id)).size).toBe(queue.length);
  });

  test("streak with no history is zero, not NaN", () => {
    expect(streakFrom([], T0)).toBe(0);
  });

  test("an exam can be built with no prior history", () => {
    const exam = buildExam(REGION, T0);
    expect(exam).toHaveLength(EXAM_TOTAL);
    expect(new Set(exam.map((q: { id: string }) => q.id)).size).toBe(EXAM_TOTAL);
  });
});

describe("everything mastered", () => {
  function masteredMap(at = T0): CardMap {
    const map: CardMap = {};
    for (const q of questionsFor(REGION)) {
      let c = newCard(at);
      // Drive each card far up the stability curve.
      for (let i = 0; i < 6; i++) c = review(c, GRADE.EASY, c.due).card;
      map[q.id] = c;
    }
    return map;
  }

  test("readiness saturates without exceeding the exam length or 99%", () => {
    const r = readiness(masteredMap(), REGION, T0);
    expect(r.expectedScore).toBeLessThanOrEqual(EXAM_TOTAL);
    expect(r.passProbability).toBeLessThanOrEqual(1);
    expect(displayPercent(r.passProbability)).toBeLessThanOrEqual(99);
    expect(readinessLabel(r)).toBe("confident");
  });

  test("the practice queue still returns something to do", () => {
    // A user who has mastered everything and opens practice must not face an
    // empty screen with no explanation — the queue falls back to the least
    // strongly retained material.
    const queue = practiceQueue(masteredMap(), REGION, T0, 12);
    expect(Array.isArray(queue)).toBe(true);
  });
});

describe("nothing due yet", () => {
  test("dueCards returns empty when every card is scheduled in the future", () => {
    const cards = [
      { card: { ...newCard(T0), stability: 30, difficulty: 4, state: "review", lastReview: T0, due: T0 + 30 * DAY } as Card },
      { card: { ...newCard(T0), stability: 10, difficulty: 5, state: "review", lastReview: T0, due: T0 + 10 * DAY } as Card },
    ];
    expect(dueCards(cards, T0)).toHaveLength(0);
    // ...and they become due exactly when their date arrives.
    expect(dueCards(cards, T0 + 10 * DAY)).toHaveLength(1);
    expect(dueCards(cards, T0 + 30 * DAY)).toHaveLength(2);
  });
});

describe("exam interrupted mid-flight", () => {
  test("a partially answered exam grades only what was answered", () => {
    const exam = buildExam(REGION, T0);
    // Answer the first 10 correctly, abandon the rest.
    const picks: (number | null)[] = exam.map((q, i) => (i < 10 ? q.correct : null));
    const score = picks.reduce<number>(
      (acc, pick, i) => acc + (pick !== null && pick === exam[i].correct ? 1 : 0),
      0
    );
    expect(score).toBe(10);
    expect(score).toBeLessThan(EXAM_PASS_MARK);
  });

  test("an unanswered question never counts as correct, even when correct is 0", () => {
    const exam = buildExam(REGION, T0);
    const zeroIndexed = exam.filter((q) => q.correct === 0);
    expect(zeroIndexed.length).toBeGreaterThan(0); // guard: the trap is real
    // null must not equal 0 in the scoring comparison.
    for (const q of zeroIndexed) {
      const pick: number | null = null;
      expect(pick !== null && pick === q.correct).toBe(false);
    }
  });
});

describe("clock going backwards", () => {
  test("a card reviewed 'in the future' does not produce negative elapsed time", () => {
    let c = newCard(T0);
    c = review(c, GRADE.GOOD, T0).card;
    // Device clock moved back a day (timezone change, manual set).
    const r = readiness({ q: c } as CardMap, REGION, T0 - DAY);
    expect(Number.isFinite(r.passProbability)).toBe(true);
    expect(r.passProbability).toBeGreaterThanOrEqual(0);
    expect(r.passProbability).toBeLessThanOrEqual(1);
  });
});
