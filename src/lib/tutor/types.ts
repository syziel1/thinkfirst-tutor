export type TutorStage =
  | "attempt"
  | "diagnosis"
  | "guided_retry"
  | "transfer"
  | "complete"
  | "assisted_complete";

export type HelpRequestType =
  | "stuck"
  | "dont_know_start"
  | "check_last_step"
  | "small_hint"
  | "human";

export type ExpectedResponseType = "distribution_products";

export type MisconceptionCode =
  | "no_attempt"
  | "correct_intermediate"
  | "stopped_too_early"
  | "distribution_error"
  | "inverse_operation_error"
  | "arithmetic_error"
  | "unclear_reasoning"
  | "correct";

export type InterventionType =
  | "request_attempt"
  | "orientation_prompt"
  | "socratic_question"
  | "concept_cue"
  | "worked_micro_step"
  | "transfer_check"
  | "human_handoff"
  | "celebration";

export interface TutorTurn {
  stage: TutorStage;
  misconception: MisconceptionCode;
  diagnosis: string;
  feedback: string;
  nextPrompt: string;
  intervention: InterventionType;
  hintLevel: 0 | 1 | 2 | 3;
  isCorrect: boolean;
  revealAnswer: false;
  expectedResponse?: ExpectedResponseType;
}

export interface TutorContext {
  attemptNumber: number;
  currentStage: TutorStage;
  learnerAttempt: string;
  problemId: string;
  helpRequest?: HelpRequestType | null;
  expectedResponse?: ExpectedResponseType | null;
  stageAssistanceUsed?: boolean;
}

export interface LinearEquationParameters {
  multiplier: number;
  offset: number;
  rightSide: number;
  solution: number;
}

export interface MathProblem {
  id: string;
  title: string;
  prompt: string;
  skill: string;
  expectedAnswer: string;
  equation: LinearEquationParameters;
  transferProblem: {
    prompt: string;
    expectedAnswer: string;
    equation: LinearEquationParameters;
  };
}
