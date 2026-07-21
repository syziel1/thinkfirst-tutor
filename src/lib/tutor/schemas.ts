import { z } from "zod";

import { isDemoProblemId } from "./problems";
import { canRequestTutorTurn } from "./stage-transition";

export const TutorStageSchema = z.enum([
  "attempt",
  "diagnosis",
  "guided_retry",
  "transfer",
  "complete",
  "assisted_complete",
]);

export const HelpRequestSchema = z.enum([
  "stuck",
  "dont_know_start",
  "check_last_step",
  "small_hint",
  "human",
]);

export const ExpectedResponseTypeSchema = z.enum(["distribution_products"]);

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
  "orientation_prompt",
  "socratic_question",
  "concept_cue",
  "worked_micro_step",
  "transfer_check",
  "human_handoff",
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
  // Structured Outputs requires every field to be present. The model uses
  // null when the next turn does not expect a bounded micro-answer.
  expectedResponse: ExpectedResponseTypeSchema.nullable(),
});

export const TutorRequestSchema = z
  .object({
    problemId: z
      .string()
      .max(64)
      .refine(isDemoProblemId, { message: "Unknown demo problem." }),
    learnerAttempt: z.string().trim().max(1200).default(""),
    helpRequest: HelpRequestSchema.nullable().optional(),
    expectedResponse: ExpectedResponseTypeSchema.nullable().optional(),
    attemptNumber: z.number().int().min(1).max(10),
    currentStage: TutorStageSchema,
    stageAssistanceUsed: z.boolean().default(false),
    useLiveModel: z.boolean().default(false),
  })
  .superRefine((request, context) => {
    if (!canRequestTutorTurn(request.currentStage)) {
      context.addIssue({
        code: "custom",
        path: ["currentStage"],
        message: "A completed tutoring session cannot accept another turn.",
      });
    }

    if (!request.learnerAttempt && !request.helpRequest) {
      context.addIssue({
        code: "custom",
        path: ["learnerAttempt"],
        message: "Provide a visible attempt or choose an explicit help request.",
      });
    }
  });

export type TutorRequest = z.infer<typeof TutorRequestSchema>;
