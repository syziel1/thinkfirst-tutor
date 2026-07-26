import { describe, expect, it } from "vitest";

import {
  canEvaluateVisibleWork,
  evaluateHelpRequest,
  inferHelpRequest,
  preserveAssistanceEvidence,
} from "./help-policy";
import { evaluateDemoTurn } from "./policy";
import { createSeededProblem } from "./problems";

const baseContext = {
  attemptNumber: 1,
  currentStage: "attempt" as const,
  learnerAttempt: "",
  problemId: "linear-equation-01",
};

describe("help-seeking policy", () => {
  it("identifies when the server actually evaluates visible learner work", () => {
    expect(canEvaluateVisibleWork("3x - 6 = 12", null)).toBe(true);
    expect(canEvaluateVisibleWork("3x - 6 = 12", "check_last_step")).toBe(
      true,
    );
    expect(canEvaluateVisibleWork("3x - 6 = 12", "small_hint")).toBe(true);
    expect(canEvaluateVisibleWork("3x - 6 = 12", "stuck")).toBe(false);
    expect(canEvaluateVisibleWork("help", "stuck")).toBe(false);
    expect(canEvaluateVisibleWork("", null)).toBe(false);
  });

  it("recognizes short typed help signals", () => {
    expect(inferHelpRequest("help me")).toBe("stuck");
    expect(inferHelpRequest("nie wiem jak zacząć")).toBe("dont_know_start");
    expect(inferHelpRequest("3x - 6 = 12")).toBeNull();
  });

  it("accepts stuck as a valid entry state without diagnosing emotion", () => {
    const turn = evaluateHelpRequest({
      ...baseContext,
      helpRequest: "stuck",
    });

    expect(turn).toMatchObject({
      stage: "guided_retry",
      intervention: "orientation_prompt",
      hintLevel: 0,
      isCorrect: false,
      revealAnswer: false,
    });
    expect(turn.nextPrompt.toLowerCase()).toContain("goal");
    expect(`${turn.diagnosis} ${turn.feedback}`.toLowerCase()).not.toMatch(
      /anxious|lazy|careless|unmotivated/,
    );
  });

  it("does not block an explicit request for a person", () => {
    const turn = evaluateHelpRequest({
      ...baseContext,
      learnerAttempt: "3x - 2 = 12",
      helpRequest: "human",
    });

    expect(turn).toMatchObject({
      intervention: "human_handoff",
      hintLevel: 0,
      isCorrect: false,
      revealAnswer: false,
    });
    expect(turn.nextPrompt).toContain("Nothing is sent automatically");
  });

  it("gives only a level-one orientation hint when no attempt exists", () => {
    const turn = evaluateHelpRequest({
      ...baseContext,
      helpRequest: "small_hint",
    });

    expect(turn).toMatchObject({
      intervention: "socratic_question",
      hintLevel: 1,
      revealAnswer: false,
    });
    expect(`${turn.feedback} ${turn.nextPrompt}`).not.toContain("x = 6");
  });

  it.each([1, 2, 3, 4, 5] as const)(
    "keeps a no-attempt help request form-aware and answer-safe at level %i",
    (level) => {
      const problem = createSeededProblem(42, level);
      const turn = evaluateHelpRequest({
        ...baseContext,
        problemId: problem.id,
        helpRequest: "dont_know_start",
      });
      const visibleText = `${turn.feedback} ${turn.nextPrompt}`;

      expect(turn).toMatchObject({
        intervention: "socratic_question",
        hintLevel: 1,
        isCorrect: false,
        revealAnswer: false,
      });
      expect(visibleText).not.toContain(
        `x = ${problem.equation.solution}`,
      );
    },
  );

  it("keeps independent transfer distinct from assisted transfer", () => {
    const independent = evaluateDemoTurn({
      attemptNumber: 1,
      currentStage: "transfer",
      learnerAttempt: "x = 4",
      problemId: "linear-equation-01",
    });

    expect(independent.stage).toBe("complete");

    const assisted = preserveAssistanceEvidence(independent, {
      currentStage: "transfer",
      stageAssistanceUsed: true,
    });

    expect(assisted.stage).toBe("assisted_complete");
    expect(assisted.feedback.toLowerCase()).toContain("assisted evidence");
    expect(assisted.nextPrompt.toLowerCase()).toContain("fresh problem");
  });
});
