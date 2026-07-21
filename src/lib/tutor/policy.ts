import {
  formatExpandedExpression,
  formatInnerExpression,
  formatPartialDistribution,
  formatSignedTerm,
  getDemoProblem,
} from "./problems";
import type {
  InterventionType,
  LinearEquationParameters,
  MisconceptionCode,
  TutorContext,
  TutorTurn,
} from "./types";

type HintLevel = 1 | 2 | 3;
type CorrectStepKind = "divided_outer" | "expanded" | "balanced";
type GuidedMisconception = Exclude<
  MisconceptionCode,
  "no_attempt" | "correct" | "correct_intermediate"
>;
type Guidance = Pick<TutorTurn, "diagnosis" | "feedback" | "nextPrompt">;

interface AttemptClassification {
  misconception: MisconceptionCode;
  correctStep?: CorrectStepKind;
}

const INTERVENTION_BY_LEVEL: Record<HintLevel, InterventionType> = {
  1: "socratic_question",
  2: "concept_cue",
  3: "worked_micro_step",
};

function compactMath(value: string) {
  return value
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("×", "*")
    .replace(/\r?\n/g, ";")
    .replace(/\s+/g, "")
    .replace(/([0-9])\*x/g, "$1x")
    .trim();
}

const SAFE_SOLVED_VALUE_PREFIXES = [
  /^(?:answer|result|solution)(?:\s+is)?$/iu,
  /^i\s+(?:believe|calculated|conclude|found|got|think)(?:\s+(?:that|the\s+answer\s+is))?$/iu,
  /^(?:my|the)\s+answer(?:\s+is)?$/iu,
  /^(?:so|then|therefore|thus)$/iu,
  /^(?:that|this|which)\s+(?:gives|means)$/iu,
  /^we\s+(?:found|get|have)$/iu,
  /^after\s+(?:(?:adding|subtracting)\s+-?\d+(?:\.\d+)?(?:\s+(?:from|to)\s+(?:both\s+sides|each\s+side))?|(?:dividing|multiplying)(?:\s+(?:both\s+sides|each\s+side))?\s+by\s+-?\d+(?:\.\d+)?|simplifying(?:\s+(?:both\s+sides|the\s+(?:equation|expression)))?)$/iu,
  /^(?:czyli|więc|zatem)$/iu,
  /^(?:moja\s+)?odpowiedź(?:\s+to)?$/iu,
  /^(?:myślę|uważam)(?:,?\s+że)?$/iu,
  /^wynik(?:\s+to)?$/iu,
];
const SAFE_SOLVED_VALUE_STEP_PREFIX =
  /^(?:then\s+)?(?:(?:add|subtract)\s+-?\d+(?:\.\d+)?(?:\s+(?:from|to)\s+(?:both\s+sides|each\s+side))?|(?:divide|multiply)(?:\s+(?:both\s+sides|each\s+side))?\s+by\s+-?\d+(?:\.\d+)?)$/iu;

function hasStandaloneSolvedLeftSide(value: string, xIndex: number) {
  const beforeAssignment = value.slice(0, xIndex);
  const lastBoundary = Math.max(
    beforeAssignment.lastIndexOf("\n"),
    beforeAssignment.lastIndexOf("\r"),
    beforeAssignment.lastIndexOf(";"),
  );
  const prefix = beforeAssignment.slice(lastBoundary + 1).trim();

  if (prefix === "") return true;

  const hasTrailingColon = prefix.endsWith(":");
  const prefixWithoutTrailingSeparator = prefix
    .replace(/[,:.!?]$/u, "")
    .trim();
  const trailingClause =
    prefixWithoutTrailingSeparator.split(/[,:.!?]/u).at(-1)?.trim() ?? "";

  // Only known explanatory labels may precede an isolated assignment without
  // punctuation. This keeps "I think x = ..." usable without treating word
  // operators such as "minus x" or "sin x" as a standalone left side.
  return (
    SAFE_SOLVED_VALUE_PREFIXES.some((pattern) => pattern.test(trailingClause)) ||
    (hasTrailingColon && SAFE_SOLVED_VALUE_STEP_PREFIX.test(trailingClause))
  );
}

function includeBalancedAssignmentWrappers(
  value: string,
  startIndex: number,
  endIndex: number,
) {
  let start = startIndex;
  let end = endIndex;

  while (true) {
    let openingIndex = start - 1;
    while (openingIndex >= 0 && /\s/u.test(value[openingIndex])) {
      openingIndex -= 1;
    }

    let closingIndex = end;
    while (closingIndex < value.length && /\s/u.test(value[closingIndex])) {
      closingIndex += 1;
    }

    if (value[openingIndex] !== "(" || value[closingIndex] !== ")") break;

    start = openingIndex;
    end = closingIndex + 1;
  }

  return { start, end };
}

function hasSeparatedAssignmentWrapper(
  value: string,
  wrapperStart: number,
  assignmentStart: number,
) {
  if (wrapperStart === assignmentStart || wrapperStart === 0) return true;

  return /[\s;,:.!?]/u.test(value[wrapperStart - 1]);
}

const EXPLANATION_CONNECTOR =
  /^(?:and|as|because|bo|czyli|is|ponieważ|since|so|then|therefore|which|więc|zatem)(?:$|[\t ]+)/iu;
const PROSE_TRANSITION =
  /^(?:because|now|since|so|then|therefore|thus|bo|ponieważ|więc|zatem)[\t ]+/iu;
const FINITE_NUMBER_SOURCE = "-?\\d+(?:\\.\\d+)?";
const EQUATION_SIDES_SOURCE = "(?:both\\s+sides|each\\s+side)";
const ADD_OR_SUBTRACT_ACTION = `(?:added|subtracted)\\s+${FINITE_NUMBER_SOURCE}(?:\\s+(?:from|to)\\s+(?:${EQUATION_SIDES_SOURCE}|${FINITE_NUMBER_SOURCE}))?`;
const DIVIDE_OR_MULTIPLY_ACTION = `(?:divided|multiplied)(?:\\s+${EQUATION_SIDES_SOURCE})?\\s+by\\s+${FINITE_NUMBER_SOURCE}`;
const SOLVING_ACTION = `(?:${ADD_OR_SUBTRACT_ACTION}|${DIVIDE_OR_MULTIPLY_ACTION})`;
const ACTION_SEQUENCE_SEPARATOR = "(?:\\s+and(?:\\s+then)?\\s+|,\\s*then\\s+)";
const ADD_OR_SUBTRACT_GERUND_ACTION = `(?:adding|subtracting)\\s+${FINITE_NUMBER_SOURCE}(?:\\s+(?:from|to)\\s+(?:${EQUATION_SIDES_SOURCE}|${FINITE_NUMBER_SOURCE}))?`;
const DIVIDE_OR_MULTIPLY_GERUND_ACTION = `(?:dividing|multiplying)(?:\\s+${EQUATION_SIDES_SOURCE})?\\s+by\\s+${FINITE_NUMBER_SOURCE}`;
const SOLVING_GERUND_ACTION = `(?:${ADD_OR_SUBTRACT_GERUND_ACTION}|${DIVIDE_OR_MULTIPLY_GERUND_ACTION})`;
const INVALID_ZERO_OPERATION =
  /\b(?:divide|divided|dividing|multiply|multiplied|multiplying)(?:\s+(?:both\s+sides|each\s+side))?\s+by\s+-?0+(?:\.0+)?(?=$|[\s,:;!?]|\.(?!\d))/iu;
const SAFE_PROSE_CONTINUATIONS = [
  new RegExp(
    `^i\\s+${SOLVING_ACTION}(?:${ACTION_SEQUENCE_SEPARATOR}${SOLVING_ACTION})?(?:\\s+to\\s+isolate\\s+x)?(?:[.!?])?$`,
    "iu",
  ),
  /^i\s+(?:calculated|checked|confirmed|found|verified)\s+(?:it|that|the\s+(?:answer|result|solution)|this|x)(?:\s+by\s+(?:substitution|working\s+backward))?(?:[.!?])?$/iu,
  /^i\s+(?:believe|conclude|think)\s+(?:that\s+)?(?:the\s+(?:answer|result|solution)|this|x)(?:\s+is\s+correct)?(?:[.!?])?$/iu,
  new RegExp(
    `^we\\s+${SOLVING_ACTION}(?:${ACTION_SEQUENCE_SEPARATOR}${SOLVING_ACTION})?(?:\\s+to\\s+isolate\\s+x)?(?:[.!?])?$`,
    "iu",
  ),
  /^we\s+(?:calculated|checked|confirmed|found|verified)\s+(?:it|that|the\s+(?:answer|result|solution)|this|x)(?:\s+by\s+(?:substitution|working\s+backward))?(?:[.!?])?$/iu,
  /^(?:it|that|this)\s+(?:confirms|gives|is|means|shows)\s+(?:that\s+)?(?:correct|the\s+(?:answer|result|solution)|this|x)(?:[.!?])?$/iu,
  /^is\s+correct(?:[.!?])?$/iu,
  /^(?:the\s+)?(?:answer|result|solution)(?:[.!?])?$/iu,
  /^(?:the\s+)?(?:answer|result|solution)\s+(?:is|was)\s+correct(?:[.!?])?$/iu,
  /^x\s+(?:is|was)\s+(?:correct|isolated)(?:[.!?])?$/iu,
  /^(?:checked|confirmed|verified)\s+by\s+(?:substitution|working\s+backward)(?:[.!?])?$/iu,
  /^(?:correct|done)(?:[.!?])?$/iu,
  /^(?:isolates|shows)\s+x(?:[.!?])?$/iu,
  new RegExp(
    `^after\\s+(?:${SOLVING_GERUND_ACTION}|simplifying(?:\\s+(?:both\\s+sides|the\\s+(?:equation|expression)))?)(?:,?\\s+(?:it\\s+)?(?:isolates|shows)\\s+x)?(?:[.!?])?$`,
    "iu",
  ),
  /^(?:dodałam|dodałem|odjęłam|odjąłem)\s+-?\d+(?:\.\d+)?(?:[.!?])?$/iu,
  /^x\s+jest\s+poprawne(?:[.!?])?$/iu,
];
const SAFE_VALUE_PROSE_CONTINUATIONS = [
  new RegExp(
    `^i\\s+(?:calculated|checked|confirmed|found|got|verified)\\s+(?:it|that|the\\s+(?:answer|result|solution)|this|x)\\s+by\\s+substituting\\s+(?<value>${FINITE_NUMBER_SOURCE})(?:[.!?])?$`,
    "iu",
  ),
  new RegExp(
    `^i\\s+got\\s+(?<value>${FINITE_NUMBER_SOURCE})(?:[.!?])?$`,
    "iu",
  ),
  new RegExp(
    `^(?:the\\s+)?(?:answer|result|solution)\\s+(?:is|was)\\s+(?<value>${FINITE_NUMBER_SOURCE})(?:[.!?])?$`,
    "iu",
  ),
  new RegExp(
    `^x\\s+(?:equals|is|was)\\s+(?<value>${FINITE_NUMBER_SOURCE})(?:[.!?])?$`,
    "iu",
  ),
  new RegExp(
    `^x\\s+(?:jest|wynosi)\\s+(?<value>${FINITE_NUMBER_SOURCE})(?:[.!?])?$`,
    "iu",
  ),
];

function hasControlledProseContinuation(
  value: string,
  solvedResult: number,
): boolean {
  let continuation = value.trimStart();
  const transition = PROSE_TRANSITION.exec(continuation)?.[0];
  if (transition) continuation = continuation.slice(transition.length);

  if (SAFE_PROSE_CONTINUATIONS.some((pattern) => pattern.test(continuation))) {
    return true;
  }

  return SAFE_VALUE_PROSE_CONTINUATIONS.some((pattern) => {
    const claimedValue = pattern.exec(continuation)?.groups?.value;
    return (
      claimedValue !== undefined &&
      isSameNumber(Number(claimedValue), solvedResult)
    );
  });
}

function hasSafeBoundaryContinuation(
  remainder: string,
  solvedResult: number,
): boolean {
  let continuation = remainder;
  let foundBoundary = false;

  while (true) {
    continuation = continuation.replace(/^[\t ]+/u, "");

    if (continuation.startsWith("\r\n")) {
      continuation = continuation.slice(2);
    } else if (
      continuation.startsWith("\n") ||
      continuation.startsWith("\r") ||
      continuation.startsWith(";")
    ) {
      continuation = continuation.slice(1);
    } else {
      break;
    }

    foundBoundary = true;
  }

  if (!foundBoundary) return false;

  continuation = continuation.replace(/^[\t ]+/u, "");
  return (
    continuation === "" ||
    hasControlledProseContinuation(continuation, solvedResult)
  );
}

function hasExplanationConnectorContinuation(
  value: string,
  solvedResult: number,
): boolean {
  const connector = EXPLANATION_CONNECTOR.exec(value)?.[0];
  if (!connector) return false;

  const continuation = value.slice(connector.length);
  return (
    continuation === "" ||
    hasControlledProseContinuation(continuation, solvedResult)
  );
}

function hasSentencePunctuationTerminator(
  remainder: string,
  solvedResult: number,
): boolean {
  if (!/^[.!?]/u.test(remainder)) return false;

  const afterPunctuation = remainder.slice(1);
  if (afterPunctuation === "") return true;

  if (hasSafeBoundaryContinuation(afterPunctuation, solvedResult)) return true;

  const horizontalSpace = /^[\t ]+/u.exec(afterPunctuation)?.[0];
  if (!horizontalSpace) return false;

  const continuation = afterPunctuation.slice(horizontalSpace.length);
  if (continuation === "") return true;
  if (hasSafeBoundaryContinuation(continuation, solvedResult)) return true;

  return hasControlledProseContinuation(continuation, solvedResult);
}

function hasSolvedExpressionTerminator(
  remainder: string,
  solvedResult: number,
): boolean {
  const leadingSpace = /^[\t ]*/u.exec(remainder)?.[0] ?? "";
  const rest = remainder.slice(leadingSpace.length);

  if (rest === "") return true;

  if (hasSafeBoundaryContinuation(rest, solvedResult)) return true;

  if (hasSentencePunctuationTerminator(rest, solvedResult)) return true;

  if (/^[,:]$/u.test(rest)) return true;

  if (/^[,:][\r\n;]/u.test(rest)) {
    return hasSafeBoundaryContinuation(rest.slice(1), solvedResult);
  }

  if (/^[,:][\t ]+/u.test(rest)) {
    const afterPunctuation = rest.replace(/^[,:][\t ]+/u, "");
    return hasExplanationConnectorContinuation(afterPunctuation, solvedResult);
  }

  return (
    leadingSpace.length > 0 &&
    hasExplanationConnectorContinuation(rest, solvedResult)
  );
}

function phraseKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNoAttempt(value: string) {
  const key = phraseKey(value);
  const noAttemptPhrases = new Set([
    "",
    "x",
    "idk",
    "idontknow",
    "dontknow",
    "notsure",
    "unsure",
    "help",
    "helpme",
    "niewiem",
    "niewiemjak",
    "niewiemjakzaczac",
    "nieumiem",
    "pomocy",
  ]);

  return noAttemptPhrases.has(key);
}

function isSameNumber(actual: number, expected: number) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;

  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  return Math.abs(actual - expected) <= Number.EPSILON * scale * 4;
}

function numericExpressionValue(expression: string) {
  const match =
    /^(-?\d+(?:\.\d+)?)(?:([+*/-])(-?\d+(?:\.\d+)?))?$/.exec(
      expression,
    );
  if (!match) return undefined;

  const left = Number(match[1]);
  const operator = match[2];
  const right = match[3] === undefined ? undefined : Number(match[3]);
  if (!Number.isFinite(left)) return undefined;
  if (operator === undefined) return left;
  if (right === undefined || !Number.isFinite(right)) return undefined;

  let result: number;
  switch (operator) {
    case "+":
      result = left + right;
      break;
    case "-":
      result = left - right;
      break;
    case "*":
      result = left * right;
      break;
    case "/":
      if (right === 0) return undefined;
      result = left / right;
      break;
    default:
      return undefined;
  }

  return Number.isFinite(result) ? result : undefined;
}

function solvedValue(value: string) {
  const normalized = value
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("×", "*");
  if (INVALID_ZERO_OPERATION.test(normalized)) return undefined;

  const numericExpression = `${FINITE_NUMBER_SOURCE}(?:[\\t ]*[+*/-][\\t ]*${FINITE_NUMBER_SOURCE})?`;
  const assignmentStartPattern = new RegExp(
    "(?<![\\p{L}\\p{N}_])x(?![\\p{L}\\p{N}_])[\\t ]*=",
    "giu",
  );
  const assignmentPattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])x(?![\\p{L}\\p{N}_])[\\t ]*=[\\t ]*(${numericExpression})`,
    "giu",
  );
  const finalAssignmentStart = [
    ...normalized.matchAll(assignmentStartPattern),
  ].at(-1)?.index;
  const finalAssignment = [...normalized.matchAll(assignmentPattern)].at(-1);

  if (
    finalAssignmentStart !== undefined &&
    finalAssignment?.index !== finalAssignmentStart
  ) {
    return undefined;
  }

  if (finalAssignment) {
    const matchIndex = finalAssignment.index;
    const expression = finalAssignment[1];
    const evaluatedExpression = numericExpressionValue(compactMath(expression));
    if (evaluatedExpression === undefined) return undefined;

    const expressionEnd = matchIndex + finalAssignment[0].length;
    const assignmentBounds = includeBalancedAssignmentWrappers(
      normalized,
      matchIndex,
      expressionEnd,
    );

    if (
      hasSeparatedAssignmentWrapper(
        normalized,
        assignmentBounds.start,
        matchIndex,
      ) &&
      hasStandaloneSolvedLeftSide(normalized, assignmentBounds.start) &&
      hasSolvedExpressionTerminator(
        normalized.slice(assignmentBounds.end),
        evaluatedExpression,
      )
    ) {
      return evaluatedExpression;
    }

    return undefined;
  }

  return numericExpressionValue(compactMath(normalized));
}

function hasEquation(value: string, left: string, right: string | number) {
  const normalized = compactMath(value);
  const compactLeft = compactMath(left);
  const compactRight = compactMath(String(right));
  const leftPattern = escapeRegExp(compactLeft);
  const rightPattern = escapeRegExp(compactRight);

  return (
    new RegExp(
      `(?<![0-9.])${leftPattern}=${rightPattern}(?![0-9./])`,
    ).test(normalized) ||
    new RegExp(
      `(?<![0-9.])${rightPattern}=${leftPattern}(?![0-9.])`,
    ).test(normalized)
  );
}

function coefficientValues(
  value: string,
  equation: LinearEquationParameters,
) {
  const normalized = compactMath(value);
  const matcher = new RegExp(
    `(?<![0-9.])${equation.multiplier}x=(-?\\d+(?:\\.\\d+)?)(?![0-9.])`,
    "g",
  );

  return [...normalized.matchAll(matcher)].map((match) => Number(match[1]));
}

function classifyAttempt(
  attempt: string,
  equation: LinearEquationParameters,
): AttemptClassification {
  if (isNoAttempt(attempt)) return { misconception: "no_attempt" };

  const value = compactMath(attempt);
  const innerExpression = formatInnerExpression(equation);
  const innerValue = equation.solution + equation.offset;
  const expandedExpression = formatExpandedExpression(equation);
  const balancedRightSide = equation.multiplier * equation.solution;
  const partialDistribution = formatPartialDistribution(equation);
  const isolatedValue = solvedValue(attempt);
  const coefficients = coefficientValues(value, equation);
  const hasUndistributedOffsetResult = coefficients.some((candidate) =>
    isSameNumber(candidate, equation.rightSide - equation.offset),
  );
  const hasWrongCoefficientValue = coefficients.some(
    (candidate) => !isSameNumber(candidate, balancedRightSide),
  );
  const hasCorrectExpansion = hasEquation(
    value,
    expandedExpression,
    equation.rightSide,
  );

  if (hasEquation(value, partialDistribution, equation.rightSide)) {
    return { misconception: "distribution_error" };
  }

  if (hasUndistributedOffsetResult) {
    return { misconception: "distribution_error" };
  }

  if (
    hasWrongCoefficientValue ||
    (hasCorrectExpansion &&
      isolatedValue !== undefined &&
      !isSameNumber(isolatedValue, equation.solution))
  ) {
    return { misconception: "arithmetic_error" };
  }

  if (
    isolatedValue !== undefined &&
    isSameNumber(isolatedValue, equation.solution)
  ) {
    return { misconception: "correct" };
  }

  if (
    isolatedValue !== undefined &&
    isSameNumber(isolatedValue, innerValue)
  ) {
    return { misconception: "stopped_too_early" };
  }

  if (
    hasEquation(value, innerExpression, innerValue) ||
    hasEquation(
      value,
      innerExpression,
      `${equation.rightSide}/${equation.multiplier}`,
    )
  ) {
    return {
      misconception: "correct_intermediate",
      correctStep: "divided_outer",
    };
  }

  if (
    hasEquation(
      value,
      `${equation.multiplier}x`,
      balancedRightSide,
    )
  ) {
    return {
      misconception: "correct_intermediate",
      correctStep: "balanced",
    };
  }

  if (hasCorrectExpansion) {
    return {
      misconception: "correct_intermediate",
      correctStep: "expanded",
    };
  }

  if (isolatedValue !== undefined) {
    const likelyInverseErrors = new Set([
      innerValue + equation.offset,
      equation.rightSide + equation.offset,
      equation.offset,
      -equation.solution,
    ]);

    if (
      [...likelyInverseErrors].some((candidate) =>
        isSameNumber(isolatedValue, candidate),
      )
    ) {
      return { misconception: "inverse_operation_error" };
    }
  }

  if (
    new RegExp(
      `x=${escapeRegExp(String(equation.rightSide))}/${escapeRegExp(
        String(equation.multiplier),
      )}${equation.offset < 0 ? "-" : "\\+"}${Math.abs(equation.offset)}`,
    ).test(value)
  ) {
    return { misconception: "inverse_operation_error" };
  }

  return { misconception: "unclear_reasoning" };
}

function hintLevel(attemptNumber: number): HintLevel {
  return Math.min(Math.max(attemptNumber, 1), 3) as HintLevel;
}

function inverseAction(value: number) {
  const amount = Math.abs(value);
  return value < 0
    ? {
        verb: "add" as const,
        past: "added to" as const,
        symbol: "+" as const,
        amount,
      }
    : {
        verb: "subtract" as const,
        past: "subtracted from" as const,
        symbol: "-" as const,
        amount,
      };
}

function correctIntermediateGuidance(
  equation: LinearEquationParameters,
  kind: CorrectStepKind,
  level: HintLevel,
): Guidance {
  const innerExpression = formatInnerExpression(equation);
  const innerValue = equation.solution + equation.offset;
  const expandedExpression = formatExpandedExpression(equation);
  const expandedConstant = equation.multiplier * equation.offset;
  const balancedRightSide = equation.multiplier * equation.solution;
  const innerAction = inverseAction(equation.offset);
  const expandedAction = inverseAction(expandedConstant);

  if (kind === "divided_outer") {
    if (level === 1) {
      return {
        diagnosis: `You correctly divided both sides by ${equation.multiplier} and reached ${innerExpression} = ${innerValue}.`,
        feedback: "That is a valid intermediate equation; x is not isolated yet.",
        nextPrompt: "Which inverse operation now isolates x?",
      };
    }

    if (level === 2) {
      return {
        diagnosis: `The step ${innerExpression} = ${innerValue} is correct, and one inverse operation remains.`,
        feedback: `Undo ${formatSignedTerm(equation.offset)} by ${innerAction.verb}ing ${innerAction.amount} on both sides.`,
        nextPrompt: `What should be ${innerAction.past} both sides?`,
      };
    }

    return {
      diagnosis: "The division step is correct; only the inner operation remains to undo.",
      feedback: `One bounded micro-step gives x = ${innerValue} ${innerAction.symbol} ${innerAction.amount}.`,
      nextPrompt: "Simplify the right side yourself.",
    };
  }

  if (kind === "expanded") {
    if (level === 1) {
      return {
        diagnosis: `You correctly distributed ${equation.multiplier} and reached ${expandedExpression} = ${equation.rightSide}.`,
        feedback: "This preserves equality and moves toward isolating x.",
        nextPrompt: `Which inverse operation should undo ${formatSignedTerm(expandedConstant)} next?`,
      };
    }

    if (level === 2) {
      return {
        diagnosis: `The expansion ${expandedExpression} = ${equation.rightSide} is correct.`,
        feedback: `Undo ${formatSignedTerm(expandedConstant)} by ${expandedAction.verb}ing ${expandedAction.amount} on both sides.`,
        nextPrompt: `What is ${equation.rightSide} ${expandedAction.symbol} ${expandedAction.amount}?`,
      };
    }

    return {
      diagnosis: "The distribution step is correct; now keep the equation balanced.",
      feedback: `One bounded micro-step gives ${equation.multiplier}x = ${balancedRightSide}.`,
      nextPrompt: "Which operation now isolates x?",
    };
  }

  if (level === 1) {
    return {
      diagnosis: `You correctly kept the equation balanced and reached ${equation.multiplier}x = ${balancedRightSide}.`,
      feedback: "Only the coefficient on x remains to undo.",
      nextPrompt: `Which operation isolates x from ${equation.multiplier}x?`,
    };
  }

  if (level === 2) {
    return {
      diagnosis: `The equation ${equation.multiplier}x = ${balancedRightSide} is correct.`,
      feedback: `x is multiplied by ${equation.multiplier}, so use the matching inverse operation on both sides.`,
      nextPrompt: "What should both sides be divided by?",
    };
  }

  return {
    diagnosis: "The balancing step is correct; only the coefficient remains.",
    feedback: `One bounded micro-step gives x = ${balancedRightSide} / ${equation.multiplier}.`,
    nextPrompt: "Simplify the right side yourself.",
  };
}

function misconceptionGuidance(
  equation: LinearEquationParameters,
  misconception: GuidedMisconception,
  level: HintLevel,
): Guidance {
  const innerExpression = formatInnerExpression(equation);
  const innerValue = equation.solution + equation.offset;
  const expandedExpression = formatExpandedExpression(equation);
  const expandedConstant = equation.multiplier * equation.offset;
  const balancedRightSide = equation.multiplier * equation.solution;
  const expandedAction = inverseAction(expandedConstant);
  const innerAction = inverseAction(equation.offset);

  if (misconception === "stopped_too_early") {
    if (level === 1) {
      return {
        diagnosis: `You treated ${innerValue} as the value of x, but it is the value of ${innerExpression}.`,
        feedback: "The division step is useful; one inverse operation still remains.",
        nextPrompt: `If ${innerExpression} = ${innerValue}, what operation isolates x?`,
      };
    }

    if (level === 2) {
      return {
        diagnosis: `The value ${innerValue} belongs to ${innerExpression}, not to x by itself.`,
        feedback: `Use the inverse operation: ${innerAction.verb} ${innerAction.amount} on both sides.`,
        nextPrompt: `What should be ${innerAction.past} both sides?`,
      };
    }

    return {
      diagnosis: "One final inverse operation remains after the division step.",
      feedback: `One bounded micro-step gives x = ${innerValue} ${innerAction.symbol} ${innerAction.amount}.`,
      nextPrompt: "Simplify the right side yourself.",
    };
  }

  if (misconception === "distribution_error") {
    if (level === 1) {
      return {
        diagnosis: `The multiplier was applied to x but not to the ${formatSignedTerm(equation.offset)} term.`,
        feedback: `The factor ${equation.multiplier} multiplies every term inside the parentheses.`,
        nextPrompt: `What is ${equation.multiplier} · x, and what is ${equation.multiplier} · (${equation.offset})?`,
      };
    }

    if (level === 2) {
      return {
        diagnosis: "Every term inside the parentheses needs the outside multiplier.",
        feedback: `Distribute ${equation.multiplier} to both x and ${equation.offset}.`,
        nextPrompt: `Rewrite the left side as ${equation.multiplier}x ${formatSignedTerm(expandedConstant)}.`,
      };
    }

    return {
      diagnosis: "The distribution must include both terms inside the parentheses.",
      feedback: `One bounded micro-step is ${equation.multiplier}(${innerExpression}) = ${expandedExpression}.`,
      nextPrompt: `With ${expandedExpression} = ${equation.rightSide}, which inverse operation comes next?`,
    };
  }

  if (misconception === "inverse_operation_error") {
    if (level === 1) {
      return {
        diagnosis: "The inverse operations were used in an order that changed the equation.",
        feedback: `Treat ${innerExpression} as one object before undoing its inner operation.`,
        nextPrompt: `What happens if you divide both sides by ${equation.multiplier} first?`,
      };
    }

    if (level === 2) {
      return {
        diagnosis: `The outer operation is multiplying the whole expression ${innerExpression} by ${equation.multiplier}.`,
        feedback: "Undo the outer multiplication before working inside the parentheses.",
        nextPrompt: `After dividing both sides by ${equation.multiplier}, what equation remains?`,
      };
    }

    return {
      diagnosis: "The outer multiplication must be undone first.",
      feedback: `One bounded micro-step is dividing both sides by ${equation.multiplier} to get ${innerExpression} = ${innerValue}.`,
      nextPrompt: "Which final inverse operation isolates x?",
    };
  }

  if (misconception === "arithmetic_error") {
    if (level === 1) {
      return {
        diagnosis: "Your equation structure is useful, but an arithmetic step changed the value.",
        feedback: `Recheck the balance after reaching ${expandedExpression} = ${equation.rightSide}.`,
        nextPrompt: `What must be ${expandedAction.past} both sides before dividing by ${equation.multiplier}?`,
      };
    }

    if (level === 2) {
      return {
        diagnosis: "The expansion is useful, but the next arithmetic step is not balanced.",
        feedback: `${expandedAction.verb[0].toUpperCase()}${expandedAction.verb.slice(1)} ${expandedAction.amount} on both sides.`,
        nextPrompt: `What is ${equation.rightSide} ${expandedAction.symbol} ${expandedAction.amount}?`,
      };
    }

    return {
      diagnosis: `The arithmetic after ${expandedExpression} = ${equation.rightSide} changed the equation's balance.`,
      feedback: `One bounded micro-step gives ${equation.multiplier}x = ${balancedRightSide}.`,
      nextPrompt: "Which operation now isolates x?",
    };
  }

  if (level === 1) {
    return {
      diagnosis: "I cannot yet see which operation your attempt is based on.",
      feedback: "Write one balanced transformation so we can inspect the reasoning, not only the result.",
      nextPrompt: "What is the first operation you would undo on the left side, and why?",
    };
  }

  if (level === 2) {
    return {
      diagnosis: "The written step still does not show how both sides stay balanced.",
      feedback: `Treat ${innerExpression} as one object and undo the outer multiplication first.`,
      nextPrompt: `Write the equation after dividing both sides by ${equation.multiplier}.`,
    };
  }

  return {
    diagnosis: "The attempt needs one explicit balanced transformation.",
    feedback: `One bounded micro-step is dividing both sides by ${equation.multiplier} to get ${innerExpression} = ${innerValue}.`,
    nextPrompt: "Continue with one final inverse operation.",
  };
}

function noAttemptTurn(stage: "attempt" | "transfer"): TutorTurn {
  return {
    stage,
    misconception: "no_attempt",
    diagnosis: "There is not enough work yet to diagnose a misconception.",
    feedback: "A visible first step gives the tutor something meaningful to respond to.",
    nextPrompt:
      stage === "transfer"
        ? "Write your first independent step, even if you are unsure."
        : "Write your first step, even if you are unsure.",
    intervention: "request_attempt",
    hintLevel: 0,
    isCorrect: false,
    revealAnswer: false,
  };
}

function guidedTurn(
  classification: AttemptClassification,
  equation: LinearEquationParameters,
  attemptNumber: number,
  stage: "guided_retry" | "transfer",
): TutorTurn {
  const level = hintLevel(attemptNumber);
  const guidance =
    classification.misconception === "correct_intermediate"
      ? correctIntermediateGuidance(
          equation,
          classification.correctStep!,
          level,
        )
      : misconceptionGuidance(
          equation,
          classification.misconception as GuidedMisconception,
          level,
        );

  return {
    stage,
    misconception: classification.misconception,
    ...guidance,
    intervention: INTERVENTION_BY_LEVEL[level],
    hintLevel: level,
    isCorrect: false,
    revealAnswer: false,
  };
}

export function evaluateDemoTurn(context: TutorContext): TutorTurn {
  const { attemptNumber, currentStage, learnerAttempt, problemId } = context;
  const problem = getDemoProblem(problemId);

  if (!problem) {
    throw new Error(`Unknown demo problem: ${problemId}`);
  }

  const isTransfer = currentStage === "transfer";
  const equation = isTransfer
    ? problem.transferProblem.equation
    : problem.equation;
  const classification = classifyAttempt(learnerAttempt, equation);

  if (classification.misconception === "no_attempt") {
    return noAttemptTurn(isTransfer ? "transfer" : "attempt");
  }

  if (classification.misconception === "correct") {
    if (isTransfer) {
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
      misconception: "correct",
      diagnosis: "Your transformations keep both sides balanced and isolate x correctly.",
      feedback: "Now we need evidence that the method transfers beyond this example.",
      nextPrompt: problem.transferProblem.prompt,
      intervention: "transfer_check",
      hintLevel: 0,
      isCorrect: true,
      revealAnswer: false,
    };
  }

  return guidedTurn(
    classification,
    equation,
    attemptNumber,
    isTransfer ? "transfer" : "guided_retry",
  );
}
