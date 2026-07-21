import { formatInnerExpression, getDemoProblem } from "./problems";
import { evaluateDemoTurn } from "./policy";
import type {
  HelpRequestType,
  LinearEquationParameters,
  TutorContext,
  TutorTurn,
} from "./types";

function phraseKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function inferHelpRequest(value: string): HelpRequestType | null {
  const key = phraseKey(value);

  if (
    new Set([
      "help",
      "helpme",
      "idk",
      "idontknow",
      "dontknow",
      "notsure",
      "unsure",
      "pomocy",
      "niewiem",
      "nieumiem",
    ]).has(key)
  ) {
    return "stuck";
  }

  if (
    new Set([
      "idontknowhowtostart",
      "dontknowhowtostart",
      "niewiemjak",
      "niewiemjakzaczac",
    ]).has(key)
  ) {
    return "dont_know_start";
  }

  return null;
}

export function canEvaluateVisibleWork(
  learnerAttempt: string,
  helpRequest: HelpRequestType | null,
) {
  if (!learnerAttempt.trim()) return false;

  return (
    !helpRequest ||
    helpRequest === "check_last_step" ||
    helpRequest === "small_hint"
  );
}

function stageForHelp(context: TutorContext) {
  return context.currentStage === "transfer" ? "transfer" : "guided_retry";
}

function currentEquation(context: TutorContext): LinearEquationParameters {
  const problem = getDemoProblem(context.problemId);
  if (!problem) throw new Error(`Unknown demo problem: ${context.problemId}`);

  return context.currentStage === "transfer"
    ? problem.transferProblem.equation
    : problem.equation;
}

function orientationTurn(
  context: TutorContext,
  diagnosis: string,
  feedback: string,
  nextPrompt: string,
): TutorTurn {
  return {
    stage: stageForHelp(context),
    misconception: context.learnerAttempt.trim()
      ? "unclear_reasoning"
      : "no_attempt",
    diagnosis,
    feedback,
    nextPrompt,
    intervention: "orientation_prompt",
    hintLevel: 0,
    isCorrect: false,
    revealAnswer: false,
  };
}

export function evaluateHelpRequest(context: TutorContext): TutorTurn {
  const request = context.helpRequest;
  if (!request) throw new Error("A help request is required.");

  const visibleAttempt = context.learnerAttempt.trim();
  const equation = currentEquation(context);
  const innerExpression = formatInnerExpression(equation);

  if (request === "human") {
    return {
      stage: stageForHelp(context),
      misconception: visibleAttempt ? "unclear_reasoning" : "no_attempt",
      diagnosis:
        "You asked to involve a person. No judgement about motivation, ability, or emotion was made.",
      feedback:
        "Your visible work can be preserved in a short handoff preview with only the context needed for this task.",
      nextPrompt:
        "Review the handoff preview below. Nothing is sent automatically in this demo.",
      intervention: "human_handoff",
      hintLevel: 0,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  if (request === "check_last_step" && visibleAttempt) {
    return evaluateDemoTurn({
      ...context,
      helpRequest: null,
      attemptNumber: 1,
    });
  }

  if (request === "small_hint" && visibleAttempt) {
    return evaluateDemoTurn({
      ...context,
      helpRequest: null,
      attemptNumber: 1,
    });
  }

  if (request === "dont_know_start") {
    return {
      stage: stageForHelp(context),
      misconception: "no_attempt",
      diagnosis:
        "You do not need a complete solution or a perfectly formed question before receiving orientation.",
      feedback: `Treat ${innerExpression} as one object before working inside it.`,
      nextPrompt: `Which outer operation is applied to the whole expression ${innerExpression}?`,
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  if (request === "small_hint") {
    return {
      stage: stageForHelp(context),
      misconception: "no_attempt",
      diagnosis:
        "You asked for the smallest useful hint before writing a full step.",
      feedback: `Start by viewing ${innerExpression} as a single object.`,
      nextPrompt: `What outer operation would you undo first, and why?`,
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  if (request === "check_last_step") {
    return orientationTurn(
      context,
      "There is no visible step to inspect yet, and that is a valid place to begin.",
      "You only need to share the last line or operation you currently trust.",
      "Write or paste that one step; you do not need to explain the whole solution.",
    );
  }

  return orientationTurn(
    context,
    "You signalled that you are stuck. That is enough to begin support.",
    visibleAttempt
      ? "Your current work stays visible; we can locate the decision point without restarting."
      : "You do not need to diagnose the problem yourself before receiving help.",
    visibleAttempt
      ? "Which line is the last one you are confident is still correct?"
      : "Would you like help with the goal, the method, or the first step?",
  );
}

export function preserveAssistanceEvidence(
  turn: TutorTurn,
  context: Pick<TutorContext, "currentStage" | "stageAssistanceUsed">,
): TutorTurn {
  if (
    context.currentStage === "transfer" &&
    context.stageAssistanceUsed &&
    turn.stage === "complete"
  ) {
    return {
      ...turn,
      stage: "assisted_complete",
      diagnosis:
        "You solved the transfer problem after support was used during this stage.",
      feedback:
        "That is meaningful progress, but it is assisted evidence rather than independent transfer.",
      nextPrompt:
        "Start a fresh problem and solve it without hints to verify independent mastery.",
      intervention: "transfer_check",
    };
  }

  return turn;
}
