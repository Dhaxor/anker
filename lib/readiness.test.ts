import { describe, expect, test } from "bun:test";
import {
  normalCdf,
  pCorrect,
  readiness,
  readinessLabel,
  displayPercent,
  type CardMap,
} from "./readiness";
import { newCard, review, GRADE, type Card } from "./fsrs";
import {
  generalQuestions,
  stateQuestions,
  questionsFor,
  EXAM_TOTAL,
  type Question,
} from "./questionBank";

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;

/** A card that was just answered correctly, so retrievability ~ 1. */
function freshlyLearned(at = T0): Card {
  let c = newCard(at);
  c = review(c, GRADE.GOOD, at).card;
  return c;
}

function cardsForAll(region: "Bayern", at = T0): CardMap {
  const map: CardMap = {};
  for (const q of questionsFor(region)) map[q.id] = freshlyLearned(at);
  return map;
}

describe("normalCdf", () => {
  test("hits the standard reference points", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.6448536)).toBeCloseTo(0.95, 4);
    expect(normalCdf(-1.6448536)).toBeCloseTo(0.05, 4);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
  });

  test("is monotonic and bounded", () => {
    let prev = 0;
    for (let z = -4; z <= 4; z += 0.25) {
      const p = normalCdf(z);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });
});

describe("pCorrect", () => {
  const q: Question = generalQuestions()[0];

  test("an unstudied question falls back to the guess rate, not zero", () => {
    expect(pCorrect(q, undefined, T0)).toBeCloseTo(0.25, 6);
  });

  test("a freshly learned question is near certain", () => {
    expect(pCorrect(q, freshlyLearned(), T0)).toBeGreaterThan(0.95);
  });

  test("never leaves [guess, 1]", () => {
    for (const days of [0, 1, 10, 200, 5000]) {
      const p = pCorrect(q, freshlyLearned(), T0 + days * DAY);
      expect(p).toBeGreaterThanOrEqual(0.24);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  test("decays as the memory fades", () => {
    const card = freshlyLearned();
    const early = pCorrect(q, card, T0 + 1 * DAY);
    const late = pCorrect(q, card, T0 + 120 * DAY);
    expect(late).toBeLessThan(early);
  });
});

describe("readiness", () => {
  test("a candidate who has studied nothing scores about chance and will not pass", () => {
    const r = readiness({}, "Bayern", T0);
    // 33 questions x 1/4 = ~8.25 expected
    expect(r.expectedScore).toBeGreaterThan(7);
    expect(r.expectedScore).toBeLessThan(10);
    expect(r.passProbability).toBeLessThan(0.02);
    expect(readinessLabel(r)).toBe("not-ready");
    expect(r.seen).toBe(0);
    expect(r.strong).toBe(0);
  });

  test("a candidate who knows everything is near a perfect score and certain to pass", () => {
    const r = readiness(cardsForAll("Bayern"), "Bayern", T0);
    expect(r.expectedScore).toBeGreaterThan(EXAM_TOTAL - 2);
    expect(r.passProbability).toBeGreaterThan(0.99);
    expect(readinessLabel(r)).toBe("confident");
    expect(r.seen).toBe(r.pool);
  });

  test("expected score never exceeds the exam length", () => {
    const r = readiness(cardsForAll("Bayern"), "Bayern", T0);
    expect(r.expectedScore).toBeLessThanOrEqual(EXAM_TOTAL);
  });

  test("pass probability rises monotonically as more questions are learned", () => {
    const pool = questionsFor("Bayern");
    const cards: CardMap = {};
    let prev = readiness(cards, "Bayern", T0).passProbability;
    for (let i = 0; i < pool.length; i += 40) {
      for (let j = i; j < Math.min(i + 40, pool.length); j++) {
        cards[pool[j].id] = freshlyLearned();
      }
      const p = readiness(cards, "Bayern", T0).passProbability;
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
    expect(prev).toBeGreaterThan(0.99);
  });

  test("readiness decays over time without review", () => {
    const cards = cardsForAll("Bayern");
    const now = readiness(cards, "Bayern", T0).passProbability;
    const muchLater = readiness(cards, "Bayern", T0 + 3000 * DAY).passProbability;
    expect(muchLater).toBeLessThan(now);
  });

  test("counts only the candidate's own Bundesland in the pool", () => {
    const r = readiness({}, "Hamburg", T0);
    expect(r.pool).toBe(generalQuestions().length + stateQuestions("Hamburg").length);
  });

  test("`strong` counts only well-retained questions", () => {
    const pool = questionsFor("Bayern");
    const cards: CardMap = {};
    for (let i = 0; i < 25; i++) cards[pool[i].id] = freshlyLearned();
    const r = readiness(cards, "Bayern", T0);
    expect(r.seen).toBe(25);
    expect(r.strong).toBeGreaterThan(0);
    expect(r.strong).toBeLessThanOrEqual(25);
  });

  test("probabilities always stay within [0,1]", () => {
    for (const days of [0, 30, 400, 100000]) {
      const r = readiness(cardsForAll("Bayern"), "Bayern", T0 + days * DAY);
      expect(r.passProbability).toBeGreaterThanOrEqual(0);
      expect(r.passProbability).toBeLessThanOrEqual(1);
    }
  });
});

describe("readinessLabel", () => {
  test("maps the probability bands in order", () => {
    const at = (p: number) => readinessLabel({ passProbability: p } as never);
    expect(at(0.1)).toBe("not-ready");
    expect(at(0.5)).toBe("borderline");
    expect(at(0.8)).toBe("ready");
    expect(at(0.99)).toBe("confident");
  });
});

describe("displayPercent", () => {
  test("never promises certainty, and never shows a bare zero", () => {
    expect(displayPercent(1)).toBe(99);
    expect(displayPercent(0.999)).toBe(99);
    expect(displayPercent(0)).toBe(1);
    expect(displayPercent(0.0001)).toBe(1);
  });

  test("rounds normally in between", () => {
    expect(displayPercent(0.5)).toBe(50);
    expect(displayPercent(0.734)).toBe(73);
  });
});
