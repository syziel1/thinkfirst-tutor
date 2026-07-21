import type { LinearEquationParameters, TutorTurn } from "./types";

export type TutorSource =
  | "openai"
  | "deterministic-demo"
  | "deterministic-fallback"
  | "deterministic-safeguard";

export type VisibleEquationPart = "multiplier" | "offset" | "rightSide";

export const HELP_REVEAL_DELAY_MS = 8_000;

export const GUIDANCE_REVEAL_ORDER = [
  "learner",
  "diagnosis",
  "feedback",
  "nextPrompt",
  "evidence",
] as const;

export type GuidanceRevealStep = (typeof GUIDANCE_REVEAL_ORDER)[number];

const GUIDANCE_REVEAL_DELAYS_MS: Record<GuidanceRevealStep, number> = {
  learner: 0,
  diagnosis: 100,
  feedback: 260,
  nextPrompt: 420,
  evidence: 560,
};

export function guidanceRevealDelayMs(step: GuidanceRevealStep) {
  return GUIDANCE_REVEAL_DELAYS_MS[step];
}

export function changedEquationParts(
  previous: LinearEquationParameters,
  next: LinearEquationParameters,
) {
  return (["multiplier", "offset", "rightSide"] as const).filter(
    (part) => previous[part] !== next[part],
  );
}

export function problemUpdateAnnouncement(prompt: string) {
  return `New problem loaded. ${prompt}`;
}

export function tutorUpdateAnnouncement(turn: TutorTurn) {
  return [
    "Tutor response ready.",
    `Diagnosis: ${turn.diagnosis}`,
    `Feedback: ${turn.feedback}`,
    `Smallest next step: ${turn.nextPrompt}`,
  ].join(" ");
}

export function tutorSourceLabel(source: TutorSource, model: string | null) {
  switch (source) {
    case "openai":
      return `Answered by ${(model || "GPT-5.6").toUpperCase()}`;
    case "deterministic-safeguard":
      return "Safeguard used";
    case "deterministic-fallback":
      return "GPT unavailable · safeguard used";
    case "deterministic-demo":
      return "Demo safeguard used";
  }
}
