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
import {
  deriveLearningProgress,
  nextAttemptNumber,
  type LearningProgressItem,
} from "@/lib/tutor/progress";
import type {
  HelpRequestType,
  LinearEquationParameters,
  TutorStage,
  TutorTurn,
} from "@/lib/tutor/types";
import { ThemeControl } from "@/components/theme-control";

type StageKey = "main" | "transfer";
type AppView = "start" | "solve" | "summary";
type LiveModelStatus =
  | "selected"
  | "contacting"
  | "online"
  | "unavailable";

interface Exchange {
  attempt: string;
  turn: TutorTurn;
  source: TutorSource;
  model: string | null;
  helpRequest?: HelpRequestType;
  stageKey: StageKey;
  problemPrompt: string;
  hasVisibleWork: boolean;
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

function classes(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

function revealStyle(step: GuidanceRevealStep) {
  return { animationDelay: `${guidanceRevealDelayMs(step)}ms` };
}

function liveModelStatusLabel(
  status: LiveModelStatus | "off",
  compact = false,
) {
  switch (status) {
    case "selected":
      return compact ? "GPT selected" : "GPT-5.6 selected";
    case "contacting":
      return compact ? "Contacting…" : "Contacting GPT-5.6…";
    case "online":
      return compact ? "GPT online" : "GPT-5.6 online";
    case "unavailable":
      return "GPT unavailable";
    case "off":
      return compact ? "GPT off" : "GPT-5.6 off";
  }
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
    <span aria-hidden="true" className="block">
      <span data-equation-instruction className="block">
        {transfer ? "Now solve independently:" : "Solve for x:"}
      </span>
      <span data-equation-expression className="mt-1 block">
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

function ProgressRail({ items }: { items: LearningProgressItem[] }) {
  return (
    <ol
      aria-label="Learning progress"
      className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur sm:p-3"
    >
      {items.map((item) => {
        return (
          <li
            key={item.key}
            aria-current={item.state === "current" ? "step" : undefined}
            data-stage-key={item.key}
            data-stage-state={item.state}
            className="relative list-none rounded-xl p-2"
          >
            <div
              aria-hidden="true"
              data-stage-light={item.state}
              className="tf-progress-light mb-2 h-1.5 overflow-hidden rounded-full"
            />
            <p
              className={classes(
                "text-[10px] font-bold uppercase tracking-[0.12em] sm:text-xs",
                item.state === "current" || item.state === "complete"
                  ? "text-white"
                  : "text-slate-400",
              )}
            >
              {item.label}
            </p>
            <span
              data-progress-status={item.status}
              className="mt-1 block text-[9px] font-semibold leading-3 text-slate-400 sm:text-[10px]"
            >
              {item.status}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ConversationExchange({
  exchange,
  index,
  showOriginalProblem,
}: {
  exchange: Exchange;
  index: number;
  showOriginalProblem: boolean;
}) {
  const unlockedTransfer =
    exchange.stageKey === "main" && exchange.turn.stage === "transfer";

  return (
    <div
      role="group"
      aria-label={`Tutoring exchange ${index + 1}, ${exchange.stageKey} stage, problem: ${exchange.problemPrompt}`}
      data-conversation-exchange={index + 1}
      data-conversation-stage={exchange.stageKey}
      data-guidance-sequence="learner-diagnosis-feedback-nextPrompt"
      className="space-y-4"
    >
      {showOriginalProblem && (
        <div
          data-original-problem
          className="rounded-xl border border-slate-500/20 bg-slate-400/[0.06] px-4 py-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Original problem
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-200">
            {exchange.problemPrompt}
          </p>
        </div>
      )}
      <div
        data-speaker="learner"
        data-reveal-step="learner"
        style={revealStyle("learner")}
        className="tf-content-reveal flex justify-end"
      >
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-blue-500/15 px-4 py-3 text-sm text-blue-50 ring-1 ring-blue-300/15 sm:max-w-[78%]">
          <p className="mb-1 text-right text-xs font-bold uppercase tracking-[0.14em] text-blue-300">
            {exchange.helpRequest ? "You · Help signal" : "You"}
          </p>
          <p
            data-learner-entry={exchange.helpRequest ? "help-signal" : "attempt"}
            className="whitespace-pre-wrap break-words text-left leading-6"
          >
            {exchange.attempt}
          </p>
        </div>
      </div>

      <div
        data-speaker="tutor"
        className="max-w-[94%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.055] p-4 sm:max-w-[92%] sm:p-5"
      >
        <div
          data-reveal-step="diagnosis"
          style={revealStyle("diagnosis")}
          className="tf-content-reveal mb-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">
            ThinkFirst Tutor · level {exchange.turn.hintLevel}
          </p>
          <SourceBadge source={exchange.source} model={exchange.model} />
        </div>

        <div className="space-y-4">
          <div
            data-reveal-step="diagnosis"
            style={revealStyle("diagnosis")}
            className="tf-content-reveal rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3"
          >
            <p className="text-xs font-semibold text-slate-300">What I notice</p>
            <p className="mt-1 text-sm leading-6 text-slate-200">
              {exchange.turn.diagnosis}
            </p>
            <p
              data-reveal-step="feedback"
              style={revealStyle("feedback")}
              className="tf-content-reveal mt-3 border-t border-white/[0.07] pt-3 text-sm leading-6 text-slate-300"
            >
              {exchange.turn.feedback}
            </p>
          </div>
          <div
            data-reveal-step="nextPrompt"
            data-transition-prompt={unlockedTransfer ? "transfer-ready" : undefined}
            style={revealStyle("nextPrompt")}
            className="tf-content-reveal rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3"
          >
            <p className="text-xs font-semibold text-cyan-200">
              {unlockedTransfer ? "Independent check ready" : "Try next"}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-white">
              {unlockedTransfer
                ? "Continue with the new problem above."
                : exchange.turn.nextPrompt}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LearningEvidenceItem {
  label: string;
  value: string;
  ready: boolean;
}

function EvidenceGrid({ items }: { items: LearningEvidenceItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-white/[0.07] bg-black/10 p-4"
        >
          <p className="text-xs text-slate-400">{item.label}</p>
          <p
            className={classes(
              "mt-1 text-sm font-bold capitalize",
              item.ready ? "text-lime-200" : "text-slate-300",
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

interface TutorDemoProps {
  initialProblemSeed: number;
}

export function TutorDemoV2({ initialProblemSeed }: TutorDemoProps) {
  const [hasStarted, setHasStarted] = useState(false);
  const [problemSeed, setProblemSeed] = useState(initialProblemSeed);
  const [attempt, setAttempt] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [stage, setStage] = useState<TutorStage>("attempt");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [useLiveModel, setUseLiveModel] = useState(true);
  const [liveModelStatus, setLiveModelStatus] =
    useState<LiveModelStatus>("selected");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageAssistanceUsed, setStageAssistanceUsed] = useState(false);
  const [handoffSummary, setHandoffSummary] = useState("");
  const [copied, setCopied] = useState(false);
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
  const attemptRef = useRef<HTMLTextAreaElement>(null);
  const problemHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStageKeyRef = useRef<StageKey>("main");
  const isTerminal = stage === "complete" || stage === "assisted_complete";
  const view: AppView = !hasStarted
    ? "start"
    : isTerminal
      ? "summary"
      : "solve";

  useEffect(() => {
    if (view !== "solve") return;

    const timeout = window.setTimeout(() => {
      setHelpPromptReady(true);
    }, HELP_REVEAL_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [helpRevealCycle, view]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (view === "solve") attemptRef.current?.focus();
      if (view === "summary") summaryHeadingRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  const problem = createSeededProblem(problemSeed);
  const latest = history.at(-1);
  const isTransfer =
    stage === "transfer" || stage === "complete" || stage === "assisted_complete";
  const currentPrompt = isTransfer
    ? problem.transferProblem.prompt
    : problem.prompt;
  const currentEquation = isTransfer
    ? problem.transferProblem.equation
    : problem.equation;
  const currentStageKey: StageKey = isTransfer ? "transfer" : "main";
  const displayedLiveModelStatus = useLiveModel ? liveModelStatus : "off";

  useEffect(() => {
    const previousStageKey = previousStageKeyRef.current;
    previousStageKeyRef.current = currentStageKey;

    if (
      view !== "solve" ||
      currentStageKey !== "transfer" ||
      previousStageKey === "transfer"
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      problemHeadingRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentStageKey, view]);

  const animateProblemChange = problemTransition > 0 && !isTransfer;
  const visibleAttemptCaptured = history.some(
    (exchange) => exchange.hasVisibleWork,
  );
  const hasHelpInteraction = history.some((exchange) => exchange.helpRequest);
  const guidanceUsed = history.some(
    (exchange) => exchange.helpRequest || exchange.turn.hintLevel > 0,
  );
  const learningProgress = deriveLearningProgress({
    stage,
    hasVisibleAttempt: visibleAttemptCaptured,
    hasHelpInteraction,
    hasTutorResponse: history.length > 0,
    guidanceUsed,
  });
  const firstMainExchangeIndex = history.findIndex(
    (exchange) => exchange.stageKey === "main",
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
        expectedResponse: latest?.turn.expectedResponse ?? null,
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
      hasVisibleWork: boolean;
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

  function startProblem() {
    restartHelpWindow();
    setAnnouncement(`Problem started. ${problem.prompt}. Attempt, step 1 of 4.`);
    setHasStarted(true);
  }

  function announcementForTurn(turn: TutorTurn, requestStageKey: StageKey) {
    if (requestStageKey === "transfer" && turn.stage === "complete") {
      return "Summary ready. Independent transfer verified.";
    }
    if (
      requestStageKey === "transfer" &&
      turn.stage === "assisted_complete"
    ) {
      return "Summary ready. Transfer completed with support.";
    }
    if (turn.stage === "transfer" && requestStageKey !== "transfer") {
      return `Transfer, step 4 of 4. New equation: ${problem.transferProblem.prompt}`;
    }
    return tutorUpdateAnnouncement(turn);
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attempt.trim() || isLoading || isTerminal) return;

    const submittedAttempt = attempt.trim();
    const requestStageKey = currentStageKey;
    const requestProblemPrompt = currentPrompt;
    const requestUsesLiveModel = useLiveModel;
    setIsLoading(true);
    if (requestUsesLiveModel) setLiveModelStatus("contacting");
    setError("");
    setHandoffSummary("");
    setCopied(false);
    setAnnouncement("");

    try {
      const data = await callTutor({ learnerAttempt: submittedAttempt });
      const effectiveHelpRequest = data.helpRequest ?? undefined;

      if (requestUsesLiveModel) {
        setLiveModelStatus(
          data.source === "openai" ? "online" : "unavailable",
        );
      }

      setAnnouncement(announcementForTurn(data.turn, requestStageKey));
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
          problemPrompt: requestProblemPrompt,
          hasVisibleWork: data.hasVisibleWork,
        },
      ]);
      setStage(data.turn.stage);
      setAttempt("");

      const movedToTransfer =
        data.turn.stage === "transfer" && requestStageKey !== "transfer";
      if (movedToTransfer) {
        setAttemptNumber(1);
        setStageAssistanceUsed(false);
        setHandoffSummary("");
        setShowMoreHelp(false);
      } else {
        setStageAssistanceUsed(data.stageAssistanceUsed);
        setAttemptNumber((number) =>
          nextAttemptNumber(number, data.turn, data.hasVisibleWork),
        );
      }
    } catch (submissionError) {
      if (requestUsesLiveModel) setLiveModelStatus("unavailable");
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
    const requestProblemPrompt = currentPrompt;
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

      setAnnouncement(announcementForTurn(data.turn, requestStageKey));
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
          problemPrompt: requestProblemPrompt,
          hasVisibleWork: data.hasVisibleWork,
        },
      ]);
      setStage(data.turn.stage);

      const movedToTransfer =
        data.turn.stage === "transfer" && requestStageKey !== "transfer";
      if (movedToTransfer) {
        setAttemptNumber(1);
        setStageAssistanceUsed(false);
        setHandoffSummary("");
        setShowMoreHelp(false);
      } else {
        setStageAssistanceUsed(data.stageAssistanceUsed);
        setAttemptNumber((number) =>
          nextAttemptNumber(number, data.turn, data.hasVisibleWork),
        );
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
    setShowMoreHelp(false);
    setHasStarted(true);
    window.requestAnimationFrame(() => attemptRef.current?.focus());
  }

  return (
    <main className="tf-app-shell min-h-screen overflow-hidden">
      <div className="tf-ambient pointer-events-none fixed inset-0" />
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <p id="model-routing-description" className="sr-only">
        Selected means the next ordinary attempt will try GPT-5.6. Online is
        confirmed only after a successful response. Help signals always use the
        deterministic safeguard. Every response names its actual source.
      </p>

      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7 lg:px-10">
        <header
          style={{ animationDelay: "960ms" }}
          className="tf-app-reveal tf-supporting-context flex items-center justify-between border-b border-white/10 pb-4 sm:pb-6"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-500 font-black text-[#06112d] shadow-lg shadow-cyan-400/20">
              TF
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">ThinkFirst Tutor</p>
              <p className="text-xs text-slate-400">
                Attempt first · Help always available
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeControl />
            {view === "solve" && (
              <label
                data-live-state={displayedLiveModelStatus}
                className={classes(
                  "tf-live-control flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-2 text-xs sm:gap-3 sm:px-3",
                  isLoading ? "cursor-wait" : "cursor-pointer",
                  displayedLiveModelStatus === "unavailable"
                    ? "text-amber-200"
                    : displayedLiveModelStatus === "off"
                      ? "text-slate-400"
                      : "text-cyan-200",
                )}
              >
                <span
                  aria-hidden="true"
                  className={classes(
                    "h-1.5 w-1.5 rounded-full",
                    displayedLiveModelStatus === "online"
                      ? "tf-live-dot bg-cyan-300"
                      : displayedLiveModelStatus === "contacting"
                        ? "tf-live-dot bg-blue-300"
                        : displayedLiveModelStatus === "unavailable"
                          ? "bg-amber-300"
                          : "bg-slate-400",
                  )}
                />
                <span
                  data-live-status-label
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="sm:hidden">
                    {liveModelStatusLabel(displayedLiveModelStatus, true)}
                  </span>
                  <span className="hidden sm:inline">
                    {liveModelStatusLabel(displayedLiveModelStatus)}
                  </span>
                </span>
                <input
                  type="checkbox"
                  aria-label="Prefer live GPT-5.6"
                  aria-describedby="model-routing-description"
                  checked={useLiveModel}
                  disabled={isLoading}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setUseLiveModel(enabled);
                    if (enabled) setLiveModelStatus("selected");
                  }}
                  className="peer sr-only"
                />
                <span className="relative h-5 w-9 rounded-full bg-slate-600 transition peer-checked:bg-cyan-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
              </label>
            )}
          </div>
        </header>

        {view === "start" && (
          <section
            data-app-view="start"
            aria-labelledby="start-title"
            className="grid min-h-[calc(100vh-8rem)] place-items-center py-12 text-center sm:py-16"
          >
            <div className="mx-auto max-w-4xl">
              <h1
                id="start-title"
                aria-label="Think first. Ask safely. Return to independent action."
                className="text-[2.65rem] font-black leading-[1.02] tracking-[-0.055em] sm:text-6xl lg:text-7xl"
              >
                <span className="tf-intro-phrase">Think first.</span>{" "}
                <span
                  style={{ animationDelay: "140ms" }}
                  className="tf-intro-phrase"
                >
                  Ask safely.
                </span>{" "}
                <span
                  style={{ animationDelay: "280ms" }}
                  className="tf-intro-phrase"
                >
                  Return to
                </span>{" "}
                <span
                  style={{ animationDelay: "420ms" }}
                  className="tf-intro-phrase bg-gradient-to-r from-cyan-300 to-lime-300 bg-clip-text text-transparent"
                >
                  independent action.
                </span>
              </h1>
              <p
                style={{ animationDelay: "1080ms" }}
                className="tf-app-reveal mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg"
              >
                Show one step you trust. Get the smallest useful help. Then prove
                the strategy on a fresh problem.
              </p>
              <button
                type="button"
                onClick={startProblem}
                style={{ animationDelay: "1180ms" }}
                className="tf-app-reveal mt-8 rounded-2xl bg-gradient-to-r from-cyan-300 to-lime-300 px-7 py-3.5 text-base font-black text-[#06112d] shadow-xl shadow-cyan-400/15 transition hover:scale-[1.02] hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30"
              >
                Start a problem
              </button>
            </div>
          </section>
        )}

        {view === "solve" && (
          <section
            data-app-view="solve"
            aria-labelledby="problem-heading"
            className="tf-state-enter mx-auto max-w-4xl space-y-5 py-6 sm:space-y-6 sm:py-8"
          >
            <ProgressRail items={learningProgress} />

            <div
              aria-busy={isLoading}
              className="tf-learning-workspace overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1837]/90 shadow-2xl shadow-black/20"
            >
              <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7 sm:py-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                    {isTransfer
                      ? "Independent transfer"
                      : `${problem.title} · Generated equation`}
                  </p>
                  <h1
                    ref={problemHeadingRef}
                    id="problem-heading"
                    tabIndex={-1}
                    key={`${currentStageKey}-${problem.id}-${problemTransition}`}
                    aria-label={currentPrompt}
                    data-problem-id={problem.id}
                    data-problem-transition={
                      animateProblemChange ? problemTransition : "initial"
                    }
                    className={classes(
                      "tf-problem-heading -mx-2 mt-1 inline-block rounded-xl px-2 py-1 text-xl font-bold sm:text-2xl",
                      animateProblemChange && "tf-problem-change",
                    )}
                  >
                    <EquationPrompt
                      equation={currentEquation}
                      changedParts={changedProblemParts}
                      animateChanges={animateProblemChange}
                      transfer={isTransfer}
                    />
                  </h1>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-400">
                  Skill: {problem.skill}
                </div>
              </div>

              <div className="space-y-6 p-5 sm:p-7">
                {history.length === 0 && (
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-4 text-sm leading-6 text-slate-300">
                    <p className="font-semibold text-cyan-100">
                      Think before responding.
                    </p>
                    <p className="mt-1">
                      Give the most complete attempt you can justify. If you’re
                      unsure, stop at the last step you trust.
                    </p>
                  </div>
                )}

                {history.length > 0 && (
                  <div
                    data-conversation="tutor-conversation"
                    className="space-y-7"
                  >
                    {history.map((exchange, index) => (
                      <ConversationExchange
                        key={`${exchange.stageKey}-${index}-${exchange.helpRequest ?? "attempt"}`}
                        exchange={exchange}
                        index={index}
                        showOriginalProblem={
                          currentStageKey === "transfer" &&
                          exchange.stageKey === "main" &&
                          firstMainExchangeIndex === index
                        }
                      />
                    ))}
                  </div>
                )}

                <form onSubmit={submitAttempt} className="space-y-4">
                  <div>
                    <label
                      htmlFor="attempt"
                      className="text-sm font-semibold text-slate-200"
                    >
                      {isTransfer
                        ? "Solve this one and show the steps you choose"
                        : `Attempt ${attemptNumber}`}
                    </label>
                  </div>
                  <textarea
                    ref={attemptRef}
                    id="attempt"
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    value={attempt}
                    onChange={(event) => setAttempt(event.target.value)}
                    onKeyDown={submitAttemptShortcut}
                    placeholder={
                      isTransfer
                        ? "Show the operations you would undo..."
                        : "Write your attempt..."
                    }
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[#07122d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
                  />

                  <p className="-mt-2 hidden text-right text-[11px] text-slate-500 sm:block">
                    Enter for a new line · Ctrl/⌘ + Enter to check
                  </p>

                  <div
                    data-composer-actions
                    className="flex items-stretch justify-end gap-1.5 pt-1 sm:gap-2"
                  >
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
                      data-composer-action="help"
                      data-help-prompt={helpPromptReady ? "ready" : "waiting"}
                      onClick={toggleHelpPanel}
                      className={classes(
                        "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-2 text-xs font-bold text-violet-200 transition hover:border-violet-300/40 hover:bg-violet-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 sm:text-sm",
                        (helpPromptReady || showHelpPanel) && "gap-1.5 sm:px-3",
                      )}
                    >
                      {!helpPromptReady && !showHelpPanel && (
                        <span aria-hidden="true">?</span>
                      )}
                      {(helpPromptReady || showHelpPanel) && (
                        <span className="tf-state-enter whitespace-nowrap">
                          {showHelpPanel ? "Hide help" : "Need help?"}
                        </span>
                      )}
                    </button>
                    <button
                      type="submit"
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      disabled={!attempt.trim() || isLoading}
                      data-composer-action="check"
                      className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-gradient-to-r from-cyan-300 to-cyan-400 px-3 text-xs font-black text-[#06112d] shadow-lg shadow-cyan-400/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 sm:text-sm"
                    >
                      {isLoading ? "Thinking…" : "Check my thinking"}
                    </button>
                  </div>

                  {error && (
                    <p role="alert" className="tf-state-enter text-sm text-rose-300">
                      {error}
                    </p>
                  )}

                  <div className="space-y-3">
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
                        Attempts prefer GPT-5.6 when enabled. Help signals always
                        use the deterministic safeguard. Every response names its
                        actual source.
                      </p>

                      {helpPromptReady && (
                        <div className="tf-state-enter mt-4 flex flex-col gap-2 border-t border-violet-200/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-slate-400">
                            Need a clean start instead?
                          </p>
                          <button
                            type="button"
                            onClick={resetDemo}
                            disabled={isLoading}
                            className="self-start rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
                          >
                            Try a different problem
                          </button>
                        </div>
                      )}
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
              </div>
            </div>
          </section>
        )}

        {view === "summary" && (
          <section
            data-app-view="summary"
            data-summary-outcome={stage === "complete" ? "independent" : "assisted"}
            aria-labelledby="summary-title"
            className="tf-state-enter mx-auto max-w-3xl space-y-5 py-8 sm:space-y-6 sm:py-12"
          >
            <ProgressRail items={learningProgress} />

            <div
              className={classes(
                "rounded-[28px] border p-6 shadow-2xl shadow-black/20 sm:p-8",
                stage === "complete"
                  ? "border-lime-300/20 bg-lime-300/[0.07]"
                  : "border-amber-300/25 bg-amber-300/[0.07]",
              )}
            >
              <p
                className={classes(
                  "text-xs font-bold uppercase tracking-[0.16em]",
                  stage === "complete" ? "text-lime-200" : "text-amber-200",
                )}
              >
                Learning summary
              </p>
              <h1
                ref={summaryHeadingRef}
                id="summary-title"
                tabIndex={-1}
                className="mt-2 text-3xl font-black tracking-[-0.03em] outline-none sm:text-4xl"
              >
                {stage === "complete"
                  ? "Independent transfer verified"
                  : "Transfer completed with support"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                {stage === "complete"
                  ? "You applied the strategy to a fresh equation without support during the transfer stage."
                  : "This is progress, but it is not independent mastery yet. A fresh problem without hints is the next required check."}
              </p>

              <div className="mt-6 rounded-2xl border border-white/10 bg-[#07122d]/70 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">
                  Transfer problem
                </p>
                <p
                  aria-label={problem.transferProblem.prompt}
                  data-problem-id={problem.id}
                  className="mt-1 text-lg font-bold text-white"
                >
                  <EquationPrompt
                    equation={problem.transferProblem.equation}
                    changedParts={[]}
                    animateChanges={false}
                    transfer
                  />
                </p>

                {latest && (
                  <div className="mt-4 flex justify-end" data-summary-attempt>
                    <div className="max-w-[88%] rounded-2xl rounded-br-md bg-blue-500/15 px-4 py-3 text-sm text-blue-50 ring-1 ring-blue-300/15 sm:max-w-[78%]">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-300">
                          Your final transfer attempt
                        </p>
                        <SourceBadge source={latest.source} model={latest.model} />
                      </div>
                      <p className="whitespace-pre-wrap break-words leading-6">
                        {latest.attempt}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <section aria-labelledby="evidence-title" className="mt-6">
                <h2 id="evidence-title" className="mb-3 text-lg font-bold">
                  Learning evidence
                </h2>
                <EvidenceGrid items={learningEvidence} />
              </section>

              <button
                type="button"
                onClick={resetDemo}
                className={classes(
                  "mt-7 w-full rounded-2xl px-5 py-3 text-sm font-black transition hover:brightness-110 sm:w-auto",
                  stage === "complete"
                    ? "bg-lime-300 text-[#06112d]"
                    : "bg-amber-300 text-[#191003]",
                )}
              >
                {stage === "complete"
                  ? "Try another problem"
                  : "Start fresh independent check"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
