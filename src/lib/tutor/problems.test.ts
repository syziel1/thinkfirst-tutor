import { describe, expect, it } from "vitest";

import { TutorRequestSchema } from "./schemas";
import {
  createSeededProblem,
  createSeededProblemId,
  DEMO_PROBLEM_IDS,
  EQUATION_LEVELS,
  formatEquation,
  getDemoProblem,
  MAX_DEMO_PROBLEM_SEED,
  nextDistinctProblemSeed,
  parseSeededProblemId,
  parseSeededProblemLevel,
  validateEquationParameters,
} from "./problems";
import type { EquationForm, EquationLevel } from "./types";

const FORM_BY_LEVEL: Record<EquationLevel, EquationForm> = {
  1: "one-step",
  2: "two-step",
  3: "variables-both-sides",
  4: "distribution",
  5: "multi-step",
};

describe("seeded equation generator", () => {
  it.each(EQUATION_LEVELS)(
    "reconstructs every level deterministically (level %i)",
    (level) => {
      for (const seed of [0, 1, 42, 908_172_635, MAX_DEMO_PROBLEM_SEED]) {
        const first = createSeededProblem(seed, level);
        const second = createSeededProblem(seed, level);

        expect(second).toEqual(first);
        expect(getDemoProblem(first.id)).toEqual(first);
        expect(parseSeededProblemId(first.id)).toBe(seed);
        expect(parseSeededProblemLevel(first.id)).toBe(level);
        expect(first.id).toBe(createSeededProblemId(seed, level));
      }
    },
  );

  it.each(EQUATION_LEVELS)(
    "generates balanced, uniquely solvable equations at level %i",
    (level) => {
      for (let seed = 0; seed < 256; seed += 1) {
        const problem = createSeededProblem(seed, level);
        const equations = [problem.equation, problem.transferProblem.equation];

        expect(problem.level).toBe(level);
        expect(problem.levelTitle).not.toBe("");
        expect(problem.transferProblem.equation).not.toEqual(problem.equation);

        for (const equation of equations) {
          expect(equation.level).toBe(level);
          expect(equation.form).toBe(FORM_BY_LEVEL[level]);
          expect(equation.offset).not.toBe(0);
          expect(Math.abs(equation.offset)).toBeLessThanOrEqual(4);
          expect(Number.isSafeInteger(equation.solution)).toBe(true);
          expect(equation.solution).toBeGreaterThan(0);
          expect(equation.leftCoefficient).not.toBe(
            equation.rightCoefficient,
          );
          expect(
            equation.leftCoefficient * equation.solution +
              equation.leftConstant,
          ).toBe(
            equation.rightCoefficient * equation.solution +
              equation.rightConstant,
          );
          expect(formatEquation(equation)).not.toBe("");
          expect(validateEquationParameters(equation)).toBe(equation);
        }
      }
    },
  );

  it("enforces the defining structure of each level", () => {
    for (const level of EQUATION_LEVELS) {
      const equation = createSeededProblem(42, level).equation;

      if (level === 1) {
        expect(equation.leftCoefficient).toBe(1);
        expect(equation.rightCoefficient).toBe(0);
      } else if (level === 2) {
        expect(equation.leftCoefficient).toBe(equation.multiplier);
        expect(equation.multiplier).toBeGreaterThanOrEqual(2);
        expect(equation.rightCoefficient).toBe(0);
      } else if (level === 3) {
        expect(equation.leftCoefficient).toBeGreaterThan(
          equation.rightCoefficient,
        );
        expect(equation.rightCoefficient).toBeGreaterThan(0);
      } else if (level === 4) {
        expect(equation.leftConstant).toBe(
          equation.multiplier * equation.offset,
        );
        expect(equation.likeCoefficient).toBe(0);
      } else {
        expect(equation.leftCoefficient).toBe(
          equation.multiplier + equation.likeCoefficient,
        );
        expect(equation.leftConstant).toBe(
          equation.multiplier * equation.offset,
        );
        expect(equation.likeCoefficient).toBeGreaterThan(0);
      }
    }
  });

  it.each(EQUATION_LEVELS)(
    "always advances to a visibly different equation at level %i",
    (level) => {
      for (const seed of [0, 1, 42, 123_456_789, MAX_DEMO_PROBLEM_SEED]) {
        const nextSeed = nextDistinctProblemSeed(seed, level);

        expect(nextSeed).not.toBe(seed);
        expect(createSeededProblem(nextSeed, level).prompt).not.toBe(
          createSeededProblem(seed, level).prompt,
        );
      }
    },
  );

  it("keeps legacy generated IDs compatible with distribution problems", () => {
    const legacyId = "linear-equation-v1-42";
    const problem = getDemoProblem(legacyId);

    expect(problem?.id).toBe(legacyId);
    expect(problem?.level).toBe(4);
    expect(problem?.equation.form).toBe("distribution");
    expect(parseSeededProblemId(legacyId)).toBe(42);
    expect(parseSeededProblemLevel(legacyId)).toBe(4);
  });

  it("accepts only fixed or bounded canonical problem IDs", () => {
    const validIds = [
      ...DEMO_PROBLEM_IDS,
      "linear-equation-v1-42",
      ...EQUATION_LEVELS.flatMap((level) => [
        createSeededProblemId(0, level),
        createSeededProblemId(MAX_DEMO_PROBLEM_SEED, level),
      ]),
    ];

    for (const problemId of validIds) {
      expect(
        TutorRequestSchema.safeParse({
          problemId,
          learnerAttempt: "first step",
          attemptNumber: 1,
          currentStage: "attempt",
          useLiveModel: false,
        }).success,
      ).toBe(true);
      expect(getDemoProblem(problemId)).toBeDefined();
    }

    for (const problemId of [
      "linear-equation-v1-01",
      "linear-equation-v1--1",
      `linear-equation-v1-${MAX_DEMO_PROBLEM_SEED + 1}`,
      "linear-equation-v1-not-a-number",
      "linear-equation-v2-42",
      "linear-equation-v2-l0-42",
      "linear-equation-v2-l6-42",
      "linear-equation-v2-l1-01",
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

  it("rejects malformed or unsafe equation parameters at runtime", () => {
    const valid = createSeededProblem(42, 3).equation;

    expect(() =>
      validateEquationParameters({ ...valid, solution: -1 }),
    ).toThrow("positive");
    expect(() =>
      validateEquationParameters({
        ...valid,
        rightCoefficient: valid.leftCoefficient,
      }),
    ).toThrow("unique solution");
    expect(() =>
      validateEquationParameters({
        ...valid,
        rightConstant: valid.rightConstant + 1,
        rightSide: valid.rightSide + 1,
      }),
    ).toThrow("not balanced");
    expect(() =>
      validateEquationParameters({ ...valid, form: "two-step" }),
    ).toThrow("does not match");
    expect(() =>
      validateEquationParameters({ ...valid, leftConstant: 0.5 }),
    ).toThrow("safe integer");
  });
});
