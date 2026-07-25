import { describe, expect, test } from "bun:test";
import {
  newCard,
  review,
  retrievability,
  intervalDays,
  dueCards,
  schedulePreview,
  DEFAULT_CONFIG,
  GRADE,
  type Card,
  type Grade,
} from "./fsrs";

const DAY = 86_400_000;
const T0 = 1_800_000_000_000; // fixed epoch so tests never depend on the clock

/** Drive a card through a sequence of grades, one review per day. */
function drill(grades: Grade[], start = T0): Card {
  let card = newCard(start);
  let t = start;
  for (const g of grades) {
    const res = review(card, g, t);
    card = res.card;
    t += Math.max(1, res.intervalDays) * DAY;
  }
  return card;
}

describe("forgetting curve", () => {
  test("recall probability is exactly 90% after one stability period", () => {
    const card: Card = { ...newCard(T0), stability: 10, difficulty: 5, state: "review", lastReview: T0 };
    expect(retrievability(card, T0 + 10 * DAY)).toBeCloseTo(0.9, 6);
  });

  test("recall starts at 1.0 and decays monotonically", () => {
    const card: Card = { ...newCard(T0), stability: 7, difficulty: 5, state: "review", lastReview: T0 };
    expect(retrievability(card, T0)).toBeCloseTo(1, 6);
    let prev = 1;
    for (let d = 1; d <= 120; d++) {
      const r = retrievability(card, T0 + d * DAY);
      expect(r).toBeLessThan(prev);
      expect(r).toBeGreaterThan(0);
      prev = r;
    }
  });

  test("a new card has no retrievability", () => {
    expect(retrievability(newCard(T0), T0 + 5 * DAY)).toBe(0);
  });
});

describe("grading", () => {
  test("intervals are strictly ordered Again < Hard < Good < Easy", () => {
    const card = drill([GRADE.GOOD, GRADE.GOOD, GRADE.GOOD]);
    const t = card.due;
    const [again, hard, good, easy] = schedulePreview(card, t).map((p) => p.intervalDays);
    expect(again).toBeLessThan(hard);
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  test("Again raises difficulty, Easy lowers it, always within 1..10", () => {
    const base = drill([GRADE.GOOD, GRADE.GOOD]);
    const harder = review(base, GRADE.AGAIN, base.due).card;
    const easier = review(base, GRADE.EASY, base.due).card;
    expect(harder.difficulty).toBeGreaterThan(base.difficulty);
    expect(easier.difficulty).toBeLessThan(base.difficulty);
    for (const c of [harder, easier]) {
      expect(c.difficulty).toBeGreaterThanOrEqual(1);
      expect(c.difficulty).toBeLessThanOrEqual(10);
    }
  });

  test("difficulty stays clamped under sustained failure or sustained ease", () => {
    const allWrong = drill(Array(30).fill(GRADE.AGAIN) as Grade[]);
    const allEasy = drill(Array(30).fill(GRADE.EASY) as Grade[]);
    expect(allWrong.difficulty).toBeLessThanOrEqual(10);
    expect(allWrong.difficulty).toBeGreaterThanOrEqual(1);
    expect(allEasy.difficulty).toBeGreaterThanOrEqual(1);
    expect(allEasy.difficulty).toBeLessThanOrEqual(10);
  });
});

describe("stability", () => {
  test("successful recall always increases stability", () => {
    let card = drill([GRADE.GOOD]);
    for (let i = 0; i < 8; i++) {
      const before = card.stability;
      card = review(card, GRADE.GOOD, card.due).card;
      expect(card.stability).toBeGreaterThan(before);
    }
  });

  test("a lapse never increases stability, and counts a lapse", () => {
    const card = drill([GRADE.GOOD, GRADE.GOOD, GRADE.GOOD, GRADE.GOOD]);
    const after = review(card, GRADE.AGAIN, card.due).card;
    expect(after.stability).toBeLessThanOrEqual(card.stability);
    expect(after.lapses).toBe(card.lapses + 1);
    expect(after.state).toBe("relearning");
  });

  test("spacing effect: recalling at a longer delay yields a bigger stability gain", () => {
    const card = drill([GRADE.GOOD, GRADE.GOOD]);
    const soon = review(card, GRADE.GOOD, card.lastReview! + 1 * DAY).card;
    const late = review(card, GRADE.GOOD, card.lastReview! + 30 * DAY).card;
    expect(late.stability).toBeGreaterThan(soon.stability);
  });
});

describe("scheduling", () => {
  test("intervals are at least a day and never exceed the configured maximum", () => {
    let card = drill([GRADE.EASY]);
    for (let i = 0; i < 40; i++) {
      const res = review(card, GRADE.EASY, card.due);
      expect(res.intervalDays).toBeGreaterThanOrEqual(1);
      expect(res.intervalDays).toBeLessThanOrEqual(DEFAULT_CONFIG.maximumInterval);
      card = res.card;
    }
  });

  test("a lapsed card returns within the same session, not tomorrow", () => {
    const card = drill([GRADE.GOOD, GRADE.GOOD, GRADE.GOOD]);
    const res = review(card, GRADE.AGAIN, card.due);
    expect(res.intervalDays).toBe(0);
    expect(res.card.due - card.due).toBeLessThan(DAY);
  });

  test("a card is never retired — it always has a future due date", () => {
    let card = newCard(T0);
    let t = T0;
    for (let i = 0; i < 25; i++) {
      const res = review(card, GRADE.EASY, t);
      card = res.card;
      t = card.due;
      expect(card.due).toBeGreaterThan(card.lastReview!);
    }
  });

  test("lower desired retention produces longer intervals", () => {
    const s = 20;
    const strict = intervalDays(s, { ...DEFAULT_CONFIG, desiredRetention: 0.95 });
    const relaxed = intervalDays(s, { ...DEFAULT_CONFIG, desiredRetention: 0.8 });
    expect(relaxed).toBeGreaterThan(strict);
  });
});

describe("queue", () => {
  test("returns only due cards, weakest recall first", () => {
    const strong: Card = { ...newCard(T0), stability: 100, difficulty: 5, state: "review", lastReview: T0 - DAY, due: T0 - 1 };
    const weak: Card = { ...newCard(T0), stability: 2, difficulty: 8, state: "review", lastReview: T0 - 5 * DAY, due: T0 - 1 };
    const future: Card = { ...newCard(T0), stability: 10, difficulty: 5, state: "review", lastReview: T0, due: T0 + 10 * DAY };
    const queue = dueCards(
      [{ id: "strong", card: strong }, { id: "future", card: future }, { id: "weak", card: weak }],
      T0
    );
    expect(queue.map((q) => q.id)).toEqual(["weak", "strong"]);
  });

  test("a brand new card is immediately due", () => {
    const items = [{ id: "n", card: newCard(T0) }];
    expect(dueCards(items, T0)).toHaveLength(1);
  });
});
