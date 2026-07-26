import type {
  EquationForm,
  EquationLevel,
  LinearEquationParameters,
  MathProblem,
} from "./types";

export const DEMO_PROBLEM_IDS = [
  "linear-equation-01",
  "linear-equation-02",
  "linear-equation-03",
  "linear-equation-04",
] as const;

export type DemoProblemId = (typeof DEMO_PROBLEM_IDS)[number];

export const EQUATION_LEVELS = [1, 2, 3, 4, 5] as const;
export const MAX_DEMO_PROBLEM_SEED = 999_999_999;

const SEEDED_PROBLEM_ID_PREFIX = "linear-equation-v2";
const GENERATED_OFFSETS = [-4, -3, -2, -1, 1, 2, 3, 4] as const;

export interface EquationLevelDefinition {
  level: EquationLevel;
  title: string;
  shortTitle: string;
  skill: string;
  example: string;
}

const LEVEL_DEFINITIONS: Record<EquationLevel, EquationLevelDefinition> = {
  1: {
    level: 1,
    title: "One-step equations",
    shortTitle: "One step",
    skill: "Undoing one addition or subtraction",
    example: "x - 3 = 2",
  },
  2: {
    level: 2,
    title: "Two-step equations",
    shortTitle: "Two step",
    skill: "Undoing a constant, then a coefficient",
    example: "4x + 1 = 13",
  },
  3: {
    level: 3,
    title: "Variables on both sides",
    shortTitle: "Both sides",
    skill: "Collecting variable terms while preserving equality",
    example: "5x - 2 = 3x + 8",
  },
  4: {
    level: 4,
    title: "Distribution",
    shortTitle: "Distribute",
    skill: "Undoing grouped operations or distributing correctly",
    example: "3(x - 2) = 18",
  },
  5: {
    level: 5,
    title: "Distribution and like terms",
    shortTitle: "Multi step",
    skill: "Distributing, combining like terms, and isolating x",
    example: "3(x - 2) + 2x = 24",
  },
};

interface EquationSeed {
  multiplier: number;
  offset: number;
  solution: number;
}

interface ParsedProblemReference {
  level: EquationLevel;
  seed: number;
}

function isEquationLevel(value: number): value is EquationLevel {
  return EQUATION_LEVELS.includes(value as EquationLevel);
}

export function equationLevelDefinition(level: EquationLevel) {
  return LEVEL_DEFINITIONS[level];
}

export function formatSignedTerm(value: number) {
  return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
}

export function formatLinearExpression(
  coefficient: number,
  constant: number,
) {
  const variable =
    coefficient === 1
      ? "x"
      : coefficient === -1
        ? "-x"
        : `${coefficient}x`;
  return constant === 0 ? variable : `${variable} ${formatSignedTerm(constant)}`;
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

export function formatCombinedExpression(equation: LinearEquationParameters) {
  return formatLinearExpression(
    equation.leftCoefficient - equation.rightCoefficient,
    equation.leftConstant,
  );
}

export function formatEquation(equation: LinearEquationParameters) {
  switch (equation.form) {
    case "one-step":
      return `x ${formatSignedTerm(equation.offset)} = ${equation.rightConstant}`;
    case "two-step":
      return `${formatLinearExpression(
        equation.leftCoefficient,
        equation.leftConstant,
      )} = ${equation.rightConstant}`;
    case "variables-both-sides":
      return `${formatLinearExpression(
        equation.leftCoefficient,
        equation.leftConstant,
      )} = ${formatLinearExpression(
        equation.rightCoefficient,
        equation.rightConstant,
      )}`;
    case "distribution":
      return `${equation.multiplier}(${formatInnerExpression(equation)}) = ${equation.rightConstant}`;
    case "multi-step":
      return `${equation.multiplier}(${formatInnerExpression(
        equation,
      )}) + ${equation.likeCoefficient}x = ${equation.rightConstant}`;
  }
}

function assertInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a safe integer.`);
  }
}

export function validateEquationParameters(
  equation: LinearEquationParameters,
): LinearEquationParameters {
  for (const [field, value] of Object.entries(equation)) {
    if (typeof value === "number") assertInteger(value, field);
  }

  if (!isEquationLevel(equation.level)) {
    throw new RangeError("Equation level must be from 1 to 5.");
  }
  if (equation.solution <= 0) {
    throw new RangeError("Generated solutions must be positive.");
  }
  if (equation.leftCoefficient === equation.rightCoefficient) {
    throw new RangeError("Generated equations must have one unique solution.");
  }

  const leftValue =
    equation.leftCoefficient * equation.solution + equation.leftConstant;
  const rightValue =
    equation.rightCoefficient * equation.solution + equation.rightConstant;
  if (leftValue !== rightValue) {
    throw new RangeError("Generated equation parameters are not balanced.");
  }

  const expectedFormByLevel: Record<EquationLevel, EquationForm> = {
    1: "one-step",
    2: "two-step",
    3: "variables-both-sides",
    4: "distribution",
    5: "multi-step",
  };
  if (equation.form !== expectedFormByLevel[equation.level]) {
    throw new RangeError("Equation form does not match its level.");
  }
  if (equation.offset === 0) {
    throw new RangeError("Generated equations must use a non-zero offset.");
  }
  if (equation.rightSide !== equation.rightConstant) {
    throw new RangeError("rightSide must mirror the visible right constant.");
  }

  switch (equation.form) {
    case "one-step":
      if (
        equation.multiplier !== 1 ||
        equation.leftCoefficient !== 1 ||
        equation.rightCoefficient !== 0 ||
        equation.likeCoefficient !== 0
      ) {
        throw new RangeError("Invalid one-step equation parameters.");
      }
      break;
    case "two-step":
      if (
        equation.multiplier < 2 ||
        equation.leftCoefficient !== equation.multiplier ||
        equation.rightCoefficient !== 0 ||
        equation.likeCoefficient !== 0
      ) {
        throw new RangeError("Invalid two-step equation parameters.");
      }
      break;
    case "variables-both-sides":
      if (
        equation.leftCoefficient <= equation.rightCoefficient ||
        equation.rightCoefficient <= 0 ||
        equation.likeCoefficient !== 0
      ) {
        throw new RangeError("Invalid variables-on-both-sides parameters.");
      }
      break;
    case "distribution":
      if (
        equation.multiplier < 2 ||
        equation.leftCoefficient !== equation.multiplier ||
        equation.leftConstant !== equation.multiplier * equation.offset ||
        equation.rightCoefficient !== 0 ||
        equation.likeCoefficient !== 0
      ) {
        throw new RangeError("Invalid distribution equation parameters.");
      }
      break;
    case "multi-step":
      if (
        equation.multiplier < 2 ||
        equation.likeCoefficient <= 0 ||
        equation.leftCoefficient !==
          equation.multiplier + equation.likeCoefficient ||
        equation.leftConstant !== equation.multiplier * equation.offset ||
        equation.rightCoefficient !== 0
      ) {
        throw new RangeError("Invalid multi-step equation parameters.");
      }
      break;
  }

  return equation;
}

function createDistributionEquation(
  seed: EquationSeed,
): LinearEquationParameters {
  return validateEquationParameters({
    level: 4,
    form: "distribution",
    ...seed,
    rightSide: seed.multiplier * (seed.solution + seed.offset),
    leftCoefficient: seed.multiplier,
    leftConstant: seed.multiplier * seed.offset,
    rightCoefficient: 0,
    rightConstant: seed.multiplier * (seed.solution + seed.offset),
    likeCoefficient: 0,
  });
}

function createGeneratedEquation(
  next: () => number,
  level: EquationLevel,
): LinearEquationParameters {
  if (level === 4) {
    return createDistributionEquation({
      // Preserve the original v1 random draw order.
      multiplier: 2 + (next() % 5),
      offset: GENERATED_OFFSETS[next() % GENERATED_OFFSETS.length],
      solution: 5 + (next() % 8),
    });
  }

  const offset = GENERATED_OFFSETS[next() % GENERATED_OFFSETS.length];

  if (level === 1) {
    const solution = 5 + (next() % 8);
    const rightSide = solution + offset;
    return validateEquationParameters({
      level,
      form: "one-step",
      multiplier: 1,
      offset,
      rightSide,
      solution,
      leftCoefficient: 1,
      leftConstant: offset,
      rightCoefficient: 0,
      rightConstant: rightSide,
      likeCoefficient: 0,
    });
  }

  if (level === 2) {
    const multiplier = 2 + (next() % 5);
    const solution = 3 + (next() % 8);
    const rightSide = multiplier * solution + offset;
    return validateEquationParameters({
      level,
      form: "two-step",
      multiplier,
      offset,
      rightSide,
      solution,
      leftCoefficient: multiplier,
      leftConstant: offset,
      rightCoefficient: 0,
      rightConstant: rightSide,
      likeCoefficient: 0,
    });
  }

  if (level === 3) {
    const rightCoefficient = 1 + (next() % 3);
    const coefficientDifference = 2 + (next() % 4);
    const leftCoefficient = rightCoefficient + coefficientDifference;
    const solution = 3 + (next() % 8);
    const rightConstant = coefficientDifference * solution + offset;
    return validateEquationParameters({
      level,
      form: "variables-both-sides",
      multiplier: coefficientDifference,
      offset,
      rightSide: rightConstant,
      solution,
      leftCoefficient,
      leftConstant: offset,
      rightCoefficient,
      rightConstant,
      likeCoefficient: 0,
    });
  }

  const multiplier = 2 + (next() % 3);
  const likeCoefficient = 1 + (next() % 3);
  const solution = 6 + (next() % 7);
  const leftCoefficient = multiplier + likeCoefficient;
  const leftConstant = multiplier * offset;
  const rightSide = leftCoefficient * solution + leftConstant;
  return validateEquationParameters({
    level,
    form: "multi-step",
    multiplier,
    offset,
    rightSide,
    solution,
    leftCoefficient,
    leftConstant,
    rightCoefficient: 0,
    rightConstant: rightSide,
    likeCoefficient,
  });
}

function createProblem(
  id: string,
  equation: LinearEquationParameters,
  transferEquation: LinearEquationParameters,
): MathProblem {
  const definition = equationLevelDefinition(equation.level);

  if (transferEquation.level !== equation.level) {
    throw new RangeError("Main and transfer equations must use the same level.");
  }

  return {
    id,
    level: equation.level,
    levelTitle: definition.title,
    title: "Linear equation",
    prompt: `Solve for x: ${formatEquation(equation)}`,
    skill: definition.skill,
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
    createDistributionEquation({ multiplier: 3, offset: -2, solution: 6 }),
    createDistributionEquation({ multiplier: 4, offset: 1, solution: 4 }),
  ),
  "linear-equation-02": createProblem(
    "linear-equation-02",
    createDistributionEquation({ multiplier: 5, offset: 3, solution: 5 }),
    createDistributionEquation({ multiplier: 2, offset: -4, solution: 9 }),
  ),
  "linear-equation-03": createProblem(
    "linear-equation-03",
    createDistributionEquation({ multiplier: 4, offset: -1, solution: 8 }),
    createDistributionEquation({ multiplier: 3, offset: 2, solution: 4 }),
  ),
  "linear-equation-04": createProblem(
    "linear-equation-04",
    createDistributionEquation({ multiplier: 2, offset: 5, solution: 7 }),
    createDistributionEquation({ multiplier: 5, offset: -2, solution: 8 }),
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

function sameEquation(
  left: LinearEquationParameters,
  right: LinearEquationParameters,
) {
  return formatEquation(left) === formatEquation(right);
}

export function createSeededProblemId(
  seed: number,
  level: EquationLevel = 4,
) {
  assertProblemSeed(seed);
  return `${SEEDED_PROBLEM_ID_PREFIX}-l${level}-${seed}`;
}

function parseSeededProblemReference(
  problemId: string,
): ParsedProblemReference | undefined {
  const current =
    /^linear-equation-v2-l([1-5])-(0|[1-9]\d{0,8})$/.exec(problemId);
  if (current) {
    const level = Number(current[1]);
    const seed = Number(current[2]);
    return isEquationLevel(level) && seed <= MAX_DEMO_PROBLEM_SEED
      ? { level, seed }
      : undefined;
  }

  const legacy = /^linear-equation-v1-(0|[1-9]\d{0,8})$/.exec(problemId);
  if (!legacy) return undefined;
  const seed = Number(legacy[1]);
  return seed <= MAX_DEMO_PROBLEM_SEED ? { level: 4, seed } : undefined;
}

export function parseSeededProblemId(problemId: string) {
  return parseSeededProblemReference(problemId)?.seed;
}

export function parseSeededProblemLevel(problemId: string) {
  return parseSeededProblemReference(problemId)?.level;
}

function createSeededProblemWithId(
  seed: number,
  level: EquationLevel,
  id: string,
) {
  assertProblemSeed(seed);

  // Level 4 deliberately keeps the original v1 seed stream so existing demo
  // links reconstruct the exact same equation after the progression upgrade.
  const next = createSeededRandom(
    level === 4 ? seed : seed + level * 1_000_003,
  );
  const mainEquation = createGeneratedEquation(next, level);
  let transferEquation = createGeneratedEquation(next, level);

  if (sameEquation(mainEquation, transferEquation)) {
    if (level === 4) {
      transferEquation = createDistributionEquation({
        multiplier:
          transferEquation.multiplier === 6
            ? 2
            : transferEquation.multiplier + 1,
        offset: transferEquation.offset,
        solution: transferEquation.solution,
      });
    } else {
      for (let step = 1; step <= 32; step += 1) {
        transferEquation = createGeneratedEquation(next, level);
        if (!sameEquation(mainEquation, transferEquation)) break;
      }
    }
  }

  if (sameEquation(mainEquation, transferEquation)) {
    throw new Error("Could not generate a distinct transfer equation.");
  }

  return createProblem(id, mainEquation, transferEquation);
}

export function createSeededProblem(
  seed: number,
  level: EquationLevel = 4,
): MathProblem {
  return createSeededProblemWithId(
    seed,
    level,
    createSeededProblemId(seed, level),
  );
}

export function nextDistinctProblemSeed(
  seed: number,
  level: EquationLevel = 4,
) {
  assertProblemSeed(seed);
  const currentPrompt = createSeededProblem(seed, level).prompt;

  for (let step = 1; step <= 1024; step += 1) {
    const candidate = (seed + step) % (MAX_DEMO_PROBLEM_SEED + 1);
    if (createSeededProblem(candidate, level).prompt !== currentPrompt) {
      return candidate;
    }
  }

  throw new Error("Could not generate a distinct equation.");
}

export function isDemoProblemId(problemId: string) {
  return (
    Object.hasOwn(DEMO_PROBLEMS_BY_ID, problemId) ||
    parseSeededProblemReference(problemId) !== undefined
  );
}

export function getDemoProblem(problemId: string) {
  const fixedProblem = Object.hasOwn(DEMO_PROBLEMS_BY_ID, problemId)
    ? DEMO_PROBLEMS_BY_ID[problemId as DemoProblemId]
    : undefined;
  if (fixedProblem) return fixedProblem;

  const reference = parseSeededProblemReference(problemId);
  return reference === undefined
    ? undefined
    : createSeededProblemWithId(reference.seed, reference.level, problemId);
}
