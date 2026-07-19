import type { LinearEquationParameters, MathProblem } from "./types";

export const DEMO_PROBLEM_IDS = [
  "linear-equation-01",
  "linear-equation-02",
  "linear-equation-03",
  "linear-equation-04",
] as const;

export type DemoProblemId = (typeof DEMO_PROBLEM_IDS)[number];

interface EquationSeed {
  multiplier: number;
  offset: number;
  solution: number;
}

function createEquation(seed: EquationSeed): LinearEquationParameters {
  return {
    ...seed,
    rightSide: seed.multiplier * (seed.solution + seed.offset),
  };
}

export function formatSignedTerm(value: number) {
  return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
}

export function formatInnerExpression(equation: LinearEquationParameters) {
  return `x ${formatSignedTerm(equation.offset)}`;
}

export function formatExpandedExpression(equation: LinearEquationParameters) {
  return `${equation.multiplier}x ${formatSignedTerm(
    equation.multiplier * equation.offset,
  )}`;
}

export function formatPartialDistribution(equation: LinearEquationParameters) {
  return `${equation.multiplier}x ${formatSignedTerm(equation.offset)}`;
}

export function formatEquation(equation: LinearEquationParameters) {
  return `${equation.multiplier}(${formatInnerExpression(equation)}) = ${equation.rightSide}`;
}

function createProblem(
  id: DemoProblemId,
  mainSeed: EquationSeed,
  transferSeed: EquationSeed,
): MathProblem {
  const equation = createEquation(mainSeed);
  const transferEquation = createEquation(transferSeed);

  return {
    id,
    title: "Linear equation",
    prompt: `Solve for x: ${formatEquation(equation)}`,
    skill: "Undoing operations in the correct order",
    expectedAnswer: `x = ${equation.solution}`,
    equation,
    transferProblem: {
      prompt: `Now solve independently: ${formatEquation(transferEquation)}`,
      expectedAnswer: `x = ${transferEquation.solution}`,
      equation: transferEquation,
    },
  };
}

const DEMO_PROBLEMS_BY_ID: Record<DemoProblemId, MathProblem> = {
  "linear-equation-01": createProblem(
    "linear-equation-01",
    { multiplier: 3, offset: -2, solution: 6 },
    { multiplier: 4, offset: 1, solution: 4 },
  ),
  "linear-equation-02": createProblem(
    "linear-equation-02",
    { multiplier: 5, offset: 3, solution: 5 },
    { multiplier: 2, offset: -4, solution: 9 },
  ),
  "linear-equation-03": createProblem(
    "linear-equation-03",
    { multiplier: 4, offset: -1, solution: 8 },
    { multiplier: 3, offset: 2, solution: 4 },
  ),
  "linear-equation-04": createProblem(
    "linear-equation-04",
    { multiplier: 2, offset: 5, solution: 7 },
    { multiplier: 5, offset: -2, solution: 8 },
  ),
};

export const DEMO_PROBLEMS = DEMO_PROBLEM_IDS.map(
  (id) => DEMO_PROBLEMS_BY_ID[id],
);

export const DEMO_PROBLEM = DEMO_PROBLEMS_BY_ID["linear-equation-01"];

export function getDemoProblem(problemId: string) {
  return DEMO_PROBLEMS_BY_ID[problemId as DemoProblemId];
}
