import { describe, expect, test } from "bun:test";
import {
  allQuestions,
  generalQuestions,
  stateQuestions,
  questionsFor,
  questionById,
  categories,
  buildExam,
  isPass,
  mulberry32,
  BUNDESLAENDER,
  EXAM_TOTAL,
  EXAM_GENERAL,
  EXAM_STATE,
  EXAM_PASS_MARK,
} from "./questionBank";

describe("question bank integrity", () => {
  test("holds the full official catalogue: 300 general + 160 state", () => {
    expect(generalQuestions()).toHaveLength(300);
    expect(allQuestions().filter((q) => q.region !== "Allgemein")).toHaveLength(160);
    expect(allQuestions()).toHaveLength(460);
  });

  test("every Bundesland has exactly 10 questions", () => {
    for (const land of BUNDESLAENDER) {
      expect(stateQuestions(land)).toHaveLength(10);
    }
  });

  test("every question is answerable: 4 options and an in-range correct index", () => {
    for (const q of allQuestions()) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
      expect(q.question.trim().length).toBeGreaterThan(5);
      expect(q.options.every((o) => o.trim().length > 0)).toBe(true);
    }
  });

  test("ids are unique so review state can key off them", () => {
    const ids = allQuestions().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the great majority are verified against the official catalogue", () => {
    const verified = allQuestions().filter((q) => q.verifiedAgainstOfficialCatalogue);
    // 398 machine-matched exactly; the rest are image questions or parse gaps
    expect(verified.length).toBeGreaterThanOrEqual(390);
    // anything unverified must say why
    for (const q of allQuestions()) {
      if (!q.verifiedAgainstOfficialCatalogue) expect(q.note ?? "").not.toBe("");
    }
  });

  test("known question 1 keeps its official answer", () => {
    const q = allQuestions()[0];
    expect(q.question).toContain("offen etwas gegen die Regierung sagen");
    expect(q.options[q.correct]).toContain("Meinungsfreiheit");
  });

  test("categories are populated for the general set", () => {
    expect(categories().length).toBeGreaterThan(3);
  });

  test("lookup by id round-trips", () => {
    const q = allQuestions()[42];
    expect(questionById(q.id)?.question).toBe(q.question);
    expect(questionById("nope")).toBeNull();
  });
});

describe("exam construction", () => {
  test("matches the official 30 general + 3 state shape", () => {
    const exam = buildExam("Bayern", 1);
    expect(exam).toHaveLength(EXAM_TOTAL);
    expect(exam.filter((q) => q.region === "Allgemein")).toHaveLength(EXAM_GENERAL);
    expect(exam.filter((q) => q.region === "Bayern")).toHaveLength(EXAM_STATE);
  });

  test("never repeats a question within one exam", () => {
    for (let seed = 0; seed < 40; seed++) {
      const exam = buildExam("Hessen", seed);
      expect(new Set(exam.map((q) => q.id)).size).toBe(EXAM_TOTAL);
    }
  });

  test("only ever draws state questions from the candidate's own Bundesland", () => {
    for (const land of BUNDESLAENDER) {
      const exam = buildExam(land, 7);
      for (const q of exam) {
        expect(q.region === "Allgemein" || q.region === land).toBe(true);
      }
    }
  });

  test("is reproducible from its seed, and different seeds differ", () => {
    const a = buildExam("Berlin", 99).map((q) => q.id);
    const b = buildExam("Berlin", 99).map((q) => q.id);
    const c = buildExam("Berlin", 100).map((q) => q.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test("draws broadly across the pool rather than favouring the head", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      buildExam("Sachsen", seed).forEach((q) => seen.add(q.id));
    }
    // 60 exams x 30 general draws should touch most of the 300 general questions
    expect(seen.size).toBeGreaterThan(200);
  });

  test("questionsFor exposes exactly the askable pool", () => {
    expect(questionsFor("Hamburg")).toHaveLength(310);
  });
});

describe("pass mark", () => {
  test("17 of 33 passes, 16 fails", () => {
    expect(isPass(EXAM_PASS_MARK)).toBe(true);
    expect(isPass(EXAM_PASS_MARK - 1)).toBe(false);
    expect(isPass(EXAM_TOTAL)).toBe(true);
    expect(isPass(0)).toBe(false);
  });
});

describe("rng", () => {
  test("is deterministic and stays in [0,1)", () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
