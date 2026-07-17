import type { MathProblem } from "./types";

export const DEMO_PROBLEM: MathProblem = {
  id: "linear-equation-01",
  title: "Linear equation",
  prompt: "Solve for x: 3(x - 2) = 12",
  skill: "Undoing operations in the correct order",
  expectedAnswer: "x = 6",
  transferProblem: {
    prompt: "Now solve independently: 4(x + 1) = 20",
    expectedAnswer: "x = 4",
  },
};
