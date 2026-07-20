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
