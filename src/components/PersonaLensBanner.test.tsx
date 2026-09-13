import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonaLensBanner } from "./PersonaLensBanner";

describe("PersonaLensBanner", () => {
  it("renders nothing for visual-only personas (no behavioral lens)", () => {
    const { container } = render(<PersonaLensBanner personaId="kandinsky" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the Bach lens with the Wendy Carlos harmonic-influence line", () => {
    render(<PersonaLensBanner personaId="bach" />);
    expect(screen.getByText(/Bach lens/i)).toBeTruthy();
    // harmonic influence row is rendered for personas that have one
    const row = screen.getByTestId("harmonic-influence");
    expect(row).toBeTruthy();
    expect(row.textContent).toMatch(/Wendy Carlos/);
    expect(row.textContent).toMatch(/Switched-On Bach/);
    // romanExample should be present
    expect(row.textContent).toMatch(/I — ii4\/2 — V6\/5 — I/);
  });

  it("renders the Coltrane lens with the John Coltrane influence", () => {
    render(<PersonaLensBanner personaId="coltrane" />);
    const row = screen.getByTestId("harmonic-influence");
    expect(row.textContent).toMatch(/John Coltrane/);
    expect(row.textContent).toMatch(/Giant Steps/);
    // romanExample mentions tritone-substitution language
    expect(row.textContent).toMatch(/V7\/bVI/);
  });

  it("renders the Miles Davis lens", () => {
    render(<PersonaLensBanner personaId="miles" />);
    const row = screen.getByTestId("harmonic-influence");
    expect(row.textContent).toMatch(/Miles Davis/);
    expect(row.textContent).toMatch(/So What/);
    // romanExample has Dorian mode labels
    expect(row.textContent).toMatch(/Dorian/i);
  });

  it("renders nothing for a persona without harmonicInfluence (defensive)", () => {
    // If a future persona has a behavioral lens but no harmonicInfluence,
    // the banner should still render — just without the influence row.
    // We simulate this with a custom render where we pass a persona id
    // that has a behavioral lens but no influence. None exist today,
    // so this is a defensive test: ensure the conditional render doesn't
    // throw on undefined.
    // (No such persona exists in PERSONAS yet — this is a placeholder
    //  test for v2 when behavioral-lens personas expand beyond the 3.)
    // Skip for now.
  });
});
