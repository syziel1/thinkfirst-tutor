import { DEMO_PROBLEM } from "./problems";
import type {
  MisconceptionCode,
  TutorContext,
  TutorTurn,
} from "./types";

function compact(value: string) {
  return value.toLowerCase().replaceAll("−", "-").replace(/\s+/g, "").trim();
}

function hasAnswer(value: string, expected: number) {
  const normalized = compact(value);
  const escaped = String(expected).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|x=)${escaped}(?:$|[^0-9.])`).test(normalized);
}

function classifyAttempt(attempt: string): MisconceptionCode {
  const value = compact(attempt);

  if (value.length < 2) return "no_attempt";
  if (hasAnswer(value, 6)) return "correct";
  if (/(?:^|x=)4$/.test(value)) return "stopped_too_early";
  if (/3x-2=12/.test(value)) return "distribution_error";
  if (/3x-6=12/.test(value) && /(?:x=)?2$/.test(value)) {
    return "arithmetic_error";
  }
  if (/(?:x=)?(?:-?2|10)$/.test(value)) return "inverse_operation_error";
  return "unclear_reasoning";
}

const FIRST_HINTS: Record<
  Exclude<MisconceptionCode, "no_attempt" | "correct">,
  Pick<TutorTurn, "diagnosis" | "feedback" | "nextPrompt">
> = {
  stopped_too_early: {
    diagnosis: "You correctly simplified the left side, but stopped one operation early.",
    feedback: "Your value describes x - 2, not x yet.",
    nextPrompt: "If x - 2 = 4, what operation isolates x?",
  },
  distribution_error: {
    diagnosis: "The multiplier was applied to x but not to every term in the parentheses.",
    feedback: "A factor outside parentheses multiplies both terms inside.",
    nextPrompt: "What is 3 · x, and what is 3 · (-2)?",
  },
  inverse_operation_error: {
    diagnosis: "The inverse operations were used in an order that changed the equation.",
    feedback: "Treat x - 2 as one object before undoing the subtraction.",
    nextPrompt: "What happens if you divide both sides by 3 first?",
  },
  arithmetic_error: {
    diagnosis: "Your equation setup is useful, but an arithmetic step changed the value.",
    feedback: "The structure is right; recheck the step after 3x - 6 = 12.",
    nextPrompt: "What must be added to both sides before dividing by 3?",
  },
  unclear_reasoning: {
    diagnosis: "I cannot yet see which operation your attempt is based on.",
    feedback: "Write one transformation so we can inspect the reasoning, not only the result.",
    nextPrompt: "What is the first operation you would undo on the left side, and why?",
  },
};

export function evaluateDemoTurn(context: TutorContext): TutorTurn {
  const { attemptNumber, currentStage, learnerAttempt } = context;

  if (currentStage === "transfer") {
    if (hasAnswer(learnerAttempt, 4)) {
      return {
        stage: "complete",
        misconception: "correct",
        diagnosis: "You transferred the same inverse-operation strategy to a new equation.",
        feedback: "That independent solution is the evidence of learning we were looking for.",
        nextPrompt: "Explain in one sentence why the order of inverse operations mattered.",
        intervention: "celebration",
        hintLevel: 0,
        isCorrect: true,
        revealAnswer: false,
      };
    }

    return {
      stage: "transfer",
      misconception: "unclear_reasoning",
      diagnosis: "The transfer answer does not yet preserve the equation's balance.",
      feedback: "Use the same strategy as before, but do this one independently.",
      nextPrompt: "Which operation around x should be undone first?",
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  const misconception = classifyAttempt(learnerAttempt);

  if (misconception === "no_attempt") {
    return {
      stage: "attempt",
      misconception,
      diagnosis: "There is not enough work yet to diagnose a misconception.",
      feedback: "A first attempt gives the tutor something meaningful to respond to.",
      nextPrompt: "Write your first step, even if you are unsure.",
      intervention: "request_attempt",
      hintLevel: 0,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  if (misconception === "correct") {
    return {
      stage: "transfer",
      misconception,
      diagnosis: "Your transformations keep both sides balanced and isolate x correctly.",
      feedback: "Now we need evidence that the method transfers beyond this example.",
      nextPrompt: DEMO_PROBLEM.transferProblem.prompt,
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
      revealAnswer: false,
    };
  }

  const firstHint = FIRST_HINTS[misconception];

  if (attemptNumber <= 1) {
    return {
      stage: "guided_retry",
      misconception,
      ...firstHint,
      intervention: "socratic_question",
      hintLevel: 1,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  if (attemptNumber === 2) {
    return {
      stage: "guided_retry",
      misconception,
      diagnosis: firstHint.diagnosis,
      feedback: "Use the equation's structure: first undo multiplication, then undo subtraction.",
      nextPrompt: "Complete only the next line: x - 2 = __.",
      intervention: "concept_cue",
      hintLevel: 2,
      isCorrect: false,
      revealAnswer: false,
    };
  }

  return {
    stage: "guided_retry",
    misconception,
    diagnosis: firstHint.diagnosis,
    feedback: "Here is one bounded micro-step: dividing both sides by 3 gives x - 2 = 4.",
    nextPrompt: "Finish the final inverse operation yourself.",
    intervention: "worked_micro_step",
    hintLevel: 3,
    isCorrect: false,
    revealAnswer: false,
  };
}
