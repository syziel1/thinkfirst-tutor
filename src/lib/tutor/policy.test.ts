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
  const maximumFiniteInteger = BigInt(Number.MAX_VALUE);
  const halfMaximumUlp = BigInt(2) ** BigInt(970);
  const finiteRoundingMidpoint = maximumFiniteInteger + halfMaximumUlp;
  const justBelowFiniteRoundingMidpoint = finiteRoundingMidpoint - BigInt(1);
  const justAboveFiniteRoundingMidpoint = finiteRoundingMidpoint + BigInt(1);
  const roundedFiniteAdditionLeft =
    maximumFiniteInteger - halfMaximumUlp - BigInt(1);
  const roundedFiniteAdditionRight = BigInt(2) * halfMaximumUlp + BigInt(2);
  const exactProductOverflowFactor =
    "1.0000000000000000555111512312578393471332274828504751832588325435348386438505485784844495356082916259765625";

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
    ["arithmetic after a period", "x = 9. + 100"],
    ["arithmetic after a question mark", "x = 9? - 100"],
    ["a number after an exclamation mark", "x = 9! 100"],
    ["word arithmetic after a period", "x = 9. plus 100"],
    ["word arithmetic after a question mark", "x = 9? minus 100"],
    ["a function after an exclamation mark", "x = 9! sin 100"],
    ["scientific notation after a period", "x = 9. e+2"],
    ["arithmetic on a new line", "x = 9\n+ 100"],
    ["arithmetic after a semicolon", "x = 9; / 0"],
    ["arithmetic after punctuation and a newline", "x = 9.\n- 100"],
    ["word arithmetic after an explanation", "x = 9 because plus 100"],
    ["a number on a new line", "x = 9\n100"],
    ["a number after a semicolon", "x = 9; 100"],
    ["a variable expression after a semicolon", "x = 9; x + 100"],
    ["a decimal fragment after a punctuated line", "x = 9.\n.5"],
    ["a variable expression after an explanation", "x = 9 because x + 100"],
    ["a negative value after an explanation", "x = 9 because negative 2"],
    ["an imperative after an explanation", "x = 9 because add 100"],
    ["arithmetic after a transition", "x = 9. then +100"],
    ["arithmetic after safe prose", "x = 9. I checked x + 100"],
    ["a contradictory answer after safe prose", "x = 9. The answer is 100."],
    ["a contradictory result after a connector", "x = 9 because I got 100."],
    ["a contradictory x value on a new line", "x = 9\nx is 100."],
    ["arithmetic after an operation explanation", "x = 9. I subtracted 2. +100"],
    ["arithmetic after a safe acknowledgement", "x = 9. correct. +100"],
    ["arithmetic after simplifying prose", "x = 9. after simplifying +100"],
    ["division by zero in prose", "x = 9. I divided both sides by 0."],
    ["multiplication by zero in prose", "x = 9\nWe multiplied both sides by 0.0."],
    ["negative zero in prose", "x = 9. After dividing both sides by -0.00."],
    ["padded zero in prose", "x = 9. I multiplied both sides by 000.000."],
    ["division by zero before the answer", "After dividing both sides by 0, x = 9"],
    ["colon-delimited division by zero", "Divide by 0: x = 9"],
    ["colon-delimited padded zero", "Divide by 000: x = 9"],
    ["colon-delimited negative zero", "Multiply both sides by -0: x = 9"],
    ["colon-delimited zero after a transition", "After multiplying by 0: x = 9"],
    ["division of each side by zero", "x = 9. I divided each side by 0."],
    ["a contradictory substitution check", "x = 9. I checked it by substituting 100."],
    [
      "a non-finite positive claim",
      `x = 9. The answer is ${"9".repeat(400)}.`,
    ],
    [
      "a non-finite negative claim",
      `x = 9 because I got -${"9".repeat(400)}.`,
    ],
    [
      "a non-finite division operand",
      `x = 9. I divided both sides by ${"9".repeat(400)}.`,
    ],
    [
      "a non-finite subtraction operand",
      `x = 9. I subtracted -${"9".repeat(400)} from both sides.`,
    ],
    [
      "a non-finite operation before the answer",
      `Divide by ${"9".repeat(400)}: x = 9`,
    ],
    ["a non-finite exponent before the answer", "I divided by 1e309, so x = 9"],
    ["a zero exponent before the answer", "I divided by 0e309, so x = 9"],
    ["a negative zero exponent before the answer", "I divided by 0e-309, so x = 9"],
    ["a leading-dot zero before the answer", "I divided by .0, so x = 9"],
    ["a hexadecimal zero before the answer", "I divided by 0x0, so x = 9"],
    ["a binary zero before the answer", "I multiplied by 0b0, so x = 9"],
    ["an octal zero before the answer", "I divided by 0o0, so x = 9"],
    ["a word zero before the answer", "I divided by zero, so x = 9"],
    ["a compact parenthesized zero", "I divided by(0), so x = 9"],
    ["a compact signed zero", "I divided by-0, so x = 9"],
    ["a compact leading-dot zero", "I divided by.0, so x = 9"],
    ["a compact unspaced zero", "I divided by0, so x = 9"],
    ["a compact fullwidth zero", "I divided by０, so x = 9"],
    ["a compact circled zero", "I divided by⓪, so x = 9"],
    ["a compact Arabic-Indic zero", "I divided by٠, so x = 9"],
    ["a compact bracketed zero", "I divided by[0], so x = 9"],
    ["a colon-separated zero", "I divided by: 0, so x = 9"],
    ["a spaced negative zero before the answer", "I divided by - 0, so x = 9"],
    ["a parenthesized zero before the answer", "I divided by (0), so x = 9"],
    ["a parenthesized negative zero", "I divided by (-0), so x = 9"],
    ["a parenthesized decimal zero", "I multiplied both sides by (0.0), so x = 9"],
    ["a parenthesized word zero", "I divided by (zero), so x = 9"],
    ["a zero applied to the equation", "I divided the equation by 0, so x = 9"],
    ["a zero applied to every term", "I divided every term by zero, so x = 9"],
    ["a zero division noun", "I used division by 0, so x = 9"],
    ["a zero multiplication noun", "I used multiplication by 0e9, so x = 9"],
    ["a newline before numeric division", "I divided both sides\nby 0, so x = 9"],
    ["a newline inside numeric division", "I divided\nby zero, so x = 9"],
    ["a newline after a division noun", "I used division\nby 0, so x = 9"],
    ["an arbitrary pronoun before a newline", "I divided it\nby 0, so x = 9"],
    ["an arbitrary noun before a newline", "I divided the expression\nby zero, so x = 9"],
    ["a target after a newline", "I divided\nboth sides by 0, so x = 9"],
    ["a comma before a newline", "I divided both sides,\nby 0, so x = 9"],
    ["a colon before a newline", "I divided both sides:\nby 0, so x = 9"],
    [
      "a noun target before a newline",
      "I used division of the equation\nby 0, so x = 9",
    ],
    ["a demonstrative target before a newline", "I multiplied this\nby 0, so x = 9"],
    ["a semicolon before numeric division", "I divided both sides; by 0, so x = 9"],
    ["a period before numeric division", "I divided both sides. by 0, so x = 9"],
    ["a bracketed zero", "I divided by [0], so x = 9"],
    ["a braced zero", "I divided by {0}, so x = 9"],
    ["a bracketed zero expression", "I divided by [1 - 1], so x = 9"],
    ["a braced zero expression", "I divided by {1 - 1}, so x = 9"],
    ["a nested bracketed zero expression", "I divided by [{2 - 2}], so x = 9"],
    ["a fullwidth bracketed zero expression", "I divided by [１ - １], so x = 9"],
    ["an Arabic-Indic braced zero expression", "I divided by {٢ - ٢}, so x = 9"],
    ["an exactly-zero phrase", "I divided by exactly zero, so x = 9"],
    ["an exactly-zero numeral", "I divided by exactly 0, so x = 9"],
    ["a number-zero phrase", "I divided by the number 0, so x = 9"],
    ["a value-of-zero phrase", "I divided by a value of 0, so x = 9"],
    ["a zero with an article", "I divided by a zero, so x = 9"],
    ["a definite zero", "I divided by the zero, so x = 9"],
    ["a zero-value phrase", "I divided by a zero value, so x = 9"],
    ["a zero factor phrase", "I divided by a factor of zero, so x = 9"],
    ["a numeric zero factor", "I multiplied by a factor of 0, so x = 9"],
    ["an approximate zero phrase", "I divided by approximately zero, so x = 9"],
    ["a relative zero phrase", "I divided by a value which is zero, so x = 9"],
    ["a relative bracketed zero", "I divided by a value which is [0], so x = 9"],
    [
      "a contradictory zero then nonzero claim",
      "I divided by zero because it was non-zero, so x = 9",
    ],
    ["a double-negated nonzero claim", "I divided by not non-zero, so x = 9"],
    ["a comparative zero phrase", "I divided by a number as small as zero, so x = 9"],
    ["a conjunctive zero qualifier", "I divided by exactly and precisely zero, so x = 9"],
    ["a non-positive comparison", "I divided by not greater than zero, so x = 9"],
    ["a wrapped exact zero", "I divided by (exactly 0), so x = 9"],
    ["a wrapped number zero", "I divided by (the number 0), so x = 9"],
    ["a bracketed exact zero", "I divided by [exactly zero], so x = 9"],
    ["a braced value zero", "I divided by {a value of 0}, so x = 9"],
    ["a subtractive zero expression", "I divided by 1 - 1, so x = 9"],
    ["another subtractive zero expression", "I multiplied by 2 - 2, so x = 9"],
    ["division by a zero expression", "I divided by 1 / 0, so x = 9"],
    ["a zero quotient", "I divided by 0 / 1, so x = 9"],
    ["a word-zero quotient", "I divided by zero / 2, so x = 9"],
    ["an exponent-zero quotient", "I divided by 0e-999 / 2, so x = 9"],
    ["division by a parenthesized zero", "I divided by 1 / (0), so x = 9"],
    ["division by a word zero", "I divided by 1 / zero, so x = 9"],
    ["division by a spaced negative zero", "I divided by 1 / - 0, so x = 9"],
    ["a parenthesized zero difference", "I divided by (1) - (1), so x = 9"],
    ["a parenthesized right subtraction", "I divided by 1 - (1), so x = 9"],
    ["a zero chained expression", "I divided by 1 + 1 - 2, so x = 9"],
    ["a caret continuation", "I divided by 1 + 1 ^ 0, so x = 9"],
    ["a superscript exponent", "I divided by 10³⁰⁹, so x = 9"],
    ["a superscript signed exponent", "I divided by 10⁻³⁰⁹, so x = 9"],
    ["a parenthesized superscript exponent", "I divided by 10⁽³⁰⁹⁾, so x = 9"],
    ["a standalone superscript zero", "I divided by ⁰, so x = 9"],
    ["a signed superscript zero", "I divided by ⁻⁰, so x = 9"],
    ["a wrapped superscript zero", "I divided by ⁽⁰⁾, so x = 9"],
    ["an unsupported percent continuation", "I divided by 10%0, so x = 9"],
    ["an unsupported factorial continuation", "I divided by 200!, so x = 9"],
    ["an adjacent numeric identifier", "I divided by 10n, so x = 9"],
    ["a spaced exponent suffix", "I divided by 1 e309, so x = 9"],
    ["a spaced implicit product", "I divided by 2 x 0, so x = 9"],
    ["an ordinal exponent phrase", "I divided by 10 to the 309th power, so x = 9"],
    ["a word exponent phrase", "I divided by 10 to the power of 400, so x = 9"],
    ["a colon quotient", "I divided by 1 : 0, so x = 9"],
    ["a colon zero expression", "I divided by 1 : 2 - 2, so x = 9"],
    ["a colon nil quotient", "I divided by 1 : nil, so x = 9"],
    ["a colon nought quotient", "I divided by 1 : nought, so x = 9"],
    ["a colon superscript-zero quotient", "I divided by 1 : ⁰, so x = 9"],
    ["a qualified colon-zero quotient", "I divided by 1 : approximately zero, so x = 9"],
    ["a per-zero quotient", "I divided by 1 per 0, so x = 9"],
    ["another zero chained expression", "I divided by 2 - 1 - 1, so x = 9"],
    ["a chained division by zero", "I divided by 1 + 1 / 0, so x = 9"],
    ["a Unicode division by zero", "I divided by 1 ÷ 0, so x = 9"],
    ["a Unicode division-slash by zero", "I divided by 1 ∕ 0, so x = 9"],
    ["a fraction-slash division by zero", "I divided by 1 ⁄ 0, so x = 9"],
    ["a fullwidth division by zero", "I divided by 1 ／ 0, so x = 9"],
    ["a middle-dot multiplication by zero", "I divided by 1 · 0, so x = 9"],
    ["a dot-operator multiplication by zero", "I divided by 1 ⋅ 0, so x = 9"],
    ["an asterisk-operator multiplication by zero", "I divided by 1 ∗ 0, so x = 9"],
    ["a fullwidth multiplication by zero", "I divided by 1 ＊ 0, so x = 9"],
    ["a non-finite product expression", "I divided by 1e308 * 2, so x = 9"],
    [
      "a coordinated zero divisor",
      "I divided by 2 and then by 0, so x = 9",
    ],
    ["a directly coordinated zero divisor", "I divided by 2 and by zero, so x = 9"],
    ["a comma-coordinated zero divisor", "I divided by 2, then by 0, so x = 9"],
    ["a semicolon-coordinated zero divisor", "I divided by 2; then by 0, so x = 9"],
    ["a later coordinated zero divisor", "I divided by 2 and later by 0, so x = 9"],
    [
      "an eventually coordinated zero divisor",
      "I divided by 2 and eventually by 0, so x = 9",
    ],
    ["an also-coordinated zero divisor", "I divided by 2 and also by 0, so x = 9"],
    [
      "a doubly modified coordinated zero divisor",
      "I divided by 2 and then also by 0, so x = 9",
    ],
    ["a repeated-step zero divisor", "I divided by 2 then again by 0, so x = 9"],
    ["a punctuated coordinator", "I divided by 2 and then, by 0, so x = 9"],
    ["a comma-only coordinated divisor", "I divided by 2, by 0, so x = 9"],
    ["an as-well-as zero divisor", "I divided by 2 as well as by 0, so x = 9"],
    ["a dash-coordinated zero divisor", "I divided by 2 — then by 0, so x = 9"],
    [
      "a contrasted zero divisor after a negated operation",
      "I did not divide by 2 but instead by 0, so x = 9",
    ],
    [
      "a rather-contrasted zero divisor after a negated operation",
      "I did not divide by 2 but rather by 0, so x = 9",
    ],
    [
      "a multiword coordinated zero divisor",
      "I divided by 2 and after that by 0, so x = 9",
    ],
    [
      "an immediately coordinated zero divisor",
      "I divided by 2 and immediately by 0, so x = 9",
    ],
    [
      "a coordinated coefficient zero",
      "I divided by 2 and then by coefficient zero, so x = 9",
    ],
    [
      "a standalone contrast after negation",
      "I did not divide by 2, only by 0, so x = 9",
    ],
    [
      "an actual contrast after negation",
      "I did not divide by 2, but actually by 0, so x = 9",
    ],
    [
      "a parenthesized coordinated by-clause",
      "I divided by 2 and then (by 0), so x = 9",
    ],
    [
      "a compact parenthesized coordinated divisor",
      "I divided by 2 and then by(0), so x = 9",
    ],
    [
      "a compact bracketed coordinated divisor",
      "I divided by 2 and then by[0], so x = 9",
    ],
    [
      "a compact Unicode coordinated divisor",
      "I divided by 2 and then by０, so x = 9",
    ],
    [
      "a colon-separated coordinated divisor",
      "I divided by 2 and then by: 0, so x = 9",
    ],
    [
      "a coordinated zero divisor after the answer",
      "I divided by 2, so x = 9, and then by 0",
    ],
    [
      "a coordinated zero divisor after an intermediate assignment",
      "I divided by 2; x = 10; then by 0; x = 9",
    ],
    ["a sentence-coordinated zero divisor", "I divided by (2). Then by 0, so x = 9"],
    [
      "a coordinated zero after a named operand",
      "I divided by a non-zero coefficient and then by 0, so x = 9",
    ],
    [
      "a later zero divisor in a coordinated chain",
      "I divided by 2 and then by 3 and then by 0, so x = 9",
    ],
    [
      "an exact overflowing addition hidden by operand rounding",
      `I divided by ${roundedFiniteAdditionLeft} + ${roundedFiniteAdditionRight}, so x = 9`,
    ],
    [
      "an addition at the exact overflow midpoint",
      `I divided by ${maximumFiniteInteger} + ${halfMaximumUlp}, so x = 9`,
    ],
    [
      "an exact overflowing product hidden by operand rounding",
      `I divided by ${maximumFiniteInteger} * ${exactProductOverflowFactor}, so x = 9`,
    ],
    ["a non-finite quotient expression", "I divided by 1e308 / 1e-308, so x = 9"],
    [
      "a quotient beyond the finite rounding boundary",
      "I divided by 1.7976931348623159e-691 / 1e-999, so x = 9",
    ],
    [
      "a quotient at the exact overflow midpoint",
      `I divided by ${finiteRoundingMidpoint}e-1000 / 1e-1000, so x = 9`,
    ],
    [
      "a quotient just above the exact overflow midpoint",
      `I divided by ${justAboveFiniteRoundingMidpoint}e-1000 / 1e-1000, so x = 9`,
    ],
    ["a negative-zero phrase", "I divided by negative zero, so x = 9"],
    ["a plus-zero phrase", "I divided by plus zero, so x = 9"],
    ["a negative numeric zero phrase", "I divided by negative 0, so x = 9"],
    ["a minus numeric zero phrase", "I divided by minus 0, so x = 9"],
    ["a plus decimal zero phrase", "I divided by plus 0.0, so x = 9"],
    ["a positive leading-dot zero", "I divided by positive .0, so x = 9"],
    ["a word-signed parenthesized zero", "I divided by negative (0), so x = 9"],
    ["another word-signed parenthesized zero", "I divided by minus (zero), so x = 9"],
    ["a spaced sign inside parentheses", "I divided by (- 0), so x = 9"],
    ["a spaced plus inside parentheses", "I divided by (+ 0.0), so x = 9"],
    ["a nested spaced sign", "I divided by (( - 0 )), so x = 9"],
    [
      "a non-finite hexadecimal operand",
      `I divided by 0x${"f".repeat(400)}, so x = 9`,
    ],
    ["an Infinity operand before the answer", "I divided by Infinity, so x = 9"],
    ["an infinite operand before the answer", "I divided by infinite, so x = 9"],
    ["a signed infinite operand", "I divided by +infinite, so x = 9"],
    ["an inf operand before the answer", "I divided by inf, so x = 9"],
    ["a signed inf operand before the answer", "I divided by -INF, so x = 9"],
    ["a NaN operand before the answer", "I multiplied by NaN, so x = 9"],
    ["an infinity symbol before the answer", "I divided by ∞, so x = 9"],
    ["an adjacent infinity symbol before the answer", "I divided by ∞x, so x = 9"],
    ["an infinity symbol after a number", "I divided by 2∞, so x = 9"],
    [
      "a later real zero operation after a negated one",
      "I did not divide by zero, then I divided by zero, so x = 9",
    ],
    [
      "a later non-finite operation after a negated one",
      "I did not divide by infinity, but I divided by infinity, so x = 9",
    ],
    [
      "a later zero division after an incomplete negation",
      "I did not divide; then I divided by zero, so x = 9",
    ],
    [
      "a later zero division after an incomplete sentence",
      "I did not divide anything. Then I divided by zero, so x = 9",
    ],
    [
      "a different later zero operation",
      "I did not multiply first, but I divided by zero, so x = 9",
    ],
    [
      "a later infinite division after an incomplete negation",
      "I did not divide, but then divided by infinity, so x = 9",
    ],
    [
      "a later zero operation after while",
      "I did not divide by zero while I multiplied by zero, so x = 9",
    ],
    [
      "a later zero operation after although",
      "I did not divide by zero although I multiplied by zero, so x = 9",
    ],
    [
      "a later zero operation after yet",
      "I did not divide by zero yet I divided by zero, so x = 9",
    ],
    ["a repeated not", "I did not not divide by zero, so x = 9"],
    ["a contracted repeated not", "I didn't not divide by zero, so x = 9"],
    ["a never-not double negation", "I never did not divide by zero, so x = 9"],
    ["a cannot-not double negation", "I cannot not divide by zero, so x = 9"],
    ["a cannot-never double negation", "I cannot never divide by zero, so x = 9"],
    ["a not-cannot double negation", "I did not cannot divide by zero, so x = 9"],
    ["a never-cannot double negation", "I never cannot divide by zero, so x = 9"],
    ["a comma-separated double negation", "I did not, not divide by zero, so x = 9"],
    ["a dash-separated double negation", "I did not — not divide by zero, so x = 9"],
    ["an adverb-separated double negation", "I did not really not divide by zero, so x = 9"],
    [
      "a padded double negation",
      `I did not ${"really ".repeat(30)}not divide by zero, so x = 9`,
    ],
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
    ["a trailing period", "x = 11 - 2."],
    [
      "a sentence after the answer",
      "x = 11 - 2. I subtracted 2 from both sides.",
    ],
    [
      "a sentence on a new line",
      "x = 11 - 2\nI subtracted 2 from both sides.",
    ],
    [
      "a connector explanation",
      "x = 11 - 2 because I subtracted 2 from both sides.",
    ],
    [
      "a bounded isolation explanation",
      "x = 11 - 2. I subtracted 2 from both sides to isolate x.",
    ],
    ["a correctness sentence", "x = 11 - 2. It is correct."],
    [
      "a verification sentence",
      "x = 11 - 2. I verified the result by substitution.",
    ],
    ["a connector correctness claim", "x = 11 - 2 which is correct."],
    ["a connector solution label", "x = 11 - 2 is the solution."],
    [
      "a bounded two-operation explanation",
      "x = 11 - 2. I divided both sides by 6 and subtracted 2.",
    ],
    [
      "an and-then operation explanation",
      "x = 11 - 2. I divided both sides by 6 and then subtracted 2.",
    ],
    [
      "a comma-then operation explanation",
      "x = 11 - 2. I divided both sides by 6, then subtracted 2.",
    ],
    ["an each-side explanation", "x = 11 - 2. I subtracted 2 from each side."],
    ["a bounded numeric explanation", "x = 11 - 2. I subtracted 2 from 11."],
    [
      "a matching substitution value",
      "x = 11 - 2. I checked it by substituting 9.",
    ],
    ["a matching repeated result", "x = 11 - 2. The answer is 9."],
    [
      "a rounded matching repeated result",
      "x = 2.7 / 0.3. The answer is 9.",
    ],
    ["a nonzero decimal operation", "x = 11 - 2. I divided both sides by 0.5."],
    ["a negative nonzero operation", "x = 11 - 2. I multiplied both sides by -0.5."],
    ["a finite exponent before the answer", "I divided by 1e2, so x = 11 - 2"],
    ["a finite negative exponent", "I divided by 1e-2, so x = 11 - 2"],
    ["a finite underflowing exponent", "I divided by 1e-999, so x = 11 - 2"],
    ["a finite hexadecimal operand", "I divided by 0x10, so x = 11 - 2"],
    ["a finite bounded expression", "I divided the equation by 2 - 1, so x = 11 - 2"],
    ["a nonzero expression starting at zero", "I divided by 0 + 1, so x = 11 - 2"],
    ["a compact fullwidth nonzero", "I divided by２, so x = 11 - 2"],
    ["a compact Arabic-Indic nonzero", "I divided by٢, so x = 11 - 2"],
    ["a negative expression starting at zero", "I divided by 0 - 1, so x = 11 - 2"],
    ["a word-zero nonzero expression", "I divided by zero + 2, so x = 11 - 2"],
    ["a hexadecimal nonzero expression", "I divided by 0x0 + 0x1, so x = 11 - 2"],
    ["a finite parenthesized operand", "I divided every term by (2), so x = 11 - 2"],
    ["a finite bracketed expression", "I divided by [2 - 1], so x = 11 - 2"],
    ["a finite braced expression", "I divided by {4 / 2}, so x = 11 - 2"],
    ["a finite fullwidth expression", "I divided by [２ - １], so x = 11 - 2"],
    ["a finite Arabic-Indic expression", "I divided by {٤ / ٢}, so x = 11 - 2"],
    ["a word-number explanation", "I divided both sides by six, so x = 11 - 2"],
    ["a symbolic coefficient explanation", "I divided by the coefficient, so x = 11 - 2"],
    ["a hyphenated nonzero coefficient", "I divided by a non-zero coefficient, so x = 11 - 2"],
    ["a spaced nonzero coefficient", "I divided by a non zero coefficient, so x = 11 - 2"],
    ["a wrapped nonzero coefficient", "I divided by (a non-zero coefficient), so x = 11 - 2"],
    ["a bracketed positive coefficient", "I divided by [a coefficient greater than zero], so x = 11 - 2"],
    ["a braced nonzero number", "I divided by {a number not equal to zero}, so x = 11 - 2"],
    ["a wrapped spaced nonzero", "I divided by (non zero), so x = 11 - 2"],
    ["a positive coefficient phrase", "I divided by a coefficient greater than zero, so x = 11 - 2"],
    ["a relational nonzero phrase", "I divided by not equal to zero, so x = 11 - 2"],
    ["an exclusionary nonzero phrase", "I divided by other than zero, so x = 11 - 2"],
    [
      "a reasoned nonzero coefficient",
      "I divided by the coefficient because it was non-zero, so x = 11 - 2",
    ],
    [
      "a since-qualified nonzero coefficient",
      "I divided by the coefficient since it was non-zero, so x = 11 - 2",
    ],
    [
      "a relative nonzero coefficient",
      "I divided by the coefficient which was non-zero, so x = 11 - 2",
    ],
    [
      "a that-qualified nonzero coefficient",
      "I divided by the coefficient that was non-zero, so x = 11 - 2",
    ],
    [
      "a known nonzero coefficient",
      "I divided by the coefficient known to be non-zero, so x = 11 - 2",
    ],
    ["a nonnumeric method phrase", "I divided the work by hand, so x = 11 - 2"],
    ["a wrapped nonnumeric method phrase", "I divided it\nby hand, so x = 11 - 2"],
    [
      "an unrelated later by-phrase",
      "I divided the equation. I checked by substituting 9, so x = 11 - 2",
    ],
    [
      "an operation-purpose explanation",
      "I divided by 2 to undo multiplication, so x = 11 - 2",
    ],
    [
      "a named division-method explanation",
      "I divided by 2 using long division, so x = 11 - 2",
    ],
    [
      "an operation-cancellation explanation",
      "I divided by 2 to reverse the multiplication, so x = 11 - 2",
    ],
    [
      "a later finite result",
      "I divided by 6 to get 11, then subtracted 2, so x = 11 - 2",
    ],
    [
      "finite coordinated divisors",
      "I divided by 2 and then by 3, so x = 11 - 2",
    ],
    [
      "a punctuated finite coordinated divisor",
      "I divided by 2; next, by 3, so x = 11 - 2",
    ],
    [
      "independent verification prose with zero metadata",
      "I verified it first by arithmetic and then by substitution in step 0, so x = 11 - 2",
    ],
    [
      "independent algebraic verification prose",
      "I checked algebraically by confirming the residual was zero, so x = 11 - 2",
    ],
    [
      "independent verification after a real operation",
      "I divided by 2. I checked algebraically by confirming the residual was zero, so x = 11 - 2",
    ],
    [
      "an unrelated additive by-phrase",
      "I divided by 2 and increased both sides by 0, so x = 11 - 2",
    ],
    [
      "an unrelated labeling by-phrase",
      "I divided by 2 and labeled the operand by 0, so x = 11 - 2",
    ],
    [
      "continued negation with nor",
      "I did not divide by 2, nor by 0, so x = 11 - 2",
    ],
    [
      "continued explicit negation",
      "I did not divide by 2 and certainly not by 0, so x = 11 - 2",
    ],
    [
      "continued contrastive negation",
      "I did not divide by 2, but definitely not by 0, so x = 11 - 2",
    ],
    [
      "independent contrastive verification after a negated operation",
      "I did not divide by 2, but I checked by confirming the residual was zero, so x = 11 - 2",
    ],
    [
      "a numbered step explanation",
      "I divided by 6 in step 1, then subtracted 2, so x = 11 - 2",
    ],
    [
      "a zero-based step explanation",
      "I divided by 2 in step 0, so x = 11 - 2",
    ],
    [
      "a zero-based method explanation",
      "I divided by 2 using method 0, so x = 11 - 2",
    ],
    ["a finite colon quotient", "I divided by 1 : 2, so x = 11 - 2"],
    [
      "an explicitly avoided zero division",
      "I did not divide by zero, so x = 11 - 2",
    ],
    [
      "a contracted avoided zero division",
      "I didn't divide by zero, so x = 11 - 2",
    ],
    [
      "a never-performed zero division",
      "I never divided by zero, so x = 11 - 2",
    ],
    [
      "an impossible zero division",
      "I can't divide by zero, so x = 11 - 2",
    ],
    [
      "two separately negated operations",
      "I did not multiply, but I did not divide by zero, so x = 11 - 2",
    ],
    [
      "a noticed single negation",
      "I noticed that I did not divide by zero, so x = 11 - 2",
    ],
    [
      "a notably safe single negation",
      "Notably, I did not divide by zero, so x = 11 - 2",
    ],
    [
      "an avoided infinite division",
      "I did not divide by infinite, so x = 11 - 2",
    ],
    [
      "an avoided overflow operand",
      "I did not divide by 1e309, so x = 11 - 2",
    ],
    ["an underflowing quotient", "I divided by 1e-999 / 2, so x = 11 - 2"],
    ["an underflowing product", "I divided by 1e-999 * 2, so x = 11 - 2"],
    ["an underflowing sum", "I divided by 1e-999 + 1e-999, so x = 11 - 2"],
    ["an equal underflowing ratio", "I divided by 1e-999 / 1e-999, so x = 11 - 2"],
    [
      "a quotient at the finite Number boundary",
      "I divided by 1.7976931348623157e-691 / 1e-999, so x = 11 - 2",
    ],
    [
      "a quotient that rounds to the finite Number boundary",
      "I divided by 1.7976931348623158e-691 / 1e-999, so x = 11 - 2",
    ],
    [
      "a quotient just below the exact overflow midpoint",
      `I divided by ${justBelowFiniteRoundingMidpoint}e-1000 / 1e-1000, so x = 11 - 2`,
    ],
    [
      "an addition just below the exact overflow midpoint",
      `I divided by ${maximumFiniteInteger} + ${halfMaximumUlp - BigInt(1)}, so x = 11 - 2`,
    ],
    [
      "a negative subtraction just below the exact overflow midpoint",
      `I divided by -${maximumFiniteInteger} - ${halfMaximumUlp - BigInt(1)}, so x = 11 - 2`,
    ],
    [
      "a rounded large-integer difference",
      "I divided by 9007199254740992 - 9007199254740993, so x = 11 - 2",
    ],
    [
      "a long leading-dot fraction before the answer",
      `I divided by .${"9".repeat(400)}, so x = 11 - 2`,
    ],
    ["a rounded decimal quotient", "x = 2.7 / 0.3"],
    ["a Unicode quotient", "x = 18 ÷ 2"],
    ["a middle-dot product", "x = 9 · 1"],
    ["a fullwidth equation and quotient", "x ＝ 18 ／ 2"],
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
