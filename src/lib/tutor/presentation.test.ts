import { describe, expect, it } from "vitest";

import type { TutorTurn } from "./types";
import {
  GUIDANCE_REVEAL_ORDER,
  HELP_REVEAL_DELAY_MS,
  changedEquationParts,
  guidanceRevealDelayMs,
  problemUpdateAnnouncement,
  tutorSourceLabel,
  tutorUpdateAnnouncement,
} from "./presentation";

const tutorTurn: TutorTurn = {
  stage: "diagnosis",
  misconception: "arithmetic_error",
  diagnosis: "The distributed constant changed value.",
  feedback: "Keep both sides balanced.",
  nextPrompt: "What would you add to both sides?",
  intervention: "socratic_question",
  hintLevel: 1,
  isCorrect: false,
  revealAnswer: false,
};

describe("presentation transitions", () => {
  it("orders guidance from the learner turn through evidence", () => {
    expect(GUIDANCE_REVEAL_ORDER).toEqual([
      "learner",
      "diagnosis",
      "feedback",
      "nextPrompt",
      "evidence",
    ]);

    const delays = GUIDANCE_REVEAL_ORDER.map(guidanceRevealDelayMs);
    expect(delays).toEqual([0, 100, 260, 420, 560]);
    expect(delays).toEqual([...delays].sort((left, right) => left - right));
    expect(HELP_REVEAL_DELAY_MS).toBe(8_000);
  });

  it("marks only visible equation parameters that changed", () => {
    expect(
      changedEquationParts(
        { multiplier: 4, offset: -2, rightSide: 24, solution: 8 },
        { multiplier: 4, offset: 3, rightSide: 44, solution: 8 },
      ),
    ).toEqual(["offset", "rightSide"]);

    expect(
      changedEquationParts(
        { multiplier: 4, offset: -2, rightSide: 24, solution: 8 },
        { multiplier: 4, offset: -2, rightSide: 24, solution: 10 },
      ),
    ).toEqual([]);
  });

  it("builds one coherent live-region update in reading order", () => {
    const announcement = tutorUpdateAnnouncement(tutorTurn);

    expect(announcement.indexOf("Diagnosis:")).toBeLessThan(
      announcement.indexOf("Feedback:"),
    );
    expect(announcement.indexOf("Feedback:")).toBeLessThan(
      announcement.indexOf("Smallest next step:"),
    );
    expect(problemUpdateAnnouncement("Solve for x: 2(x + 1) = 8")).toBe(
      "New problem loaded. Solve for x: 2(x + 1) = 8",
    );
  });

  it("names every actual tutor response source distinctly", () => {
    expect(tutorSourceLabel("openai", "gpt-5.6")).toBe(
      "Answered by GPT-5.6",
    );
    expect(tutorSourceLabel("deterministic-safeguard", null)).toBe(
      "Safeguard used",
    );
    expect(tutorSourceLabel("deterministic-demo", null)).toBe(
      "Demo safeguard used",
    );
    expect(tutorSourceLabel("deterministic-fallback", null)).toBe(
      "GPT unavailable · safeguard used",
    );
  });
});
