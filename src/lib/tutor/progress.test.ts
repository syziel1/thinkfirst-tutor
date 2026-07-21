import { describe, expect, it } from "vitest";

import { deriveLearningProgress, nextAttemptNumber } from "./progress";
import type { TutorStage } from "./types";

function progress(
  stage: TutorStage,
  overrides: Partial<{
    hasVisibleAttempt: boolean;
    hasHelpInteraction: boolean;
    hasTutorResponse: boolean;
    guidanceUsed: boolean;
  }> = {},
) {
  return deriveLearningProgress({
    stage,
    hasVisibleAttempt: false,
    hasHelpInteraction: false,
    hasTutorResponse: false,
    guidanceUsed: false,
    ...overrides,
  }).map(({ label, state, status }) => ({ label, state, status }));
}

describe("observable learning progress", () => {
  it("matches the fresh-problem row", () => {
    expect(progress("attempt")).toEqual([
      { label: "Your try", state: "current", status: "Now" },
      {
        label: "Diagnose",
        state: "waiting",
        status: "Waiting for attempt",
      },
      { label: "Guide", state: "skipped", status: "If needed" },
      { label: "Transfer", state: "waiting", status: "Locked" },
    ]);
  });

  it("matches the help-only row without claiming an attempt or diagnosis", () => {
    expect(
      progress("guided_retry", {
        hasHelpInteraction: true,
        hasTutorResponse: true,
        guidanceUsed: true,
      }),
    ).toEqual([
      { label: "Your try", state: "waiting", status: "Still needed" },
      {
        label: "Diagnose",
        state: "waiting",
        status: "Waiting for attempt",
      },
      { label: "Guide", state: "current", status: "Now" },
      { label: "Transfer", state: "waiting", status: "Locked" },
    ]);
  });

  it("matches the visible incorrect or intermediate attempt row", () => {
    expect(
      progress("guided_retry", {
        hasVisibleAttempt: true,
        hasTutorResponse: true,
        guidanceUsed: true,
      }),
    ).toEqual([
      { label: "Your try", state: "complete", status: "Done" },
      { label: "Diagnose", state: "complete", status: "Done" },
      { label: "Guide", state: "current", status: "Now" },
      { label: "Transfer", state: "waiting", status: "Locked" },
    ]);
  });

  it("distinguishes direct and guided transfer", () => {
    expect(
      progress("transfer", {
        hasVisibleAttempt: true,
        hasTutorResponse: true,
      }),
    ).toEqual([
      { label: "Your try", state: "complete", status: "Done" },
      { label: "Diagnose", state: "complete", status: "Done" },
      { label: "Guide", state: "skipped", status: "Not needed" },
      { label: "Transfer", state: "current", status: "Now" },
    ]);

    expect(
      progress("transfer", {
        hasVisibleAttempt: true,
        hasTutorResponse: true,
        guidanceUsed: true,
      }),
    ).toEqual([
      { label: "Your try", state: "complete", status: "Done" },
      { label: "Diagnose", state: "complete", status: "Done" },
      { label: "Guide", state: "used", status: "Used" },
      { label: "Transfer", state: "current", status: "Now" },
    ]);
  });

  it("distinguishes independent and assisted completion", () => {
    expect(
      progress("complete", {
        hasVisibleAttempt: true,
        hasTutorResponse: true,
      }),
    ).toEqual([
      { label: "Your try", state: "complete", status: "Done" },
      { label: "Diagnose", state: "complete", status: "Done" },
      { label: "Guide", state: "skipped", status: "Not needed" },
      { label: "Transfer", state: "complete", status: "Done" },
    ]);

    expect(
      progress("complete", {
        hasVisibleAttempt: true,
        hasTutorResponse: true,
        guidanceUsed: true,
      }),
    ).toMatchObject([
      { status: "Done" },
      { status: "Done" },
      { state: "used", status: "Used" },
      { state: "complete", status: "Done" },
    ]);

    expect(
      progress("assisted_complete", {
        hasVisibleAttempt: true,
        hasHelpInteraction: true,
        hasTutorResponse: true,
        guidanceUsed: true,
      }),
    ).toEqual([
      { label: "Your try", state: "complete", status: "Done" },
      { label: "Diagnose", state: "complete", status: "Done" },
      { label: "Guide", state: "used", status: "Used" },
      {
        label: "Transfer",
        state: "needs-check",
        status: "Fresh check needed",
      },
    ]);
  });

  it("does not invent completed foundations from a later stage alone", () => {
    expect(progress("complete")).toEqual([
      { label: "Your try", state: "current", status: "Now" },
      {
        label: "Diagnose",
        state: "waiting",
        status: "Waiting for attempt",
      },
      { label: "Guide", state: "skipped", status: "If needed" },
      { label: "Transfer", state: "waiting", status: "Locked" },
    ]);
  });
});

describe("learner attempt progression", () => {
  it("does not advance after zero-level orientation", () => {
    expect(
      nextAttemptNumber(
        1,
        {
          hintLevel: 0,
          isCorrect: false,
        },
        true,
      ),
    ).toBe(1);
  });

  it("advances after substantive guidance for evaluated visible work", () => {
    expect(
      nextAttemptNumber(
        1,
        {
          hintLevel: 1,
          isCorrect: false,
        },
        true,
      ),
    ).toBe(2);
  });

  it("does not advance help-only or no-attempt interactions", () => {
    expect(
      nextAttemptNumber(
        1,
        {
          hintLevel: 1,
          isCorrect: false,
        },
        false,
      ),
    ).toBe(1);
  });

  it("does not advance a correct turn or exceed the request limit", () => {
    expect(
      nextAttemptNumber(
        3,
        {
          hintLevel: 0,
          isCorrect: true,
        },
        true,
      ),
    ).toBe(3);
    expect(
      nextAttemptNumber(
        10,
        {
          hintLevel: 3,
          isCorrect: false,
        },
        true,
      ),
    ).toBe(10);
  });
});
