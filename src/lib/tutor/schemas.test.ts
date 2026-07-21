import { describe, expect, it } from "vitest";

import { TutorRequestSchema } from "./schemas";

const baseRequest = {
  problemId: "linear-equation-01",
  attemptNumber: 1,
  currentStage: "attempt" as const,
  useLiveModel: false,
};

describe("TutorRequestSchema help-seeking contract", () => {
  it("rejects a blank request without an attempt or help signal", () => {
    const result = TutorRequestSchema.safeParse({
      ...baseRequest,
      learnerAttempt: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a blank attempt with an explicit help signal", () => {
    const result = TutorRequestSchema.safeParse({
      ...baseRequest,
      learnerAttempt: "",
      helpRequest: "stuck",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.learnerAttempt).toBe("");
      expect(result.data.helpRequest).toBe("stuck");
      expect(result.data.stageAssistanceUsed).toBe(false);
    }
  });

  it("accepts a visible attempt without a help signal", () => {
    const result = TutorRequestSchema.safeParse({
      ...baseRequest,
      learnerAttempt: "3x - 6 = 12",
    });

    expect(result.success).toBe(true);
  });

  it("accepts only the bounded expected-response type", () => {
    expect(
      TutorRequestSchema.safeParse({
        ...baseRequest,
        learnerAttempt: "3x and -6",
        expectedResponse: "distribution_products",
      }).success,
    ).toBe(true);
    expect(
      TutorRequestSchema.safeParse({
        ...baseRequest,
        learnerAttempt: "3x and -6",
        expectedResponse: "free_form_reasoning",
      }).success,
    ).toBe(false);
  });

  it("rejects new requests after either terminal outcome", () => {
    for (const currentStage of ["complete", "assisted_complete"] as const) {
      const result = TutorRequestSchema.safeParse({
        ...baseRequest,
        currentStage,
        learnerAttempt: "x = 4",
      });

      expect(result.success).toBe(false);
    }
  });
});
