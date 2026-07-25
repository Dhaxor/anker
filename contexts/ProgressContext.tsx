// Review state for every question, persisted locally. There is no account and
// no server: the whole app works offline on a plane, which is the point.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card, Grade, dueCards, newCard, review } from "@/lib/fsrs";
import { CardMap, Readiness, readiness } from "@/lib/readiness";
import { Bundesland, Question, questionsFor } from "@/lib/questionBank";

const CARDS_KEY = "anker.cards.v1";
const REGION_KEY = "anker.region.v1";
const STATS_KEY = "anker.stats.v1";

export interface Stats {
  /** exam attempts, most recent last */
  attempts: { at: number; score: number; passed: boolean }[];
  /** ISO days on which the candidate practised, for the streak */
  activeDays: string[];
}

const EMPTY_STATS: Stats = { attempts: [], activeDays: [] };

interface ProgressValue {
  ready: boolean;
  region: Bundesland | null;
  setRegion: (r: Bundesland) => void;
  cards: CardMap;
  stats: Stats;
  /** grade one question and persist */
  answer: (questionId: string, grade: Grade) => void;
  recordAttempt: (score: number, passed: boolean) => void;
  /** questions due now, weakest recall first, then unseen */
  queue: (limit?: number) => Question[];
  readiness: Readiness | null;
  streak: number;
  reset: () => void;
}

const Ctx = createContext<ProgressValue | null>(null);

function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Consecutive days ending today (or yesterday, so an unfinished day is forgiving). */
export function streakFrom(days: string[], now: number): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  const dayMs = 86_400_000;
  let cursor = now;
  if (!set.has(isoDay(cursor))) {
    cursor -= dayMs;
    if (!set.has(isoDay(cursor))) return 0;
  }
  let count = 0;
  while (set.has(isoDay(cursor))) {
    count += 1;
    cursor -= dayMs;
  }
  return count;
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [region, setRegionState] = useState<Bundesland | null>(null);
  const [cards, setCards] = useState<CardMap>({});
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const [c, r, s] = await AsyncStorage.multiGet([CARDS_KEY, REGION_KEY, STATS_KEY]);
        if (stale) return;
        if (c[1]) setCards(JSON.parse(c[1]) as CardMap);
        if (r[1]) setRegionState(r[1] as Bundesland);
        if (s[1]) setStats({ ...EMPTY_STATS, ...(JSON.parse(s[1]) as Stats) });
      } catch {
        // a corrupt store must not brick the app; start fresh instead
      } finally {
        if (!stale) setReady(true);
      }
    })();
    return () => {
      stale = true;
    };
  }, []);

  const persistCards = useCallback((next: CardMap) => {
    setCards(next);
    void AsyncStorage.setItem(CARDS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const persistStats = useCallback((next: Stats) => {
    setStats(next);
    void AsyncStorage.setItem(STATS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setRegion = useCallback((r: Bundesland) => {
    setRegionState(r);
    void AsyncStorage.setItem(REGION_KEY, r).catch(() => {});
  }, []);

  const answer = useCallback(
    (questionId: string, grade: Grade) => {
      const now = Date.now();
      const existing = cards[questionId] ?? newCard(now);
      const next = review(existing, grade, now).card;
      persistCards({ ...cards, [questionId]: next });

      const today = isoDay(now);
      if (!stats.activeDays.includes(today)) {
        persistStats({ ...stats, activeDays: [...stats.activeDays, today].slice(-400) });
      }
    },
    [cards, stats, persistCards, persistStats]
  );

  const recordAttempt = useCallback(
    (score: number, passed: boolean) => {
      persistStats({
        ...stats,
        attempts: [...stats.attempts, { at: Date.now(), score, passed }].slice(-50),
      });
    },
    [stats, persistStats]
  );

  const queue = useCallback(
    (limit = 20): Question[] => {
      if (!region) return [];
      const now = Date.now();
      const pool = questionsFor(region);
      const withCards = pool
        .filter((q) => cards[q.id])
        .map((q) => ({ q, card: cards[q.id] as Card }));
      const due = dueCards(withCards, now).map((x) => x.q);
      // unseen questions fill the rest, in catalogue order so study feels ordered
      const unseen = pool.filter((q) => !cards[q.id]);
      return [...due, ...unseen].slice(0, limit);
    },
    [cards, region]
  );

  const value = useMemo<ProgressValue>(
    () => ({
      ready,
      region,
      setRegion,
      cards,
      stats,
      answer,
      recordAttempt,
      queue,
      readiness: region ? readiness(cards, region, Date.now()) : null,
      streak: streakFrom(stats.activeDays, Date.now()),
      reset: () => {
        persistCards({});
        persistStats(EMPTY_STATS);
      },
    }),
    [ready, region, setRegion, cards, stats, answer, recordAttempt, queue, persistCards, persistStats]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProgress must be used inside ProgressProvider");
  return v;
}
