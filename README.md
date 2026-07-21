# ThinkFirst Tutor

ThinkFirst Tutor is an AI math tutor that protects productive struggle. It asks
for an attempt first, diagnoses the learner's misconception, and responds with
Socratic questions and graduated hints before checking independent transfer.
It also provides low-friction help signals for learners who are stuck but cannot
yet formulate a complete question.

- **Public demo:** [thinkfirst-tutor.vercel.app](https://thinkfirst-tutor.vercel.app)
- **Devpost submission:** [ThinkFirst Tutor](https://devpost.com/software/thinkfirst-tutor)
- **Demo video:** [ThinkFirst Tutor — OpenAI Build Week Demo](https://www.youtube.com/watch?v=COHgbupPHts)

## OpenAI Build Week

- Category: Education
- Entrant: Sylwester Zieliński (`syziel` on Devpost)
- Development started: 2026-07-16
- Submission deadline: 2026-07-22 02:00 CEST

This repository is a standalone project created during the hackathon submission
period. The commit history and Codex session evidence document the work.

## MVP learning loop

1. The learner submits an initial attempt or uses a private, low-friction help signal.
2. The tutor identifies the likely mathematical misconception without exposing
   hidden reasoning, diagnosing emotion, or revealing the final solution.
3. The tutor chooses the smallest useful intervention: an orientation question,
   a Socratic prompt, a concept cue, or a worked micro-step.
4. The learner retries.
5. A transfer problem checks whether the learner can apply the idea independently.
6. Transfer completed after support is recorded as **assisted**, not independent.

## Safe help-seeking

The learner may choose:

- **I'm stuck**
- **I don't know how to start**
- **Check my last step**
- **Give me a small hint**
- **Ask a person**

A well-formed question is not required before support. The current attempt stays
visible, help does not reduce a score, and the tutor does not infer anxiety,
motivation, attention, diagnosis, or character from the request.

Explicit help signals use a deterministic safeguard even when Live GPT-5.6 is
enabled. This makes the dignity and escalation contract stable and testable.

### Human handoff demo

The MVP has no authentication, database, teacher queue, or messaging backend.
`Ask a person` therefore creates a local, privacy-minimized handoff preview that
can be copied. It contains only the current problem, visible attempt, latest
automated hypothesis, hint level, and unresolved next step.

**No message is sent automatically.** The automated diagnosis is labelled as a
hypothesis for a teacher to confirm or correct.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- OpenAI Responses API with GPT-5.6
- Structured Outputs for the tutor state
- Vitest for the deterministic pedagogical and help-seeking policies
- Vercel for the public demo

## Try the learning loop

The demo generates a fresh, reproducible linear equation on every visit. Each
seed produces its own coefficients and distinct transfer problem. Use **New
problem** to generate another set. To run the deterministic judging path:

1. Turn off **Live GPT-5.6**.
2. Choose **Demo: stopped early**, then check the attempt.
3. Use the equation-specific Socratic hint to finish isolating `x`.
4. Solve the generated transfer problem independently.

The final state should read **Independent transfer verified**. Live mode calls
GPT-5.6 from the server through the Responses API. If credentials or the model
are unavailable, the same request safely falls back to the deterministic policy.
The deterministic reaction matrix covers correct intermediate steps, common
misconceptions, graduated hints, transfer behavior, help signals, and assisted
completion across generated seeds.

To review the new trust and dignity flow, leave the attempt blank and choose
**I'm stuck** or **Ask a person**. The former offers a bounded orientation prompt;
the latter creates a local handoff preview without sending any data.

## How GPT-5.6 is used

`src/lib/tutor/ai.ts` sends the visible learner attempt and tutor state to
GPT-5.6 through the server-side Responses API. The response is constrained by a
Zod-backed Structured Output schema, stored with `store: false`, and checked
again before it reaches the browser. Incorrect turns are rejected if they reveal
the protected final answer.

Explicit help requests are handled by `src/lib/tutor/help-policy.ts` through a
deterministic safeguard. The live model receives whether support was already
used during the transfer stage so it cannot label assisted work independent.

## How Codex and GPT-5.6 Sol were used

Codex, powered by GPT-5.6 Sol with reasoning effort set to Ultra, was the
primary implementation partner during Build Week. It helped translate the
learning principles into an explicit state machine, implement the interface
and server-side API boundary, convert observed tutoring failures into
regression tests, prepare pull requests, and verify the deployed learning
journey in a real browser.

The entrant remained responsible for the educational principles, product
decisions, testing the application as a learner, and evaluating whether each
response was mathematically and pedagogically appropriate.

GPT-5.6 Sol was also used through Codex to assemble the final demo video from
recorded application screens, narration, and synchronized captions.

This development-time use is separate from the application's live tutoring
engine, which calls GPT-5.6 through the OpenAI Responses API.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The app includes a deterministic demo mode so the learning flow can be reviewed
without an API key. Live AI responses require `OPENAI_API_KEY`.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
pnpm verify:http
```

## Hackathon evidence

Submission copy, a video outline, screenshots, and the final eligibility
checklist are collected in [`DEVPOST.md`](./DEVPOST.md). The final submission
will reference the Codex `/feedback` session used for the majority of the
implementation.
