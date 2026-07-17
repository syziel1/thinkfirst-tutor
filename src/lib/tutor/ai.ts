import { createHash } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { DEMO_PROBLEM } from "./problems";
import { TutorTurnSchema, type TutorRequest } from "./schemas";
import type { TutorTurn } from "./types";

const SYSTEM_PROMPT = `You are ThinkFirst Tutor, a math tutor designed to protect
productive struggle and develop independent problem solving.

Pedagogical policy:
- Require a meaningful learner attempt before substantive help.
- Diagnose only the likely misconception. Never expose chain-of-thought or hidden reasoning.
- Give the smallest useful intervention. Prefer one Socratic question before an explanation.
- Use hint level 1 for a question, 2 for a concept cue, and 3 for one worked micro-step.
- Never provide the final answer when the learner is still incorrect.
- If the main problem is correct, move to the transfer stage and ask the distinct transfer problem.
- Complete the session only when the transfer problem is solved correctly.
- Keep diagnosis, feedback, and nextPrompt concise and student-friendly.
- Set revealAnswer to false in every response.

Return only the structured tutor turn requested by the schema.`;

function safetyIdentifier(seed: string) {
  return createHash("sha256")
    .update(`thinkfirst:${seed || "anonymous"}`)
    .digest("hex")
    .slice(0, 32);
}

function containsProtectedAnswer(turn: TutorTurn, request: TutorRequest) {
  if (turn.isCorrect) return false;

  const protectedAnswer =
    request.currentStage === "transfer" ? /x\s*=\s*4\b/i : /x\s*=\s*6\b/i;
  const visibleText = `${turn.diagnosis} ${turn.feedback} ${turn.nextPrompt}`;

  return protectedAnswer.test(visibleText);
}

export async function generateTutorTurn(
  request: TutorRequest,
  userSeed: string,
): Promise<TutorTurn> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5.6";

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
            prompt: DEMO_PROBLEM.prompt,
            expectedAnswer: DEMO_PROBLEM.expectedAnswer,
            skill: DEMO_PROBLEM.skill,
          },
          transferProblem: DEMO_PROBLEM.transferProblem,
          tutorState: {
            currentStage: request.currentStage,
            attemptNumber: request.attemptNumber,
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
  if (containsProtectedAnswer(parsed, request)) {
    throw new Error("The model revealed a protected final answer.");
  }

  return parsed;
}
