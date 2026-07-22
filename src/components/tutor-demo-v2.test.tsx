// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TutorStage, TutorTurn } from "@/lib/tutor/types";

import { TutorDemoV2 } from "./tutor-demo-v2";

interface TutorResponseOptions {
  helpRequest?: "stuck" | "small_hint" | null;
  hasVisibleWork?: boolean;
  stageAssistanceUsed?: boolean;
  source?:
    | "openai"
    | "deterministic-demo"
    | "deterministic-fallback"
    | "deterministic-safeguard";
  model?: string | null;
  turn?: Partial<TutorTurn>;
}

function tutorResponse(
  stage: TutorStage,
  {
    helpRequest = null,
    hasVisibleWork = helpRequest === null,
    stageAssistanceUsed = false,
    source = "deterministic-demo",
    model = null,
    turn: turnOverrides = {},
  }: TutorResponseOptions = {},
) {
  const isCorrect =
    stage === "transfer" ||
    stage === "complete" ||
    stage === "assisted_complete";

  return {
    turn: {
      stage,
      misconception: isCorrect ? "correct" : "correct_intermediate",
      diagnosis: isCorrect
        ? "The equation is balanced and the value is correct."
        : "The balanced intermediate step is correct.",
      feedback: isCorrect
        ? "The same inverse-operation strategy was applied."
        : "This keeps the equation equivalent.",
      nextPrompt:
        stage === "transfer"
          ? "Now solve the transfer equation independently."
          : "Which inverse operation would you use next?",
      intervention:
        stage === "transfer"
          ? "transfer_check"
          : stage === "complete" || stage === "assisted_complete"
            ? "celebration"
            : "socratic_question",
      hintLevel: isCorrect ? 0 : 1,
      isCorrect,
      revealAnswer: false,
      ...turnOverrides,
    } satisfies TutorTurn,
    source,
    model,
    helpRequest,
    hasVisibleWork,
    stageAssistanceUsed,
  };
}

function stubTutorResponses(...responses: ReturnType<typeof tutorResponse>[]) {
  const fetchMock = vi.fn();

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(response),
    });
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function visibleEquationParts() {
  return Object.fromEntries(
    [...document.querySelectorAll<HTMLElement>("[data-equation-part]")].map(
      (element) => [element.dataset.equationPart, element.textContent],
    ),
  );
}

async function enterSolveView() {
  fireEvent.click(screen.getByRole("button", { name: "Start a problem" }));

  const attempt = await screen.findByRole("textbox", { name: "Attempt 1" });
  await waitFor(() => expect(document.activeElement).toBe(attempt));
  return attempt as HTMLTextAreaElement;
}

async function submitAttempt(value: string, expectedFetchCount: number) {
  const attempt = screen.getByRole("textbox");
  fireEvent.change(attempt, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Check my thinking" }));

  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls).toHaveLength(expectedFetchCount),
  );
}

async function continueToTransferConversation() {
  fireEvent.click(
    screen.getByRole("button", { name: "Continue with the new problem" }),
  );

  const attempt = await screen.findByRole("textbox", {
    name: "Solve this one and show the steps you choose",
  });
  await waitFor(() => expect(document.activeElement).toBe(attempt));
  return attempt as HTMLTextAreaElement;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  const request = fetchMock.mock.calls[callIndex]?.[1] as
    | RequestInit
    | undefined;
  return JSON.parse(String(request?.body)) as Record<string, unknown>;
}

function progressStatuses() {
  return [...document.querySelectorAll<HTMLElement>("[data-stage-key]")].map(
    (item) => ({
      key: item.dataset.stageKey,
      state: item.dataset.stageState,
      status: item.querySelector<HTMLElement>("[data-progress-status]")
        ?.textContent,
      current: item.getAttribute("aria-current"),
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TutorDemoV2 three-view flow", () => {
  it("renders a calm start view with one dominant action", () => {
    render(<TutorDemoV2 initialProblemSeed={23} />);

    expect(
      screen.getByRole("heading", {
        name: "Think first. Ask safely. Return to independent action.",
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent?.trim()),
    ).toEqual(["Start a problem"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Prefer live GPT-5.6" }),
    ).toBeNull();
    expect(
      screen.queryByRole("list", { name: "Learning progress" }),
    ).toBeNull();
    expect(screen.queryByText("Learning evidence")).toBeNull();
    expect(screen.queryByText("Design principle")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open help options now" }),
    ).toBeNull();
    expect(screen.queryByText("Try an example attempt")).toBeNull();
    expect(screen.queryByText("Demo: stopped early")).toBeNull();
    expect(document.querySelector("[data-problem-id]")).toBeNull();
  });

  it("enters solve without navigation, announces the task, and moves focus", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const initialUrl = window.location.href;

    render(<TutorDemoV2 initialProblemSeed={23} />);
    const attempt = await enterSolveView();

    expect(window.location.href).toBe(initialUrl);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /^Solve for x:/ })).toBeTruthy();
    expect(document.activeElement).toBe(attempt);
    const liveModelToggle = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Prefer live GPT-5.6",
    });
    expect(liveModelToggle).toBeTruthy();
    expect(liveModelToggle.checked).toBe(false);
    expect(screen.getByText("GPT-5.6 off")).toBeTruthy();
    expect(
      document.querySelector("[data-live-state='off']"),
    ).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Learning progress" }),
    ).toBeTruthy();
    const appearance = screen.getByRole("combobox", { name: "Appearance" });
    const mobileControls = appearance.closest("label")?.parentElement;
    expect(mobileControls?.classList.contains("flex-col")).toBe(true);
    expect(mobileControls?.classList.contains("sm:flex-row")).toBe(true);
    expect(mobileControls?.children[0]?.contains(appearance)).toBe(true);
    expect(mobileControls?.children[1]?.contains(liveModelToggle)).toBe(true);
    const stickyProblemHeader = document.querySelector<HTMLElement>(
      "[data-sticky-problem-header]",
    );
    expect(stickyProblemHeader?.classList.contains("sticky")).toBe(true);
    expect(stickyProblemHeader?.classList.contains("tf-problem-header")).toBe(
      true,
    );
    expect(
      screen.queryByRole("heading", {
        name: "Think first. Ask safely. Return to independent action.",
      }),
    ).toBeNull();
    expect(screen.queryByText("Design principle")).toBeNull();
    expect(screen.queryByRole("button", { name: "New problem" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Try a different problem" }),
    ).toBeNull();
    expect(screen.queryByText("Try an example attempt")).toBeNull();
    expect(screen.queryByText("Demo: distribution error")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(
      /^Problem started\. Solve for x: .+ Attempt, step 1 of 4\.$/,
    );
  });

  it("shows truthful live-model states before, during, and after a request", async () => {
    let resolveResponse: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TutorDemoV2 initialProblemSeed={23} />);
    const attempt = await enterSolveView();
    const liveToggle = screen.getByRole("checkbox", {
      name: "Prefer live GPT-5.6",
    });

    fireEvent.click(liveToggle);
    expect(screen.getByText("GPT-5.6 selected")).toBeTruthy();
    expect(
      document.querySelector("[data-live-state='selected']"),
    ).toBeTruthy();

    fireEvent.change(attempt, { target: { value: "x - 4 = 4" } });
    fireEvent.click(screen.getByRole("button", { name: "Check my thinking" }));

    expect(screen.getByText("Contacting GPT-5.6…")).toBeTruthy();
    expect(liveToggle).toHaveProperty("disabled", true);
    expect(
      document.querySelector("[data-live-state='contacting']"),
    ).toBeTruthy();

    resolveResponse?.({
      ok: true,
      json: vi.fn().mockResolvedValue(
        tutorResponse("guided_retry", {
          source: "openai",
          model: "gpt-5.6",
        }),
      ),
    });

    expect(await screen.findByText("GPT-5.6 online")).toBeTruthy();
    expect(screen.getByText("Answered by GPT-5.6")).toBeTruthy();
    expect(
      document.querySelector("[data-live-state='online']"),
    ).toBeTruthy();
  });

  it("makes fallback and deliberate safeguards visually distinct", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", { source: "deterministic-fallback" }),
      tutorResponse("guided_retry", {
        helpRequest: "stuck",
        hasVisibleWork: false,
        stageAssistanceUsed: true,
        source: "deterministic-safeguard",
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Prefer live GPT-5.6" }),
    );
    await submitAttempt("x - 4 = 4", 1);

    await waitFor(() =>
      expect(
        document.querySelector("[data-live-status-label]")?.textContent,
      ).toContain("GPT unavailable"),
    );
    expect(
      screen.getByText("GPT unavailable · safeguard used"),
    ).toBeTruthy();
    expect(
      document.querySelector("[data-live-state='unavailable']"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Open help options now" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "I’m stuck" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.getByText("Safeguard used")).toBeTruthy();
    expect(
      document.querySelector("[data-live-status-label]")?.textContent,
    ).toContain("GPT unavailable");
  });

  it("shows GPT as off without implying a connectivity check", async () => {
    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();

    expect(screen.getByText("GPT-5.6 off")).toBeTruthy();
    expect(document.querySelector("[data-live-state='off']")).toBeTruthy();
  });

  it("renders a two-line equation and keeps help directly before check", async () => {
    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();

    const heading = screen.getByRole("heading", { name: /^Solve for x:/ });
    const instruction = heading.querySelector<HTMLElement>(
      "[data-equation-instruction]",
    )!;
    const expression = heading.querySelector<HTMLElement>(
      "[data-equation-expression]",
    )!;
    expect(instruction.textContent).toBe("Solve for x:");
    expect(instruction.classList.contains("block")).toBe(true);
    expect(expression.classList.contains("block")).toBe(true);
    expect(heading.getAttribute("aria-label")).toMatch(
      /^Solve for x: \d\(x [+-] \d\) = \d+$/,
    );

    const actions = document.querySelector<HTMLElement>(
      "[data-composer-actions]",
    )!;
    const help = actions.querySelector<HTMLElement>(
      '[data-composer-action="help"]',
    )!;
    const check = actions.querySelector<HTMLElement>(
      '[data-composer-action="check"]',
    )!;
    expect([...actions.children]).toEqual([help, check]);
    expect(help.classList.contains("h-11")).toBe(true);
    expect(help.classList.contains("min-w-11")).toBe(true);
    expect(check.classList.contains("h-11")).toBe(true);
    expect(
      actions.compareDocumentPosition(
        document.querySelector<HTMLElement>("#help-options-panel")!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("returns the bounded expected-response type with the next learner turn", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", {
        turn: {
          misconception: "distribution_error",
          expectedResponse: "distribution_products",
          nextPrompt: "What are the two products?",
        },
      }),
      tutorResponse("guided_retry", {
        turn: { nextPrompt: "Write the complete distributed equation." },
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={85} />);
    await enterSolveView();
    await submitAttempt("5x + 2 = 40", 1);
    await screen.findByText("What are the two products?");
    await submitAttempt("5x and 10", 2);

    expect(requestBody(fetchMock, 0).expectedResponse).toBeNull();
    expect(requestBody(fetchMock, 1).expectedResponse).toBe(
      "distribution_products",
    );
  });

  it("starts delayed help in solve and reveals problem replacement only inside help", () => {
    vi.useFakeTimers();
    render(<TutorDemoV2 initialProblemSeed={23} />);

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Start a problem" }));

    const helpTrigger = screen.getByRole("button", {
      name: "Open help options now",
    });
    expect(helpTrigger.getAttribute("data-help-prompt")).toBe("waiting");
    expect(
      screen.queryByRole("button", { name: "Try a different problem" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "New problem" })).toBeNull();

    fireEvent.click(helpTrigger);
    expect(helpTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Try a different problem" }),
    ).toBeNull();
    fireEvent.click(helpTrigger);

    act(() => {
      vi.advanceTimersByTime(7_999);
    });
    expect(helpTrigger.getAttribute("data-help-prompt")).toBe("waiting");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(helpTrigger.getAttribute("data-help-prompt")).toBe("ready");
    expect(helpTrigger.textContent).toBe("Need help?");

    fireEvent.click(helpTrigger);
    expect(
      screen.getByRole("button", { name: "Try a different problem" }),
    ).toBeTruthy();
  });

  it("shows one concise attempt instruction without repeating it near the field", async () => {
    render(<TutorDemoV2 initialProblemSeed={23} />);

    const attempt = await enterSolveView();

    expect(screen.getByText("Think before responding.")).toBeTruthy();
    expect(
      screen.getByText(
        "Give the most complete attempt you can justify. If you’re unsure, stop at the last step you trust.",
      ),
    ).toBeTruthy();
    expect(attempt.getAttribute("placeholder")).toBe("Write your attempt...");
    expect(screen.queryByText(/Start with one step you trust/)).toBeNull();
  });

  it("replaces the problem from delayed help and resets the solve state", () => {
    vi.useFakeTimers();
    render(<TutorDemoV2 initialProblemSeed={23} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a problem" }));

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    const firstHeading = screen.getByRole("heading", { name: /^Solve for x:/ });
    const firstPrompt = firstHeading.getAttribute("aria-label");
    const firstProblemId = firstHeading.getAttribute("data-problem-id");
    const firstParts = visibleEquationParts();

    fireEvent.click(
      screen.getByRole("button", { name: "Open help options now" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Try a different problem" }),
    );

    const secondHeading = screen.getByRole("heading", { name: /^Solve for x:/ });
    expect(secondHeading.getAttribute("aria-label")).not.toBe(firstPrompt);
    expect(secondHeading.getAttribute("data-problem-id")).not.toBe(
      firstProblemId,
    );
    expect(secondHeading.getAttribute("data-problem-transition")).toBe("1");
    expect(secondHeading.classList.contains("tf-problem-change")).toBe(true);

    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-equation-part]",
    )) {
      const part = element.dataset.equationPart!;
      const changed = firstParts[part] !== element.textContent;
      expect(element.getAttribute("data-parameter-changed")).toBe(
        String(changed),
      );
    }

    const attempt = screen.getByRole("textbox", { name: "Attempt 1" });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(document.activeElement).toBe(attempt);
    expect(
      screen.getByRole("button", { name: "Open help options now" })
        .getAttribute("data-help-prompt"),
    ).toBe("waiting");
    expect(
      screen.queryByRole("button", { name: "Try a different problem" }),
    ).toBeNull();
  });

  it("keeps help-trigger focus when a help response closes the panel", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", {
        helpRequest: "stuck",
        stageAssistanceUsed: true,
        source: "deterministic-safeguard",
        turn: {
          diagnosis: "The learner requested a smaller starting step.",
          feedback: "Start with the outermost operation.",
          nextPrompt: "Which operation is applied last on the left side?",
        },
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();

    const helpTrigger = screen.getByRole("button", {
      name: "Open help options now",
    });
    fireEvent.click(helpTrigger);
    const helpAction = screen.getByRole("button", { name: "I’m stuck" });
    helpAction.focus();
    fireEvent.click(helpAction);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(helpTrigger));
    expect(helpTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("You · Help signal")).toBeTruthy();
    expect(
      document.querySelector('[data-learner-entry="help-signal"]')?.textContent,
    ).toBe("I am stuck");
  });

  it("preserves multiline chat sides, shortcut, source, and reading order", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", {
        source: "openai",
        model: "gpt-5.6",
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    const attempt = await enterSolveView();
    fireEvent.change(attempt, {
      target: { value: "x - 4 = 4\nx = 8" },
    });
    fireEvent.keyDown(attempt, { key: "Enter" });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(attempt, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("What I notice")).toBeTruthy();
    expect(screen.getByText("Try next")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("ThinkFirst Tutor · level 1")).toBeTruthy();

    const learnerEntry = document.querySelector<HTMLElement>(
      '[data-learner-entry="attempt"]',
    )!;
    const learnerCard = learnerEntry.closest<HTMLElement>(
      '[data-reveal-step="learner"]',
    )!;
    const tutorCard = document.querySelector<HTMLElement>(
      '[data-speaker="tutor"]',
    )!;
    expect(learnerEntry.textContent).toBe("x - 4 = 4\nx = 8");
    expect(learnerEntry.classList.contains("whitespace-pre-wrap")).toBe(true);
    expect(learnerCard.getAttribute("data-speaker")).toBe("learner");
    expect(learnerCard.classList.contains("justify-end")).toBe(true);
    expect(tutorCard).toBeTruthy();
    expect(tutorCard.classList.contains("justify-end")).toBe(false);

    const revealOrder = [
      ...new Set(
        [...document.querySelectorAll<HTMLElement>("[data-reveal-step]")].map(
          (element) => element.dataset.revealStep,
        ),
      ),
    ];
    expect(revealOrder).toEqual([
      "learner",
      "diagnosis",
      "feedback",
      "nextPrompt",
    ]);

    const source = document.querySelector<HTMLElement>("[data-tutor-source]")!;
    expect(source.getAttribute("data-tutor-source")).toBe("openai");
    expect(source.textContent).toContain("Answered by GPT-5.6");
    expect(source.classList.contains("tf-live-response")).toBe(true);
  });

  it("keeps the completed main conversation until the learner opens a clean transfer", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", {
        turn: { nextPrompt: "Which inverse operation would you use next?" },
      }),
      tutorResponse("transfer"),
      tutorResponse("transfer", {
        hasVisibleWork: true,
        turn: {
          isCorrect: false,
          hintLevel: 1,
          misconception: "correct_intermediate",
          intervention: "socratic_question",
          nextPrompt: "Which inverse operation isolates x next?",
        },
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    const originalPrompt = screen
      .getByRole("heading", { name: /^Solve for x:/ })
      .getAttribute("aria-label")!;

    await submitAttempt("x - 4 = 4", 1);
    await submitAttempt("x - 4 = 4\nx = 8", 2);

    expect(screen.getByRole("heading", { name: originalPrompt })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: /^Now solve independently:/ }),
    ).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();

    const firstMainExchange = screen.getByRole("group", {
      name: `Tutoring exchange 1, main stage, problem: ${originalPrompt}`,
    });
    const transitionExchange = screen.getByRole("group", {
      name: `Tutoring exchange 2, main stage, problem: ${originalPrompt}`,
    });
    expect(firstMainExchange.getAttribute("data-conversation-stage")).toBe(
      "main",
    );
    expect(transitionExchange.getAttribute("data-conversation-stage")).toBe(
      "main",
    );
    expect(document.querySelectorAll("[data-original-problem]")).toHaveLength(0);
    expect(transitionExchange.textContent).toContain(
      "Independent check ready",
    );
    expect(transitionExchange.textContent).toContain(
      "Your independent check is ready in a clean conversation.",
    );
    expect(
      screen.getByRole("button", { name: "Continue with the new problem" }),
    ).toBeTruthy();
    expect(transitionExchange.textContent).not.toContain("Try next");
    expect(firstMainExchange.textContent).toContain("Try next");
    expect(screen.getByRole("status").textContent).toBe(
      "Independent check ready. Continue when you are ready.",
    );

    const transferAttempt = await continueToTransferConversation();
    expect(transferAttempt.value).toBe("");
    const transferHeading = screen.getByRole("heading", {
      name: /^Now solve independently:/,
    });
    expect(transferHeading.classList.contains("tf-problem-heading")).toBe(true);
    expect(transferHeading.getAttribute("data-problem-transition")).toBe(
      "transfer",
    );
    expect(
      transferHeading.closest("[data-sticky-problem-header]"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: /main stage/ }),
    ).toBeNull();
    expect(screen.queryByRole("group", { name: /Tutoring exchange/ })).toBeNull();

    const activeTransferPrompt = transferHeading.getAttribute("aria-label")!;
    await submitAttempt("x - 4 = 6", 3);
    const transferExchange = screen.getByRole("group", {
      name: `Tutoring exchange 1, transfer stage, problem: ${activeTransferPrompt}`,
    });
    expect(transferExchange.getAttribute("data-conversation-stage")).toBe(
      "transfer",
    );
    expect(transferExchange.querySelector("[data-original-problem]")).toBeNull();
    expect(transferExchange.textContent).toContain("Try next");
    expect(transferExchange.textContent).toContain(
      "Which inverse operation isolates x next?",
    );
    expect(requestBody(fetchMock, 2)).toMatchObject({
      attemptNumber: 1,
      currentStage: "transfer",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows evidence-based progress for fresh and help-only states", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", {
        helpRequest: "small_hint",
        hasVisibleWork: false,
        stageAssistanceUsed: true,
        source: "deterministic-safeguard",
        turn: { misconception: "no_attempt", hintLevel: 1, isCorrect: false },
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();

    expect(progressStatuses()).toEqual([
      { key: "attempt", state: "current", status: "Now", current: "step" },
      {
        key: "diagnose",
        state: "waiting",
        status: "Waiting for attempt",
        current: null,
      },
      {
        key: "guide",
        state: "skipped",
        status: "If needed",
        current: null,
      },
      {
        key: "transfer",
        state: "waiting",
        status: "Locked",
        current: null,
      },
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Open help options now" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Give me a small hint" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(progressStatuses()).toEqual([
      {
        key: "attempt",
        state: "waiting",
        status: "Still needed",
        current: null,
      },
      {
        key: "diagnose",
        state: "waiting",
        status: "Waiting for attempt",
        current: null,
      },
      { key: "guide", state: "current", status: "Now", current: "step" },
      {
        key: "transfer",
        state: "waiting",
        status: "Locked",
        current: null,
      },
    ]);
    expect(screen.getByRole("textbox", { name: "Attempt 1" })).toBeTruthy();
  });

  it("does not advance the visible attempt for typed help or no-attempt input", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", {
        helpRequest: "stuck",
        hasVisibleWork: false,
        source: "deterministic-safeguard",
        turn: { misconception: "no_attempt", hintLevel: 0, isCorrect: false },
      }),
      tutorResponse("guided_retry", {
        hasVisibleWork: false,
        turn: { misconception: "no_attempt", hintLevel: 1, isCorrect: false },
      }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    await submitAttempt("help", 1);

    expect(screen.getByRole("textbox", { name: "Attempt 1" })).toBeTruthy();
    expect(progressStatuses().find((item) => item.key === "attempt")).toEqual({
      key: "attempt",
      state: "waiting",
      status: "Still needed",
      current: null,
    });

    await submitAttempt("x", 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("textbox", { name: "Attempt 1" })).toBeTruthy();
  });

  it("tracks visible work, guided transfer, and independent completion", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("guided_retry", { hasVisibleWork: true }),
      tutorResponse("transfer", { hasVisibleWork: true }),
      tutorResponse("complete", { hasVisibleWork: true }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    await submitAttempt("x - 4 = 4", 1);

    expect(progressStatuses().map(({ state, status }) => ({ state, status }))).toEqual([
      { state: "complete", status: "Done" },
      { state: "complete", status: "Done" },
      { state: "current", status: "Now" },
      { state: "waiting", status: "Locked" },
    ]);
    expect(screen.getByRole("textbox", { name: "Attempt 2" })).toBeTruthy();

    await submitAttempt("x = 8", 2);
    expect(progressStatuses().map(({ state, status }) => ({ state, status }))).toEqual([
      { state: "complete", status: "Done" },
      { state: "complete", status: "Done" },
      { state: "used", status: "Used" },
      { state: "current", status: "Now" },
    ]);

    await continueToTransferConversation();
    await submitAttempt("x = 6", 3);
    await screen.findByRole("heading", { name: "Independent transfer verified" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(progressStatuses().map(({ state, status }) => ({ state, status }))).toEqual([
      { state: "complete", status: "Done" },
      { state: "complete", status: "Done" },
      { state: "used", status: "Used" },
      { state: "complete", status: "Done" },
    ]);
  });

  it("stays in solve after the main answer and summarizes only completed transfer", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("transfer"),
      tutorResponse("complete"),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    await submitAttempt("x = 8", 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: /^Solve for x:/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: /^Now solve independently:/ }),
    ).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Continue with the new problem" }),
    ).toBeTruthy();
    await continueToTransferConversation();
    expect(
      screen.getByRole("textbox", {
        name: "Solve this one and show the steps you choose",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Independent transfer verified",
      }),
    ).toBeNull();
    expect(progressStatuses().map(({ state, status }) => ({ state, status }))).toEqual([
      { state: "complete", status: "Done" },
      { state: "complete", status: "Done" },
      { state: "skipped", status: "Not needed" },
      { state: "current", status: "Now" },
    ]);

    await submitAttempt("x = 6", 2);

    const summaryHeading = await screen.findByRole("heading", {
      name: "Independent transfer verified",
    });
    await waitFor(() => expect(document.activeElement).toBe(summaryHeading));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Independent")).toBeTruthy();
    expect(screen.getByText(/No support/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Try another problem" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Transfer completed with support",
      }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Summary ready. Independent transfer verified.",
    );
  });

  it("shows a distinct assisted summary after help during transfer", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("transfer"),
      tutorResponse("transfer", {
        helpRequest: "small_hint",
        stageAssistanceUsed: true,
        source: "deterministic-safeguard",
        turn: {
          isCorrect: false,
          hintLevel: 1,
          misconception: "correct_intermediate",
          intervention: "socratic_question",
        },
      }),
      tutorResponse("assisted_complete", { stageAssistanceUsed: true }),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    await submitAttempt("x = 8", 1);
    await continueToTransferConversation();

    fireEvent.click(
      screen.getByRole("button", { name: "Open help options now" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Give me a small hint" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await submitAttempt("x = 6", 3);

    expect(requestBody(fetchMock, 2)).toMatchObject({
      currentStage: "transfer",
      stageAssistanceUsed: true,
    });
    const summaryHeading = await screen.findByRole("heading", {
      name: "Transfer completed with support",
    });
    await waitFor(() => expect(document.activeElement).toBe(summaryHeading));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/Assisted/i)).toBeTruthy();
    expect(screen.getByText("Assisted — fresh check needed")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start fresh independent check" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "Independent transfer verified",
      }),
    ).toBeNull();
    expect(progressStatuses().map(({ state, status }) => ({ state, status }))).toEqual([
      { state: "complete", status: "Done" },
      { state: "complete", status: "Done" },
      { state: "used", status: "Used" },
      { state: "needs-check", status: "Fresh check needed" },
    ]);
    expect(screen.getByRole("status").textContent).toBe(
      "Summary ready. Transfer completed with support.",
    );
  });

  it("starts the next summary problem directly in solve with reset state", async () => {
    const fetchMock = stubTutorResponses(
      tutorResponse("transfer"),
      tutorResponse("complete"),
      tutorResponse("guided_retry"),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    await enterSolveView();
    const firstProblemId = screen
      .getByRole("heading", { name: /^Solve for x:/ })
      .getAttribute("data-problem-id");
    await submitAttempt("x = 8", 1);
    await continueToTransferConversation();
    await submitAttempt("x = 6", 2);
    await screen.findByRole("heading", {
      name: "Independent transfer verified",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Try another problem" }),
    );

    const nextHeading = await screen.findByRole("heading", {
      name: /^Solve for x:/,
    });
    expect(nextHeading.getAttribute("data-problem-id")).not.toBe(firstProblemId);
    const attempt = screen.getByRole("textbox", { name: "Attempt 1" });
    await waitFor(() => expect(document.activeElement).toBe(attempt));
    expect((attempt as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("group", { name: /Tutoring exchange/ })).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "Independent transfer verified",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open help options now" })
        .getAttribute("data-help-prompt"),
    ).toBe("waiting");
    expect(screen.queryByRole("button", { name: "New problem" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Try a different problem" }),
    ).toBeNull();

    const progress = screen.getByRole("list", { name: "Learning progress" });
    expect(
      progress.querySelector<HTMLElement>('[aria-current="step"]')?.textContent,
    ).toContain("Your try");

    await submitAttempt("x = 0", 3);
    expect(requestBody(fetchMock, 2)).toMatchObject({
      attemptNumber: 1,
      currentStage: "attempt",
      stageAssistanceUsed: false,
    });
  });

  it("changes views immediately when reduced motion is requested", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    render(<TutorDemoV2 initialProblemSeed={23} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a problem" }));

    expect(screen.getByRole("heading", { name: /^Solve for x:/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Attempt 1" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Problem started");
  });
});
