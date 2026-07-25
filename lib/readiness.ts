// "Am I ready?" — the only question a candidate actually has.
//
// Competitors answer it with progress bars ("62% of questions seen"), which
// measures effort, not readiness. We answer it with an estimated exam score
// and a pass probability, derived from the FSRS memory model.
//
// The model per question: FSRS gives retrievability R (probability the answer
// is recalled). If it is not recalled the candidate still picks one of four
// options, so
//
//     P(correct) = R + (1 - R) * (1 / options)
//
// which honestly credits guessing instead of pretending an unseen question is
// a guaranteed loss. Across a 33-question exam the total is a Poisson-binomial;
// we use the normal approximation with a continuity correction, which is
// accurate to well under a point at this n.
//
// Pure module: takes the cards and the clock as arguments.

import { Card, retrievability } from "./fsrs";
import {
  Bundesland,
  EXAM_GENERAL,
  EXAM_PASS_MARK,
  EXAM_STATE,
  EXAM_TOTAL,
  Question,
  generalQuestions,
  stateQuestions,
} from "./questionBank";

/** Review state keyed by question id; a missing entry means "never studied". */
export type CardMap = Record<string, Card | undefined>;

export interface Readiness {
  /** expected number correct out of 33 */
  expectedScore: number;
  /** probability of reaching the 17-mark */
  passProbability: number;
  /** questions with a strong memory trace (R >= 0.9) */
  strong: number;
  /** questions seen at least once */
  seen: number;
  /** total askable questions for this Bundesland */
  pool: number;
}

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Probability the candidate answers this question correctly right now. */
export function pCorrect(q: Question, card: Card | undefined, now: number): number {
  const guess = 1 / Math.max(2, q.options.length);
  if (!card) return guess;
  const r = retrievability(card, now);
  return r + (1 - r) * guess;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function readiness(cards: CardMap, region: Bundesland, now: number): Readiness {
  const general = generalQuestions();
  const state = stateQuestions(region);

  const gp = general.map((q) => pCorrect(q, cards[q.id], now));
  const sp = state.map((q) => pCorrect(q, cards[q.id], now));

  // An exam draws EXAM_GENERAL of the general pool and EXAM_STATE of the state
  // pool, so the per-draw success probability is the pool mean.
  const pg = mean(gp);
  const ps = mean(sp);

  const mu = EXAM_GENERAL * pg + EXAM_STATE * ps;
  const variance = EXAM_GENERAL * pg * (1 - pg) + EXAM_STATE * ps * (1 - ps);
  const sd = Math.sqrt(Math.max(variance, 1e-9));

  // P(X >= 17) with continuity correction
  const passProbability = 1 - normalCdf((EXAM_PASS_MARK - 0.5 - mu) / sd);

  const pool = [...general, ...state];
  return {
    expectedScore: Math.min(EXAM_TOTAL, mu),
    passProbability: Math.min(1, Math.max(0, passProbability)),
    strong: pool.filter((q) => {
      const c = cards[q.id];
      return c ? retrievability(c, now) >= 0.9 : false;
    }).length,
    seen: pool.filter((q) => cards[q.id] !== undefined).length,
    pool: pool.length,
  };
}

/**
 * Pass probability as a percentage for display.
 *
 * Capped at 99 and floored at 1: the model is an estimate from a memory curve,
 * not a guarantee, and printing "100%" would promise a certainty we cannot
 * have about an exam nobody has sat yet. Overclaiming here would undermine the
 * one number the whole product is trusted for.
 */
export function displayPercent(passProbability: number): number {
  return Math.min(99, Math.max(1, Math.round(passProbability * 100)));
}

/** Short, honest label for the readiness headline. */
export function readinessLabel(r: Readiness): "not-ready" | "borderline" | "ready" | "confident" {
  if (r.passProbability >= 0.95) return "confident";
  if (r.passProbability >= 0.75) return "ready";
  if (r.passProbability >= 0.4) return "borderline";
  return "not-ready";
}
