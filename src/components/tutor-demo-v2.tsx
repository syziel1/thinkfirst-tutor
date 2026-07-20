"use client";

import { FormEvent, useState } from "react";

import {
  buildTeacherHandoffSummary,
  helpRequestLabel,
} from "@/lib/tutor/handoff";
import {
  createSeededProblem,
  formatPartialDistribution,
  nextDistinctProblemSeed,
} from "@/lib/tutor/problems";
import type {
  HelpRequestType,
  TutorStage,
  TutorTurn,
} from "@/lib/tutor/types";

type TutorSource =
  | "openai"
  | "deterministic-demo"
  | "deterministic-fallback"
  | "deterministic-safeguard";

type StageKey = "main" | "transfer";

interface Exchange {
  attempt: string;
  turn: TutorTurn;
  source: TutorSource;
  model: string | null;
  helpRequest?: HelpRequestType;
  stageKey: StageKey;
}

const HELP_ACTIONS: Array<{
  request: HelpRequestType;
  label: string;
  emphasis?: boolean;
}> = [
  { request: "stuck", label: "I’m stuck" },
  { request: "dont_know_start", label: "I don’t know how to start" },
  { request: "check_last_step", label: "Check my last step" },
  { request: "small_hint", label: "Give me a small hint" },
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

function SourceBadge({ source, model }: Pick<Exchange, "source" | "model">) {
  const isLive = source === "openai";
  const isSafeguard = source === "deterministic-safeguard";

  return (
    <span
      className={classes(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        isLive
          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
          : isSafeguard
            ? "border-violet-300/30 bg-violet-300/10 text-violet-100"
            : "border-white/10 bg-white/5 text-slate-300",
      )}
    >
      <span
        className={classes(
          "h-1.5 w-1.5 rounded-full",
          isLive
            ? "bg-cyan-300"
            : isSafeguard
              ? "bg-violet-300"
              : "bg-slate-400",
        )}
      />
      {isLive
        ? model
        : isSafeguard
          ? "Help-seeking safeguard"
          : "Deterministic safeguard"}
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

  const problem = createSeededProblem(problemSeed);
  const latest = history.at(-1);
  const activeStep = stageIndex[stage];
  const isTerminal = stage === "complete" || stage === "assisted_complete";
  const isTransfer =
    stage === "transfer" || stage === "complete" || stage === "assisted_complete";
  const currentPrompt = isTransfer
    ? problem.transferProblem.prompt
    : problem.prompt;
  const currentStageKey: StageKey = isTransfer ? "transfer" : "main";
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
  const supportState = history.some(
    (exchange) => exchange.helpRequest === "human",
  )
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
    };
  }

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attempt.trim() || isLoading || isTerminal) return;

    const submittedAttempt = attempt.trim();
    const requestStageKey = currentStageKey;
    setIsLoading(true);
    setError("");

    try {
      const data = await callTutor({ learnerAttempt: submittedAttempt });

      setHistory((items) => [
        ...items,
        {
          attempt: submittedAttempt,
          turn: data.turn,
          source: data.source,
          model: data.model,
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
      } else {
        if (data.turn.hintLevel > 0) setStageAssistanceUsed(true);
        if (!data.turn.isCorrect) {
          setAttemptNumber((number) => Math.min(number + 1, 10));
        }
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

  async function requestHelp(helpRequest: HelpRequestType) {
    if (isLoading || isTerminal) return;

    const currentAttempt = attempt.trim();
    const requestStageKey = currentStageKey;
    setIsLoading(true);
    setError("");
    setCopied(false);

    try {
      const data = await callTutor({
        learnerAttempt: currentAttempt,
        helpRequest,
      });

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
      } else {
        setStageAssistanceUsed(true);
        if (helpRequest !== "human") {
          setAttemptNumber((number) => Math.min(number + 1, 10));
        }
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
    setProblemSeed((seed) => nextDistinctProblemSeed(seed));
    setAttempt("");
    setAttemptNumber(1);
    setStage("attempt");
    setHistory([]);
    setError("");
    setStageAssistanceUsed(false);
    setHandoffSummary("");
    setCopied(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#06112d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_8%,rgba(34,211,238,0.13),transparent_28%),radial-gradient(circle_at_18%_38%,rgba(132,204,22,0.08),transparent_24%)]" />

      <div className="relative mx-auto max-w-7xl px-5 py-7 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-500 font-black text-[#06112d] shadow-lg shadow-cyan-400/20">
              TF
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">ThinkFirst Tutor</p>
              <p className="text-xs text-slate-400">Attempt first · Help always available</p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <span className="hidden sm:inline">Live GPT-5.6</span>
            <input
              type="checkbox"
              aria-label="Use live GPT-5.6"
              checked={useLiveModel}
              onChange={(event) => setUseLiveModel(event.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-5 w-9 rounded-full bg-slate-600 transition peer-checked:bg-cyan-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
          </label>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-200">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
              Productive struggle without unsupported struggle
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Think first. Ask safely. Return to{" "}
              <span className="bg-gradient-to-r from-cyan-300 to-lime-300 bg-clip-text text-transparent">
                independent action.
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              The tutor responds to visible reasoning, offers low-friction help,
              preserves context for a person, and never calls assisted work
              independent mastery.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur">
            {progressSteps.map((step, index) => {
              const complete = activeStep > index;
              const active = activeStep === index;

              return (
                <div key={step} className="relative rounded-xl p-2 sm:p-3">
                  <div
                    className={classes(
                      "mb-3 h-1.5 rounded-full transition",
                      complete
                        ? "bg-lime-300"
                        : active
                          ? "bg-cyan-300"
                          : "bg-white/10",
                    )}
                  />
                  <p
                    className={classes(
                      "text-[10px] font-bold uppercase tracking-[0.12em] sm:text-xs",
                      complete || active ? "text-white" : "text-slate-500",
                    )}
                  >
                    {step}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1837]/90 shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                  {isTransfer
                    ? "Transfer evidence"
                    : `${problem.title} · Generated equation`}
                </p>
                <h2
                  data-problem-id={problem.id}
                  className="mt-2 text-xl font-bold sm:text-2xl"
                >
                  {currentPrompt}
                </h2>
              </div>
              {!isTransfer && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-400">
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
              {history.length === 0 && (
                <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.04] p-5">
                  <p className="text-sm font-semibold text-cyan-100">
                    Your thinking comes first, but you do not need a perfect question.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Write a step, or use a private help signal below. Asking for help
                    is part of learning agency, not a penalty.
                  </p>
                </div>
              )}

              {latest && (
                <div className="space-y-4" aria-live="polite">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blue-500/15 px-4 py-3 text-sm text-blue-50 ring-1 ring-blue-300/15">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">
                      {latest.helpRequest ? "Learner signal" : "Learner attempt"}
                    </p>
                    {latest.attempt}
                  </div>

                  <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.055] p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">
                        Tutor intervention · level {latest.turn.hintLevel}
                      </p>
                      <SourceBadge source={latest.source} model={latest.model} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">
                          Mathematical hypothesis
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-200">
                          {latest.turn.diagnosis}
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3">
                          <p className="text-xs font-semibold text-cyan-200">
                            Tutor feedback
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-200">
                            {latest.turn.feedback}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500">
                            Smallest next step
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-white">
                            {latest.turn.nextPrompt}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isTerminal ? (
                <form onSubmit={submitAttempt} className="space-y-4">
                  <label
                    htmlFor="attempt"
                    className="text-sm font-semibold text-slate-200"
                  >
                    {isTransfer
                      ? "Solve this one and show the steps you choose"
                      : `Attempt ${attemptNumber}`}
                  </label>
                  <textarea
                    id="attempt"
                    value={attempt}
                    onChange={(event) => setAttempt(event.target.value)}
                    placeholder={
                      isTransfer
                        ? "Show the operations you would undo..."
                        : "Write one balanced operation, a complete attempt, or the last step you trust..."
                    }
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-[#07122d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10"
                  />

                  {!isTransfer && history.length === 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setAttempt(
                            `x = ${problem.equation.solution + problem.equation.offset}`,
                          )
                        }
                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100"
                      >
                        Demo: stopped early
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAttempt(
                            `${formatPartialDistribution(problem.equation)} = ${problem.equation.rightSide}`,
                          )
                        }
                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100"
                      >
                        Demo: distribution error
                      </button>
                    </div>
                  )}

                  <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">
                      A lower-friction way to ask
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Your current work stays in the box. These signals do not lower
                      a score or create a psychological profile.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {HELP_ACTIONS.map((action) => (
                        <button
                          key={action.request}
                          type="button"
                          onClick={() => requestHelp(action.request)}
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
                  </div>

                  {handoffSummary && (
                    <div className="rounded-2xl border border-violet-300/20 bg-[#0b1430] p-5">
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

                  {error && <p className="text-sm text-rose-300">{error}</p>}

                  <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="text-xs leading-5 text-slate-500">
                      Help signals use the deterministic safeguard even when live GPT
                      is enabled. No hidden reasoning is exposed.
                    </p>
                    <button
                      type="submit"
                      disabled={!attempt.trim() || isLoading}
                      className="w-full shrink-0 rounded-xl bg-gradient-to-r from-cyan-300 to-cyan-400 px-5 py-3 text-sm font-black text-[#06112d] shadow-lg shadow-cyan-400/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                    >
                      {isLoading ? "Thinking…" : "Check my thinking"}
                    </button>
                  </div>
                </form>
              ) : stage === "complete" ? (
                <div className="rounded-2xl border border-lime-300/20 bg-lime-300/[0.07] p-5">
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
                <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-5">
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

          <aside className="space-y-5">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Learning evidence</h2>
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Live state
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {learningEvidence.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/10 p-3"
                  >
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span
                      className={classes(
                        "text-right text-xs font-bold capitalize",
                        item.ready ? "text-lime-200" : "text-slate-600",
                      )}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.08] to-transparent p-5">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-300">
                Design principle
              </p>
              <blockquote className="mt-3 text-lg font-bold leading-7 text-white">
                “Help should reduce the cost of asking, then return the learner to
                independent action.”
              </blockquote>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Context is preserved, automated diagnoses remain hypotheses, and
                support is recorded rather than hidden inside a green result.
              </p>
            </div>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Built with Codex, GPT-5.6, Next.js and the OpenAI Responses API.</p>
          <p>Deterministic safeguards keep help-seeking safe and testable.</p>
        </footer>
      </div>
    </main>
  );
}
