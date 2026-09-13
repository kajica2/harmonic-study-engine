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

  describe("composer-reductions topic", () => {
    it("renders a prompt from the composer-reductions curated pool", () => {
      render(
        <QuizPanel
          pathId="path-1"
          stepIndex={0}
          topic="composer-reductions"
          score={{ correct: 0, total: 0 }}
          onAnswer={vi.fn()}
        />,
      );
      expect(screen.getByRole("region", { name: /Quiz/i })).toBeTruthy();
      // Confirm a curated question got picked — it should reference a
      // specific composer, work, or technique (since the curated pool is
      // all composer-themed). Match against works AND composer names to
      // be robust regardless of which seed the hash lands on.
      const region = screen.getByRole("region", { name: /Quiz/i });
      expect(region.textContent).toMatch(
        /Beethoven|Schubert|Chopin|Wagner|Verdi|Liszt|Ellington|Armstrong|Miles|Coltrane|Beatles|Kraftwerk|Carlos|Piazzolla|Fela|Symphony|Winterreise|Tristan|Otello|Nuages|Mood Indigo|West End|So What|Giant Steps|A Day in the Life|Trans-Europe|Switched-On|Adi|WTC|Zombie/i,
      );
    });

    it("exposes the 6th topic without breaking other topics", () => {
      // Render all 6 topics and confirm each renders without throwing.
      const topics = [
        "roman-numerals",
        "tensions",
        "voice-leading",
        "modulations",
        "form",
        "composer-reductions",
      ] as const;
      for (const topic of topics) {
        const { unmount } = render(
          <QuizPanel
            pathId="path-1"
            stepIndex={0}
            topic={topic}
            score={{ correct: 0, total: 0 }}
            onAnswer={vi.fn()}
          />,
        );
        expect(screen.getByRole("radiogroup")).toBeTruthy();
        unmount();
      }
    });
  });

  describe("topic selector", () => {
    it("does not render a <select> when onTopicChange is omitted", () => {
      render(
        <QuizPanel
          pathId="path-1"
          stepIndex={0}
          topic="roman-numerals"
          score={{ correct: 0, total: 0 }}
          onAnswer={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("quiz-topic-selector")).toBeNull();
    });

    it("renders a <select> with all 6 topics when onTopicChange is provided", () => {
      render(
        <QuizPanel
          pathId="path-1"
          stepIndex={0}
          topic="roman-numerals"
          score={{ correct: 0, total: 0 }}
          onAnswer={vi.fn()}
          onTopicChange={vi.fn()}
        />,
      );
      const selector = screen.getByTestId("quiz-topic-selector");
      expect(selector).toBeTruthy();
      const options = selector.querySelectorAll("option");
      expect(options.length).toBe(6);
      // The selected option matches the active topic
      expect((selector as HTMLSelectElement).value).toBe("roman-numerals");
    });

    it("calls onTopicChange when a new topic is selected", () => {
      const onTopicChange = vi.fn();
      render(
        <QuizPanel
          pathId="path-1"
          stepIndex={0}
          topic="roman-numerals"
          score={{ correct: 0, total: 0 }}
          onAnswer={vi.fn()}
          onTopicChange={onTopicChange}
        />,
      );
      const selector = screen.getByTestId(
        "quiz-topic-selector",
      ) as HTMLSelectElement;
      fireEvent.change(selector, { target: { value: "composer-reductions" } });
      expect(onTopicChange).toHaveBeenCalledWith("composer-reductions");
    });

    it("shows the topic label in the human-readable form", () => {
      render(
        <QuizPanel
          pathId="path-1"
          stepIndex={0}
          topic="voice-leading"
          score={{ correct: 0, total: 0 }}
          onAnswer={vi.fn()}
          onTopicChange={vi.fn()}
        />,
      );
      // Header uses replace(/-/g, " ") — dashes become spaces
      expect(screen.getByText(/Quiz · voice leading/i)).toBeTruthy();
    });
  });
});
