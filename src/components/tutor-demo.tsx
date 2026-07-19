"use client";

import { FormEvent, useState } from "react";

import {
  createSeededProblem,
  formatPartialDistribution,
  nextDistinctProblemSeed,
} from "@/lib/tutor/problems";
import type { TutorStage, TutorTurn } from "@/lib/tutor/types";

type TutorSource = "openai" | "deterministic-demo" | "deterministic-fallback";

interface Exchange {
  attempt: string;
  turn: TutorTurn;
  source: TutorSource;
  model: string | null;
}

const progressSteps = ["Attempt", "Diagnose", "Guide", "Transfer"];

const stageIndex: Record<TutorStage, number> = {
  attempt: 0,
  diagnosis: 1,
  guided_retry: 2,
  transfer: 3,
  complete: 4,
};

function classes(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

function SourceBadge({ source, model }: Pick<Exchange, "source" | "model">) {
  const isLive = source === "openai";

  return (
    <span
      className={classes(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        isLive
          ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/5 text-slate-300",
      )}
    >
      <span
        className={classes(
          "h-1.5 w-1.5 rounded-full",
          isLive ? "bg-cyan-300" : "bg-slate-400",
        )}
      />
      {isLive ? model : "Deterministic safeguard"}
    </span>
  );
}

interface TutorDemoProps {
  initialProblemSeed: number;
}

export function TutorDemo({ initialProblemSeed }: TutorDemoProps) {
  const [problemSeed, setProblemSeed] = useState(initialProblemSeed);
  const [attempt, setAttempt] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [stage, setStage] = useState<TutorStage>("attempt");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [useLiveModel, setUseLiveModel] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const problem = createSeededProblem(problemSeed);
  const latest = history.at(-1);
  const activeStep = stageIndex[stage];
  const isTransfer = stage === "transfer" || stage === "complete";
  const currentPrompt = isTransfer
    ? problem.transferProblem.prompt
    : problem.prompt;

  const learningEvidence = [
    {
      label: "Initial attempt",
      value: history.length > 0 ? "Captured" : "Waiting",
      ready: history.length > 0,
    },
    {
      label: "Misconception",
      value: latest
        ? latest.turn.misconception.replaceAll("_", " ")
        : "Not diagnosed",
      ready: Boolean(latest),
    },
    {
      label: "Hint level",
      value: latest ? latest.turn.hintLevel + " of 3" : "0 of 3",
      ready: Boolean(latest?.turn.hintLevel),
    },
    {
      label: "Transfer check",
      value:
        stage === "complete"
          ? "Passed"
          : isTransfer
            ? "In progress"
            : "Locked",
      ready: isTransfer,
    },
  ];

  async function submitAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attempt.trim() || isLoading || stage === "complete") return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          learnerAttempt: attempt,
          attemptNumber,
          currentStage: stage,
          useLiveModel,
        }),
      });

      if (!response.ok) {
        throw new Error("The tutor could not evaluate this attempt.");
      }

      const data = (await response.json()) as {
        turn: TutorTurn;
        source: TutorSource;
        model: string | null;
      };

      setHistory((items) => [
        ...items,
        {
          attempt: attempt.trim(),
          turn: data.turn,
          source: data.source,
          model: data.model,
        },
      ]);
      setStage(data.turn.stage);
      setAttempt("");

      if (data.turn.stage === "transfer" && stage !== "transfer") {
        setAttemptNumber(1);
      } else if (!data.turn.isCorrect) {
        setAttemptNumber((number) => Math.min(number + 1, 10));
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

  function resetDemo() {
    setProblemSeed((seed) => nextDistinctProblemSeed(seed));
    setAttempt("");
    setAttemptNumber(1);
    setStage("attempt");
    setHistory([]);
    setError("");
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
              <p className="text-xs text-slate-400">OpenAI Build Week · Education</p>
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
              Attempt before assistance
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              An AI tutor that protects the moment when{" "}
              <span className="bg-gradient-to-r from-cyan-300 to-lime-300 bg-clip-text text-transparent">
                learning happens.
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              ThinkFirst diagnoses the learner&apos;s attempt, asks one useful
              question, and escalates hints only when needed. A new problem
              verifies independent transfer.
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
                    ? "Independent transfer"
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
                    Your thinking comes first.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Write a first step or a complete attempt. The tutor will
                    respond to the reasoning it can see.
                  </p>
                </div>
              )}

              {latest && (
                <div className="space-y-4" aria-live="polite">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blue-500/15 px-4 py-3 text-sm text-blue-50 ring-1 ring-blue-300/15">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-300">
                      Learner attempt
                    </p>
                    {latest.attempt}
                  </div>

                  <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.055] p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">
                        Tutor intervention · level {latest.turn.hintLevel}
                      </p>
                      <SourceBadge
                        source={latest.source}
                        model={latest.model}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">
                          Diagnosis
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-200">
                          {latest.turn.diagnosis}
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
              )}

              {stage !== "complete" ? (
                <form onSubmit={submitAttempt} className="space-y-3">
                  <label
                    htmlFor="attempt"
                    className="text-sm font-semibold text-slate-200"
                  >
                    {isTransfer
                      ? "Solve this one independently"
                      : "Attempt " + attemptNumber}
                  </label>
                  <textarea
                    id="attempt"
                    value={attempt}
                    onChange={(event) => setAttempt(event.target.value)}
                    placeholder={
                      isTransfer
                        ? "Show the operations you would undo..."
                        : "For example: show one balanced operation..."
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

                  {error && <p className="text-sm text-rose-300">{error}</p>}

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <p className="text-xs leading-5 text-slate-500">
                      No chain-of-thought is exposed. Only a concise pedagogical
                      diagnosis.
                    </p>
                    <button
                      type="submit"
                      disabled={!attempt.trim() || isLoading}
                      className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-300 to-cyan-400 px-5 py-3 text-sm font-black text-[#06112d] shadow-lg shadow-cyan-400/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isLoading ? "Thinking…" : "Check my thinking"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-2xl border border-lime-300/20 bg-lime-300/[0.07] p-5">
                  <p className="text-lg font-bold text-lime-100">
                    Independent transfer verified.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    The learner applied the strategy to a new equation. That is
                    stronger evidence than receiving the original answer.
                  </p>
                  <button
                    type="button"
                    onClick={resetDemo}
                    className="mt-4 rounded-xl border border-lime-200/30 px-4 py-2 text-sm font-bold text-lime-100 transition hover:bg-lime-200/10"
                  >
                    Try another problem
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
                “Measure what the learner can do after the conversation.”
              </blockquote>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The transfer task makes learning visible and keeps the AI
                accountable to an educational outcome.
              </p>
            </div>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Built with Codex, GPT-5.6, Next.js and the OpenAI Responses API.</p>
          <p>Deterministic fallback keeps the demo testable without credentials.</p>
        </footer>
      </div>
    </main>
  );
}
