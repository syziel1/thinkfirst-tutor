import { describe, expect, it } from "vitest";

import {
  evaluateHelpRequest,
  inferHelpRequest,
  preserveAssistanceEvidence,
} from "./help-policy";
import { evaluateDemoTurn } from "./policy";

const baseContext = {
  attemptNumber: 1,
  currentStage: "attempt" as const,
  learnerAttempt: "",
  problemId: "linear-equation-01",
};

describe("help-seeking policy", () => {
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
