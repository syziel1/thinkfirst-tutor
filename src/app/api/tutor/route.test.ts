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
