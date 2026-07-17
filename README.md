# ThinkFirst Tutor

ThinkFirst Tutor is an AI math tutor that protects productive struggle. It asks
for an attempt first, diagnoses the learner's misconception, and responds with
Socratic questions and graduated hints before checking independent transfer.

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

## Planned stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- OpenAI Responses API with GPT-5.6
- Structured Outputs for the tutor state
- Vitest for the deterministic pedagogical policy
- Vercel for the public demo

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The app will include a deterministic demo mode so the learning flow can be
reviewed without an API key. Live AI responses require `OPENAI_API_KEY`.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
```

## Hackathon evidence

The final submission will identify the functionality added during the event,
include dated commits, and reference the Codex `/feedback` session used for the
majority of the implementation.
