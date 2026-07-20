import type { HelpRequestType, TutorStage, TutorTurn } from "./types";

const HELP_REQUEST_LABELS: Record<HelpRequestType, string> = {
  stuck: "I am stuck",
  dont_know_start: "I do not know how to start",
  check_last_step: "Check my last step",
  small_hint: "Give me a small hint",
  human: "I want to ask a person",
};

export interface TeacherHandoffInput {
  problemId: string;
  problemPrompt: string;
  stage: TutorStage;
  currentAttempt: string;
  helpRequest: HelpRequestType;
  latestTurn?: TutorTurn;
  highestHintLevel: 0 | 1 | 2 | 3;
}

export function helpRequestLabel(request: HelpRequestType) {
  return HELP_REQUEST_LABELS[request];
}

export function buildTeacherHandoffSummary(input: TeacherHandoffInput) {
  const attempt = input.currentAttempt.trim() || "No written attempt yet.";
  const hypothesis = input.latestTurn
    ? input.latestTurn.diagnosis
    : "No automated diagnosis yet.";
  const unresolved = input.latestTurn
    ? input.latestTurn.nextPrompt
    : "The learner requested human support before an automated next step was established.";

  return [
    "ThinkFirst Tutor — teacher handoff preview",
    `Problem ID: ${input.problemId}`,
    `Problem: ${input.problemPrompt}`,
    `Stage: ${input.stage.replaceAll("_", " ")}`,
    `Learner request: ${helpRequestLabel(input.helpRequest)}`,
    `Current visible attempt: ${attempt}`,
    `Latest automated hypothesis: ${hypothesis}`,
    `Highest hint level already used: ${input.highestHintLevel} of 3`,
    `Unresolved next step: ${unresolved}`,
    "",
    "Teacher note: the automated diagnosis is a hypothesis to confirm or correct.",
    "Privacy note: this summary contains only the current task context. No message is sent automatically in this demo.",
  ].join("\n");
}
