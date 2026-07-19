import type { LinearEquationParameters, MathProblem } from "./types";

export const DEMO_PROBLEM_IDS = [
  "linear-equation-01",
  "linear-equation-02",
  "linear-equation-03",
  "linear-equation-04",
] as const;

export type DemoProblemId = (typeof DEMO_PROBLEM_IDS)[number];

export const MAX_DEMO_PROBLEM_SEED = 999_999_999;

const SEEDED_PROBLEM_ID_PREFIX = "linear-equation-v1-";
const GENERATED_OFFSETS = [-4, -3, -2, -1, 1, 2, 3, 4] as const;

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
  id: string,
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

function assertProblemSeed(seed: number) {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > MAX_DEMO_PROBLEM_SEED
  ) {
    throw new RangeError(
      `Problem seed must be an integer from 0 to ${MAX_DEMO_PROBLEM_SEED}.`,
    );
  }
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}

function createGeneratedSeed(next: () => number): EquationSeed {
  return {
    multiplier: 2 + (next() % 5),
    offset: GENERATED_OFFSETS[next() % GENERATED_OFFSETS.length],
    solution: 5 + (next() % 8),
  };
}

function sameEquation(left: EquationSeed, right: EquationSeed) {
  return (
    left.multiplier === right.multiplier &&
    left.offset === right.offset &&
    left.solution === right.solution
  );
}

export function createSeededProblemId(seed: number) {
  assertProblemSeed(seed);
  return `${SEEDED_PROBLEM_ID_PREFIX}${seed}`;
}

export function parseSeededProblemId(problemId: string) {
  const match = /^linear-equation-v1-(0|[1-9]\d{0,8})$/.exec(problemId);
  if (!match) return undefined;

  const seed = Number(match[1]);
  return seed <= MAX_DEMO_PROBLEM_SEED ? seed : undefined;
}

export function createSeededProblem(seed: number): MathProblem {
  assertProblemSeed(seed);

  const next = createSeededRandom(seed);
  const mainSeed = createGeneratedSeed(next);
  let transferSeed = createGeneratedSeed(next);

  if (sameEquation(mainSeed, transferSeed)) {
    transferSeed = {
      ...transferSeed,
      multiplier: transferSeed.multiplier === 6 ? 2 : transferSeed.multiplier + 1,
    };
  }

  return createProblem(createSeededProblemId(seed), mainSeed, transferSeed);
}

export function nextDistinctProblemSeed(seed: number) {
  assertProblemSeed(seed);
  const currentPrompt = createSeededProblem(seed).prompt;

  for (let step = 1; step <= 1024; step += 1) {
    const candidate = (seed + step) % (MAX_DEMO_PROBLEM_SEED + 1);
    if (createSeededProblem(candidate).prompt !== currentPrompt) {
      return candidate;
    }
  }

  throw new Error("Could not generate a distinct equation.");
}

export function isDemoProblemId(problemId: string) {
  return (
    Object.hasOwn(DEMO_PROBLEMS_BY_ID, problemId) ||
    parseSeededProblemId(problemId) !== undefined
  );
}

export function getDemoProblem(problemId: string) {
  const fixedProblem = Object.hasOwn(DEMO_PROBLEMS_BY_ID, problemId)
    ? DEMO_PROBLEMS_BY_ID[problemId as DemoProblemId]
    : undefined;
  if (fixedProblem) return fixedProblem;

  const seed = parseSeededProblemId(problemId);
  return seed === undefined ? undefined : createSeededProblem(seed);
}
