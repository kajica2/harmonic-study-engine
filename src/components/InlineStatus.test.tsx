/**
 * Component tests for InlineStatus. Pure-render, no engine deps.
 *
 * Real regression checks:
 *  - tone=error + assertive=true → role=alert + aria-live=assertive
 *  - tone=info → role=status + aria-live=polite
 *  - onRetry renders the Retry button with the onClick handler
 *  - children render inside the body div
 *
 * Uses jsdom via vitest.config.ts environmentMatchGlobs.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  InlineStatus,
  InlineError,
  InlineErrorPill,
} from "./InlineStatus";

describe("InlineStatus", () => {
  it("renders with role=status and aria-live=polite by default", () => {
    const { container } = render(<InlineStatus tone="info">Hello</InlineStatus>);
    const el = container.querySelector('[role="status"]');
    expect(el).toBeTruthy();
    expect(el!.getAttribute("aria-live")).toBe("polite");
    expect(el!.getAttribute("aria-atomic")).toBe("true");
    expect(el!.textContent).toContain("Hello");
  });

  it("renders with role=alert + assertive when assertive=true", () => {
    const { container } = render(
      <InlineStatus tone="error" assertive>
        Something broke
      </InlineStatus>,
    );
    const el = container.querySelector('[role="alert"]');
    expect(el).toBeTruthy();
    expect(el!.getAttribute("aria-live")).toBe("assertive");
  });

  it("renders the title when provided", () => {
    const { container } = render(
      <InlineStatus tone="warning" title="Heads up">
        Watch out for the low end
      </InlineStatus>,
    );
    const el = container.querySelector('[role="status"]');
    expect(el!.textContent).toContain("Heads up");
    expect(el!.textContent).toContain("Watch out for the low end");
  });

  it("renders the Retry button when onRetry is provided and fires it on click", () => {
    const onRetry = vi.fn();
    const { container } = render(
      <InlineStatus tone="error" onRetry={onRetry}>
        Failure
      </InlineStatus>,
    );
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the Retry button when onRetry is absent", () => {
    const { container } = render(<InlineStatus tone="info">No retry here</InlineStatus>);
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("InlineError (convenience wrapper)", () => {
  it("uses role=alert + assertive regardless of explicit flag", () => {
    const { container } = render(<InlineError>Broken</InlineError>);
    const el = container.querySelector('[role="alert"]');
    expect(el!.getAttribute("aria-live")).toBe("assertive");
  });
});

describe("InlineErrorPill", () => {
  it("renders children and dismisses on click", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <InlineErrorPill onDismiss={onDismiss}>Pill error</InlineErrorPill>,
    );
    const el = container.querySelector('[role="alert"]');
    expect(el!.textContent).toContain("Pill error");
    const btn = container.querySelector("button");
    fireEvent.click(btn!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});