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
  console.log("PASS home page renders project content");

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
} finally {
  server.kill("SIGTERM");
}
