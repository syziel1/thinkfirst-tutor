// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TutorDemoV2 } from "./tutor-demo-v2";

function visibleEquationParts() {
  return Object.fromEntries(
    [...document.querySelectorAll<HTMLElement>("[data-equation-part]")].map(
      (element) => [element.dataset.equationPart, element.textContent],
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TutorDemoV2 interaction presentation", () => {
  it("replays the problem transition and marks only changed parameters", () => {
    render(<TutorDemoV2 initialProblemSeed={23} />);

    const newProblem = screen.getByRole("button", { name: "New problem" });
    newProblem.focus();

    const firstPrompt = screen.getByRole("heading", {
      name: /^Solve for x:/,
    }).getAttribute("aria-label");
    const firstParts = visibleEquationParts();

    fireEvent.click(newProblem);

    const secondHeading = screen.getByRole("heading", {
      name: /^Solve for x:/,
    });
    const secondPrompt = secondHeading.getAttribute("aria-label");
    const secondParts = visibleEquationParts();

    expect(secondPrompt).not.toBe(firstPrompt);
    expect(secondHeading.classList.contains("tf-problem-change")).toBe(true);
    expect(secondHeading.getAttribute("data-problem-transition")).toBe("1");
    expect(document.activeElement).toBe(newProblem);

    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-equation-part]",
    )) {
      const part = element.dataset.equationPart!;
      const changed = firstParts[part] !== secondParts[part];
      expect(element.getAttribute("data-parameter-changed")).toBe(
        String(changed),
      );
      expect(element.classList.contains("tf-equation-parameter-change")).toBe(
        changed,
      );
    }

    fireEvent.click(newProblem);

    const thirdHeading = screen.getByRole("heading", {
      name: /^Solve for x:/,
    });
    expect(thirdHeading.getAttribute("aria-label")).not.toBe(secondPrompt);
    expect(thirdHeading.getAttribute("data-problem-transition")).toBe("2");
    expect(thirdHeading.classList.contains("tf-problem-change")).toBe(true);
    expect(document.activeElement).toBe(newProblem);
  });

  it("keeps the help trigger focused while the thinking prompt becomes ready", () => {
    vi.useFakeTimers();
    render(<TutorDemoV2 initialProblemSeed={23} />);

    const helpTrigger = screen.getByRole("button", {
      name: "Open help options now",
    });
    const helpPanel = document.getElementById("help-options-panel")!;
    helpTrigger.focus();

    expect(helpTrigger.getAttribute("data-help-prompt")).toBe("waiting");
    expect(helpTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(helpPanel.hidden).toBe(true);
    expect(screen.queryByRole("button", { name: "I’m stuck" })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(helpTrigger.getAttribute("data-help-prompt")).toBe("ready");
    expect(helpTrigger.textContent).toContain("Need help?");
    expect(document.activeElement).toBe(helpTrigger);
    expect(helpPanel.hidden).toBe(true);

    fireEvent.click(helpTrigger);

    expect(helpTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(helpTrigger.getAttribute("aria-label")).toBe("Hide help options");
    expect(document.activeElement).toBe(helpTrigger);
    expect(helpPanel.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "I’m stuck" })).toBeTruthy();

    fireEvent.click(helpTrigger);

    expect(helpTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(helpPanel.hidden).toBe(true);
    expect(document.activeElement).toBe(helpTrigger);
  });

  it("returns focus to the trigger when a help response closes the panel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        turn: {
          stage: "guided_retry",
          misconception: "insufficient_attempt",
          diagnosis: "The learner requested a smaller starting step.",
          feedback: "Start with the outermost operation.",
          nextPrompt: "Which operation is applied last on the left side?",
          intervention: "socratic_question",
          hintLevel: 1,
          isCorrect: false,
          revealAnswer: false,
        },
        source: "deterministic",
        model: null,
        helpRequest: "stuck",
        stageAssistanceUsed: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TutorDemoV2 initialProblemSeed={23} />);

    const helpTrigger = screen.getByRole("button", {
      name: "Open help options now",
    });
    fireEvent.click(helpTrigger);

    const helpAction = screen.getByRole("button", { name: "I’m stuck" });
    helpAction.focus();
    fireEvent.click(helpAction);
    expect(document.activeElement).toBe(helpTrigger);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(document.getElementById("help-options-panel")?.hidden).toBe(true),
    );
    await waitFor(() => expect(document.activeElement).toBe(helpTrigger));
    expect(helpTrigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("submits once with Ctrl+Enter and renders guidance in reading order", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        turn: {
          stage: "guided_retry",
          misconception: "correct_intermediate",
          diagnosis: "The balanced intermediate step is correct.",
          feedback: "This keeps the equation equivalent.",
          nextPrompt: "Which inverse operation would you use next?",
          intervention: "socratic_question",
          hintLevel: 1,
          isCorrect: false,
          revealAnswer: false,
        },
        source: "openai",
        model: "gpt-5.6",
        helpRequest: null,
        stageAssistanceUsed: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TutorDemoV2 initialProblemSeed={23} />);

    const attempt = screen.getByRole("textbox", { name: "Attempt 1" });
    fireEvent.change(attempt, { target: { value: "4x + 8 = 28" } });
    fireEvent.keyDown(attempt, { key: "Enter" });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(attempt, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("What I notice")).toBeTruthy();
    expect(screen.getByText("Try next")).toBeTruthy();

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
      "evidence",
    ]);

    const source = document.querySelector<HTMLElement>("[data-tutor-source]")!;
    expect(source.getAttribute("data-tutor-source")).toBe("openai");
    expect(source.textContent).toContain("Live GPT-5.6");
    expect(source.classList.contains("tf-live-response")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Smallest next step: Which inverse operation would you use next?",
    );
  });
});
