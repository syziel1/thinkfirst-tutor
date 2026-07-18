# ThinkFirst Tutor

ThinkFirst Tutor is an AI math tutor that protects productive struggle. It asks
for an attempt first, diagnoses the learner's misconception, and responds with
Socratic questions and graduated hints before checking independent transfer.

**Public demo:** [thinkfirst-tutor.vercel.app](https://thinkfirst-tutor.vercel.app)

## OpenAI Build Week

- Category: Education
- Entrant: Sylwester Zieliński (`syziel` on Devpost)
- Development started: 2026-07-16
- Submission deadline: 2026-07-22 02:00 CEST

This repository is a standalone project created during the hackathon submission
period. The commit history and Codex session evidence document the work.

## MVP learning loop

1. The learner submits an initial attempt.
2. The tutor identifies the likely misconception without exposing hidden
   reasoning or the final solution.
3. The tutor chooses the smallest useful intervention: a question, a concept
   cue, or a worked micro-step.
4. The learner retries.
5. A transfer problem checks whether the learner can apply the idea
   independently.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- OpenAI Responses API with GPT-5.6
- Structured Outputs for the tutor state
- Vitest for the deterministic pedagogical policy
- Vercel for the public demo

## Try the learning loop

The demo contains one linear-equation lesson and a distinct transfer problem.
To run the deterministic judging path:

1. Turn off **Live GPT-5.6**.
2. Choose **Demo: stopped early**, then check the attempt.
3. Use the Socratic hint to retry with `x = 6`.
4. Solve the transfer problem with `x = 4`.

The final state should read **Independent transfer verified**. Live mode calls
GPT-5.6 from the server through the Responses API. If credentials or the model
are unavailable, the same request safely falls back to the deterministic policy.

## How GPT-5.6 is used

`src/lib/tutor/ai.ts` sends the visible learner attempt and tutor state to
GPT-5.6 through the server-side Responses API. The response is constrained by a
Zod-backed Structured Output schema, stored with `store: false`, and checked
again before it reaches the browser. Incorrect turns are rejected if they reveal
the protected final answer.

## How Codex accelerated the build

Codex was the primary implementation partner during Build Week. It translated
the productive-struggle learning policy into a strict runtime state machine,
built the App Router UI and API boundary, added deterministic policy tests, and
verified the deployed learner journey on desktop and mobile.

The key product decision was to optimize for evidence of independent transfer,
not answer delivery. That led to three implementation constraints: require a
meaningful attempt, escalate one hint level at a time, and unlock completion only
after the learner solves a new problem. The dated commit history records the MVP
work completed during the submission period.

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
