import { describe, expect, it } from "vitest";

import {
  highestLevelAfterTransfer,
  isEquationLevelUnlocked,
  unlockedEquationLevels,
} from "./mastery-progression";

describe("mastery-based level progression", () => {
  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ] as const)(
    "unlocks level %i only after independent transfer at level %i",
    (completedLevel, expectedHighest) => {
      expect(
        highestLevelAfterTransfer({
          completedLevel,
          highestUnlocked: completedLevel,
          outcome: "complete",
        }),
      ).toBe(expectedHighest);
    },
  );

  it("does not unlock after assisted transfer", () => {
    expect(
      highestLevelAfterTransfer({
        completedLevel: 2,
        highestUnlocked: 2,
        outcome: "assisted_complete",
      }),
    ).toBe(2);
  });

  it("does not skip ahead after revisiting an easier unlocked level", () => {
    expect(
      highestLevelAfterTransfer({
        completedLevel: 2,
        highestUnlocked: 4,
        outcome: "complete",
      }),
    ).toBe(4);
  });

  it("keeps level 5 as the upper boundary", () => {
    expect(
      highestLevelAfterTransfer({
        completedLevel: 5,
        highestUnlocked: 5,
        outcome: "complete",
      }),
    ).toBe(5);
  });

  it("exposes exactly the levels at or below the session boundary", () => {
    expect(unlockedEquationLevels(1)).toEqual([1]);
    expect(unlockedEquationLevels(3)).toEqual([1, 2, 3]);
    expect(unlockedEquationLevels(5)).toEqual([1, 2, 3, 4, 5]);
    expect(isEquationLevelUnlocked(3, 3)).toBe(true);
    expect(isEquationLevelUnlocked(4, 3)).toBe(false);
  });
});
