import { describe, expect, it } from "vitest";

import { evaluateDemoTurn } from "./policy";
import {
  DEMO_PROBLEM,
  DEMO_PROBLEMS,
  createSeededProblem,
  formatExpandedExpression,
  formatInnerExpression,
  formatPartialDistribution,
} from "./problems";
import type {
  InterventionType,
  MisconceptionCode,
  TutorStage,
  TutorTurn,
} from "./types";

interface ReactionScenario {
  name: string;
  learnerAttempt: string;
  problemId?: string;
  attemptNumber?: number;
  currentStage?: TutorStage;
  expected: {
    stage: TutorStage;
    misconception: MisconceptionCode;
    intervention: InterventionType;
    hintLevel: 0 | 1 | 2 | 3;
    isCorrect: boolean;
    nextPromptIncludes?: string;
  };
}

function evaluate({
  learnerAttempt,
  problemId = DEMO_PROBLEM.id,
  attemptNumber = 1,
  currentStage = "attempt",
}: Pick<
  ReactionScenario,
  "learnerAttempt" | "problemId" | "attemptNumber" | "currentStage"
>) {
  return evaluateDemoTurn({
    attemptNumber,
    currentStage,
    learnerAttempt,
    problemId,
  });
}

function expectReaction(turn: TutorTurn, expected: ReactionScenario["expected"]) {
  expect(turn).toMatchObject({
    stage: expected.stage,
    misconception: expected.misconception,
    intervention: expected.intervention,
    hintLevel: expected.hintLevel,
    isCorrect: expected.isCorrect,
    revealAnswer: false,
  });

  if (expected.nextPromptIncludes) {
    expect(turn.nextPrompt.toLowerCase()).toContain(
      expected.nextPromptIncludes.toLowerCase(),
    );
  }
}

const mainProblemScenarios: ReactionScenario[] = [
  {
    name: "punctuation is not a meaningful attempt",
    learnerAttempt: "?",
    expected: {
      stage: "attempt",
      misconception: "no_attempt",
      intervention: "request_attempt",
      hintLevel: 0,
      isCorrect: false,
      nextPromptIncludes: "first step",
    },
  },
  {
    name: "English uncertainty is not a meaningful attempt",
    learnerAttempt: "I don't know",
    expected: {
      stage: "attempt",
      misconception: "no_attempt",
      intervention: "request_attempt",
      hintLevel: 0,
      isCorrect: false,
    },
  },
  {
    name: "Polish uncertainty is not a meaningful attempt",
    learnerAttempt: "nie wiem",
    expected: {
      stage: "attempt",
      misconception: "no_attempt",
      intervention: "request_attempt",
      hintLevel: 0,
      isCorrect: false,
    },
  },
  {
    name: "division by three is recognized as a correct intermediate step",
    learnerAttempt: "x - 2 = 4",
    expected: {
      stage: "guided_retry",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "isolates x",
    },
  },
  {
    name: "unicode minus is normalized in a correct intermediate step",
    learnerAttempt: "x − 2 = 12 / 3",
    expected: {
      stage: "guided_retry",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "correct distribution is recognized as progress",
    learnerAttempt: "3x - 6 = 12",
    expected: {
      stage: "guided_retry",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "inverse operation",
    },
  },
  {
    name: "correct balancing is recognized as progress",
    learnerAttempt: "3x = 18",
    expected: {
      stage: "guided_retry",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "isolates x",
    },
  },
  {
    name: "multi-step work prioritizes the most advanced valid equation",
    learnerAttempt: "3x - 6 = 12\n3x = 18",
    expected: {
      stage: "guided_retry",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "isolates x",
    },
  },
  {
    name: "x equals four is stopped one operation too early",
    learnerAttempt: "x = 4",
    expected: {
      stage: "guided_retry",
      misconception: "stopped_too_early",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "isolates x",
    },
  },
  {
    name: "a bare four is still a substantive attempt",
    learnerAttempt: "4",
    expected: {
      stage: "guided_retry",
      misconception: "stopped_too_early",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "partial distribution is diagnosed",
    learnerAttempt: "3x - 2 = 12",
    expected: {
      stage: "guided_retry",
      misconception: "distribution_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "3 · (-2)",
    },
  },
  {
    name: "a result produced by leaving the constant undistributed is diagnosed",
    problemId: "linear-equation-v1-267",
    learnerAttempt: "3x = 23",
    expected: {
      stage: "guided_retry",
      misconception: "distribution_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "3 · (4)",
    },
  },
  {
    name: "an arithmetic error after a valid expansion is diagnosed",
    learnerAttempt: "3x - 6 = 12; 3x = 6; x = 2",
    expected: {
      stage: "guided_retry",
      misconception: "arithmetic_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "added to both sides",
    },
  },
  {
    name: "a coefficient equation cannot masquerade as x equals six",
    learnerAttempt: "3x = 6",
    expected: {
      stage: "guided_retry",
      misconception: "arithmetic_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "adding before removing the outer multiplier is diagnosed",
    learnerAttempt: "x = 10",
    expected: {
      stage: "guided_retry",
      misconception: "inverse_operation_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "subtracting in the wrong order is diagnosed",
    learnerAttempt: "x = -2",
    expected: {
      stage: "guided_retry",
      misconception: "inverse_operation_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "uninspectable reasoning gets one clarifying question",
    learnerAttempt: "I multiplied both sides somehow",
    expected: {
      stage: "guided_retry",
      misconception: "unclear_reasoning",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "first operation",
    },
  },
  {
    name: "a correct isolated value unlocks transfer",
    learnerAttempt: "x = 6",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "a decimal representation of the correct value unlocks transfer",
    learnerAttempt: "x = 6.0",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "an unsimplified quotient of the correct value unlocks transfer",
    learnerAttempt: "x = 18 / 3",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "an unsimplified sum of the correct value unlocks transfer",
    learnerAttempt: "x = 4 + 2",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "an unsimplified product of the correct value unlocks transfer",
    learnerAttempt: "x = 3 * 2",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "the seeded unsimplified inverse step unlocks transfer",
    problemId: "linear-equation-v1-296",
    learnerAttempt: "x = 11 - 2",
    attemptNumber: 2,
    currentStage: "guided_retry",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "a bare correct value is accepted as an attempt",
    learnerAttempt: "6",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "a correct worked explanation unlocks transfer",
    learnerAttempt: "Divide by 3: x - 2 = 4, then add 2: x = 6",
    expected: {
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "sixty is not mistaken for six",
    learnerAttempt: "x = 60",
    expected: {
      stage: "guided_retry",
      misconception: "unclear_reasoning",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
];

const transferScenarios: ReactionScenario[] = [
  {
    name: "transfer uncertainty still requires an attempt",
    learnerAttempt: "not sure",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "no_attempt",
      intervention: "request_attempt",
      hintLevel: 0,
      isCorrect: false,
    },
  },
  {
    name: "division by four is recognized as transfer progress",
    learnerAttempt: "x + 1 = 5",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      nextPromptIncludes: "isolates x",
    },
  },
  {
    name: "correct transfer distribution is recognized as progress",
    learnerAttempt: "4x + 4 = 20",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "correct transfer balancing is recognized as progress",
    learnerAttempt: "4x = 16",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "correct_intermediate",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "five is stopped one operation too early in transfer",
    learnerAttempt: "x = 5",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "stopped_too_early",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "partial transfer distribution is diagnosed",
    learnerAttempt: "4x + 1 = 20",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "distribution_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "transfer arithmetic errors are diagnosed",
    learnerAttempt: "4x + 4 = 20; 4x = 12; x = 3",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "arithmetic_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "wrong transfer inverse operations are diagnosed",
    learnerAttempt: "x = -4",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "inverse_operation_error",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
  {
    name: "the transfer answer completes the session",
    learnerAttempt: "x = 4",
    currentStage: "transfer",
    expected: {
      stage: "complete",
      misconception: "correct",
      intervention: "celebration",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "a decimal transfer answer completes the session",
    learnerAttempt: "x = 4.0",
    currentStage: "transfer",
    expected: {
      stage: "complete",
      misconception: "correct",
      intervention: "celebration",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "an unsimplified inverse step completes transfer",
    learnerAttempt: "x = 5 - 1",
    currentStage: "transfer",
    expected: {
      stage: "complete",
      misconception: "correct",
      intervention: "celebration",
      hintLevel: 0,
      isCorrect: true,
    },
  },
  {
    name: "forty is not mistaken for four in transfer",
    learnerAttempt: "x = 40",
    currentStage: "transfer",
    expected: {
      stage: "transfer",
      misconception: "unclear_reasoning",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
    },
  },
];

describe("deterministic pedagogical reaction matrix", () => {
  it.each(mainProblemScenarios)("main problem: $name", (scenario) => {
    expectReaction(evaluate(scenario), scenario.expected);
  });

  it.each(transferScenarios)("transfer: $name", (scenario) => {
    expectReaction(evaluate(scenario), scenario.expected);
  });

  it.each([
    ["correct intermediate", "x - 2 = 4"],
    ["stopped too early", "x = 4"],
    ["distribution error", "3x - 2 = 12"],
    ["arithmetic error", "3x = 6"],
    ["inverse-operation error", "x = 10"],
    ["unclear reasoning", "I changed the equation"],
  ])("escalates %s gradually", (_, learnerAttempt) => {
    const first = evaluate({ learnerAttempt, attemptNumber: 1 });
    const second = evaluate({
      learnerAttempt,
      attemptNumber: 2,
      currentStage: "guided_retry",
    });
    const third = evaluate({
      learnerAttempt,
      attemptNumber: 3,
      currentStage: "guided_retry",
    });

    expect(first).toMatchObject({
      intervention: "socratic_question",
      hintLevel: 1,
    });
    expect(second).toMatchObject({ intervention: "concept_cue", hintLevel: 2 });
    expect(third).toMatchObject({
      intervention: "worked_micro_step",
      hintLevel: 3,
    });
  });

  it.each([
    ["correct transfer intermediate", "x + 1 = 5"],
    ["stopped transfer step", "x = 5"],
    ["transfer distribution error", "4x + 1 = 20"],
    ["transfer arithmetic error", "4x = 12"],
    ["unclear transfer reasoning", "I changed both sides"],
  ])("escalates %s gradually", (_, learnerAttempt) => {
    for (const attemptNumber of [1, 2, 3] as const) {
      const turn = evaluate({
        learnerAttempt,
        attemptNumber,
        currentStage: "transfer",
      });

      expect(turn.hintLevel).toBe(attemptNumber);
      expect(turn.intervention).toBe(
        attemptNumber === 1
          ? "socratic_question"
          : attemptNumber === 2
            ? "concept_cue"
            : "worked_micro_step",
      );
    }
  });

  it.each([...mainProblemScenarios, ...transferScenarios])(
    "never reveals a protected final answer: $name",
    (scenario) => {
      const turn = evaluate(scenario);
      const visibleTutorText = [
        turn.diagnosis,
        turn.feedback,
        turn.nextPrompt,
      ].join(" ");
      const protectedAnswer =
        scenario.currentStage === "transfer" ? /x\s*=\s*4\b/i : /x\s*=\s*6\b/i;

      expect(turn.revealAnswer).toBe(false);
      if (!turn.isCorrect) {
        expect(visibleTutorText).not.toMatch(protectedAnswer);
      }
    },
  );
});

describe("bounded numeric expression parsing", () => {
  it.each([
    ["a chained expression", "x = 11 - 2 + 100"],
    ["division by zero", "x = 9 / 0"],
    ["a valid expression with the wrong result", "x = 11 - 3"],
  ])("does not accept %s as the seeded solution", (_, learnerAttempt) => {
    const turn = evaluate({
      problemId: "linear-equation-v1-296",
      learnerAttempt,
      attemptNumber: 2,
      currentStage: "guided_retry",
    });

    expect(turn).toMatchObject({
      stage: "guided_retry",
      isCorrect: false,
      revealAnswer: false,
    });
  });

  it.each([
    ["a variable suffix", "x = 11 - 2x"],
    ["implicit multiplication", "x = 9x"],
    ["an unsupported exponent", "x = 11 - 2^2"],
    ["a negated left side", "-x = 9"],
    ["a compound left side", "3 - x = 9"],
    ["a word-negated left side", "minus x = 9"],
    ["a comma-suffixed word-negated left side", "minus, x = 9"],
    ["a colon-suffixed word-negated left side", "minus: x = 9"],
    ["a word-added left side", "plus x = 9"],
    ["a negative-word left side", "negative x = 9"],
    ["a named-function left side", "sin x = 9"],
    ["a colon-suffixed named-function left side", "sin: x = 9"],
    ["a malformed operator label", "2 *: x = 9"],
    ["a numeric sentence-like prefix", "2. x = 9"],
    ["a function-like exclamation prefix", "sin! x = 9"],
    ["a later contradictory assignment", "x = 9 because x = 10"],
    ["a later contradictory conjunction", "x = 9 and x = 10"],
    ["a later variable assignment", "x = 9 because x = y"],
    ["a later incomplete assignment", "x = 9; x ="],
    ["a later question assignment", "x = 9\nx = ?"],
    ["a later function assignment", "x = 9 because x = sin 10"],
    ["a later grouped expression", "x = 9; x = (11 - 2)"],
    ["an operator after an explanation connector", "x = 9 because+100"],
    ["a spaced operator after an explanation connector", "x = 9 because +100"],
    ["another named-function left side", "cos x = 9"],
    ["a symbolic word-prefix left side", "f x = 9"],
    ["a repeated-variable left side", "x x = 9"],
    ["an explanation before a word operator", "I think minus x = 9"],
    ["a label before a word operator", "answer: minus x = 9"],
    ["a word-multiplied left side", "double x = 9"],
    ["a malformed subtraction explanation", "After subtracting - x = 9"],
    ["a function in a subtraction explanation", "After subtracting sin x = 9"],
    ["an operator in a multiplication explanation", "After multiplying * x = 9"],
    ["a grouped implicit product", "2(x = 9)"],
    ["a spaced grouped implicit product", "2 (x = 9)"],
    ["an explicit grouped product", "2 * (x = 9)"],
    ["a negated grouped assignment", "-(x = 9)"],
    ["a function-like assignment", "f(x = 9)"],
    ["a spaced function-like assignment", "f (x = 9)"],
    ["a spaced named function assignment", "sin (x = 9)"],
    ["a spaced variable product", "x (x = 9)"],
    ["a word-negated grouped assignment", "minus (x = 9)"],
    ["a function-like grouped assignment", "sin (x = 9)"],
    ["a colon-suffixed grouped function", "sin: (x = 9)"],
    ["an adjacent answer wrapper", "answer(x = 9)"],
    ["an adjacent result wrapper", "result(x = 9)"],
    ["an adjacent solution wrapper", "solution(x = 9)"],
    ["an adjacent prose wrapper", "I think(x = 9)"],
    ["a numeric sentence-like wrapper", "2. (x = 9)"],
    ["an operation after a grouped assignment", "(x = 9) + 1"],
    ["an unmatched opening wrapper", "(x = 9"],
    ["an unmatched closing wrapper", "x = 9)"],
    ["an unmatched closing bracket", "x = 9]"],
    ["an extra closing wrapper", "((x = 9)))"],
    ["a mismatched wrapper", "(x = 9]"],
    ["an unsupported percent suffix", "x = 9%"],
    ["scientific notation", "x = 9e0"],
  ])("rejects %s instead of accepting a numeric prefix", (_, learnerAttempt) => {
    const turn = evaluate({
      problemId: "linear-equation-v1-296",
      learnerAttempt,
      attemptNumber: 2,
      currentStage: "guided_retry",
    });

    expect(turn).toMatchObject({
      stage: "guided_retry",
      isCorrect: false,
      revealAnswer: false,
    });
  });

  it.each([
    ["newline-separated work", "x + 2 = 11\nx = 11 - 2"],
    ["semicolon-separated work", "x + 2 = 11; x = 11 - 2"],
    ["a parenthesized answer", "(x = 11 - 2)"],
    ["a labeled parenthesized answer", "answer: (x = 11 - 2)"],
    ["a nested parenthesized answer", "(( x = 11 - 2 ))"],
    ["a prose-prefixed parenthesized answer", "I think (x = 11 - 2)"],
    ["an answer label", "answer is x = 11 - 2"],
    ["a colon answer label", "answer: x = 11 - 2"],
    ["an explanatory connector", "I divided both sides, so x = 11 - 2"],
    ["a found-value explanation", "I found x = 11 - 2"],
    ["a meaning explanation", "This means x = 11 - 2"],
    [
      "an operation explanation",
      "After subtracting 2 from both sides, x = 11 - 2",
    ],
    ["a word prefix on a prior line", "minus\nx = 11 - 2"],
    ["a word prefix in a prior statement", "minus; x = 11 - 2"],
    ["a corrected final assignment", "x = 10; x = 11 - 2"],
    ["a rounded decimal quotient", "x = 2.7 / 0.3"],
    [
      "a plain-language explanation",
      "I think x = 11 - 2 because I subtracted 2 from both sides.",
    ],
  ])("accepts %s when the final isolated expression is valid", (_, learnerAttempt) => {
    const turn = evaluate({
      problemId: "linear-equation-v1-296",
      learnerAttempt,
      attemptNumber: 2,
      currentStage: "guided_retry",
    });

    expect(turn).toMatchObject({
      stage: "transfer",
      misconception: "correct",
      intervention: "transfer_check",
      isCorrect: true,
      revealAnswer: false,
    });
  });

  it("does not accept a merely close decimal value", () => {
    const turn = evaluate({
      problemId: "linear-equation-v1-296",
      learnerAttempt: "x = 9.000000001",
      attemptNumber: 2,
      currentStage: "guided_retry",
    });

    expect(turn).toMatchObject({
      stage: "guided_retry",
      isCorrect: false,
      revealAnswer: false,
    });
  });
});

const reactionProblems = [
  ...DEMO_PROBLEMS,
  createSeededProblem(0),
  createSeededProblem(42),
  createSeededProblem(908_172_635),
];

describe.each(reactionProblems)(
  "parameterized reaction engine: $id",
  (problem) => {
    const main = problem.equation;
    const transfer = problem.transferProblem.equation;

    function evaluateProblem(
      learnerAttempt: string,
      currentStage: TutorStage = "attempt",
      attemptNumber = 1,
    ) {
      return evaluate({
        learnerAttempt,
        currentStage,
        attemptNumber,
        problemId: problem.id,
      });
    }

    it("recognizes every valid main-problem intermediate form", () => {
      const innerValue = main.solution + main.offset;
      const balancedRightSide = main.multiplier * main.solution;
      const attempts = [
        `${formatInnerExpression(main)} = ${innerValue}`,
        `${formatExpandedExpression(main)} = ${main.rightSide}`,
        `${main.multiplier}x = ${balancedRightSide}`,
      ];

      for (const learnerAttempt of attempts) {
        expect(evaluateProblem(learnerAttempt)).toMatchObject({
          stage: "guided_retry",
          misconception: "correct_intermediate",
          intervention: "socratic_question",
          hintLevel: 1,
          isCorrect: false,
          revealAnswer: false,
        });
      }
    });

    it("distinguishes common main-problem errors from valid progress", () => {
      const innerValue = main.solution + main.offset;
      const balancedRightSide = main.multiplier * main.solution;

      expect(evaluateProblem(`x = ${innerValue}`)).toMatchObject({
        misconception: "stopped_too_early",
        isCorrect: false,
      });
      expect(
        evaluateProblem(
          `${formatPartialDistribution(main)} = ${main.rightSide}`,
        ),
      ).toMatchObject({ misconception: "distribution_error", isCorrect: false });
      expect(
        evaluateProblem(`${main.multiplier}x = ${balancedRightSide - 1}`),
      ).toMatchObject({ misconception: "arithmetic_error", isCorrect: false });
    });

    it("unlocks the problem-specific transfer task only for the main solution", () => {
      const turn = evaluateProblem(`x = ${main.solution}`);

      expect(turn).toMatchObject({
        stage: "transfer",
        misconception: "correct",
        intervention: "transfer_check",
        isCorrect: true,
      });
      expect(turn.nextPrompt).toBe(problem.transferProblem.prompt);
    });

    it("recognizes every valid transfer intermediate form", () => {
      const innerValue = transfer.solution + transfer.offset;
      const balancedRightSide = transfer.multiplier * transfer.solution;
      const attempts = [
        `${formatInnerExpression(transfer)} = ${innerValue}`,
        `${formatExpandedExpression(transfer)} = ${transfer.rightSide}`,
        `${transfer.multiplier}x = ${balancedRightSide}`,
      ];

      for (const learnerAttempt of attempts) {
        expect(evaluateProblem(learnerAttempt, "transfer")).toMatchObject({
          stage: "transfer",
          misconception: "correct_intermediate",
          intervention: "socratic_question",
          hintLevel: 1,
          isCorrect: false,
          revealAnswer: false,
        });
      }
    });

    it("distinguishes common transfer errors from valid progress", () => {
      const innerValue = transfer.solution + transfer.offset;
      const balancedRightSide = transfer.multiplier * transfer.solution;

      expect(
        evaluateProblem(`x = ${innerValue}`, "transfer"),
      ).toMatchObject({ misconception: "stopped_too_early", isCorrect: false });
      expect(
        evaluateProblem(
          `${formatPartialDistribution(transfer)} = ${transfer.rightSide}`,
          "transfer",
        ),
      ).toMatchObject({ misconception: "distribution_error", isCorrect: false });
      expect(
        evaluateProblem(
          `${transfer.multiplier}x = ${balancedRightSide - 1}`,
          "transfer",
        ),
      ).toMatchObject({ misconception: "arithmetic_error", isCorrect: false });
    });

    it("completes only for the problem-specific transfer solution", () => {
      const turn = evaluateProblem(`x = ${transfer.solution}`, "transfer");

      expect(turn).toMatchObject({
        stage: "complete",
        misconception: "correct",
        intervention: "celebration",
        hintLevel: 0,
        isCorrect: true,
        revealAnswer: false,
      });
    });

    it("keeps all generated hint levels bounded and answer-safe", () => {
      const learnerAttempt = `${formatPartialDistribution(main)} = ${main.rightSide}`;
      const protectedAnswer = new RegExp(
        `x\\s*=\\s*${main.solution}(?:\\.0+)?\\b`,
        "i",
      );

      for (const attemptNumber of [1, 2, 3] as const) {
        const turn = evaluateProblem(
          learnerAttempt,
          attemptNumber === 1 ? "attempt" : "guided_retry",
          attemptNumber,
        );
        const visibleTutorText = [
          turn.diagnosis,
          turn.feedback,
          turn.nextPrompt,
        ].join(" ");

        expect(turn.hintLevel).toBe(attemptNumber);
        expect(turn.revealAnswer).toBe(false);
        expect(visibleTutorText).not.toMatch(protectedAnswer);
      }
    });
  },
);
