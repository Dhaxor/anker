// The Leben-in-Deutschland / Einbürgerungstest question bank.
//
// Content provenance matters here more than anywhere else in the app: every
// question was parsed from the official BAMF Gesamtfragenkatalog and
// cross-checked against an independent answer key. `verifiedAgainstOfficialCatalogue`
// records whether that check passed, so the UI can be honest about the handful
// we could not machine-verify rather than quietly presenting them as official.
//
// Pure module — no React, no storage, no global RNG.

import raw from "@/assets/content/lid-questions.json";

export interface Question {
  id: string;
  /** 1-based position in the official catalogue ordering */
  n: number;
  /** "Allgemein" for the 300 general questions, otherwise the Bundesland */
  region: string;
  question: string;
  options: string[];
  /** index into `options` */
  correct: number;
  category: string;
  verifiedAgainstOfficialCatalogue: boolean;
  note?: string;
}

export const BUNDESLAENDER = [
  "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg",
  "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen",
  "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt",
  "Schleswig-Holstein", "Thüringen",
] as const;

export type Bundesland = (typeof BUNDESLAENDER)[number];

/**
 * Official exam shape: 33 questions — 30 general plus 3 from the candidate's
 * Bundesland — with 17 correct required to pass, inside 60 minutes.
 */
export const EXAM_TOTAL = 33;
export const EXAM_GENERAL = 30;
export const EXAM_STATE = 3;
export const EXAM_PASS_MARK = 17;
export const EXAM_MINUTES = 60;

const ALL = raw as Question[];

export function allQuestions(): Question[] {
  return ALL;
}

export function generalQuestions(): Question[] {
  return ALL.filter((q) => q.region === "Allgemein");
}

export function stateQuestions(region: Bundesland): Question[] {
  return ALL.filter((q) => q.region === region);
}

/** Questions a candidate in `region` can be asked at all. */
export function questionsFor(region: Bundesland): Question[] {
  return [...generalQuestions(), ...stateQuestions(region)];
}

export function questionById(id: string): Question | null {
  return ALL.find((q) => q.id === id) ?? null;
}

export function categories(): string[] {
  return [...new Set(generalQuestions().map((q) => q.category))].filter(Boolean).sort();
}

/** Deterministic RNG so an exam can be replayed from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(items: T[], count: number, rand: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** Build a mock exam in the official 30 + 3 shape. */
export function buildExam(region: Bundesland, seed: number): Question[] {
  const rand = mulberry32(seed);
  return [
    ...sample(generalQuestions(), EXAM_GENERAL, rand),
    ...sample(stateQuestions(region), EXAM_STATE, rand),
  ];
}

export function isPass(correctCount: number): boolean {
  return correctCount >= EXAM_PASS_MARK;
}
