"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  buildTeacherHandoffSummary,
  helpRequestLabel,
} from "@/lib/tutor/handoff";
import {
  createSeededProblem,
  formatPartialDistribution,
  formatSignedTerm,
  nextDistinctProblemSeed,
} from "@/lib/tutor/problems";
import {
  changedEquationParts,
  guidanceRevealDelayMs,
  HELP_REVEAL_DELAY_MS,
  problemUpdateAnnouncement,
  tutorSourceLabel,
  tutorUpdateAnnouncement,
  type GuidanceRevealStep,
  type TutorSource,
  type VisibleEquationPart,
} from "@/lib/tutor/presentation";
import { nextAttemptNumber } from "@/lib/tutor/progress";
import type {
  HelpRequestType,
  LinearEquationParameters,
  TutorStage,
  TutorTurn,
} from "@/lib/tutor/types";

type StageKey = "main" | "transfer";

interface Exchange {
  attempt: string;
  turn: TutorTurn;
  source: TutorSource;
  model: string | null;
  helpRequest?: HelpRequestType;
  stageKey: StageKey;
}

interface HelpAction {
  request: HelpRequestType;
  label: string;
  emphasis?: boolean;
}

const PRIMARY_HELP_ACTIONS: HelpAction[] = [
  { request: "stuck", label: "I’m stuck" },
  { request: "small_hint", label: "Give me a small hint" },
];

const ADDITIONAL_HELP_ACTIONS: HelpAction[] = [
  { request: "dont_know_start", label: "I don’t know how to start" },
  { request: "check_last_step", label: "Check my last step" },
  { request: "human", label: "Ask a person", emphasis: true },
];

const progressSteps = ["Attempt", "Diagnose", "Guide", "Transfer"];
const stageIndex: Record<TutorStage, number> = {
  attempt: 0,
  diagnosis: 1,
  guided_retry: 2,
  transfer: 3,
  complete: 4,
  assisted_complete: 4,
};

function classes(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

function revealStyle(step: GuidanceRevealStep) {
  return { animationDelay: `${guidanceRevealDelayMs(step)}ms` };
}

function EquationPrompt({
  equation,
  changedParts,
  animateChanges,
  transfer,
}: {
  equation: LinearEquationParameters;
  changedParts: VisibleEquationPart[];
  animateChanges: boolean;
  transfer: boolean;
}) {
  const parameterClass = (part: VisibleEquationPart) =>
    classes(
      "tf-equation-parameter inline-block rounded-md px-0.5",
      animateChanges &&
        changedParts.includes(part) &&
        "tf-equation-parameter-change",
    );

  return (
    <span aria-hidden="true">
      {transfer ? "Now solve independently:" : "Solve for x:"}{" "}
      <span
        data-equation-part="multiplier"
        data-parameter-changed={
          animateChanges && changedParts.includes("multiplier")
        }
        className={parameterClass("multiplier")}
      >
        {equation.multiplier}
      </span>
      (x{" "}
      <span
        data-equation-part="offset"
        data-parameter-changed={animateChanges && changedParts.includes("offset")}
        className={parameterClass("offset")}
      >
        {formatSignedTerm(equation.offset)}
      </span>
      ) ={" "}
      <span
        data-equation-part="rightSide"
        data-parameter-changed={
          animateChanges && changedParts.includes("rightSide")
        }
        className={parameterClass("rightSide")}
      >
        {equation.rightSide}
      </span>
    </span>
  );
}

function SourceBadge({ source, model }: Pick<Exchange, "source" | "model">) {
  const isLive = source === "openai";
  const isSafeguard = source === "deterministic-safeguard";
  const isFallback = source === "deterministic-fallback";
  const label = tutorSourceLabel(source, model);

  return (
    <span
      data-tutor-source={source}
      title="Actual response source"
      className={classes(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        isLive && "tf-live-response",
        isLive
          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
          : isSafeguard
            ? "border-violet-300/30 bg-violet-300/10 text-violet-100"
            : isFallback
              ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
              : "border-white/10 bg-white/5 text-slate-300",
      )}
    >
      <span
        className={classes(
          "h-1.5 w-1.5 rounded-full",
          isLive && "tf-live-dot",
          isLive
            ? "bg-cyan-300"
            : isSafeguard
              ? "bg-violet-300"
              : isFallback
                ? "bg-amber-300"
                : "bg-slate-400",
        )}
      />
      {label}
    </span>
  );
}

interface TutorDemoProps {
  initialProblemSeed: number;
}

export function TutorDemoV2({ initialProblemSeed }: TutorDemoProps) {
  const [problemSeed, setProblemSeed] = useState(initialProblemSeed);
  const [attempt, setAttempt] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [stage, setStage] = useState<TutorStage>("attempt");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [useLiveModel, setUseLiveModel] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageAssistanceUsed, setStageAssistanceUsed] = useState(false);
  const [handoffSummary, setHandoffSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const [showExampleAttempts, setShowExampleAttempts] = useState(false);
  const [showMoreHelp, setShowMoreHelp] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [problemTransition, setProblemTransition] = useState(0);
  const [changedProblemParts, setChangedProblemParts] = useState<
    VisibleEquationPart[]
  >([]);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [helpPromptReady, setHelpPromptReady] = useState(false);
  const [helpRevealCycle, setHelpRevealCycle] = useState(0);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setHelpPromptReady(true);
    }, HELP_REVEAL_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [helpRevealCycle]);

  const problem = createSeededProblem(problemSeed);
  const latest = history.at(-1);
  const activeStep = stageIndex[stage];
  const isTerminal = stage === "complete" || stage === "assisted_complete";
  const isTransfer =
    stage === "transfer" || stage === "complete" || stage === "assisted_complete";
  const currentPrompt = isTransfer
    ? problem.transferProblem.prompt
    : problem.prompt;
  const currentEquation = isTransfer
    ? problem.transferProblem.equation
    : problem.equation;
  const currentStageKey: StageKey = isTransfer ? "transfer" : "main";
  const animateProblemChange = problemTransition > 0 && !isTransfer;
  const visibleAttemptCaptured = history.some(
    (exchange) => !exchange.helpRequest && exchange.attempt.trim().length > 0,
  );
  const currentStageHintLevel = Math.min(
    3,
    Math.max(
      0,
      ...history
        .filter((exchange) => exchange.stageKey === currentStageKey)
        .map((exchange) => exchange.turn.hintLevel),
    ),
  ) as 0 | 1 | 2 | 3;
  const supportState = handoffSummary
    ? "Handoff preview prepared"
    : stageAssistanceUsed
      ? "Support used in this stage"
      : "No support in this stage";

  const learningEvidence = [
    {
      label: "Visible attempt",
      value: visibleAttemptCaptured ? "Captured" : "Waiting or help signal",
      ready: visibleAttemptCaptured,
    },
    {
      label: "Latest hypothesis",
      value: latest
        ? latest.turn.misconception.replaceAll("_", " ")
        : "Not diagnosed",
      ready: Boolean(latest),
    },
    {
      label: "Help path",
      value: supportState,
      ready: stageAssistanceUsed || Boolean(handoffSummary),
    },
    {
      label: "Transfer evidence",
      value:
        stage === "complete"
          ? "Independent"
          : stage === "assisted_complete"
            ? "Assisted — fresh check needed"
            : isTransfer
              ? "In progress"
              : "Locked",
      ready: isTransfer,
    },
  ];

  async function callTutor(payload: {
    learnerAttempt: string;
    helpRequest?: HelpRequestType | null;
  }) {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemId: problem.id,
        learnerAttempt: payload.learnerAttempt,
        helpRequest: payload.helpRequest ?? null,
        attemptNumber,
        currentStage: stage,
        stageAssistanceUsed,
        useLiveModel,
      }),
    });

    if (!response.ok) {
      throw new Error("The tutor could not evaluate this request.");
    }

    return (await response.json()) as {
      turn: TutorTurn;
      source: TutorSource;
      model: string | null;
      helpRequest: HelpRequestType | null;
      stageAssistanceUsed: boolean;
    };
  }

  function restartHelpWindow() {
    setShowHelpPanel(false);
    setHelpPromptReady(false);
    setShowMoreHelp(false);
    setHelpRevealCycle((cycle) => cycle + 1);
  }

  function toggleHelpPanel() {
    if (showHelpPanel) setShowMoreHelp(false);
    setShowHelpPanel((visible) => !visible);
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attempt.trim() || isLoading || isTerminal) return;

    const submittedAttempt = attempt.trim();
    const requestStageKey = currentStageKey;
    setIsLoading(true);
    setError("");
    setHandoffSummary("");
    setCopied(false);
    setAnnouncement("");

    try {
      const data = await callTutor({ learnerAttempt: submittedAttempt });
      const effectiveHelpRequest = data.helpRequest ?? undefined;

      setAnnouncement(tutorUpdateAnnouncement(data.turn));
      restartHelpWindow();

      setHistory((items) => [
        ...items,
        {
          attempt: submittedAttempt,
          turn: data.turn,
          source: data.source,
          model: data.model,
          helpRequest: effectiveHelpRequest,
          stageKey: requestStageKey,
        },
      ]);
      setStage(data.turn.stage);
      setAttempt("");

      const movedToTransfer = data.turn.stage === "transfer" && stage !== "transfer";
      if (movedToTransfer) {
        setAttemptNumber(1);
        setStageAssistanceUsed(false);
        setHandoffSummary("");
        setShowExampleAttempts(false);
        setShowMoreHelp(false);
      } else {
        setStageAssistanceUsed(data.stageAssistanceUsed);
        setAttemptNumber((number) => nextAttemptNumber(number, data.turn));
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function submitAttemptShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      (!event.ctrlKey && !event.metaKey) ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function requestHelp(helpRequest: HelpRequestType) {
    if (isLoading || isTerminal) return;

    helpTriggerRef.current?.focus();
    const currentAttempt = attempt.trim();
    const requestStageKey = currentStageKey;
    setIsLoading(true);
    setError("");
    setHandoffSummary("");
    setCopied(false);
    setAnnouncement("");

    try {
      const data = await callTutor({
        learnerAttempt: currentAttempt,
        helpRequest,
      });

      setAnnouncement(tutorUpdateAnnouncement(data.turn));
      restartHelpWindow();

      setHistory((items) => [
        ...items,
        {
          attempt: currentAttempt || helpRequestLabel(helpRequest),
          turn: data.turn,
          source: data.source,
          model: data.model,
          helpRequest,
          stageKey: requestStageKey,
        },
      ]);
      setStage(data.turn.stage);

      const movedToTransfer = data.turn.stage === "transfer" && stage !== "transfer";
      if (movedToTransfer) {
        setAttemptNumber(1);
        setStageAssistanceUsed(false);
        setHandoffSummary("");
        setShowExampleAttempts(false);
        setShowMoreHelp(false);
      } else {
        setStageAssistanceUsed(data.stageAssistanceUsed);
        setAttemptNumber((number) => nextAttemptNumber(number, data.turn));
      }

      if (helpRequest === "human") {
        setHandoffSummary(
          buildTeacherHandoffSummary({
            problemId: problem.id,
            problemPrompt: currentPrompt,
            stage,
            currentAttempt,
            helpRequest,
            latestTurn: latest?.turn,
            highestHintLevel: currentStageHintLevel,
          }),
        );
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(handoffSummary);
      setCopied(true);
    } catch {
      setError("The handoff preview could not be copied on this device.");
    }
  }

  function resetDemo() {
    const nextSeed = nextDistinctProblemSeed(problemSeed);
    const nextProblem = createSeededProblem(nextSeed);

    setChangedProblemParts(
      changedEquationParts(problem.equation, nextProblem.equation),
    );
    setProblemSeed(nextSeed);
    setProblemTransition((transition) => transition + 1);
    setAnnouncement(problemUpdateAnnouncement(nextProblem.prompt));
    restartHelpWindow();
    setAttempt("");
    setAttemptNumber(1);
    setStage("attempt");
    setHistory([]);
    setError("");
    setStageAssistanceUsed(false);
    setHandoffSummary("");
    setCopied(false);
    setShowExampleAttempts(false);
    setShowMoreHelp(false);
  }

  return (
    <main className="tf-app-shell min-h-screen overflow-hidden bg-[#06112d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_8%,rgba(34,211,238,0.13),transparent_28%),radial-gradient(circle_at_18%_38%,rgba(132,204,22,0.08),transparent_24%)]" />
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>
      <p id="model-routing-description" className="sr-only">
        When enabled, ordinary attempts prefer live GPT-5.6. Help signals always
        use the deterministic safeguard. Every response names its actual source.
      </p>

      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7 lg:px-10">
        <header
          style={{ animationDelay: "740ms" }}
          className="tf-app-reveal tf-supporting-context flex items-center justify-between border-b border-white/10 pb-4 sm:pb-6"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-500 font-black text-[#06112d] shadow-lg shadow-cyan-400/20">
              TF
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">ThinkFirst Tutor</p>
              <p className="text-xs text-slate-400">Attempt first · Help always available</p>
            </div>
          </div>

          <label
            data-live-state={useLiveModel ? "on" : "off"}
            className="tf-live-control flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-300 sm:gap-3 sm:px-3"
          >
            <span className="sm:hidden">Prefer GPT</span>
            <span className="hidden sm:inline">Prefer GPT-5.6</span>
            <input
              type="checkbox"
              aria-label="Prefer live GPT-5.6"
              aria-describedby="model-routing-description"
              checked={useLiveModel}
              onChange={(event) => setUseLiveModel(event.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-5 w-9 rounded-full bg-slate-600 transition peer-checked:bg-cyan-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
          </label>
        </header>

        <section className="grid gap-5 py-5 sm:gap-6 sm:py-7 lg:grid-cols-[minmax(0,1fr)_500px] lg:items-center">
          <div className="tf-supporting-context">
            <div
              style={{ animationDelay: "760ms" }}
              className="tf-app-reveal mb-2 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-200 sm:mb-3"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
              Productive struggle without unsupported struggle
            </div>
            <h1
              aria-label="Think first. Ask safely. Return to independent action."
              className="max-w-3xl text-[2rem] font-black leading-[1.05] tracking-[-0.04em] sm:text-4xl lg:text-5xl"
            >
              <span className="tf-intro-phrase">Think first.</span>{" "}
              <span
                style={{ animationDelay: "110ms" }}
                className="tf-intro-phrase"
              >
                Ask safely.
              </span>{" "}
              <span
                style={{ animationDelay: "220ms" }}
                className="tf-intro-phrase"
              >
                Return to
              </span>{" "}
              <span
                style={{ animationDelay: "330ms" }}
                className="tf-intro-phrase bg-gradient-to-r from-cyan-300 to-lime-300 bg-clip-text text-transparent"
              >
                independent action.
              </span>
            </h1>
            <p
              style={{ animationDelay: "800ms" }}
              className="tf-app-reveal mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7"
            >
              <span className="sm:hidden">
                Smallest useful help, followed by a fresh independent transfer check.
              </span>
              <span className="hidden sm:inline">
                Visible reasoning comes first. The tutor gives the smallest useful
                help, then verifies a fresh transfer problem independently.
              </span>
            </p>
          </div>

          <ol
            aria-label="Learning progress"
            style={{ animationDelay: "820ms" }}
            className="tf-app-reveal grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur sm:p-3"
          >
            {progressSteps.map((step, index) => {
              const complete = activeStep > index;
              const active = activeStep === index;
              const progressState = active
                ? "active"
                : complete
                  ? "complete"
                  : "upcoming";

              return (
                <li
                  key={step}
                  aria-current={active ? "step" : undefined}
                  data-stage-state={progressState}
                  className="relative list-none rounded-xl p-2"
                >
                  <div
                    aria-hidden="true"
                    data-stage-light={progressState}
                    className="tf-progress-light mb-2 h-1.5 overflow-hidden rounded-full"
                  />
                  <p
                    className={classes(
                      "text-[10px] font-bold uppercase tracking-[0.12em] sm:text-xs",
                      complete || active ? "text-white" : "text-slate-400",
                    )}
                  >
                    {step}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div
            style={{ animationDelay: "860ms" }}
            className="tf-app-reveal tf-learning-workspace overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1837]/90 shadow-2xl shadow-black/20"
          >
            <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7 sm:py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                  {isTransfer
                    ? "Transfer evidence"
                    : `${problem.title} · Generated equation`}
                </p>
                <h2
                  key={`${currentStageKey}-${problem.id}-${problemTransition}`}
                  aria-label={currentPrompt}
                  data-problem-id={problem.id}
                  data-problem-transition={
                    animateProblemChange ? problemTransition : "initial"
                  }
                  className={classes(
                    "-mx-2 mt-1 inline-block rounded-xl px-2 py-1 text-xl font-bold sm:text-2xl",
                    animateProblemChange && "tf-problem-change",
                  )}
                >
                  <EquationPrompt
                    equation={currentEquation}
                    changedParts={changedProblemParts}
                    animateChanges={animateProblemChange}
                    transfer={isTransfer}
                  />
                </h2>
              </div>
              {!isTransfer && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="hidden rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-400 sm:block">
                    Skill: {problem.skill}
                  </div>
                  <button
                    type="button"
                    onClick={resetDemo}
                    disabled={isLoading}
                    className="rounded-xl border border-cyan-300/20 px-3 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    New problem
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {latest && (
                <div
                  key={`turn-${history.length}`}
                  data-guidance-sequence="learner-diagnosis-feedback-nextPrompt-evidence"
                  className="space-y-4"
                >
                  <div
                    data-reveal-step="learner"
                    style={revealStyle("learner")}
                    className="tf-content-reveal ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blue-500/15 px-4 py-3 text-sm text-blue-50 ring-1 ring-blue-300/15"
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">
                      {latest.helpRequest ? "Learner signal" : "Learner attempt"}
                    </p>
                    {latest.attempt}
                  </div>

                  <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.055] p-5">
                    <div
                      data-reveal-step="diagnosis"
                      style={revealStyle("diagnosis")}
                      className="tf-content-reveal mb-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">
                        Tutor intervention · level {latest.turn.hintLevel}
                      </p>
                      <SourceBadge source={latest.source} model={latest.model} />
                    </div>

                    <div className="space-y-4">
                      <div
                        data-reveal-step="diagnosis"
                        style={revealStyle("diagnosis")}
                        className="tf-content-reveal rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3"
                      >
                        <p className="text-xs font-semibold text-slate-300">
                          What I notice
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-200">
                          {latest.turn.diagnosis}
                        </p>
                        <p
                          data-reveal-step="feedback"
                          style={revealStyle("feedback")}
                          className="tf-content-reveal mt-3 border-t border-white/[0.07] pt-3 text-sm leading-6 text-slate-300"
                        >
                          {latest.turn.feedback}
                        </p>
                      </div>
                      <div
                        data-reveal-step="nextPrompt"
                        style={revealStyle("nextPrompt")}
                        className="tf-content-reveal rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3"
                      >
                        <p className="text-xs font-semibold text-cyan-200">
                          Try next
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-white">
                          {latest.turn.nextPrompt}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isTerminal ? (
                <form onSubmit={submitAttempt} className="space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <label
                      htmlFor="attempt"
                      className="text-sm font-semibold text-slate-200"
                    >
                      {isTransfer
                        ? "Solve this one and show the steps you choose"
                        : `Attempt ${attemptNumber}`}
                    </label>
                    {history.length === 0 && (
                      <span
                        id="attempt-guidance"
                        className="text-xs leading-5 text-slate-400"
                      >
                        Start with one step you trust — it does not need to be complete.
                      </span>
                    )}
                  </div>
                  <textarea
                    id="attempt"
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    aria-describedby={
                      history.length === 0 ? "attempt-guidance" : undefined
                    }
                    value={attempt}
                    onChange={(event) => setAttempt(event.target.value)}
                    onKeyDown={submitAttemptShortcut}
                    placeholder={
                      isTransfer
                        ? "Show the operations you would undo..."
                        : "Write one balanced operation, a complete attempt, or the last step you trust..."
                    }
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[#07122d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
                  />

                  <p className="-mt-2 hidden text-right text-[11px] text-slate-500 sm:block">
                    Enter for a new line · Ctrl/⌘ + Enter to check
                  </p>

                  <div className="flex justify-stretch pt-1 sm:justify-end">
                    <button
                      type="submit"
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      disabled={!attempt.trim() || isLoading}
                      className="w-full shrink-0 rounded-xl bg-gradient-to-r from-cyan-300 to-cyan-400 px-5 py-3 text-sm font-black text-[#06112d] shadow-lg shadow-cyan-400/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {isLoading ? "Thinking…" : "Check my thinking"}
                    </button>
                  </div>

                  {error && (
                    <p role="alert" className="tf-state-enter text-sm text-rose-300">
                      {error}
                    </p>
                  )}

                  {!isTransfer && history.length === 0 && (
                    <div className="rounded-xl border border-white/[0.07] bg-black/10">
                      <button
                        type="button"
                        aria-expanded={showExampleAttempts}
                        aria-controls="example-attempts"
                        onClick={() => setShowExampleAttempts((visible) => !visible)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-300 transition hover:bg-white/[0.035] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                      >
                        <span>Try an example attempt</span>
                        <span aria-hidden="true" className="text-base text-cyan-300">
                          {showExampleAttempts ? "−" : "+"}
                        </span>
                      </button>

                      <div
                        id="example-attempts"
                        hidden={!showExampleAttempts}
                        className={classes(
                          "border-t border-white/[0.07] px-3 py-3",
                          showExampleAttempts ? "tf-state-enter block" : "hidden",
                        )}
                      >
                          <p className="mb-2 text-xs leading-5 text-slate-400">
                            Prefill a realistic learner attempt for a fast demo.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAttempt(
                                  `x = ${problem.equation.solution + problem.equation.offset}`,
                                );
                              }}
                              disabled={isLoading}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Demo: stopped early
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAttempt(
                                  `${formatPartialDistribution(problem.equation)} = ${problem.equation.rightSide}`,
                                );
                              }}
                              disabled={isLoading}
                              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Demo: distribution error
                            </button>
                          </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="tf-state-enter flex justify-end">
                      <button
                        ref={helpTriggerRef}
                        type="button"
                        aria-label={
                          showHelpPanel
                            ? "Hide help options"
                            : "Open help options now"
                        }
                        aria-controls="help-options-panel"
                        aria-expanded={showHelpPanel}
                        data-help-prompt={helpPromptReady ? "ready" : "waiting"}
                        onClick={toggleHelpPanel}
                        className={classes(
                          "flex h-9 min-w-9 items-center justify-center rounded-full border border-violet-300/20 bg-violet-300/[0.05] text-sm font-bold text-violet-200 transition hover:border-violet-300/40 hover:bg-violet-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50",
                          (helpPromptReady || showHelpPanel) && "gap-2 px-3",
                        )}
                      >
                        <span aria-hidden="true">?</span>
                        {(helpPromptReady || showHelpPanel) && (
                          <span className="tf-state-enter">
                            {showHelpPanel ? "Hide help" : "Need help?"}
                          </span>
                        )}
                      </button>
                    </div>
                    <div
                      id="help-options-panel"
                      hidden={!showHelpPanel}
                      data-help-panel={showHelpPanel ? "revealed" : "hidden"}
                      className={classes(
                        "rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] p-4",
                        showHelpPanel ? "tf-content-reveal block" : "hidden",
                      )}
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">
                        Need help?
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Choose a private signal. Asking does not lower a score.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {PRIMARY_HELP_ACTIONS.map((action) => (
                          <button
                            key={action.request}
                            type="button"
                            onClick={() => requestHelp(action.request)}
                            disabled={isLoading}
                            className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-violet-300/30 hover:text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {action.label}
                          </button>
                        ))}

                        <button
                          type="button"
                          aria-expanded={showMoreHelp}
                          aria-controls="additional-help-actions"
                          onClick={() => setShowMoreHelp((visible) => !visible)}
                          className="rounded-full border border-transparent px-3 py-2 text-xs font-semibold text-violet-200 transition hover:border-violet-300/20 hover:bg-violet-200/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
                        >
                          {showMoreHelp ? "Fewer options" : "More ways to ask"}
                        </button>
                      </div>

                      <div
                        id="additional-help-actions"
                        hidden={!showMoreHelp}
                        className={classes(
                          "mt-3 flex-wrap gap-2 border-t border-violet-200/10 pt-3",
                          showMoreHelp ? "tf-state-enter flex" : "hidden",
                        )}
                      >
                        {ADDITIONAL_HELP_ACTIONS.map((action) => (
                          <button
                            key={action.request}
                            type="button"
                            onClick={() => {
                              void requestHelp(action.request);
                            }}
                            disabled={isLoading}
                            className={classes(
                              "rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                              action.emphasis
                                ? "border-violet-200/40 bg-violet-200/10 text-violet-100 hover:bg-violet-200/20"
                                : "border-white/10 text-slate-300 hover:border-violet-300/30 hover:text-violet-100",
                            )}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-400">
                        Attempts prefer GPT-5.6 when enabled. Help signals always use
                        the deterministic safeguard. Every response names its actual
                        source. No hidden reasoning is exposed.
                      </p>
                    </div>
                  </div>

                  {handoffSummary && (
                    <div className="tf-state-enter rounded-2xl border border-violet-300/20 bg-[#0b1430] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-violet-100">
                            Human handoff preview
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            No message is sent automatically in this demo.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={copyHandoff}
                          className="rounded-xl border border-violet-200/30 px-3 py-2 text-xs font-bold text-violet-100 transition hover:bg-violet-200/10"
                        >
                          {copied ? "Copied" : "Copy summary"}
                        </button>
                      </div>
                      <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 p-4 text-xs leading-5 text-slate-300">
                        {handoffSummary}
                      </pre>
                    </div>
                  )}

                </form>
              ) : stage === "complete" ? (
                <div className="tf-state-enter rounded-2xl border border-lime-300/20 bg-lime-300/[0.07] p-5">
                  <p className="text-lg font-bold text-lime-100">
                    Independent transfer verified.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    The learner applied the strategy to a new equation without
                    support during the transfer stage.
                  </p>
                  <button
                    type="button"
                    onClick={resetDemo}
                    className="mt-4 rounded-xl border border-lime-200/30 px-4 py-2 text-sm font-bold text-lime-100 transition hover:bg-lime-200/10"
                  >
                    Try another problem
                  </button>
                </div>
              ) : (
                <div className="tf-state-enter rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-5">
                  <p className="text-lg font-bold text-amber-100">
                    Transfer completed with support.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    This is progress, but it is not independent mastery yet. A fresh
                    problem without hints is the next required check.
                  </p>
                  <button
                    type="button"
                    onClick={resetDemo}
                    className="mt-4 rounded-xl border border-amber-200/30 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-200/10"
                  >
                    Start fresh independent check
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside
            style={{ animationDelay: "940ms" }}
            className="tf-app-reveal tf-supporting-context"
          >
            <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Learning evidence</h2>
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {history.length > 0 ? "Live state" : "Ready"}
                </span>
              </div>

              {history.length === 0 ? (
                <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4">
                  <p className="text-sm font-semibold text-slate-200">
                    Ready for your first attempt
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Evidence appears after you submit work or ask for help.
                  </p>
                </div>
              ) : (
                <div
                  key={`evidence-${history.length}`}
                  data-reveal-step="evidence"
                  style={revealStyle("evidence")}
                  className="tf-content-reveal mt-5 space-y-3"
                >
                  {learningEvidence.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/10 p-3"
                    >
                      <span className="text-xs text-slate-400">{item.label}</span>
                      <span
                        className={classes(
                          "text-right text-xs font-bold capitalize",
                          item.ready ? "text-lime-200" : "text-slate-400",
                        )}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>

        <section
          aria-labelledby="design-principle-title"
          style={{ animationDelay: "1s" }}
          className="tf-app-reveal tf-supporting-context mt-5 grid gap-3 rounded-[24px] border border-cyan-300/15 bg-gradient-to-r from-cyan-300/[0.07] to-transparent p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:p-5"
        >
          <p
            id="design-principle-title"
            className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-300"
          >
            Design principle
          </p>
          <div className="grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-6">
            <blockquote className="text-base font-bold leading-6 text-white">
              “Help should reduce the cost of asking, then return the learner to
              independent action.”
            </blockquote>
            <p className="text-xs leading-5 text-slate-400">
              Context is preserved, diagnoses remain hypotheses, and support is
              recorded rather than hidden inside a green result.
            </p>
          </div>
        </section>

        <footer
          style={{ animationDelay: "1040ms" }}
          className="tf-app-reveal tf-supporting-context flex flex-col gap-2 py-8 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>Built with Codex, GPT-5.6, Next.js and the OpenAI Responses API.</p>
          <p>Deterministic safeguards keep help-seeking safe and testable.</p>
        </footer>
      </div>
    </main>
  );
}
