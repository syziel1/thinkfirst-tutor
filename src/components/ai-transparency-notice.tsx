interface AiTransparencyNoticeProps {
  liveModelEnabled: boolean;
}

export function AiTransparencyNotice({
  liveModelEnabled,
}: AiTransparencyNoticeProps) {
  return (
    <aside
      aria-labelledby="ai-transparency-title"
      data-ai-transparency-notice
      className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] px-4 py-3 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="ai-transparency-title"
          className="text-sm font-bold text-cyan-100"
        >
          AI guidance
        </h2>
        <span
          data-ai-routing-state={liveModelEnabled ? "live-on" : "live-off"}
          className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300"
        >
          {liveModelEnabled ? "GPT-5.6 preferred" : "Built-in rules preferred"}
        </span>
      </div>
      <p
        id="ai-tutor-live-description"
        className="mt-1.5 text-sm leading-6 text-slate-300"
      >
        AI guidance is optional. Check each step; every reply shows whether it
        came from GPT-5.6 or built-in rules.
      </p>

      <details id="ai-transparency-details" className="mt-2.5">
        <summary className="w-fit cursor-pointer rounded-lg text-xs font-bold text-cyan-200 outline-none hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300/50">
          AI, safeguards, and data
        </summary>
        <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-400 sm:grid-cols-3">
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
            <p className="font-bold text-slate-200">Role and limits</p>
            <p className="mt-1">
              GPT-5.6 can make mistakes. Its guidance is formative and does not
              determine an official grade or high-stakes decision.
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
          “Ask a person” is available under “Need help?” and prepares a local
          handoff preview. No message is sent to a person automatically.
        </p>
      </details>
    </aside>
  );
}
