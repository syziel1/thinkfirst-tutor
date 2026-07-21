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
    [
      "a non-finite operation operand",
      `x = 9. I divided both sides by ${"9".repeat(400)}.`,
    ],
    ["a non-finite exponent operand", "I divided by 1e309, so x = 9"],
    ["a zero exponent operand", "I divided by 0e309, so x = 9"],
    ["a hexadecimal zero operand", "I divided by 0x0, so x = 9"],
    ["an adjacent infinity operand", "I divided by ∞x, so x = 9"],
    ["a parenthesized zero operand", "I divided by (0), so x = 9"],
    ["a compact parenthesized zero operand", "I divided by(0), so x = 9"],
    ["a compact Unicode zero operand", "I divided by０, so x = 9"],
    ["an Eastern Pwo Karen zero operand", "I divided by𑛚, so x = 9"],
    ["a noun-form zero operand", "I used division by 0, so x = 9"],
    ["a newline before a zero operand", "I divided both sides\nby 0, so x = 9"],
    ["a wrapped arbitrary target", "I divided the expression\nby zero, so x = 9"],
    ["a qualified zero operand", "I divided by exactly zero, so x = 9"],
    ["a zero factor operand", "I divided by a factor of zero, so x = 9"],
    ["a bracketed zero operand", "I divided by [0], so x = 9"],
    ["a bracketed zero expression operand", "I divided by [1 - 1], so x = 9"],
    ["a braced zero expression operand", "I divided by {1 - 1}, so x = 9"],
    ["a fullwidth zero expression operand", "I divided by [１ - １], so x = 9"],
    ["an Arabic-Indic zero expression operand", "I divided by {٢ - ٢}, so x = 9"],
    ["a zero expression operand", "I divided by 1 - 1, so x = 9"],
    ["a parenthesized zero divisor", "I divided by 1 / (0), so x = 9"],
    ["a zero quotient operand", "I divided by 0 / 1, so x = 9"],
    ["a chained zero expression", "I divided by 1 + 1 - 2, so x = 9"],
    ["a superscript operand", "I divided by 10³⁰⁹, so x = 9"],
    ["an unsupported percent operand", "I divided by 10%0, so x = 9"],
    ["a spaced circled numeric tail", "I divided by 2 ⑨, so x = 9"],
    ["a circled exponent tail", "I divided by 1 e⑨⑨⑨, so x = 9"],
    ["a fullwidth exponent tail", "I divided by 1 ｅ999, so x = 9"],
    ["a compact fullwidth non-finite exponent", "I divided by 1ｅ309, so x = 9"],
    ["a fullwidth infinity operand", "I divided by ｉｎｆ, so x = 9"],
    ["a fully fullwidth zero operation", "I ｄｉｖｉｄｅｄ ｂｙ ０, so x = 9"],
    [
      "a compatibility fraction after a fullwidth operation",
      "I ｄｉｖｉｄｅｄ ｂｙ ⅟0, so x = 9",
    ],
    ["a compatibility non-finite suboperand", "I divided by 1 / 1ｅ309, so x = 9"],
    ["a fullwidth fractional tail", "I divided by 1．⑨, so x = 9"],
    ["a spaced exponent operand", "I divided by 1 e309, so x = 9"],
    ["a short infinity operand", "I divided by inf, so x = 9"],
    ["an infinite adjective operand", "I divided by infinite, so x = 9"],
    [
      "a later real operation after an incomplete negation",
      "I did not divide; then I divided by zero, so x = 9",
    ],
    ["a double-negated zero operation", "I did not not divide by zero, so x = 9"],
    ["a non-finite expression result", "I divided by 1e308 * 2, so x = 9"],
    [
      "a coordinated zero divisor",
      "I divided by 2 and then by 0, so x = 9",
    ],
    [
      "a contrasted zero divisor after a negated operation",
      "I did not divide by 2 but instead by 0, so x = 9",
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
      "a nonzero expression starting at zero",
      "I divided by 0 + 1, so x = 11 - 2",
    ],
    [
      "an explicit nonzero coefficient",
      "I divided by a non-zero coefficient, so x = 11 - 2",
    ],
    [
      "an explicitly avoided zero division",
      "I did not divide by zero, so x = 11 - 2",
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
