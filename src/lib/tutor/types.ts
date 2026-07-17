export type TutorStage =
  | "attempt"
  | "diagnosis"
  | "guided_retry"
  | "transfer"
  | "complete";

export type MisconceptionCode =
  | "no_attempt"
  | "stopped_too_early"
  | "distribution_error"
  | "inverse_operation_error"
  | "arithmetic_error"
  | "unclear_reasoning"
  | "correct";

export type InterventionType =
  | "request_attempt"
  | "socratic_question"
  | "concept_cue"
  | "worked_micro_step"
  | "transfer_check"
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
}

export interface TutorContext {
  attemptNumber: number;
  currentStage: TutorStage;
  learnerAttempt: string;
  problemId: string;
}

export interface MathProblem {
  id: string;
  title: string;
  prompt: string;
  skill: string;
  expectedAnswer: string;
  transferProblem: {
    prompt: string;
    expectedAnswer: string;
  };
}
