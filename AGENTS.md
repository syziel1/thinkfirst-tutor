# ThinkFirst Tutor agent guidance

## Product goal

Build a focused OpenAI Build Week education demo that develops independent
mathematical problem solving instead of optimizing for answer delivery.

## Non-negotiable learning behavior

- Require a meaningful learner attempt before substantive solution help, while
  allowing a learner to signal that they are stuck without a complete question.
- Treat help-seeking as learner agency, not failure or dependence.
- Preserve dignity: never shame, moralize, infantilize, or infer motivation,
  emotion, trauma, diagnosis, or character from an incorrect response.
- Diagnose the mathematical misconception, but do not reveal hidden chain-of-thought.
- Prefer one Socratic question over an explanation when it can unblock progress.
- Escalate hints gradually and never skip directly to the final answer.
- Allow an explicit request for a person without trapping the learner in an AI flow.
- Preserve only the minimum useful task context in a human handoff preview.
- Finish successful guidance with a distinct transfer problem.
- Never label transfer completed after support as independent mastery.
- Keep every UI state demoable and understandable without reading logs.

## Engineering constraints

- Use the Next.js App Router and TypeScript strict mode.
- Keep OpenAI calls server-side.
- Use GPT-5.6 through the Responses API with Structured Outputs.
- Keep a deterministic demo fallback and deterministic help-seeking safeguard.
- Validate all model output and learner input at runtime.
- Do not add authentication, payments, a database, or a real teacher messaging
  backend during the MVP sprint.
- Be explicit that the handoff preview is local and no message is sent automatically.

## Required checks

Run `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm verify:http` before declaring work complete.
