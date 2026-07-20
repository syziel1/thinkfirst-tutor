import { spawn } from "node:child_process";

const baseUrl = "http://127.0.0.1:3100";
const server = spawn(
  "pnpm",
  ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", "3100"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";

server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error("Server did not become ready.\n" + serverOutput));
    }, 20_000);

    const poll = setInterval(() => {
      if (serverOutput.includes("Ready")) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve();
      }

      if (server.exitCode !== null) {
        clearTimeout(deadline);
        clearInterval(poll);
        reject(new Error("Server exited early.\n" + serverOutput));
      }
    }, 100);
  });
}

async function postTutor(payload) {
  const response = await fetch(baseUrl + "/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Tutor request failed with " + response.status);
  }

  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await waitForServer();

  const page = await fetch(baseUrl);
  const html = await page.text();
  assert(page.ok, "Home page did not return 2xx.");
  assert(html.includes("ThinkFirst Tutor"), "Home page is missing the project title.");
  assert(
    html.includes(
      'aria-label="Think first. Ask safely. Return to independent action."',
    ),
    "Home page is missing the complete accessible hero name.",
  );
  assert(html.includes("Generated equation"), "Home page is missing the generated-equation state.");
  assert(
    /data-problem-id="linear-equation-v1-\d+"/.test(html),
    "Home page did not render a canonical seeded problem ID.",
  );
  assert(
    html.includes("Start with one step you trust"),
    "Home page is missing the concise first-attempt guidance.",
  );
  assert(
    html.includes('aria-describedby="attempt-guidance"') &&
      html.includes('id="attempt-guidance"'),
    "The attempt field is not connected to its concise guidance.",
  );
  assert(
    html.includes('aria-controls="example-attempts"') &&
      html.includes('id="example-attempts"') &&
      html.includes("Try an example attempt"),
    "Home page is missing the accessible example-attempt disclosure.",
  );
  assert(
    html.includes('aria-controls="additional-help-actions"') &&
      html.includes('id="additional-help-actions"') &&
      html.includes("More ways to ask"),
    "Home page is missing the accessible additional-help disclosure.",
  );
  assert(
    (html.match(/aria-expanded="false"/g) ?? []).length >= 2,
    "Progressive-disclosure controls do not start collapsed.",
  );
  for (const actionLabel of [
    "Demo: stopped early",
    "Demo: distribution error",
    "I’m stuck",
    "Give me a small hint",
    "I don’t know how to start",
    "Check my last step",
    "Ask a person",
  ]) {
    assert(
      html.includes(actionLabel),
      `Home page is missing the preserved action: ${actionLabel}.`,
    );
  }
  assert(
    html.includes("Ready for your first attempt"),
    "Home page is missing the condensed initial evidence state.",
  );
  assert(
    !html.includes("Latest hypothesis"),
    "The full evidence panel rendered before the first interaction.",
  );
  assert(
    html.includes("Check my thinking"),
    "Home page is missing the dominant first-attempt action.",
  );
  assert(html.includes("/icon.svg"), "Home page is missing the SVG favicon link.");
  assert(html.includes("/apple-icon.png"), "Home page is missing the Apple icon link.");
  console.log("PASS home page renders project content");

  for (const iconPath of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
    const icon = await fetch(baseUrl + iconPath);
    assert(icon.ok, `${iconPath} did not return 2xx.`);
    assert(
      icon.headers.get("content-type")?.startsWith("image/"),
      `${iconPath} did not return an image content type.`,
    );
  }
  console.log("PASS branded favicon assets are publicly available");

  const reactionScenarios = [
    {
      name: "explicit division step",
      problemId: "linear-equation-01",
      learnerAttempt: "x - 2 = 4",
      misconception: "correct_intermediate",
    },
    {
      name: "explicit distribution step",
      problemId: "linear-equation-01",
      learnerAttempt: "3x - 6 = 12",
      misconception: "correct_intermediate",
    },
    {
      name: "coefficient arithmetic error",
      problemId: "linear-equation-01",
      learnerAttempt: "3x = 6",
      misconception: "arithmetic_error",
    },
    {
      name: "second-parameter division step",
      problemId: "linear-equation-02",
      learnerAttempt: "x + 3 = 8",
      misconception: "correct_intermediate",
    },
    {
      name: "second-parameter distribution error",
      problemId: "linear-equation-02",
      learnerAttempt: "5x + 3 = 40",
      misconception: "distribution_error",
    },
    {
      name: "seeded equation division step",
      problemId: "linear-equation-v1-42",
      learnerAttempt: "x - 2 = 3",
      misconception: "correct_intermediate",
    },
    {
      name: "undistributed positive offset",
      problemId: "linear-equation-v1-267",
      learnerAttempt: "3x = 23",
      misconception: "distribution_error",
    },
  ];

  for (const scenario of reactionScenarios) {
    const result = await postTutor({
      problemId: scenario.problemId,
      learnerAttempt: scenario.learnerAttempt,
      attemptNumber: 1,
      currentStage: "attempt",
      useLiveModel: false,
    });
    assert(
      result.turn.misconception === scenario.misconception,
      `${scenario.name}: expected ${scenario.misconception}, received ${result.turn.misconception}.`,
    );
    assert(
      result.source === "deterministic-demo",
      `${scenario.name}: expected deterministic source.`,
    );
    console.log(`PASS ${scenario.name} produces the expected reaction`);
  }

  const multiStep = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "3x - 6 = 12\n3x = 18",
    attemptNumber: 1,
    currentStage: "attempt",
    useLiveModel: false,
  });
  assert(
    multiStep.turn.nextPrompt.includes("isolates x"),
    "Multi-step work did not prioritize the most advanced visible equation.",
  );
  console.log("PASS multi-step work receives guidance from its latest valid step");

  const quotient = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "x = 18 / 3",
    attemptNumber: 2,
    currentStage: "guided_retry",
    useLiveModel: false,
  });
  assert(
    quotient.turn.stage === "transfer",
    "An unsimplified correct quotient did not unlock transfer.",
  );
  console.log("PASS an unsimplified correct quotient unlocks transfer");

  const invalidProblem = await fetch(baseUrl + "/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      problemId: "linear-equation-v1-not-a-seed",
      learnerAttempt: "x = 1",
      attemptNumber: 1,
      currentStage: "attempt",
      useLiveModel: false,
    }),
  });
  assert(invalidProblem.status === 400, "Invalid seeded problem ID was accepted.");
  console.log("PASS invalid seeded problem ID is rejected");

  const diagnosis = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "x = 4",
    attemptNumber: 1,
    currentStage: "attempt",
    useLiveModel: false,
  });
  assert(
    diagnosis.turn.misconception === "stopped_too_early",
    "Expected stopped-too-early diagnosis.",
  );
  assert(diagnosis.turn.hintLevel === 1, "Expected first-level hint.");
  console.log("PASS misconception produces a level-one hint");

  const transfer = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "x = 6",
    attemptNumber: 2,
    currentStage: "guided_retry",
    useLiveModel: false,
  });
  assert(transfer.turn.stage === "transfer", "Correct solution did not unlock transfer.");
  console.log("PASS correct solution unlocks transfer");

  const completion = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "x = 4",
    attemptNumber: 1,
    currentStage: "transfer",
    useLiveModel: false,
  });
  assert(completion.turn.stage === "complete", "Transfer solution did not complete.");
  console.log("PASS transfer solution verifies independent learning");

  const currentHelpCompletion = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "x = 4",
    helpRequest: "check_last_step",
    attemptNumber: 1,
    currentStage: "transfer",
    stageAssistanceUsed: false,
    useLiveModel: false,
  });
  assert(
    currentHelpCompletion.turn.stage === "assisted_complete",
    "Current transfer help was incorrectly marked as independent completion.",
  );
  assert(
    currentHelpCompletion.stageAssistanceUsed === true,
    "Current transfer help was not returned as stage assistance.",
  );
  console.log("PASS current transfer help produces assisted completion");

  const inferredHelp = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "help",
    attemptNumber: 1,
    currentStage: "transfer",
    stageAssistanceUsed: false,
    useLiveModel: false,
  });
  assert(
    inferredHelp.helpRequest === "stuck" && inferredHelp.stageAssistanceUsed === true,
    "Typed transfer help was not returned as persistent assistance.",
  );

  const completionAfterInferredHelp = await postTutor({
    problemId: "linear-equation-01",
    learnerAttempt: "x = 4",
    attemptNumber: 2,
    currentStage: "transfer",
    stageAssistanceUsed: inferredHelp.stageAssistanceUsed,
    useLiveModel: false,
  });
  assert(
    completionAfterInferredHelp.turn.stage === "assisted_complete",
    "Typed help followed by a correct answer was marked as independent completion.",
  );
  console.log("PASS typed transfer help persists as assisted evidence");
} finally {
  server.kill("SIGTERM");
}
