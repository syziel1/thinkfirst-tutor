import type { TutorTurn } from "./types";

export function nextAttemptNumber(
  currentAttemptNumber: number,
  turn: Pick<TutorTurn, "hintLevel" | "isCorrect">,
) {
  if (turn.isCorrect || turn.hintLevel === 0) {
    return currentAttemptNumber;
  }

  return Math.min(currentAttemptNumber + 1, 10);
}
