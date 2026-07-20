import { describe, expect, it } from "vitest";

import { nextAttemptNumber } from "./progress";

describe("learner attempt progression", () => {
  it("does not advance after zero-level orientation", () => {
    expect(
      nextAttemptNumber(1, {
        hintLevel: 0,
        isCorrect: false,
      }),
    ).toBe(1);
  });

  it("advances after substantive guidance", () => {
    expect(
      nextAttemptNumber(1, {
        hintLevel: 1,
        isCorrect: false,
      }),
    ).toBe(2);
  });

  it("does not advance a correct turn or exceed the request limit", () => {
    expect(
      nextAttemptNumber(3, {
        hintLevel: 0,
        isCorrect: true,
      }),
    ).toBe(3);
    expect(
      nextAttemptNumber(10, {
        hintLevel: 3,
        isCorrect: false,
      }),
    ).toBe(10);
  });
});
