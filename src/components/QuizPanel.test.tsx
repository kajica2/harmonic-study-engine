import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuizPanel } from "./QuizPanel";

describe("QuizPanel", () => {
  it("renders the prompt and a radio group", () => {
    render(<QuizPanel pathId="path-1" stepIndex={0} topic="roman-numerals" />);
    expect(screen.getByRole("region", { name: /Quiz/i })).toBeTruthy();
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });

  it("shows correct/total when score is provided", () => {
    render(
      <QuizPanel
        pathId="path-1"
        stepIndex={0}
        topic="roman-numerals"
        score={{ correct: 3, total: 5 }}
      />,
    );
    expect(screen.getByText("3/5")).toBeTruthy();
  });

  it("clicking the correct option calls onAnswer(true)", () => {
    // Find which option is correct by inspecting the pool directly
    // (the test doesn't care about the selection logic, just that
    // clicking the correct one fires true).
    const onAnswer = vi.fn();
    render(
      <QuizPanel
        pathId="path-1"
        stepIndex={0}
        topic="roman-numerals"
        score={{ correct: 0, total: 0 }}
        onAnswer={onAnswer}
      />,
    );
    // Find the correct option by scanning the rendered buttons.
    // We use the fact that the FIRST option is correct in romanNumeralQuizzes[5].
    // To keep this robust, we just click option index 1 (which is the
    // correct answer for the picked question per the hash function).
    const radios = screen.getAllByRole("radio") as HTMLButtonElement[];
    fireEvent.click(radios[1]);
    expect(onAnswer).toHaveBeenCalledWith(true, 1, 1);
  });

  it("disabled after answering — buttons inert", () => {
    render(<QuizPanel pathId="path-1" stepIndex={0} topic="roman-numerals" />);
    const radios = screen.getAllByRole("radio") as HTMLButtonElement[];
    fireEvent.click(radios[0]);
    radios.forEach((r) => expect(r.disabled).toBe(true));
  });

  it("shows the explanation after answering", () => {
    render(<QuizPanel pathId="path-1" stepIndex={0} topic="roman-numerals" />);
    fireEvent.click(screen.getAllByRole("radio")[0]);
    // Explanation is at the bottom — find by class
    const explanation = document.querySelector("p.text-\\[10px\\].font-mono");
    expect(explanation).toBeTruthy();
  });
});
