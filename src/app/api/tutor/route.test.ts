import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "./route";

const transferRequest = {
  problemId: "linear-equation-01",
  attemptNumber: 1,
  currentStage: "transfer",
  stageAssistanceUsed: false,
  useLiveModel: false,
};

async function postTutor(payload: Record<string, unknown>) {
  const response = await POST(
    new NextRequest("http://localhost/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );

  expect(response.status).toBe(200);
  return response.json();
}

describe("POST /api/tutor assistance evidence", () => {
  it("counts the current explicit help request before completing transfer", async () => {
    const result = await postTutor({
      ...transferRequest,
      learnerAttempt: "x = 4",
      helpRequest: "check_last_step",
    });

    expect(result).toMatchObject({
      source: "deterministic-safeguard",
      helpRequest: "check_last_step",
      stageAssistanceUsed: true,
      turn: { stage: "assisted_complete" },
    });
  });

  it("returns inferred help as assistance that persists to the next attempt", async () => {
    const helpResult = await postTutor({
      ...transferRequest,
      learnerAttempt: "help",
    });

    expect(helpResult).toMatchObject({
      source: "deterministic-safeguard",
      helpRequest: "stuck",
      stageAssistanceUsed: true,
      turn: { stage: "transfer", hintLevel: 0 },
    });

    const completionResult = await postTutor({
      ...transferRequest,
      learnerAttempt: "x = 4",
      stageAssistanceUsed: helpResult.stageAssistanceUsed,
    });

    expect(completionResult.turn.stage).toBe("assisted_complete");
  });
});

describe("POST /api/tutor bounded numeric expressions", () => {
  const seededRequest = {
    problemId: "linear-equation-v1-296",
    stageAssistanceUsed: false,
    useLiveModel: false,
  };

  it("continues from a valid intermediate equation to an unsimplified inverse step", async () => {
    const intermediate = await postTutor({
      ...seededRequest,
      learnerAttempt: "x + 2 = 11",
      attemptNumber: 1,
      currentStage: "attempt",
    });

    expect(intermediate).toMatchObject({
      source: "deterministic-demo",
      turn: {
        stage: "guided_retry",
        misconception: "correct_intermediate",
        isCorrect: false,
        nextPrompt: "Which inverse operation now isolates x?",
      },
    });

    const solution = await postTutor({
      ...seededRequest,
      learnerAttempt: "x = 11 - 2",
      attemptNumber: 2,
      currentStage: intermediate.turn.stage,
    });

    expect(solution).toMatchObject({
      source: "deterministic-demo",
      turn: {
        stage: "transfer",
        misconception: "correct",
        intervention: "transfer_check",
        isCorrect: true,
      },
    });
  });

  it.each([
    ["a chained expression", "x = 11 - 2 + 100"],
    ["division by zero", "x = 9 / 0"],
    ["the wrong result", "x = 11 - 3"],
    ["a variable suffix", "x = 11 - 2x"],
    ["implicit multiplication", "x = 9x"],
    ["an unsupported exponent", "x = 11 - 2^2"],
    ["a negated left side", "-x = 9"],
    ["a compound left side", "3 - x = 9"],
    ["a word-negated left side", "minus x = 9"],
    ["a colon-suffixed word operator", "minus: x = 9"],
    ["a named-function left side", "sin x = 9"],
    ["a prose-prefixed word operator", "I think minus x = 9"],
    ["a malformed prose operation", "After subtracting sin x = 9"],
    ["a numeric sentence-like prefix", "2. x = 9"],
    ["a later contradictory assignment", "x = 9 because x = 10"],
    ["a later variable assignment", "x = 9 because x = y"],
    ["a later incomplete assignment", "x = 9; x ="],
    ["an operator after an explanation connector", "x = 9 because+100"],
    ["arithmetic after a period", "x = 9. + 100"],
    ["word arithmetic after a period", "x = 9. plus 100"],
    ["arithmetic on a new line", "x = 9\n+ 100"],
    ["arithmetic after a semicolon", "x = 9; / 0"],
    ["a number on a new line", "x = 9\n100"],
    ["a variable expression after a semicolon", "x = 9; x + 100"],
    ["a variable expression after an explanation", "x = 9 because x + 100"],
    ["arithmetic after safe prose", "x = 9. I checked x + 100"],
    ["a contradictory later answer", "x = 9. The answer is 100."],
    ["arithmetic after an operation explanation", "x = 9. I subtracted 2. +100"],
    ["division by zero in prose", "x = 9. I divided both sides by 0."],
    ["colon-delimited division by zero", "Divide by 0: x = 9"],
    ["a contradictory substitution check", "x = 9. I checked it by substituting 100."],
    [
      "a non-finite numeric claim",
      `x = 9. The answer is ${"9".repeat(400)}.`,
    ],
    ["a grouped implicit product", "2(x = 9)"],
    ["an adjacent prose wrapper", "I think(x = 9)"],
    ["an unmatched closing wrapper", "x = 9)"],
    ["an unsupported percent suffix", "x = 9%"],
    ["scientific notation", "x = 9e0"],
  ])("does not unlock transfer for %s", async (_, learnerAttempt) => {
    const result = await postTutor({
      ...seededRequest,
      learnerAttempt,
      attemptNumber: 2,
      currentStage: "guided_retry",
    });

    expect(result).toMatchObject({
      source: "deterministic-demo",
      turn: { stage: "guided_retry", isCorrect: false },
    });
  });

  it.each([
    ["newline-separated work", "x + 2 = 11\nx = 11 - 2"],
    ["semicolon-separated work", "x + 2 = 11; x = 11 - 2"],
    ["a rounded decimal quotient", "x = 2.7 / 0.3"],
    [
      "a plain-language explanation",
      "I think x = 11 - 2 because I subtracted 2 from both sides.",
    ],
    [
      "an operation explanation",
      "After subtracting 2 from both sides, x = 11 - 2",
    ],
    [
      "a sentence after the answer",
      "x = 11 - 2. I subtracted 2 from both sides.",
    ],
    [
      "a bounded two-operation explanation",
      "x = 11 - 2. I divided both sides by 6 and subtracted 2.",
    ],
    [
      "a matching substitution value",
      "x = 11 - 2. I checked it by substituting 9.",
    ],
  ])("unlocks transfer for %s", async (_, learnerAttempt) => {
    const result = await postTutor({
      ...seededRequest,
      learnerAttempt,
      attemptNumber: 2,
      currentStage: "guided_retry",
    });

    expect(result).toMatchObject({
      source: "deterministic-demo",
      turn: {
        stage: "transfer",
        misconception: "correct",
        intervention: "transfer_check",
        isCorrect: true,
      },
    });
  });
});
