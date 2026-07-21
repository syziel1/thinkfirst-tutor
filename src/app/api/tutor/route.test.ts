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
    ["a grouped implicit product", "2(x = 9)"],
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
