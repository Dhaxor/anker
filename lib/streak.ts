// Daily streak, kept pure so it can be tested without React or storage.
//
// Deliberately forgiving at the edge: the streak survives until the end of
// *tomorrow*, so someone who studies at 23:50 on Monday and 00:10 on Wednesday
// has not "lost" anything they earned. A streak that punishes timezone edges
// teaches people to distrust it.

const DAY_MS = 86_400_000;

export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Consecutive active days ending today, or yesterday if today is unstarted. */
export function streakFrom(days: string[], now: number): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  let cursor = now;
  if (!set.has(isoDay(cursor))) {
    cursor -= DAY_MS;
    if (!set.has(isoDay(cursor))) return 0;
  }
  let count = 0;
  while (set.has(isoDay(cursor))) {
    count += 1;
    cursor -= DAY_MS;
  }
  return count;
}

/** True when studying today would extend rather than restart the streak. */
export function streakAtRisk(days: string[], now: number): boolean {
  if (days.length === 0) return false;
  const set = new Set(days);
  return !set.has(isoDay(now)) && set.has(isoDay(now - DAY_MS));
}
