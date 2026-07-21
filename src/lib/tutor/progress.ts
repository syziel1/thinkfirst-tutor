import type { TutorStage, TutorTurn } from "./types";

export type LearningProgressState =
  | "current"
  | "complete"
  | "waiting"
  | "used"
  | "skipped"
  | "needs-check";

export interface LearningProgressItem {
  key: "attempt" | "diagnose" | "guide" | "transfer";
  label: string;
  state: LearningProgressState;
  status: string;
}

interface LearningProgressEvidence {
  stage: TutorStage;
  hasVisibleAttempt: boolean;
  hasHelpInteraction: boolean;
  hasTutorResponse: boolean;
  guidanceUsed: boolean;
}

const MAIN_STAGES = new Set<TutorStage>([
  "attempt",
  "diagnosis",
  "guided_retry",
]);

export function deriveLearningProgress({
  stage,
  hasVisibleAttempt,
  hasHelpInteraction,
  hasTutorResponse,
  guidanceUsed,
}: LearningProgressEvidence): LearningProgressItem[] {
  const isMain = MAIN_STAGES.has(stage);
  const isTransfer = stage === "transfer";
  const isIndependentComplete = stage === "complete";
  const isAssistedComplete = stage === "assisted_complete";

  const attempt: LearningProgressItem = hasVisibleAttempt
    ? { key: "attempt", label: "Your try", state: "complete", status: "Done" }
    : hasHelpInteraction
      ? {
          key: "attempt",
          label: "Your try",
          state: "waiting",
          status: "Still needed",
        }
      : {
          key: "attempt",
          label: "Your try",
          state: "current",
          status: hasTutorResponse ? "Still needed" : "Now",
        };

  const diagnose: LearningProgressItem = hasVisibleAttempt
    ? {
        key: "diagnose",
        label: "Diagnose",
        state: "complete",
        status: "Done",
      }
    : {
        key: "diagnose",
        label: "Diagnose",
        state: "waiting",
        status: "Waiting for attempt",
      };

  let guide: LearningProgressItem;
  if (isTransfer || isIndependentComplete) {
    guide = guidanceUsed
      ? { key: "guide", label: "Guide", state: "used", status: "Used" }
      : {
          key: "guide",
          label: "Guide",
          state: "skipped",
          status: "Not needed",
        };
  } else if (isAssistedComplete) {
    guide = { key: "guide", label: "Guide", state: "used", status: "Used" };
  } else if (hasVisibleAttempt || hasHelpInteraction) {
    guide = { key: "guide", label: "Guide", state: "current", status: "Now" };
  } else {
    guide = {
      key: "guide",
      label: "Guide",
      state: "skipped",
      status: "If needed",
    };
  }

  let transfer: LearningProgressItem;
  if (isIndependentComplete) {
    transfer = {
      key: "transfer",
      label: "Transfer",
      state: "complete",
      status: "Done",
    };
  } else if (isAssistedComplete) {
    transfer = {
      key: "transfer",
      label: "Transfer",
      state: "needs-check",
      status: "Fresh check needed",
    };
  } else if (isTransfer) {
    transfer = {
      key: "transfer",
      label: "Transfer",
      state: "current",
      status: "Now",
    };
  } else {
    transfer = {
      key: "transfer",
      label: "Transfer",
      state: "waiting",
      status: "Locked",
    };
  }

  // Keep incomplete evidence incomplete even if a malformed caller reports a
  // later stage. The route transition guard should prevent this in practice.
  if (!hasVisibleAttempt && !isMain) {
    attempt.state = hasHelpInteraction ? "waiting" : "current";
    attempt.status = hasHelpInteraction ? "Still needed" : "Now";
    diagnose.state = "waiting";
    diagnose.status = "Waiting for attempt";
    guide = hasHelpInteraction
      ? { key: "guide", label: "Guide", state: "current", status: "Now" }
      : {
          key: "guide",
          label: "Guide",
          state: "skipped",
          status: "If needed",
        };
    transfer = {
      key: "transfer",
      label: "Transfer",
      state: "waiting",
      status: "Locked",
    };
  }

  return [attempt, diagnose, guide, transfer];
}

export function nextAttemptNumber(
  currentAttemptNumber: number,
  turn: Pick<TutorTurn, "hintLevel" | "isCorrect">,
  hasVisibleWork = true,
) {
  if (!hasVisibleWork || turn.isCorrect || turn.hintLevel === 0) {
    return currentAttemptNumber;
  }

  return Math.min(currentAttemptNumber + 1, 10);
}
