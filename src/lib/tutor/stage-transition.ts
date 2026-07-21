import type { InterventionType, TutorStage, TutorTurn } from "./types";

const MAIN_STAGES = new Set<TutorStage>([
  "attempt",
  "diagnosis",
  "guided_retry",
]);
const TERMINAL_STAGES = new Set<TutorStage>(["complete", "assisted_complete"]);

export function canRequestTutorTurn(stage: TutorStage) {
  return !TERMINAL_STAGES.has(stage);
}

export function isAllowedTutorStageTransition(
  currentStage: TutorStage,
  nextStage: TutorStage,
  evidence: {
    hasVisibleWork: boolean;
    stageAssistanceUsed: boolean;
  },
) {
  if (!canRequestTutorTurn(currentStage)) return false;

  if (MAIN_STAGES.has(currentStage)) {
    return (
      MAIN_STAGES.has(nextStage) ||
      (nextStage === "transfer" && evidence.hasVisibleWork)
    );
  }

  if (currentStage !== "transfer") return false;
  if (nextStage === "transfer") return true;
  if (!evidence.hasVisibleWork) return false;
  if (nextStage === "complete") return !evidence.stageAssistanceUsed;
  if (nextStage === "assisted_complete") return evidence.stageAssistanceUsed;
  return false;
}

interface LiveTutorTurnGate {
  currentStage: TutorStage;
  liveTurn: TutorTurn;
  deterministicTurn?: TutorTurn;
  hasVisibleWork: boolean;
  stageAssistanceUsed: boolean;
}

function boundaryIntervention(stage: TutorStage): InterventionType | undefined {
  if (stage === "transfer" || stage === "assisted_complete") {
    return "transfer_check";
  }
  if (stage === "complete") return "celebration";
  return undefined;
}

export function isTutorAdvancementBoundary(
  currentStage: TutorStage,
  nextStage: TutorStage,
) {
  return (
    (MAIN_STAGES.has(currentStage) && nextStage === "transfer") ||
    (currentStage === "transfer" && TERMINAL_STAGES.has(nextStage))
  );
}

function isCoherentSuccessfulBoundary(turn: TutorTurn) {
  const expectedIntervention = boundaryIntervention(turn.stage);

  return (
    expectedIntervention !== undefined &&
    turn.isCorrect === true &&
    turn.misconception === "correct" &&
    turn.hintLevel === 0 &&
    turn.intervention === expectedIntervention
  );
}

export function isAllowedLiveTutorTurn({
  currentStage,
  liveTurn,
  deterministicTurn,
  hasVisibleWork,
  stageAssistanceUsed,
}: LiveTutorTurnGate) {
  if (
    !isAllowedTutorStageTransition(currentStage, liveTurn.stage, {
      hasVisibleWork,
      stageAssistanceUsed,
    })
  ) {
    return false;
  }

  if (!isTutorAdvancementBoundary(currentStage, liveTurn.stage)) return true;

  return (
    deterministicTurn !== undefined &&
    isCoherentSuccessfulBoundary(liveTurn) &&
    isCoherentSuccessfulBoundary(deterministicTurn) &&
    liveTurn.stage === deterministicTurn.stage
  );
}
