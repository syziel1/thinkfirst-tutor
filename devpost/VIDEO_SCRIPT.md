# ThinkFirst Tutor — demo video script

Target length: 2:40–2:55. Record in English. Keep the YouTube link public or
unlisted and verify it in a private browser window before submission.

## 0:00–0:20 — The problem

**On screen:** Open the production app and pause on the generated equation.

**Voiceover:**

> Most AI tutors optimize for giving an answer. ThinkFirst Tutor protects the
> moment when learning happens instead. The learner must make a meaningful
> attempt, the tutor responds to the visible work, and success means solving a
> new problem independently.

## 0:20–1:15 — Complete learning loop

**On screen:** Turn off Live GPT-5.6 for the reproducible judging path. Choose
"Demo: stopped early", submit, and show the diagnosis, tutor feedback, and
Socratic next step. Finish the generated equation, then solve the distinct
transfer equation until the app shows "Independent transfer verified".

**Voiceover:**

> This first step is useful, but x is not isolated. ThinkFirst diagnoses that
> exact misconception and asks one question instead of revealing the answer.
> If the learner still needs help, hints escalate from a question, to a concept
> cue, to one worked micro-step. Solving the original equation is not enough.
> A different transfer problem checks whether the learner can apply the idea
> without assistance.

## 1:15–1:55 — GPT-5.6 integration

**On screen:** Start a new problem, enable Live GPT-5.6, submit a partial step,
and hold on the source badge showing OpenAI and `gpt-5.6`.

**Voiceover:**

> Live turns use GPT-5.6 through the server-side OpenAI Responses API. The model
> receives only the visible attempt and tutor state, then returns a concise
> diagnosis, feedback, next question, hint level, and stage as Structured
> Output. Zod validates the result at runtime, and a second guard rejects an
> incorrect turn if it exposes the protected final answer. A deterministic
> policy keeps the demo reliable if credentials or the model are unavailable.

## 1:55–2:35 — How Codex accelerated the build

**On screen:** Show the GitHub commit history, the policy test summary, and a
brief mobile screenshot.

**Voiceover:**

> Codex was my primary implementation partner during Build Week. It helped turn
> the educational principles into a strict state machine, build the App Router
> interface and server boundary, generate seeded equation variants, add
> regression tests for learner misconceptions, and verify the deployed flow on
> desktop and mobile. I made the key product decision to optimize for evidence
> of independent transfer rather than answer delivery.

## 2:35–2:50 — Close

**On screen:** Return to the completed transfer state and the Learning Evidence
panel.

**Voiceover:**

> ThinkFirst Tutor asks a simple question: not what answer the AI can produce,
> but what the learner can do after the conversation.

## Final recording check

- Keep the total runtime at or below 3:00.
- Show a real `OpenAI · gpt-5.6` source badge after production credentials are
  configured.
- Do not include copyrighted music or third-party footage.
- Confirm voiceover volume and text readability on mobile.
- Open the final YouTube URL in an incognito window before adding it to Devpost.
