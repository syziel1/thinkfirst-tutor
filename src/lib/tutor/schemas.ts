import { z } from "zod";

import { isDemoProblemId } from "./problems";

export const TutorStageSchema = z.enum([
  "attempt",
  "diagnosis",
  "guided_retry",
  "transfer",
  "complete",
]);

export const MisconceptionCodeSchema = z.enum([
  "no_attempt",
  "correct_intermediate",
  "stopped_too_early",
  "distribution_error",
  "inverse_operation_error",
  "arithmetic_error",
  "unclear_reasoning",
  "correct",
]);

export const InterventionTypeSchema = z.enum([
  "request_attempt",
  "socratic_question",
  "concept_cue",
  "worked_micro_step",
  "transfer_check",
  "celebration",
]);

export const TutorTurnSchema = z.object({
  stage: TutorStageSchema,
  misconception: MisconceptionCodeSchema,
  diagnosis: z.string(),
  feedback: z.string(),
  nextPrompt: z.string(),
  intervention: InterventionTypeSchema,
  hintLevel: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  isCorrect: z.boolean(),
  revealAnswer: z.literal(false),
});

export const TutorRequestSchema = z.object({
  problemId: z
    .string()
    .max(64)
    .refine(isDemoProblemId, { message: "Unknown demo problem." }),
  learnerAttempt: z.string().trim().min(1).max(1200),
  attemptNumber: z.number().int().min(1).max(10),
  currentStage: TutorStageSchema,
  useLiveModel: z.boolean().default(false),
});

export type TutorRequest = z.infer<typeof TutorRequestSchema>;
