import { describe, expect, it } from "vitest";

import {
  isAllowedLiveTutorTurn,
  canRequestTutorTurn,
  isAllowedTutorStageTransition,
} from "./stage-transition";
import type { TutorTurn } from "./types";

function turn(
  stage: TutorTurn["stage"],
  overrides: Partial<TutorTurn> = {},
): TutorTurn {
  const successful =
    stage === "transfer" || stage === "complete" || stage === "assisted_complete";

  return {
    stage,
    misconception: successful ? "correct" : "correct_intermediate",
    diagnosis: "Diagnosis",
    feedback: "Feedback",
    nextPrompt: "Next prompt",
    intervention:
      stage === "complete"
        ? "celebration"
        : successful
          ? "transfer_check"
          : "socratic_question",
    hintLevel: successful ? 0 : 1,
    isCorrect: successful,
    revealAnswer: false,
    ...overrides,
  };
}

describe("tutor stage transitions", () => {
  const independentWork = {
    hasVisibleWork: true,
    stageAssistanceUsed: false,
  };
  const assistedWork = {
    hasVisibleWork: true,
    stageAssistanceUsed: true,
  };

  it("keeps main work in main stages or moves it to transfer", () => {
    expect(
      isAllowedTutorStageTransition(
        "attempt",
        "guided_retry",
        independentWork,
      ),
    ).toBe(true);
    expect(
      isAllowedTutorStageTransition(
        "guided_retry",
        "diagnosis",
        independentWork,
      ),
    ).toBe(true);
    expect(
      isAllowedTutorStageTransition("diagnosis", "transfer", independentWork),
    ).toBe(true);
    expect(
      isAllowedTutorStageTransition("attempt", "complete", independentWork),
    ).toBe(false);
    expect(
      isAllowedTutorStageTransition(
        "guided_retry",
        "assisted_complete",
        assistedWork,
      ),
    ).toBe(false);
  });

  it("never lets transfer move back to main work", () => {
    expect(
      isAllowedTutorStageTransition("transfer", "transfer", independentWork),
    ).toBe(true);
    expect(
      isAllowedTutorStageTransition("transfer", "complete", independentWork),
    ).toBe(true);
    expect(
      isAllowedTutorStageTransition(
        "transfer",
        "assisted_complete",
        assistedWork,
      ),
    ).toBe(true);
    expect(
      isAllowedTutorStageTransition(
        "transfer",
        "guided_retry",
        independentWork,
      ),
    ).toBe(false);
    expect(
      isAllowedTutorStageTransition("transfer", "attempt", independentWork),
    ).toBe(false);
  });

  it("requires visible work and matching assistance evidence to advance", () => {
    expect(
      isAllowedTutorStageTransition("attempt", "transfer", {
        hasVisibleWork: false,
        stageAssistanceUsed: false,
      }),
    ).toBe(false);
    expect(
      isAllowedTutorStageTransition("transfer", "complete", assistedWork),
    ).toBe(false);
    expect(
      isAllowedTutorStageTransition(
        "transfer",
        "assisted_complete",
        independentWork,
      ),
    ).toBe(false);
  });

  it("rejects requests after either terminal outcome", () => {
    expect(canRequestTutorTurn("complete")).toBe(false);
    expect(canRequestTutorTurn("assisted_complete")).toBe(false);
    expect(
      isAllowedTutorStageTransition("complete", "complete", independentWork),
    ).toBe(false);
    expect(
      isAllowedTutorStageTransition(
        "assisted_complete",
        "transfer",
        assistedWork,
      ),
    ).toBe(false);
  });
});

describe("live tutor advancement gate", () => {
  const independentEvidence = {
    hasVisibleWork: true,
    stageAssistanceUsed: false,
  };

  it("accepts ordinary non-advancing live guidance without confirmation", () => {
    expect(
      isAllowedLiveTutorTurn({
        currentStage: "attempt",
        liveTurn: turn("guided_retry"),
        deterministicTurn: undefined,
        ...independentEvidence,
      }),
    ).toBe(true);
  });

  it("rejects a coherent-looking main advancement not confirmed deterministically", () => {
    expect(
      isAllowedLiveTutorTurn({
        currentStage: "attempt",
        liveTurn: turn("transfer"),
        deterministicTurn: turn("guided_retry"),
        ...independentEvidence,
      }),
    ).toBe(false);
  });

  it("rejects a coherent-looking terminal advancement not confirmed deterministically", () => {
    expect(
      isAllowedLiveTutorTurn({
        currentStage: "transfer",
        liveTurn: turn("complete"),
        deterministicTurn: turn("transfer", {
          isCorrect: false,
          misconception: "correct_intermediate",
          intervention: "socratic_question",
          hintLevel: 1,
        }),
        ...independentEvidence,
      }),
    ).toBe(false);
  });

  it("accepts a coherent boundary confirmed by the deterministic outcome", () => {
    expect(
      isAllowedLiveTutorTurn({
        currentStage: "attempt",
        liveTurn: turn("transfer"),
        deterministicTurn: turn("transfer"),
        ...independentEvidence,
      }),
    ).toBe(true);
  });

  it("requires correctness fields and boundary intervention to agree", () => {
    for (const liveTurn of [
      turn("transfer", { isCorrect: false }),
      turn("transfer", { misconception: "correct_intermediate" }),
      turn("transfer", { hintLevel: 1 }),
      turn("transfer", { intervention: "celebration" }),
    ]) {
      expect(
        isAllowedLiveTutorTurn({
          currentStage: "attempt",
          liveTurn,
          deterministicTurn: turn("transfer"),
          ...independentEvidence,
        }),
      ).toBe(false);
    }
  });

  it("requires the preserved assisted outcome to match", () => {
    expect(
      isAllowedLiveTutorTurn({
        currentStage: "transfer",
        liveTurn: turn("assisted_complete"),
        deterministicTurn: turn("assisted_complete"),
        hasVisibleWork: true,
        stageAssistanceUsed: true,
      }),
    ).toBe(true);
    expect(
      isAllowedLiveTutorTurn({
        currentStage: "transfer",
        liveTurn: turn("assisted_complete"),
        deterministicTurn: turn("complete"),
        hasVisibleWork: true,
        stageAssistanceUsed: true,
      }),
    ).toBe(false);
  });
});
