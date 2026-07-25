// What is free and what is paid.
//
// Principle: the 460 questions come from a government catalogue and are
// public. Locking them behind a paywall would be both wrong and bad business —
// every competitor gives them away, so gating them just loses the install.
// What we sell is the work we did on top: the timed exam simulator, the
// weak-spot targeting, and the readiness estimate.
//
// One-time purchase, not a subscription. A candidate uses this for a few
// months, passes, and leaves; billing them monthly for a one-off life event
// invites exactly the cancellation-friction complaints that sink this
// category's ratings.

export type Feature =
  | "practice"      // free: unlimited drilling of the whole catalogue
  | "readiness"     // free: expected score + pass probability
  | "exam"          // 1 free, then paid: timed 33-question simulator
  | "weakSpots";    // paid: lapse-ranked trouble list + topic strengths

export const PRODUCT_ID = "app.anker.einbuergerung.pro";

/** Free users may sit this many mock exams before the gate appears. */
export const FREE_EXAM_ALLOWANCE = 1;

export interface EntitlementState {
  pro: boolean;
  /** how many mock exams have been completed, ever */
  examsTaken: number;
}

// Readiness is free on purpose. It is the reason to install and the reason to
// buy: "you would score 8 out of 33" is what turns a browser into someone with
// a problem. Hiding it behind the paywall would make the app look like every
// other quiz app on the shelf, and would sell the cure before the diagnosis.
const FREE_FEATURES: Feature[] = ["practice", "readiness"];

export function canUse(feature: Feature, state: EntitlementState): boolean {
  if (state.pro) return true;
  if (FREE_FEATURES.includes(feature)) return true;
  // The first mock exam is free on purpose: it produces the "I would score
  // 14/33" moment, which is what makes the upgrade worth buying. Gating it
  // would be selling a solution before the user feels the problem.
  if (feature === "exam") return state.examsTaken < FREE_EXAM_ALLOWANCE;
  return false;
}

export function examsRemaining(state: EntitlementState): number {
  if (state.pro) return Infinity;
  return Math.max(0, FREE_EXAM_ALLOWANCE - state.examsTaken);
}

/**
 * Whether to show an upgrade prompt at this moment.
 *
 * Education is the slowest-converting category on the App Store — only ~28.5%
 * of paid conversions happen on day 0, the lowest of any category — so a
 * single day-0 wall is the wrong shape. We prompt when the user has just felt
 * the value instead: after finishing their free exam, and again once they have
 * accumulated real weak spots.
 */
export function shouldPrompt(
  state: EntitlementState,
  ctx: { justFinishedExam?: boolean; troubleSpotCount?: number; questionsSeen?: number }
): boolean {
  if (state.pro) return false;
  if (ctx.justFinishedExam) return true;
  if ((ctx.troubleSpotCount ?? 0) >= 5) return true;
  if ((ctx.questionsSeen ?? 0) >= 60) return true;
  return false;
}
