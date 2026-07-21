import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateTutorTurn } from "@/lib/tutor/ai";
import type { TutorTurn } from "@/lib/tutor/types";

import { POST } from "./route";

vi.mock("@/lib/tutor/ai", () => ({
  generateTutorTurn: vi.fn(),
}));

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

function liveTurn(
  stage: TutorTurn["stage"],
  overrides: Partial<TutorTurn> = {},
): TutorTurn {
  const successful =
    stage === "transfer" || stage === "complete" || stage === "assisted_complete";

  return {
    stage,
    misconception: successful ? "correct" : "correct_intermediate",
    diagnosis: "Live diagnosis.",
    feedback: "Live feedback.",
    nextPrompt: "Live next prompt.",
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
      hasVisibleWork: true,
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
      hasVisibleWork: false,
      stageAssistanceUsed: true,
      turn: { stage: "transfer", hintLevel: 0 },
    });

    const completionResult = await postTutor({
      ...transferRequest,
      learnerAttempt: "x = 4",
      stageAssistanceUsed: helpResult.stageAssistanceUsed,
    });

    expect(completionResult.turn.stage).toBe("assisted_complete");
    expect(completionResult.hasVisibleWork).toBe(true);
  });

  it("does not count typed help or non-evaluating help as visible work", async () => {
    const typedHelp = await postTutor({
      ...transferRequest,
      learnerAttempt: "help",
    });
    const explicitHelp = await postTutor({
      ...transferRequest,
      learnerAttempt: "x + 1 = 5",
      helpRequest: "stuck",
    });

    expect(typedHelp.hasVisibleWork).toBe(false);
    expect(explicitHelp.hasVisibleWork).toBe(false);
  });
});

describe("POST /api/tutor live transition guard", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.mocked(generateTutorTurn).mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("falls back deterministically when live output skips transfer", async () => {
    vi.mocked(generateTutorTurn).mockResolvedValueOnce(liveTurn("complete"));

    const result = await postTutor({
      problemId: "linear-equation-01",
      learnerAttempt: "x = 6",
      attemptNumber: 1,
      currentStage: "attempt",
      stageAssistanceUsed: false,
      useLiveModel: true,
    });

    expect(generateTutorTurn).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      source: "deterministic-fallback",
      hasVisibleWork: true,
      turn: { stage: "transfer" },
    });
  });

  it("rejects a legal main-to-transfer stage when the attempt is not correct", async () => {
    vi.mocked(generateTutorTurn).mockResolvedValueOnce(liveTurn("transfer"));

    const result = await postTutor({
      problemId: "linear-equation-01",
      learnerAttempt: "x - 2 = 4",
      attemptNumber: 1,
      currentStage: "attempt",
      stageAssistanceUsed: false,
      useLiveModel: true,
    });

    expect(result).toMatchObject({
      source: "deterministic-fallback",
      turn: { stage: "guided_retry", isCorrect: false },
    });
  });

  it("rejects a legal transfer-to-complete stage when transfer is not correct", async () => {
    vi.mocked(generateTutorTurn).mockResolvedValueOnce(liveTurn("complete"));

    const result = await postTutor({
      ...transferRequest,
      learnerAttempt: "x + 1 = 5",
      useLiveModel: true,
    });

    expect(result).toMatchObject({
      source: "deterministic-fallback",
      turn: { stage: "transfer", isCorrect: false },
    });
  });

  it("accepts live boundary advancement confirmed by deterministic evaluation", async () => {
    vi.mocked(generateTutorTurn)
      .mockResolvedValueOnce(liveTurn("transfer"))
      .mockResolvedValueOnce(liveTurn("complete"));

    const mainResult = await postTutor({
      problemId: "linear-equation-01",
      learnerAttempt: "x = 6",
      attemptNumber: 1,
      currentStage: "attempt",
      stageAssistanceUsed: false,
      useLiveModel: true,
    });
    const transferResult = await postTutor({
      ...transferRequest,
      learnerAttempt: "x = 4",
      useLiveModel: true,
    });

    expect(mainResult).toMatchObject({
      source: "openai",
      turn: { stage: "transfer", isCorrect: true },
    });
    expect(transferResult).toMatchObject({
      source: "openai",
      stageAssistanceUsed: false,
      turn: { stage: "complete", isCorrect: true },
    });
  });

  it("persists assistance from an accepted non-advancing live turn", async () => {
    vi.mocked(generateTutorTurn).mockResolvedValueOnce(
      liveTurn("transfer", {
        misconception: "correct_intermediate",
        intervention: "socratic_question",
        hintLevel: 1,
        isCorrect: false,
      }),
    );

    const result = await postTutor({
      ...transferRequest,
      learnerAttempt: "x + 1 = 5",
      useLiveModel: true,
    });

    expect(result).toMatchObject({
      source: "openai",
      stageAssistanceUsed: true,
      turn: { stage: "transfer", hintLevel: 1, isCorrect: false },
    });
  });

  it("does not persist assistance from a rejected live candidate", async () => {
    vi.mocked(generateTutorTurn).mockResolvedValueOnce(
      liveTurn("complete", { hintLevel: 1 }),
    );

    const result = await postTutor({
      ...transferRequest,
      learnerAttempt: "x = 4",
      useLiveModel: true,
    });

    expect(result).toMatchObject({
      source: "deterministic-fallback",
      stageAssistanceUsed: false,
      turn: { stage: "complete", hintLevel: 0 },
    });
  });

  it("matches an assisted terminal outcome after prior accepted support", async () => {
    vi.mocked(generateTutorTurn).mockResolvedValueOnce(liveTurn("complete"));

    const result = await postTutor({
      ...transferRequest,
      learnerAttempt: "x = 4",
      stageAssistanceUsed: true,
      useLiveModel: true,
    });

    expect(result).toMatchObject({
      source: "openai",
      stageAssistanceUsed: true,
      turn: {
        stage: "assisted_complete",
        intervention: "transfer_check",
      },
    });
  });
});
