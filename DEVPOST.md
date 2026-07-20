# ThinkFirst Tutor — Devpost submission package

## Submission facts

- **Track:** Education
- **Tagline:** An AI math tutor that protects productive struggle and verifies independent transfer.
- **Demo:** https://thinkfirst-tutor.vercel.app
- **Repository:** https://github.com/syziel1/thinkfirst-tutor
- **Deadline:** July 21, 2026 at 5:00 PM PDT / July 22 at 02:00 CEST

## Project Story

### Inspiration

AI tutors are often optimized to produce an answer as quickly as possible. That
can erase the exact moment when a learner needs to decide what to try next.
ThinkFirst Tutor explores a different contract: the learner thinks first, the AI
responds to visible work, and success means solving a new problem independently.

### What it does

ThinkFirst starts with a meaningful learner attempt. It diagnoses the likely
misconception without exposing hidden reasoning or the final answer, then gives
the smallest useful intervention. A first response is usually one Socratic
question. Hints escalate gradually only when another attempt shows they are
needed.

Solving the original equation does not complete the session. It unlocks a
distinct transfer problem, and the tutor marks the lesson complete only when the
learner applies the same strategy successfully in that new context.

### How we built it

The application uses the Next.js App Router and a server-only tutor endpoint.
Learner input is validated at runtime with Zod. Live turns use GPT-5.6 through
the OpenAI Responses API and Zod-backed Structured Outputs. A second policy
check rejects an incorrect turn if it reveals the protected answer.

A deterministic policy implements the same state transitions without external
credentials. It makes the complete judging path reliable while also serving as
the safe fallback if a live model request fails.

### How Codex and GPT-5.6 were used

Codex was the primary implementation partner. It helped turn the educational
principles into explicit state transitions, built the responsive interface and
server boundary, wrote policy tests, prepared the production deployment, and
walked the full learner journey in a real browser on desktop and mobile.

GPT-5.6 is the live pedagogical engine. It receives the visible learner attempt,
the current stage, and the attempt count, then returns a concise diagnosis,
feedback, next question, hint level, and next stage as validated structured data.
The model never receives permission to reveal hidden chain-of-thought or skip to
the protected final answer.

### Challenges

The central challenge was not generating a mathematically correct response. It
was keeping every response pedagogically bounded. The tutor needs enough context
to diagnose a misconception while remaining unable to shortcut the learner's
work. We addressed that with a narrow schema, explicit stage rules, protected
answer checks, and a deterministic fallback that can be tested exhaustively.

### Accomplishments

- A visible attempt-first tutoring loop rather than an answer chat.
- Graduated hints with one Socratic question at the first level.
- Runtime validation on both learner input and model output.
- A distinct transfer problem as the completion gate.
- Seeded equation generation with coefficient-aware diagnosis and hints.
- A credential-free deterministic path for reliable judging.
- A responsive public deployment with the complete path verified at 1440px and 390px.

### What we learned

The most useful AI tutoring metric may be what the learner can do after the
conversation. Treating transfer as a product state—not just an educational
aspiration—changed the API schema, UI progress model, test cases, and definition
of done.

### What's next

Next steps are a broader problem library, teacher-authored misconception maps,
and evaluation sets that compare hint helpfulness with independent transfer.
Those extensions are intentionally outside this Build Week MVP: the current demo
stays focused, inspectable, and easy for judges to test.

## Built With

- Codex
- GPT-5.6
- OpenAI Responses API
- Structured Outputs
- Next.js 16 App Router
- React 19
- TypeScript
- Zod
- Tailwind CSS
- Vitest
- Vercel

## Judge test path

1. Open https://thinkfirst-tutor.vercel.app.
2. Turn off **Live GPT-5.6** to select the deterministic path.
3. Refresh once or choose **New problem** to confirm that the coefficients
   change while the server can reconstruct the seeded equation.
4. Choose **Demo: stopped early** and submit.
5. Confirm the level-one intervention asks what operation isolates `x` and does not reveal the answer.
6. Finish the generated equation to unlock its transfer problem.
7. Solve the transfer equation to reach **Independent transfer verified**.

## Demo video outline (maximum 3 minutes)

The final video must be publicly accessible on YouTube (public or unlisted) and
include voiceover covering the product, Codex, and GPT-5.6.

The recording-ready English voiceover and shot list are in
[`devpost/VIDEO_SCRIPT.md`](./devpost/VIDEO_SCRIPT.md).

1. **0:00–0:20 — Problem and promise.** Explain that answer-first AI can remove productive struggle. Introduce the attempt-first contract.
2. **0:20–1:20 — Product demo.** Submit a stopped-early value, show the diagnosis and Socratic hint, finish the generated equation, then solve its transfer task.
3. **1:20–2:05 — GPT-5.6.** Show Live mode and explain the server-side Responses API, Structured Outputs, runtime validation, and protected-answer guard.
4. **2:05–2:40 — Codex.** Show the dated commits, policy tests, and responsive UI while explaining how Codex accelerated product decisions, implementation, and verification.
5. **2:40–2:55 — Close.** Return to the completed transfer state and restate: measure what the learner can do after the conversation.

## Prepared media

- `devpost/assets/thinkfirst-tutor-cover.png` (3:2 project cover)
- `devpost/assets/desktop-start.png`
- `devpost/assets/desktop-transfer-complete.png`
- `devpost/assets/mobile-transfer-complete.png`

## Final submission checklist

- [x] Public production URL
- [x] Public repository URL
- [ ] Education track selected in the Devpost form
- [x] Project Story drafted
- [x] Built With list drafted
- [x] 3:2 project cover generated
- [x] Final desktop and mobile screenshots recaptured from production
- [x] Repository licensed under MIT
- [x] Recording-ready English voiceover and shot list drafted
- [ ] Configure and verify `OPENAI_API_KEY` in production
- [ ] Add the primary Codex `/feedback` Session ID
- [ ] Record voiceover, upload a publicly accessible YouTube video, and add its URL
- [ ] Complete the Devpost form and submit before the deadline
