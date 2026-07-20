import { NextRequest, NextResponse } from "next/server";

import { generateTutorTurn } from "@/lib/tutor/ai";
import {
  evaluateHelpRequest,
  inferHelpRequest,
  preserveAssistanceEvidence,
} from "@/lib/tutor/help-policy";
import { evaluateDemoTurn } from "@/lib/tutor/policy";
import { TutorRequestSchema } from "@/lib/tutor/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = TutorRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid tutor request.", details: result.error.flatten() },
      { status: 400 },
    );
  }

  const inferredHelpRequest =
    result.data.helpRequest ?? inferHelpRequest(result.data.learnerAttempt);
  const tutorContext = {
    attemptNumber: result.data.attemptNumber,
    currentStage: result.data.currentStage,
    learnerAttempt: result.data.learnerAttempt,
    problemId: result.data.problemId,
    helpRequest: inferredHelpRequest,
    stageAssistanceUsed: result.data.stageAssistanceUsed,
  };

  if (inferredHelpRequest) {
    const turn = preserveAssistanceEvidence(
      evaluateHelpRequest(tutorContext),
      tutorContext,
    );

    return NextResponse.json({
      turn,
      source: "deterministic-safeguard",
      model: null,
    });
  }

  if (!result.data.useLiveModel || !process.env.OPENAI_API_KEY) {
    const turn = preserveAssistanceEvidence(
      evaluateDemoTurn(tutorContext),
      tutorContext,
    );

    return NextResponse.json({
      turn,
      source: "deterministic-demo",
      model: null,
    });
  }

  try {
    const forwardedFor = request.headers.get("x-forwarded-for") || "local-demo";
    const generated = await generateTutorTurn(result.data, forwardedFor.split(",")[0]);
    const turn = preserveAssistanceEvidence(generated, tutorContext);

    return NextResponse.json({
      turn,
      source: "openai",
      model: process.env.OPENAI_MODEL || "gpt-5.6",
    });
  } catch (error) {
    console.error("Live tutor generation failed; using deterministic fallback.", error);

    const turn = preserveAssistanceEvidence(
      evaluateDemoTurn(tutorContext),
      tutorContext,
    );

    return NextResponse.json({
      turn,
      source: "deterministic-fallback",
      model: null,
    });
  }
}
