import { describe, expect, it } from "vitest";

import { TutorRequestSchema } from "./schemas";
import {
  createSeededProblem,
  createSeededProblemId,
  DEMO_PROBLEM_IDS,
  getDemoProblem,
  MAX_DEMO_PROBLEM_SEED,
  nextDistinctProblemSeed,
  parseSeededProblemId,
} from "./problems";

describe("seeded equation generator", () => {
  it.each([0, 1, 42, 908_172_635, MAX_DEMO_PROBLEM_SEED])(
    "reconstructs seed %i deterministically",
    (seed) => {
      const first = createSeededProblem(seed);
      const second = createSeededProblem(seed);

      expect(second).toEqual(first);
      expect(getDemoProblem(first.id)).toEqual(first);
      expect(parseSeededProblemId(first.id)).toBe(seed);
    },
  );

  it("keeps generated equations inside the learner-friendly bounds", () => {
    for (let seed = 0; seed < 1024; seed += 1) {
      const problem = createSeededProblem(seed);
      const equations = [problem.equation, problem.transferProblem.equation];

      for (const equation of equations) {
        expect(equation.multiplier).toBeGreaterThanOrEqual(2);
        expect(equation.multiplier).toBeLessThanOrEqual(6);
        expect(equation.offset).not.toBe(0);
        expect(Math.abs(equation.offset)).toBeLessThanOrEqual(4);
        expect(equation.solution).toBeGreaterThanOrEqual(5);
        expect(equation.solution).toBeLessThanOrEqual(12);
        expect(equation.rightSide).toBe(
          equation.multiplier * (equation.solution + equation.offset),
        );
        expect(equation.rightSide).toBeGreaterThan(0);
      }

      expect(problem.transferProblem.equation).not.toEqual(problem.equation);
    }
  });

  it("always advances to visibly different coefficients", () => {
    for (const seed of [0, 1, 42, 123_456_789, MAX_DEMO_PROBLEM_SEED]) {
      const nextSeed = nextDistinctProblemSeed(seed);

      expect(nextSeed).not.toBe(seed);
      expect(createSeededProblem(nextSeed).prompt).not.toBe(
        createSeededProblem(seed).prompt,
      );
    }
  });

  it("accepts only fixed or bounded canonical problem IDs", () => {
    for (const problemId of [
      ...DEMO_PROBLEM_IDS,
      createSeededProblemId(0),
      createSeededProblemId(MAX_DEMO_PROBLEM_SEED),
    ]) {
      expect(
        TutorRequestSchema.safeParse({
          problemId,
          learnerAttempt: "first step",
          attemptNumber: 1,
          currentStage: "attempt",
          useLiveModel: false,
        }).success,
      ).toBe(true);
    }

    for (const problemId of [
      "linear-equation-v1-01",
      "linear-equation-v1--1",
      `linear-equation-v1-${MAX_DEMO_PROBLEM_SEED + 1}`,
      "linear-equation-v1-not-a-number",
      "linear-equation-v2-42",
      "linear-equation-99",
      "__proto__",
    ]) {
      expect(
        TutorRequestSchema.safeParse({
          problemId,
          learnerAttempt: "first step",
          attemptNumber: 1,
          currentStage: "attempt",
          useLiveModel: false,
        }).success,
      ).toBe(false);
      expect(getDemoProblem(problemId)).toBeUndefined();
    }
  });
});
