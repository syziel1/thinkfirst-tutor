import { createHash } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { getDemoProblem } from "./problems";
import { TutorTurnSchema, type TutorRequest } from "./schemas";
import type { MathProblem, TutorTurn } from "./types";

const SYSTEM_PROMPT = `You are ThinkFirst Tutor, a math tutor designed to protect
productive struggle and develop independent problem solving.

Pedagogical policy:
- Require a meaningful learner attempt before substantive solution help, but never shame uncertainty or demand a perfectly formed question.
- Treat help-seeking as learner agency. Use calm, precise, non-patronizing language.
- Never say that the learner should already know something, was not paying attention, is lazy, anxious, careless, or unmotivated.
- Diagnose only the likely mathematical misconception. Never infer an emotional or psychological state and never expose chain-of-thought or hidden reasoning.
- Give the smallest useful intervention. Prefer one Socratic question before an explanation.
- Use hint level 1 for a question, 2 for a concept cue, and 3 for one worked micro-step.
- Never provide the final answer when the learner is still incorrect.
- If the main problem is correct, move to the transfer stage and ask the distinct transfer problem.
- Complete the session only when the transfer problem is solved correctly without support during that transfer stage.
- If stageAssistanceUsed is true and the transfer answer is correct, use stage assisted_complete, intervention transfer_check, and state that a fresh independent check is still required.
- Keep diagnosis, feedback, and nextPrompt concise and student-friendly.
- Set revealAnswer to false in every response.

Return only the structured tutor turn requested by the schema.`;

function safetyIdentifier(seed: string) {
  return createHash("sha256")
    .update(`thinkfirst:${seed || "anonymous"}`)
    .digest("hex")
    .slice(0, 32);
}

function containsProtectedAnswer(
  turn: TutorTurn,
  request: TutorRequest,
  problem: MathProblem,
) {
  if (turn.isCorrect) return false;

  const expectedSolution =
    request.currentStage === "transfer"
      ? problem.transferProblem.equation.solution
      : problem.equation.solution;
  const protectedAnswer = new RegExp(
    `x\\s*=\\s*${expectedSolution}(?:\\.0+)?\\b`,
    "i",
  );
  const visibleText = `${turn.diagnosis} ${turn.feedback} ${turn.nextPrompt}`;

  return protectedAnswer.test(visibleText);
}

export async function generateTutorTurn(
  request: TutorRequest,
  userSeed: string,
): Promise<TutorTurn> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5.6";
  const problem = getDemoProblem(request.problemId);

  if (!problem) throw new Error(`Unknown demo problem: ${request.problemId}`);

  const response = await client.responses.parse({
    model,
    store: false,
    safety_identifier: safetyIdentifier(userSeed),
    reasoning: { effort: "low" },
    max_output_tokens: 2500,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          problem: {
            prompt: problem.prompt,
            expectedAnswer: problem.expectedAnswer,
            skill: problem.skill,
          },
          transferProblem: problem.transferProblem,
          tutorState: {
            currentStage: request.currentStage,
            attemptNumber: request.attemptNumber,
            stageAssistanceUsed: request.stageAssistanceUsed,
          },
          learnerAttempt: request.learnerAttempt,
        }),
      },
    ],
    text: {
      format: zodTextFormat(TutorTurnSchema, "tutor_turn"),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("The model returned no structured tutor turn.");
  if (containsProtectedAnswer(parsed, request, problem)) {
    throw new Error("The model revealed a protected final answer.");
  }

  return parsed;
}
