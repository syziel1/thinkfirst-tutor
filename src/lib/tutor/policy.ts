import {
  formatExpandedExpression,
  formatInnerExpression,
  formatPartialDistribution,
  formatSignedTerm,
  getDemoProblem,
} from "./problems";
import type {
  InterventionType,
  ExpectedResponseType,
  LinearEquationParameters,
  MisconceptionCode,
  TutorContext,
  TutorTurn,
} from "./types";

type HintLevel = 1 | 2 | 3;
type CorrectStepKind =
  | "divided_outer"
  | "expanded"
  | "balanced"
  | "distribution_products";
type GuidedMisconception = Exclude<
  MisconceptionCode,
  "no_attempt" | "correct" | "correct_intermediate"
>;
type Guidance = Pick<TutorTurn, "diagnosis" | "feedback" | "nextPrompt">;

interface AttemptClassification {
  misconception: MisconceptionCode;
  correctStep?: CorrectStepKind;
  expectedResponse?: ExpectedResponseType;
  distributionProducts?: {
    coefficientCorrect: boolean;
    constantCorrect: boolean;
  };
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
    .replaceAll("－", "-")
    .replaceAll("＋", "+")
    .replaceAll("×", "*")
    .replaceAll("·", "*")
    .replaceAll("⋅", "*")
    .replaceAll("∗", "*")
    .replaceAll("＊", "*")
    .replaceAll("÷", "/")
    .replaceAll("∕", "/")
    .replaceAll("⁄", "/")
    .replaceAll("／", "/")
    .replaceAll("＝", "=")
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
const UNSIGNED_NUMERIC_LITERAL_SOURCE =
  "(?:0x[0-9a-f]+|0b[01]+|0o[0-7]+|(?:(?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))(?:e[+-]?\\d+)?)";
const SIGNED_NUMERIC_LITERAL_SOURCE = `[+-]?${UNSIGNED_NUMERIC_LITERAL_SOURCE}`;
const OPERATION_SIGN_SOURCE =
  "(?:(?:[+-]|negative|positive|plus|minus)\\s*)?";
const OPERATION_WRAPPER_OPEN_SOURCE = "[([{]";
const OPERATION_WRAPPER_CLOSE_SOURCE = "[)\\]}]";
const OPERATION_ATOM_SOURCE = `${OPERATION_SIGN_SOURCE}(?:${OPERATION_WRAPPER_OPEN_SOURCE}\\s*)*${OPERATION_SIGN_SOURCE}(?:zero\\b|${UNSIGNED_NUMERIC_LITERAL_SOURCE})(?:\\s*${OPERATION_WRAPPER_CLOSE_SOURCE})*`;
const OPERATION_OPERAND_SOURCE = `(?:${OPERATION_WRAPPER_OPEN_SOURCE}\\s*)*${OPERATION_ATOM_SOURCE}(?:\\s*[+*/-]\\s*${OPERATION_ATOM_SOURCE})?(?:\\s*${OPERATION_WRAPPER_CLOSE_SOURCE})*`;
const NUMERIC_LITERAL_PATTERN = new RegExp(
  SIGNED_NUMERIC_LITERAL_SOURCE,
  "giu",
);
const OPERATION_WORD_SOURCE =
  "(?:divide|divided|dividing|division|multiply|multiplied|multiplication|multiplying)";
const OPERATION_WORD_PREFIX_PATTERN = new RegExp(
  `^\\b${OPERATION_WORD_SOURCE}\\b`,
  "iu",
);
const BY_OPERAND_SEPARATOR_SOURCE =
  "\\bby(?=[\\s(:,+\\-\\[\\{.\\p{N}⁰¹²³⁴⁵⁶⁷⁸⁹])[\\s,:]*";
const OPERATION_BY_PATTERN = new RegExp(
  `\\b${OPERATION_WORD_SOURCE}\\b(?:(?!\\b${OPERATION_WORD_SOURCE}\\b|\\bx[\\t ]*=)[\\s\\S])*?${BY_OPERAND_SEPARATOR_SOURCE}`,
  "giu",
);
const COORDINATED_BY_TOKEN_SOURCE =
  "(?:actually|additionally|after|afterward|afterwards|again|also|and|as|but|consecutively|directly|eventually|fact|finally|followed|however|immediately|in|instead|later|more|next|one|only|rather|repeatedly|subsequently|successively|that|then|thereafter|time|turn|ultimately|well|yet)";
const COORDINATED_BY_SOURCE = `(?:(?:[,.;:!?–—-]\\s*)+|(?:[,.;:!?–—-]\\s*)*(?:\\b${COORDINATED_BY_TOKEN_SOURCE}\\b\\s+){0,4}\\b${COORDINATED_BY_TOKEN_SOURCE}\\b\\s*(?:[,.;:!?–—-]\\s*)*)(?:\\(\\s*)*${BY_OPERAND_SEPARATOR_SOURCE}`;
const COORDINATED_BY_PATTERN = new RegExp(COORDINATED_BY_SOURCE, "giu");
const CONTRAST_COORDINATED_BY_PATTERN = new RegExp(
  `^(?:[,.;:!?–—-]\\s*)*\\b(?:but|however|instead|only|rather|yet)\\b\\s*(?:\\b${COORDINATED_BY_TOKEN_SOURCE}\\b\\s*){0,4}(?:[,.;:!?–—-]\\s*|\\(\\s*)*${BY_OPERAND_SEPARATOR_SOURCE}`,
  "iu",
);
const OPERATION_OPERAND_PREFIX_PATTERN = new RegExp(
  `^(?<operand>${OPERATION_OPERAND_SOURCE})`,
  "iu",
);
const UNSAFE_OPERAND_CONTINUATION =
  /^(?:[()[\]{}+*/%^!=_-]|\p{N}|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾]|\.(?=\p{N})|e(?=[\t ]*[+-]?[\t ]*\p{N})|x(?=[\t ]*\p{N})|(?:add|added|divide|divided|division|exponent|minus|multiply|multiplied|multiplication|over|per|plus|power|subtract|subtracted|times|zero)\b)/iu;
const ADJACENT_UNSAFE_OPERAND_CONTINUATION =
  /^(?:[\p{L}\p{N}_%!=]|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾])/iu;
const ZERO_LIKE_OPERATION_OPERAND =
  /(?:\b(?:nil|nought|zero)\b|(?<![\p{L}\p{N}_.])(?:[+-]\s*)?(?:0+(?:\.0*)?(?:e[+-]?\d+)?|\.0+(?:e[+-]?\d+)?|0x0+|0b0+|0o0+)(?![\p{L}\p{N}_.]))/iu;
const EXPLICIT_NONZERO_OPERATION_OPERAND =
  /^(?:(?:a|the)\s+)?(?:(?:coefficient|factor|number|value)\s+)?(?:greater\s+than\s+zero|less\s+than\s+zero|non(?:-|\s+)zero|not\s+equal\s+to\s+zero|other\s+than\s+zero)(?:\s+(?:coefficient|factor|number|value))?$/iu;
const DESCRIBED_OPERATION_OPERAND_PREFIX =
  /^(?:\s*[([{]\s*)*(?:(?:a|an|approximately|coefficient|exactly|factor|minus|negative|nil|nought|not|number|plus|positive|precisely|the|value|zero)\b|[+-]?(?:\d|\.\d)|\p{N}|[⁰¹²³⁴⁵⁶⁷⁸⁹])/iu;
const EXPLICIT_NONZERO_PHRASE =
  /(?<!not\s)(?<!no\s)\b(?:non(?:-|\s+)zero|not\s+equal\s+to\s+zero|other\s+than\s+zero)\b/giu;
const ZERO_BASED_METADATA_PHRASE =
  /\b(?:example|line|method|step)\s+(?:0|zero)\b/giu;
const UNSAFE_OPERAND_TAIL_MARKER =
  /(?:\b(?:exponent|nil|nought|power|zero)\b|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾])/iu;
const OPERATION_OPERAND_CLAUSE_BOUNDARY =
  /(?:[\r\n,:;!?]|\.(?!\d)|\b(?:and|as|because|bo|czyli|ponieważ|since|so|then|therefore|thus|więc|zatem)\b|(?<![\p{L}\p{N}_])x[\t ]*=)/iu;
const OPERATION_STATEMENT_BOUNDARY =
  /(?:[\r\n,;!?]|\.(?!\d)|(?<![\p{L}\p{N}_])x[\t ]*=)/iu;
const NEGATED_OPERATION_CLAUSE_BOUNDARY = new RegExp(
  `(?:[\\r\\n,;!?]|\\.(?!\\d)|\\b(?:although|and|as|because|bo|but|czyli|however|ponieważ|since|so|then|therefore|though|thus|while|yet|więc|zatem)\\b|\\b${OPERATION_WORD_SOURCE}\\b|(?<![\\p{L}\\p{N}_])x[\\t ]*=)`,
  "iu",
);
const NEGATION_TOKEN_SOURCE =
  "(?:(?:can|could|did|do|does|must|should|will|would)\\s+not|(?:could|did|do|does|must|should|would)n[’']t|(?:can|won)[’']t|cannot|never|without|not(?:\\s+to)?)\\b";
const NEGATED_OPERATION_PREFIX = new RegExp(
  `\\b${NEGATION_TOKEN_SOURCE}\\s*$`,
  "iu",
);
const DOUBLE_NEGATED_OPERATION_PREFIX = new RegExp(
  `\\b${NEGATION_TOKEN_SOURCE}(?:(?!\\b(?:${OPERATION_WORD_SOURCE}|although|and|as|because|but|however|since|so|then|therefore|though|while|yet)\\b)[^.!?;\\r\\n])*?\\b${NEGATION_TOKEN_SOURCE}\\s*$`,
  "iu",
);
const BOUNDED_NUMERIC_EXPRESSION_PATTERN = new RegExp(
  `^(?<left>${SIGNED_NUMERIC_LITERAL_SOURCE})(?:\\s*(?<operator>[+*/-])\\s*(?<right>${SIGNED_NUMERIC_LITERAL_SOURCE}))?$`,
  "iu",
);
const NON_FINITE_LITERAL_PATTERN =
  /(?:∞|(?:^|[^\p{L}\p{N}_])[+-]?(?:inf(?:inite|inity)?|nan)(?![\p{L}\p{N}_]))/iu;
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

function hasOnlyFiniteNumericLiterals(value: string): boolean {
  return [...value.matchAll(NUMERIC_LITERAL_PATTERN)].every((match) =>
    Number.isFinite(numericLiteralValue(match[0])),
  );
}

function numericLiteralValue(value: string): number {
  const compactValue = value.replace(/\s+/gu, "").toLowerCase();
  if (/^[+-]?zero$/u.test(compactValue)) return 0;

  const sign = compactValue.startsWith("-") ? -1 : 1;
  const unsignedValue = compactValue.replace(/^[+-]/u, "");
  return sign * Number(unsignedValue);
}

interface ExactNumericLiteral {
  coefficient: string;
  exponent: bigint;
  isNegative: boolean;
  isZero: boolean;
}

function normalizeExactNumericLiteral(
  coefficient: string,
  exponent: bigint,
  isNegative: boolean,
): ExactNumericLiteral {
  let normalizedCoefficient = coefficient.replace(/^0+/u, "");
  if (normalizedCoefficient === "") {
    return {
      coefficient: "0",
      exponent: BigInt(0),
      isNegative: false,
      isZero: true,
    };
  }

  while (normalizedCoefficient.endsWith("0")) {
    normalizedCoefficient = normalizedCoefficient.slice(0, -1);
    exponent += BigInt(1);
  }

  return {
    coefficient: normalizedCoefficient,
    exponent,
    isNegative,
    isZero: false,
  };
}

function exactNumericLiteral(value: string): ExactNumericLiteral | undefined {
  const normalized = value.toLowerCase();
  const isNegative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/u, "");

  if (/^0[xbo]/u.test(unsigned)) {
    try {
      return normalizeExactNumericLiteral(
        BigInt(unsigned).toString(10),
        BigInt(0),
        isNegative,
      );
    } catch {
      return undefined;
    }
  }

  const decimal =
    /^(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/iu.exec(unsigned);
  if (!decimal) return undefined;

  const integer = decimal[1] ?? "";
  const fraction = decimal[1] === undefined ? (decimal[3] ?? "") : (decimal[2] ?? "");
  const coefficient = `${integer}${fraction}`;
  const exponent = BigInt(decimal[4] ?? "0") - BigInt(fraction.length);
  return normalizeExactNumericLiteral(coefficient, exponent, isNegative);
}

function decimalOrder(value: ExactNumericLiteral): bigint {
  return value.exponent + BigInt(value.coefficient.length - 1);
}

const MAXIMUM_ROUNDED_FINITE_INTEGER =
  BigInt(Number.MAX_VALUE) + BigInt(2) ** BigInt(970);

function withExactSign(
  value: ExactNumericLiteral,
  isNegative: boolean,
): ExactNumericLiteral {
  return { ...value, isNegative: value.isZero ? false : isNegative };
}

function addExactNumericLiterals(
  left: ExactNumericLiteral,
  right: ExactNumericLiteral,
  subtractRight: boolean,
): ExactNumericLiteral | undefined {
  const adjustedRight = withExactSign(
    right,
    subtractRight ? !right.isNegative : right.isNegative,
  );
  if (left.isZero) return adjustedRight;
  if (adjustedRight.isZero) return left;

  const commonExponent =
    left.exponent < adjustedRight.exponent
      ? left.exponent
      : adjustedRight.exponent;
  const leftShift = left.exponent - commonExponent;
  const rightShift = adjustedRight.exponent - commonExponent;
  const maximumAlignment = BigInt(5000);

  if (leftShift > maximumAlignment || rightShift > maximumAlignment) {
    const leftOrder = decimalOrder(left);
    const rightOrder = decimalOrder(adjustedRight);
    if (leftOrder === rightOrder) return undefined;
    return leftOrder > rightOrder ? left : adjustedRight;
  }

  const signedLeft =
    (left.isNegative ? BigInt(-1) : BigInt(1)) *
    BigInt(left.coefficient) *
    BigInt(10) ** leftShift;
  const signedRight =
    (adjustedRight.isNegative ? BigInt(-1) : BigInt(1)) *
    BigInt(adjustedRight.coefficient) *
    BigInt(10) ** rightShift;
  const sum = signedLeft + signedRight;

  return normalizeExactNumericLiteral(
    (sum < BigInt(0) ? -sum : sum).toString(10),
    commonExponent,
    sum < BigInt(0),
  );
}

function multiplyExactNumericLiterals(
  left: ExactNumericLiteral,
  right: ExactNumericLiteral,
): ExactNumericLiteral {
  return normalizeExactNumericLiteral(
    (BigInt(left.coefficient) * BigInt(right.coefficient)).toString(10),
    left.exponent + right.exponent,
    left.isNegative !== right.isNegative,
  );
}

function hasFiniteExactValue(value: ExactNumericLiteral): boolean {
  if (value.isZero) return true;

  const order = decimalOrder(value);
  if (order < BigInt(308)) return true;
  if (order > BigInt(308)) return false;

  let left = BigInt(value.coefficient);
  let right = MAXIMUM_ROUNDED_FINITE_INTEGER;
  if (value.exponent >= BigInt(0)) {
    left *= BigInt(10) ** value.exponent;
  } else {
    right *= BigInt(10) ** -value.exponent;
  }

  return left < right;
}

function hasFiniteExactRatio(
  numerator: ExactNumericLiteral,
  denominator: ExactNumericLiteral,
): boolean {
  const orderDifference = decimalOrder(numerator) - decimalOrder(denominator);
  if (orderDifference < BigInt(308)) return true;
  if (orderDifference > BigInt(309)) return false;

  const exponentDifference = numerator.exponent - denominator.exponent;
  let left = BigInt(numerator.coefficient);
  let right =
    BigInt(denominator.coefficient) * MAXIMUM_ROUNDED_FINITE_INTEGER;

  if (exponentDifference >= BigInt(0)) {
    left *= BigInt(10) ** exponentDifference;
  } else {
    right *= BigInt(10) ** -exponentDifference;
  }

  return left < right;
}

function isInvalidNumericExpression(
  left: string,
  operator?: string,
  right?: string,
): boolean {
  const exactLeft = exactNumericLiteral(left);
  if (!exactLeft) return true;
  if (operator === undefined) {
    return exactLeft.isZero || !hasFiniteExactValue(exactLeft);
  }
  if (right === undefined) return true;

  const exactRight = exactNumericLiteral(right);
  if (!exactRight) return true;

  switch (operator) {
    case "+": {
      const result = addExactNumericLiterals(exactLeft, exactRight, false);
      return !result || result.isZero || !hasFiniteExactValue(result);
    }
    case "-": {
      const result = addExactNumericLiterals(exactLeft, exactRight, true);
      return !result || result.isZero || !hasFiniteExactValue(result);
    }
    case "*": {
      const result = multiplyExactNumericLiterals(exactLeft, exactRight);
      return result.isZero || !hasFiniteExactValue(result);
    }
    case "/":
      return (
        exactLeft.isZero ||
        exactRight.isZero ||
        !hasFiniteExactRatio(exactLeft, exactRight)
      );
    default:
      return true;
  }
}

function hasBalancedOperationWrappers(value: string): boolean {
  const expectedClosers: string[] = [];
  const wrapperPairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
  };

  for (const character of value) {
    const expectedCloser = wrapperPairs[character];
    if (expectedCloser !== undefined) {
      expectedClosers.push(expectedCloser);
      continue;
    }

    if (")]}".includes(character) && expectedClosers.pop() !== character) {
      return false;
    }
  }

  return expectedClosers.length === 0;
}

function isInvalidParsedOperationOperand(operand: string): boolean {
  if (!hasBalancedOperationWrappers(operand)) return true;

  const compactOperand = operand
    .toLowerCase()
    .replace(/\b(?:negative|minus)\s+/gu, "-")
    .replace(/\b(?:positive|plus)\s+/gu, "+")
    .replace(/\bzero\b/gu, "0")
    .replace(/[()[\]{}\s]+/gu, "")
    .trim();
  const expression = BOUNDED_NUMERIC_EXPRESSION_PATTERN.exec(compactOperand);
  if (!expression?.groups) return true;

  const left = expression.groups.left;
  const operator = expression.groups.operator;
  const right = expression.groups.right;
  if (left === undefined) return true;

  return isInvalidNumericExpression(left, operator, right);
}

function boundedOperationClause(value: string): string {
  const trimmedValue = value.trimStart();
  const clauseEnd = OPERATION_OPERAND_CLAUSE_BOUNDARY.exec(trimmedValue)?.index;
  return trimmedValue.slice(0, clauseEnd ?? trimmedValue.length);
}

function boundedOperationStatement(value: string): string {
  const trimmedValue = value.trimStart();
  const statementEnd = OPERATION_STATEMENT_BOUNDARY.exec(trimmedValue)?.index;
  return trimmedValue.slice(0, statementEnd ?? trimmedValue.length);
}

function unicodeDecimalDigitValue(character: string): number | undefined {
  const compatibilityDigit = character.normalize("NFKC");
  if (/^[0-9]$/u.test(compatibilityDigit)) {
    return Number(compatibilityDigit);
  }
  if (!/^\p{Nd}$/u.test(character)) return undefined;

  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return undefined;

  let blockStart = codePoint;
  while (
    blockStart > 0 &&
    /^\p{Nd}$/u.test(String.fromCodePoint(blockStart - 1))
  ) {
    blockStart -= 1;
  }

  return (codePoint - blockStart) % 10;
}

function normalizeUnicodeDecimalDigits(value: string): string {
  return value.replace(/\p{Nd}/gu, (character) => {
    const digitValue = unicodeDecimalDigitValue(character);
    return digitValue === undefined ? character : String(digitValue);
  });
}

function normalizeOperationCompatibilityMarkers(value: string): string {
  return value.replace(/[^\u0000-\u007f]/gu, (character) => {
    const compatibilityMarker = character.normalize("NFKC");
    return compatibilityMarker === "." || /^e$/iu.test(compatibilityMarker)
      ? compatibilityMarker
      : character;
  });
}

function isUnicodeNumericZero(character: string): boolean {
  return (
    character.normalize("NFKC") === "0" ||
    unicodeDecimalDigitValue(character) === 0
  );
}

function hasZeroLikeOperationOperand(
  value: string,
  allowZeroBasedMetadata = false,
): boolean {
  const withoutMetadata = allowZeroBasedMetadata
    ? value.replace(ZERO_BASED_METADATA_PHRASE, "")
    : value;
  const operand = withoutMetadata.replace(EXPLICIT_NONZERO_PHRASE, "");
  return (
    ZERO_LIKE_OPERATION_OPERAND.test(operand) ||
    [...operand.matchAll(/\p{N}/gu)].some(
      (match) => isUnicodeNumericZero(match[0]),
    )
  );
}

function stripBalancedOuterOperationWrappers(value: string): string {
  let unwrapped = value.trim();
  const wrapperPairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
  };

  while (wrapperPairs[unwrapped[0]] === unwrapped.at(-1)) {
    unwrapped = unwrapped.slice(1, -1).trim();
  }

  return unwrapped;
}

function hasInvalidColonOperationOperand(value: string): boolean {
  const trailing = value.trimStart();
  if (!trailing.startsWith(":")) return false;

  const colonOperand = boundedOperationStatement(trailing.slice(1)).trim();
  const operandMatch = OPERATION_OPERAND_PREFIX_PATTERN.exec(colonOperand);
  const operand = operandMatch?.groups?.operand;
  if (!operandMatch || operand === undefined) {
    return hasZeroLikeOperationOperand(colonOperand);
  }

  const unparsed = colonOperand.slice(operandMatch[0].length).trim();
  if (unparsed !== "") {
    return (
      hasZeroLikeOperationOperand(unparsed) ||
      UNSAFE_OPERAND_CONTINUATION.test(unparsed)
    );
  }

  return isInvalidParsedOperationOperand(operand);
}

function hasInvalidOperationOperandAtStart(
  remainder: string,
  allowDescriptiveOperand = true,
): boolean {
  const operandMatch = OPERATION_OPERAND_PREFIX_PATTERN.exec(remainder);
  let operand = operandMatch?.groups?.operand;
  if (!operandMatch || operand === undefined) {
    const operandClause = boundedOperationClause(remainder);
    const hasDescribedOperandPrefix =
      DESCRIBED_OPERATION_OPERAND_PREFIX.test(operandClause);
    const unparsedNumericOperand = boundedOperationStatement(remainder)
      .replace(ZERO_BASED_METADATA_PHRASE, "")
      .replace(EXPLICIT_NONZERO_PHRASE, "");
    return (
      (allowDescriptiveOperand || hasDescribedOperandPrefix) &&
      !EXPLICIT_NONZERO_OPERATION_OPERAND.test(
        stripBalancedOuterOperationWrappers(operandClause),
      ) &&
      (hasZeroLikeOperationOperand(boundedOperationStatement(remainder), true) ||
        (hasDescribedOperandPrefix && /\p{N}/u.test(unparsedNumericOperand)))
    );
  }
  let operandLength = operandMatch[0].length;
  if (
    operand.endsWith(".") &&
    /^[\t ]+\p{L}/u.test(remainder.slice(operandLength))
  ) {
    operand = operand.slice(0, -1);
    operandLength -= 1;
  }
  if (isInvalidParsedOperationOperand(operand)) return true;

  const rawTrailing = remainder.slice(operandLength);
  if (ADJACENT_UNSAFE_OPERAND_CONTINUATION.test(rawTrailing)) return true;

  const trailing = rawTrailing.trimStart();
  if (UNSAFE_OPERAND_CONTINUATION.test(trailing)) return true;
  if (hasInvalidColonOperationOperand(trailing)) return true;
  const trailingClause = boundedOperationClause(rawTrailing);
  if (UNSAFE_OPERAND_TAIL_MARKER.test(trailingClause)) {
    return true;
  }

  return false;
}

function hasInvalidOperationOperand(value: string): boolean {
  const normalizedValue = normalizeUnicodeDecimalDigits(
    normalizeOperationCompatibilityMarkers(value),
  );

  return [...normalizedValue.matchAll(OPERATION_BY_PATTERN)].some((operationMatch) => {
    const operandStart =
      (operationMatch.index ?? 0) + operationMatch[0].length;
    const remainder = normalizedValue.slice(operandStart);
    if (hasInvalidOperationOperandAtStart(remainder)) return true;

    return [...remainder.matchAll(COORDINATED_BY_PATTERN)].some(
      (coordinatedMatch) => {
        const coordinatedOperandStart =
          (coordinatedMatch.index ?? 0) + coordinatedMatch[0].length;
        return hasInvalidOperationOperandAtStart(
          remainder.slice(coordinatedOperandStart),
          false,
        );
      },
    );
  });
}

function maskNegatedOperationClauses(value: string): string {
  const ranges = [...value.matchAll(OPERATION_BY_PATTERN)]
    .filter((match) => {
      const operationStart = match.index ?? 0;
      const prefix = value.slice(0, operationStart);
      return (
        NEGATED_OPERATION_PREFIX.test(prefix) &&
        !DOUBLE_NEGATED_OPERATION_PREFIX.test(prefix)
      );
    })
    .map((match) => {
      const operationStart = match.index ?? 0;
      const operationWordLength =
        OPERATION_WORD_PREFIX_PATTERN.exec(match[0])?.[0].length ?? 0;
      const operandStart = operationStart + match[0].length;
      const remainder = value.slice(operandStart);
      const clauseEnd =
        NEGATED_OPERATION_CLAUSE_BOUNDARY.exec(remainder)?.index ??
        remainder.length;
      const boundaryTail = remainder.slice(clauseEnd);
      const preserveOperationContext =
        CONTRAST_COORDINATED_BY_PATTERN.test(boundaryTail);

      return {
        start:
          operationStart +
          (preserveOperationContext ? operationWordLength : 0),
        end: operandStart + clauseEnd,
      };
    });

  return ranges.reduceRight(
    (maskedValue, range) =>
      `${maskedValue.slice(0, range.start)}${" ".repeat(
        range.end - range.start,
      )}${maskedValue.slice(range.end)}`,
    value,
  );
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

function normalizeMathOperators(value: string): string {
  return value
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("－", "-")
    .replaceAll("＋", "+")
    .replaceAll("×", "*")
    .replaceAll("·", "*")
    .replaceAll("⋅", "*")
    .replaceAll("∗", "*")
    .replaceAll("＊", "*")
    .replaceAll("÷", "/")
    .replaceAll("∕", "/")
    .replaceAll("⁄", "/")
    .replaceAll("／", "/")
    .replaceAll("＝", "=");
}

function solvedValue(value: string) {
  const normalized = normalizeMathOperators(value.toLowerCase());
  const numericValidationValue = maskNegatedOperationClauses(normalized);
  const compatibilityValidationValue = maskNegatedOperationClauses(
    normalizeMathOperators(normalized.normalize("NFKC")),
  );
  if (
    NON_FINITE_LITERAL_PATTERN.test(numericValidationValue) ||
    NON_FINITE_LITERAL_PATTERN.test(compatibilityValidationValue) ||
    !hasOnlyFiniteNumericLiterals(numericValidationValue) ||
    !hasOnlyFiniteNumericLiterals(compatibilityValidationValue) ||
    hasInvalidOperationOperand(numericValidationValue) ||
    hasInvalidOperationOperand(compatibilityValidationValue)
  ) {
    return undefined;
  }

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

function classifyDistributionProducts(
  attempt: string,
  equation: LinearEquationParameters,
): AttemptClassification | undefined {
  const normalized = attempt
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("×", "*")
    .replaceAll("·", "*")
    .trim();
  const match = /^([+-]?\d+(?:\.\d+)?)\s*\*?\s*x\s*(?:,|and)\s*([+-]?\d+(?:\.\d+)?)\s*[.!]?$/iu.exec(
    normalized,
  );

  if (!match) return undefined;

  const coefficientCorrect = isSameNumber(
    Number(match[1]),
    equation.multiplier,
  );
  const constantCorrect = isSameNumber(
    Number(match[2]),
    equation.multiplier * equation.offset,
  );

  if (coefficientCorrect && constantCorrect) {
    return {
      misconception: "correct_intermediate",
      correctStep: "distribution_products",
    };
  }

  return {
    misconception: "distribution_error",
    expectedResponse: "distribution_products",
    distributionProducts: { coefficientCorrect, constantCorrect },
  };
}

function classifyAttempt(
  attempt: string,
  equation: LinearEquationParameters,
  expectedResponse?: ExpectedResponseType | null,
): AttemptClassification {
  if (isNoAttempt(attempt)) return { misconception: "no_attempt" };

  if (expectedResponse === "distribution_products") {
    const products = classifyDistributionProducts(attempt, equation);
    if (products) return products;
  }

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

  if (kind === "distribution_products") {
    return {
      diagnosis: `You correctly found ${equation.multiplier}x and ${expandedConstant}.`,
      feedback:
        "Put those products back into the equation while keeping the right side unchanged.",
      nextPrompt: `What complete equation do you get after distributing ${equation.multiplier}?`,
    };
  }

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
  const level =
    classification.correctStep === "distribution_products"
      ? 1
      : hintLevel(attemptNumber);
  const guidance = classification.distributionProducts
    ? {
        diagnosis: classification.distributionProducts.coefficientCorrect
          ? `The x-product ${equation.multiplier}x is correct, but the constant product needs another check.`
          : classification.distributionProducts.constantCorrect
            ? "The constant product is correct, but the x-product needs another check."
            : "Both products need another check before they are put back into the equation.",
        feedback: `Multiply ${equation.multiplier} by each term inside the parentheses separately.`,
        nextPrompt: `What is ${equation.multiplier} · x, and what is ${equation.multiplier} · (${equation.offset})?`,
      }
    : classification.misconception === "correct_intermediate"
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
  const expectedResponse =
    classification.expectedResponse ??
    (classification.misconception === "distribution_error" && level === 1
      ? "distribution_products"
      : undefined);

  return {
    stage,
    misconception: classification.misconception,
    ...guidance,
    intervention: INTERVENTION_BY_LEVEL[level],
    hintLevel: level,
    isCorrect: false,
    revealAnswer: false,
    ...(expectedResponse ? { expectedResponse } : {}),
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
  const classification = classifyAttempt(
    learnerAttempt,
    equation,
    context.expectedResponse,
  );

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
