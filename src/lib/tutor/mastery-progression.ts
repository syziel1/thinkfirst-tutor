import { EQUATION_LEVELS } from "./problems";
import type { EquationLevel, TutorStage } from "./types";

export function unlockedEquationLevels(highestUnlocked: EquationLevel) {
  return EQUATION_LEVELS.filter((level) => level <= highestUnlocked);
}

export function isEquationLevelUnlocked(
  level: EquationLevel,
  highestUnlocked: EquationLevel,
) {
  return level <= highestUnlocked;
}

export function highestLevelAfterTransfer({
  completedLevel,
  highestUnlocked,
  outcome,
}: {
  completedLevel: EquationLevel;
  highestUnlocked: EquationLevel;
  outcome: TutorStage;
}): EquationLevel {
  if (
    outcome !== "complete" ||
    completedLevel !== highestUnlocked ||
    highestUnlocked === 5
  ) {
    return highestUnlocked;
  }

  return (highestUnlocked + 1) as EquationLevel;
}
