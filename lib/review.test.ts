import { describe, expect, test } from "bun:test";
import { troubleSpots, weakestCategories, unseen, mastered } from "./review";
import { newCard, review as grade, GRADE, type Card } from "./fsrs";
import type { CardMap } from "./readiness";
import { questionsFor, generalQuestions } from "./questionBank";

const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const REGION = "Bayern" as const;

function learned(at = T0): Card {
  return grade(newCard(at), GRADE.GOOD, at).card;
}

/** A card that has been failed `n` times, so it carries real lapses. */
function lapsed(n: number, at = T0): Card {
  let c = grade(newCard(at), GRADE.GOOD, at).card;
  for (let i = 0; i < n; i++) {
    c = grade(c, GRADE.AGAIN, at + (i + 1) * DAY).card;
    c = grade(c, GRADE.GOOD, at + (i + 1) * DAY + 600_000).card;
  }
  return c;
}

describe("troubleSpots", () => {
  test("is empty when nothing has been studied", () => {
    expect(troubleSpots({}, REGION, T0)).toHaveLength(0);
  });

  test("never includes questions the candidate has not seen", () => {
    const pool = questionsFor(REGION);
    const cards: CardMap = { [pool[0].id]: lapsed(2) };
    const spots = troubleSpots(cards, REGION, T0);
    expect(spots.every((s) => s.card !== undefined)).toBe(true);
    expect(spots.map((s) => s.question.id)).toContain(pool[0].id);
  });

  test("ranks the most-lapsed question first", () => {
    const pool = questionsFor(REGION);
    const cards: CardMap = {
      [pool[0].id]: lapsed(1),
      [pool[1].id]: lapsed(3),
      [pool[2].id]: lapsed(2),
    };
    const order = troubleSpots(cards, REGION, T0).map((s) => s.question.id);
    expect(order.slice(0, 3)).toEqual([pool[1].id, pool[2].id, pool[0].id]);
  });

  test("falls back to weakest recall when lapses tie", () => {
    const pool = questionsFor(REGION);
    // both never lapsed, but one was learned long ago so it has decayed
    const cards: CardMap = {
      [pool[0].id]: learned(T0 - 400 * DAY),
      [pool[1].id]: learned(T0),
    };
    const spots = troubleSpots(cards, REGION, T0);
    expect(spots[0]?.question.id).toBe(pool[0].id);
  });

  test("excludes solidly known questions", () => {
    const pool = questionsFor(REGION);
    const cards: CardMap = { [pool[0].id]: learned(T0) };
    // freshly learned: p is ~1, well above the 0.8 threshold, and no lapses
    expect(troubleSpots(cards, REGION, T0)).toHaveLength(0);
  });

  test("respects the limit", () => {
    const cards: CardMap = {};
    for (const q of questionsFor(REGION).slice(0, 50)) cards[q.id] = lapsed(1);
    expect(troubleSpots(cards, REGION, T0, 7)).toHaveLength(7);
  });

  test("only returns questions from the candidate's own pool", () => {
    const cards: CardMap = {};
    for (const q of questionsFor("Hessen")) cards[q.id] = lapsed(1);
    const spots = troubleSpots(cards, REGION, T0);
    for (const s of spots) {
      expect(s.question.region === "Allgemein" || s.question.region === REGION).toBe(true);
    }
  });
});

describe("weakestCategories", () => {
  test("is empty before enough questions have been seen", () => {
    expect(weakestCategories({}, REGION, T0)).toHaveLength(0);
  });

  test("ignores categories below the minimum sample", () => {
    const q = generalQuestions().find((x) => x.category)!;
    const cards: CardMap = { [q.id]: learned() };
    expect(weakestCategories(cards, REGION, T0, 3)).toHaveLength(0);
  });

  test("sorts weakest topic first", () => {
    const byCat = new Map<string, string[]>();
    for (const q of generalQuestions()) {
      if (!q.category) continue;
      const l = byCat.get(q.category) ?? [];
      if (l.length < 4) l.push(q.id);
      byCat.set(q.category, l);
    }
    const cats = [...byCat.keys()].slice(0, 2);
    const cards: CardMap = {};
    // first category answered long ago (decayed), second answered just now
    for (const id of byCat.get(cats[0])!) cards[id] = learned(T0 - 500 * DAY);
    for (const id of byCat.get(cats[1])!) cards[id] = learned(T0);

    const standings = weakestCategories(cards, REGION, T0, 3);
    expect(standings.length).toBeGreaterThanOrEqual(2);
    expect(standings[0].category).toBe(cats[0]);
    expect(standings[0].strength).toBeLessThan(standings[1].strength);
  });

  test("reports the sample size behind each standing", () => {
    const byCat = new Map<string, string[]>();
    for (const q of generalQuestions()) {
      if (!q.category) continue;
      const l = byCat.get(q.category) ?? [];
      if (l.length < 5) l.push(q.id);
      byCat.set(q.category, l);
    }
    const cat = [...byCat.keys()][0];
    const cards: CardMap = {};
    for (const id of byCat.get(cat)!) cards[id] = learned();
    const standing = weakestCategories(cards, REGION, T0, 3).find((s) => s.category === cat);
    expect(standing?.seen).toBe(5);
    expect(standing!.strength).toBeGreaterThan(0);
    expect(standing!.strength).toBeLessThanOrEqual(1);
  });
});

describe("unseen", () => {
  test("returns the whole pool before any study, capped by the limit", () => {
    expect(unseen({}, REGION, 10)).toHaveLength(10);
    expect(unseen({}, REGION, 10_000)).toHaveLength(questionsFor(REGION).length);
  });

  test("shrinks as questions are studied", () => {
    const pool = questionsFor(REGION);
    const cards: CardMap = { [pool[0].id]: learned() };
    const rest = unseen(cards, REGION, 10_000);
    expect(rest).toHaveLength(pool.length - 1);
    expect(rest.map((q) => q.id)).not.toContain(pool[0].id);
  });
});

describe("mastered", () => {
  test("counts nothing before study and everything after", () => {
    expect(mastered({}, REGION, T0)).toBe(0);
    const cards: CardMap = {};
    for (const q of questionsFor(REGION)) cards[q.id] = learned(T0);
    expect(mastered(cards, REGION, T0)).toBe(questionsFor(REGION).length);
  });

  test("decays as memories fade", () => {
    const cards: CardMap = {};
    for (const q of questionsFor(REGION)) cards[q.id] = learned(T0);
    expect(mastered(cards, REGION, T0 + 500 * DAY)).toBeLessThan(
      mastered(cards, REGION, T0)
    );
  });
});
