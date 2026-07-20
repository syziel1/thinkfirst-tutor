import { describe, expect, it } from "vitest";

import { buildTeacherHandoffSummary } from "./handoff";

describe("teacher handoff preview", () => {
  it("preserves minimum task context and labels diagnosis as a hypothesis", () => {
    const summary = buildTeacherHandoffSummary({
      problemId: "linear-equation-01",
      problemPrompt: "Solve for x: 3(x - 2) = 12",
      stage: "guided_retry",
      currentAttempt: "3x - 2 = 12",
      helpRequest: "human",
      highestHintLevel: 1,
      latestTurn: {
        stage: "guided_retry",
        misconception: "distribution_error",
        diagnosis: "The multiplier was not applied to every term.",
        feedback: "Distribute to both terms.",
        nextPrompt: "What is 3 · (-2)?",
        intervention: "socratic_question",
        hintLevel: 1,
        isCorrect: false,
        revealAnswer: false,
      },
    });

    expect(summary).toContain("Problem ID: linear-equation-01");
    expect(summary).toContain("Current visible attempt: 3x - 2 = 12");
    expect(summary).toContain("Learner request: I want to ask a person");
    expect(summary).toContain("automated diagnosis is a hypothesis");
    expect(summary).toContain("No message is sent automatically");
  });

  it("does not invent emotional or character labels", () => {
    const summary = buildTeacherHandoffSummary({
      problemId: "linear-equation-01",
      problemPrompt: "Solve for x: 3(x - 2) = 12",
      stage: "attempt",
      currentAttempt: "",
      helpRequest: "human",
      highestHintLevel: 0,
    });

    expect(summary.toLowerCase()).not.toMatch(
      /anxious|lazy|careless|unmotivated|trauma|adhd/,
    );
    expect(summary).toContain("No written attempt yet.");
  });
});
