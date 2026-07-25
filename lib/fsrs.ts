// FSRS (Free Spaced Repetition Scheduler) — the review scheduler.
//
// Why not SM-2: benchmarked over ~350M reviews, FSRS achieves lower log loss
// than SM-2 for 99.6% of users. Babbel's review is static/linear, Mondly's and
// LingoDeer's are quiz pickers, and Duolingo's own half-life regression scores
// below FSRS. A better memory model is free, so there is no excuse to ship
// hand-tuned intervals.
//
// The model is DSR: every card carries Difficulty (1-10), Stability (days for
// recall probability to fall to 90%) and a derived Retrievability (probability
// of recall right now). Weights are the published FSRS-5 defaults and are
// deliberately injectable — once we have real review logs they can be
// re-optimised per user without touching this code.
//
// Pure module: no React, no storage, no Date.now() inside the maths. Every
// function takes the current time explicitly so it is fully testable.

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const GRADE = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 } as const;

export type CardState = "new" | "learning" | "review" | "relearning";

export interface Card {
  /** days; 0 for a card never studied */
  stability: number;
  /** 1..10, higher = harder for this user */
  difficulty: number;
  state: CardState;
  /** epoch ms of the last review, null when new */
  lastReview: number | null;
  /** epoch ms when the card next comes up */
  due: number;
  reps: number;
  lapses: number;
}

export const DEFAULT_WEIGHTS: readonly number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544,
  1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

/** Governs the shape of the forgetting curve. */
const DECAY = -0.5;
/** Chosen so that R(t = S) === 0.9 exactly. */
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

const DAY_MS = 86_400_000;

export interface Config {
  weights: readonly number[];
  /** target recall probability when scheduling; 0.9 is the tuned default */
  desiredRetention: number;
  /** hard ceiling on any interval, in days */
  maximumInterval: number;
}

export const DEFAULT_CONFIG: Config = {
  weights: DEFAULT_WEIGHTS,
  desiredRetention: 0.9,
  maximumInterval: 365 * 4,
};

const clampDifficulty = (d: number) => Math.min(10, Math.max(1, d));

export function newCard(now: number): Card {
  return {
    stability: 0,
    difficulty: 0,
    state: "new",
    lastReview: null,
    due: now,
    reps: 0,
    lapses: 0,
  };
}

/**
 * Probability the learner still recalls this card, given days elapsed.
 * Power forgetting curve: R(t) = (1 + FACTOR * t/S)^DECAY.
 */
export function retrievability(card: Card, now: number): number {
  if (card.state === "new" || card.stability <= 0 || card.lastReview === null) return 0;
  const elapsedDays = Math.max(0, (now - card.lastReview) / DAY_MS);
  return Math.pow(1 + (FACTOR * elapsedDays) / card.stability, DECAY);
}

/** Days until recall probability decays to `desiredRetention`. */
export function intervalDays(stability: number, cfg: Config): number {
  const raw = (stability / FACTOR) * (Math.pow(cfg.desiredRetention, 1 / DECAY) - 1);
  return Math.min(cfg.maximumInterval, Math.max(1, Math.round(raw)));
}

function initialStability(grade: Grade, w: readonly number[]): number {
  return Math.max(0.1, w[grade - 1]);
}

function initialDifficulty(grade: Grade, w: readonly number[]): number {
  return clampDifficulty(w[4] - Math.exp(w[5] * (grade - 1)) + 1);
}

function nextDifficulty(difficulty: number, grade: Grade, w: readonly number[]): number {
  // linear damping: the closer D already is to 10, the less a lapse moves it
  const delta = -w[6] * (grade - 3);
  const damped = difficulty + delta * ((10 - difficulty) / 9);
  // mean reversion toward the difficulty an "easy" first answer would imply
  const reverted = w[7] * initialDifficulty(GRADE.EASY, w) + (1 - w[7]) * damped;
  return clampDifficulty(reverted);
}

function stabilityAfterRecall(
  difficulty: number,
  stability: number,
  r: number,
  grade: Grade,
  w: readonly number[]
): number {
  const hardPenalty = grade === GRADE.HARD ? w[15] : 1;
  const easyBonus = grade === GRADE.EASY ? w[16] : 1;
  const growth =
    Math.exp(w[8]) *
    (11 - difficulty) *
    Math.pow(stability, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(0.1, stability * (1 + growth));
}

function stabilityAfterLapse(
  difficulty: number,
  stability: number,
  r: number,
  w: readonly number[]
): number {
  const next =
    w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  // a lapse must never make a card more stable than it already was
  return Math.max(0.1, Math.min(next, stability));
}

export interface ReviewResult {
  card: Card;
  /** scheduled gap in days (1 for same-session relearning) */
  intervalDays: number;
}

/**
 * Apply a review. `now` is the review time in epoch ms.
 *
 * Note the deliberate absence of a "retire" path: per Karpicke & Roediger,
 * repeated *studying* after the first correct answer does nothing, while
 * repeated *testing* produces a large effect. Cards keep coming back; the
 * interval just grows.
 */
export function review(
  card: Card,
  grade: Grade,
  now: number,
  cfg: Config = DEFAULT_CONFIG
): ReviewResult {
  const w = cfg.weights;

  let stability: number;
  let difficulty: number;
  let state: CardState;
  let lapses = card.lapses;

  if (card.state === "new") {
    stability = initialStability(grade, w);
    difficulty = initialDifficulty(grade, w);
    state = grade === GRADE.AGAIN ? "learning" : "review";
  } else {
    const r = retrievability(card, now);
    if (grade === GRADE.AGAIN) {
      stability = stabilityAfterLapse(card.difficulty, card.stability, r, w);
      lapses += 1;
      state = "relearning";
    } else {
      stability = stabilityAfterRecall(card.difficulty, card.stability, r, grade, w);
      state = "review";
    }
    difficulty = nextDifficulty(card.difficulty, grade, w);
  }

  // A missed card comes back inside the same session rather than tomorrow —
  // the point of a lapse is another retrieval attempt while it is still warm.
  const days = state === "learning" || state === "relearning" ? 0 : intervalDays(stability, cfg);
  const due = state === "learning" || state === "relearning" ? now + 10 * 60_000 : now + days * DAY_MS;

  return {
    card: { stability, difficulty, state, lastReview: now, due, reps: card.reps + 1, lapses },
    intervalDays: days,
  };
}

/** Cards due now, hardest-recall first so the session front-loads real work. */
export function dueCards<T extends { card: Card }>(items: T[], now: number): T[] {
  return items
    .filter((i) => i.card.due <= now)
    .sort((a, b) => retrievability(a.card, now) - retrievability(b.card, now));
}

/** Human-facing preview of what each button will do, for the answer bar. */
export function schedulePreview(card: Card, now: number, cfg: Config = DEFAULT_CONFIG) {
  const grades: Grade[] = [1, 2, 3, 4];
  return grades.map((g) => ({ grade: g, intervalDays: review(card, g, now, cfg).intervalDays }));
}
