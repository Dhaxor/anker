// Evening reminder scheduling (pure).
//
// One notification a day, in the evening, and only when it has something true
// to say. Duolingo sends ~1bn notifications a year and models habituation with
// a bandit; we do not have that data, so the honest substitute is restraint:
// never nag someone who already studied today, and never send a streak warning
// to someone who has no streak to lose.

import { isoDay, streakAtRisk } from "./streak";

export interface ReminderPlan {
  /** local hour, 24h */
  hour: number;
  minute: number;
  title: string;
  body: string;
}

export type ReminderKind = "streak-at-risk" | "due-reviews" | "none";

export interface ReminderContext {
  activeDays: string[];
  /** how many cards are due at or before tomorrow evening */
  dueCount: number;
  streak: number;
  now: number;
}

/** Decide what, if anything, tonight's reminder should say. */
export function pickReminder(ctx: ReminderContext): ReminderKind {
  // Studied today already — say nothing. This is the single most common reason
  // people mute an app's notifications for good.
  if (ctx.activeDays.includes(isoDay(ctx.now))) return "none";
  if (streakAtRisk(ctx.activeDays, ctx.now) && ctx.streak > 0) return "streak-at-risk";
  if (ctx.dueCount > 0) return "due-reviews";
  return "none";
}

export function buildReminder(kind: ReminderKind, ctx: ReminderContext): ReminderPlan | null {
  if (kind === "none") return null;
  if (kind === "streak-at-risk") {
    return {
      hour: 19,
      minute: 30,
      title: `${ctx.streak} Tage in Folge`,
      // Concrete and small: "a few questions" is a promise someone tired can keep.
      body: "Ein paar Fragen genügen, um Ihre Serie zu halten.",
    };
  }
  return {
    hour: 19,
    minute: 30,
    title: "Kurz üben?",
    body:
      ctx.dueCount === 1
        ? "Eine Frage wartet auf Ihre Wiederholung."
        : `${ctx.dueCount} Fragen warten auf Ihre Wiederholung.`,
  };
}
