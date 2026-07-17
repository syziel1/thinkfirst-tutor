import { describe, expect, it } from "vitest";

import { evaluateDemoTurn } from "./policy";

function evaluate(
  learnerAttempt: string,
  attemptNumber = 1,
  currentStage: "attempt" | "guided_retry" | "transfer" = "attempt",
) {
  return evaluateDemoTurn({
    attemptNumber,
    currentStage,
    learnerAttempt,
    problemId: "linear-equation-01",
  });
}

describe("deterministic pedagogical policy", () => {
  it("requires an attempt before giving substantive help", () => {
    const turn = evaluate("?");

    expect(turn.stage).toBe("attempt");
    expect(turn.intervention).toBe("request_attempt");
    expect(turn.revealAnswer).toBe(false);
  });

  it("recognizes stopping one operation too early", () => {
    const turn = evaluate("x = 4");

    expect(turn.misconception).toBe("stopped_too_early");
    expect(turn.hintLevel).toBe(1);
    expect(turn.nextPrompt).toContain("isolates x");
  });

  it("escalates hints without revealing the final answer", () => {
    const second = evaluate("I still think x = 4", 2, "guided_retry");
    const third = evaluate("x = 4", 3, "guided_retry");

    expect(second.intervention).toBe("concept_cue");
    expect(second.hintLevel).toBe(2);
    expect(third.intervention).toBe("worked_micro_step");
    expect(third.hintLevel).toBe(3);
    expect(third.revealAnswer).toBe(false);
  });

  it("moves a correct solution to a transfer problem", () => {
    const turn = evaluate("Divide by 3: x - 2 = 4, so x = 6");

    expect(turn.stage).toBe("transfer");
    expect(turn.intervention).toBe("transfer_check");
  });

  it("completes only after a correct transfer solution", () => {
    const turn = evaluate("x = 4", 1, "transfer");

    expect(turn.stage).toBe("complete");
    expect(turn.isCorrect).toBe(true);
  });
});
