// Selecting what to show the candidate, beyond "what is due".
//
// The exam is close and finite, so the highest-value minute is spent on the
// questions that are actually going to cost points — not on a tidy sweep of the
// catalogue. These selectors are pure so the ordering is testable.

import { Card, dueCards, retrievability } from "./fsrs";
import { CardMap, pCorrect } from "./readiness";
import { Bundesland, Question, questionsFor } from "./questionBank";

export interface Scored {
  question: Question;
  card: Card | undefined;
  /** probability of getting it right if it came up now */
  p: number;
  lapses: number;
}

function score(q: Question, cards: CardMap, now: number): Scored {
  const card = cards[q.id];
  return { question: q, card, p: pCorrect(q, card, now), lapses: card?.lapses ?? 0 };
}

/**
 * Questions the candidate keeps getting wrong: lapses first, then weakest
 * recall. Unseen questions are excluded — you cannot have "trouble" with a
 * question you have never met, and mixing them in would bury the real problems.
 */
export function troubleSpots(
  cards: CardMap,
  region: Bundesland,
  now: number,
  limit = 20
): Scored[] {
  return questionsFor(region)
    .filter((q) => cards[q.id])
    .map((q) => score(q, cards, now))
    .filter((s) => s.lapses > 0 || s.p < 0.8)
    .sort((a, b) => b.lapses - a.lapses || a.p - b.p)
    .slice(0, limit);
}

/**
 * Where the candidate is losing points by topic. Only categories with enough
 * seen questions to mean anything are reported, so a single unlucky answer
 * cannot label a whole topic a weakness.
 */
export interface CategoryStanding {
  category: string;
  seen: number;
  /** mean probability of a correct answer across seen questions */
  strength: number;
}

export function weakestCategories(
  cards: CardMap,
  region: Bundesland,
  now: number,
  minSeen = 3
): CategoryStanding[] {
  const byCat = new Map<string, number[]>();
  for (const q of questionsFor(region)) {
    if (!q.category || !cards[q.id]) continue;
    const list = byCat.get(q.category) ?? [];
    list.push(pCorrect(q, cards[q.id], now));
    byCat.set(q.category, list);
  }
  return [...byCat.entries()]
    .filter(([, ps]) => ps.length >= minSeen)
    .map(([category, ps]) => ({
      category,
      seen: ps.length,
      strength: ps.reduce((a, b) => a + b, 0) / ps.length,
    }))
    .sort((a, b) => a.strength - b.strength);
}

/** Questions never shown, in catalogue order. */
export function unseen(cards: CardMap, region: Bundesland, limit = 20): Question[] {
  return questionsFor(region)
    .filter((q) => !cards[q.id])
    .slice(0, limit);
}

/** How many of the pool are held at a strong memory trace right now. */
export function mastered(cards: CardMap, region: Bundesland, now: number): number {
  return questionsFor(region).filter((q) => {
    const c = cards[q.id];
    return c ? retrievability(c, now) >= 0.9 : false;
  }).length;
}

/**
 * The practice queue: everything due now (weakest recall first), then unseen
 * questions in catalogue order so a study session feels ordered rather than
 * random.
 *
 * Pure and time-injected so the cold-start and all-mastered cases can be
 * tested. This logic previously lived inside a React callback, where a bug —
 * building the queue before AsyncStorage had loaded — showed "nothing to
 * review" to users with 310 unseen questions.
 */
export function practiceQueue(
  cards: CardMap,
  region: Bundesland,
  now: number,
  limit = 20
): Question[] {
  const pool = questionsFor(region);
  const withCards = pool
    .filter((q) => cards[q.id])
    .map((q) => ({ q, card: cards[q.id] as Card }));
  const due = dueCards(withCards, now).map((x) => x.q);
  const fresh = pool.filter((q) => !cards[q.id]);
  return [...due, ...fresh].slice(0, limit);
}
