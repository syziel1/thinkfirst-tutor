# ThinkFirst Tutor agent guidance

## Product goal

Build a focused OpenAI Build Week education demo that develops independent
mathematical problem solving instead of optimizing for answer delivery.

## Non-negotiable learning behavior

- Require a meaningful learner attempt before substantive help.
- Diagnose the misconception, but do not reveal hidden chain-of-thought.
- Prefer one Socratic question over an explanation when it can unblock progress.
- Escalate hints gradually and never skip directly to the final answer.
- Finish successful guidance with a distinct transfer problem.
- Keep every UI state demoable and understandable without reading logs.

## Engineering constraints

- Use the Next.js App Router and TypeScript strict mode.
- Keep OpenAI calls server-side.
- Use GPT-5.6 through the Responses API with Structured Outputs.
- Keep a deterministic demo fallback for judging without credentials.
- Validate all model output and learner input at runtime.
- Do not add authentication, payments, or a database during the MVP sprint.

## Required checks

Run `pnpm lint`, `pnpm test`, and `pnpm build` before declaring work complete.
