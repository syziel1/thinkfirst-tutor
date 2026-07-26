interface AiTransparencyNoticeProps {
  disabled: boolean;
  liveModelEnabled: boolean;
  onAskPerson: () => void;
}

export function AiTransparencyNotice({
  disabled,
  liveModelEnabled,
  onAskPerson,
}: AiTransparencyNoticeProps) {
  return (
    <aside
      aria-labelledby="ai-transparency-title"
      data-ai-transparency-notice
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.055] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="ai-transparency-title"
              className="text-sm font-bold text-cyan-100"
            >
              AI tutor option
            </h2>
            <span
              data-ai-routing-state={liveModelEnabled ? "live-on" : "live-off"}
              className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300"
            >
              {liveModelEnabled ? "Live GPT is on" : "Live GPT is off"}
            </span>
          </div>
          <p
            id="ai-tutor-live-description"
            className="mt-2 text-sm leading-6 text-slate-300"
          >
            GPT-5.6 can generate guidance when Live GPT is on. AI can make
            mistakes, and this tutor does not by itself determine an official
            grade or high-stakes decision. Every response names its actual
            source.
          </p>
        </div>

        <button
          type="button"
          onClick={onAskPerson}
          disabled={disabled}
          className="shrink-0 self-start rounded-xl border border-violet-200/35 bg-violet-200/10 px-3 py-2 text-xs font-bold text-violet-100 transition hover:bg-violet-200/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask a person
        </button>
      </div>

      <details id="ai-transparency-details" className="mt-4">
        <summary className="w-fit cursor-pointer rounded-lg text-xs font-bold text-cyan-200 outline-none hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300/50">
          How AI, safeguards, and data differ
        </summary>
        <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-400 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
            <p className="font-bold text-slate-200">Response sources</p>
            <p className="mt-1">
              “Answered by GPT-5.6” is generative AI. “Deterministic
              safeguard” and “Demo safeguard used” come from fixed application
              rules. “GPT unavailable · safeguard used” means an automatic
              fallback produced the response.
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
            <p className="font-bold text-slate-200">When Live GPT is used</p>
            <p className="mt-1">
              The server sends the current and transfer problem details, your
              current written attempt, and limited tutor-stage context to
              OpenAI. It does not send the visible conversation transcript. A
              one-way safety identifier is included, and response storage is
              requested off.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          “Ask a person” prepares a local handoff preview that you can review or
          use to report a problem. No message is sent to a person automatically.
        </p>
      </details>
    </aside>
  );
}
