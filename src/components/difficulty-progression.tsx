"use client";

import {
  EQUATION_LEVELS,
  equationLevelDefinition,
} from "@/lib/tutor/problems";
import type { EquationLevel } from "@/lib/tutor/types";

function classes(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function DifficultyProgression({
  currentLevel,
  highestUnlocked,
  disabled = false,
  onSelect,
}: {
  currentLevel: EquationLevel;
  highestUnlocked: EquationLevel;
  disabled?: boolean;
  onSelect: (level: EquationLevel) => void;
}) {
  const current = equationLevelDefinition(currentLevel);

  return (
    <section
      aria-labelledby="difficulty-title"
      data-current-level={currentLevel}
      data-highest-unlocked-level={highestUnlocked}
      className="tf-level-path rounded-2xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p
            id="difficulty-title"
            className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-300"
          >
            Equation path
          </p>
          <p className="mt-1 text-sm font-bold text-white">
            Level {currentLevel}: {current.title}
          </p>
        </div>
        <p className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          {highestUnlocked === 5
            ? "All levels unlocked"
            : `Levels 1–${highestUnlocked} unlocked`}
        </p>
      </div>

      <ol className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
        {EQUATION_LEVELS.map((level) => {
          const definition = equationLevelDefinition(level);
          const unlocked = level <= highestUnlocked;
          const selected = level === currentLevel;

          return (
            <li key={level}>
              <button
                type="button"
                disabled={disabled || !unlocked}
                aria-current={selected ? "step" : undefined}
                data-level={level}
                data-level-status={
                  selected ? "current" : unlocked ? "unlocked" : "locked"
                }
                onClick={() => onSelect(level)}
                className={classes(
                  "tf-level-option flex min-h-14 w-full flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
                  selected &&
                    "border-cyan-300/50 bg-cyan-300/15 text-cyan-50",
                  unlocked &&
                    !selected &&
                    "border-white/10 bg-white/[0.035] text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-300/[0.07]",
                  !unlocked &&
                    "cursor-not-allowed border-white/[0.06] bg-black/10 text-slate-600",
                )}
              >
                <span className="text-sm font-black">
                  Level {level}
                </span>
                {" "}
                <span className="hidden text-[10px] font-semibold leading-3 sm:block">
                  {definition.shortTitle}
                </span>
                {selected && <span className="sr-only">, current level</span>}
                {!unlocked && <span className="sr-only">, locked</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs leading-5 text-slate-400">
        {highestUnlocked === 5
          ? "Choose any level. A new problem always stays at the selected level."
          : `Complete Level ${highestUnlocked}’s transfer problem independently to unlock Level ${highestUnlocked + 1}. If you use support during transfer, you’ll get a fresh same-level check instead.`}
      </p>
    </section>
  );
}
