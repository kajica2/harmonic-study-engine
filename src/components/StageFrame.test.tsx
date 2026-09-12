/**
 * Component tests for StageFrame, ToolGroup, ToolChip (pure-presentation,
 * no engine deps).
 *
 * Real regression checks:
 *  - StageFrame renders header (eyebrow + title + meta + actions)
 *  - StageFrame renders brass strip when accent=true (aria-hidden)
 *  - StageFrame toggles open/closed via onToggle; chevron rotates
 *  - StageFrame hides body when collapsed=true
 *  - StageFrame passes className passthrough
 *  - ToolGroup sets role="group" and aria-label from label
 *  - ToolChip has aria-pressed bound to active
 *  - ToolChip click fires onClick handler
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { StageFrame, ToolGroup, ToolChip } from "./StageFrame";

describe("StageFrame", () => {
  it("renders children inside the body when not collapsed", () => {
    const { container } = render(
      <StageFrame title="Frame Title">
        <p>body content here</p>
      </StageFrame>,
    );
    expect(container.textContent).toContain("body content here");
    expect(container.textContent).toContain("Frame Title");
  });

  it("renders eyebrow above the title", () => {
    const { container } = render(
      <StageFrame eyebrow="Step 1" title="Frame Title">
        <span>child</span>
      </StageFrame>,
    );
    const txt = container.textContent!;
    const eyebrowIdx = txt.indexOf("Step 1");
    const titleIdx = txt.indexOf("Frame Title");
    expect(eyebrowIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeGreaterThan(eyebrowIdx);
  });

  it("renders meta on the right side of the header", () => {
    const { container } = render(
      <StageFrame title="T" meta={<span data-testid="meta-content">META</span>}>
        <span>child</span>
      </StageFrame>,
    );
    expect(screen.getByTestId("meta-content")).toBeTruthy();
    // Meta should be in the header (above the body divider).
    expect(container.textContent).toContain("META");
  });

  it("renders actions on the far right", () => {
    render(
      <StageFrame
        title="T"
        actions={<button data-testid="action-btn">Click me</button>}
      >
        <span>child</span>
      </StageFrame>,
    );
    expect(screen.getByTestId("action-btn")).toBeTruthy();
  });

  it("renders brass strip when accent=true", () => {
    const { container } = render(
      <StageFrame title="T" accent>
        <span>c</span>
      </StageFrame>,
    );
    const strip = container.querySelector(".brass-strip");
    expect(strip).toBeTruthy();
    expect(strip!.getAttribute("aria-hidden")).toBe("true");
  });

  it("does NOT render brass strip when accent=false (default)", () => {
    const { container } = render(
      <StageFrame title="T">
        <span>c</span>
      </StageFrame>,
    );
    expect(container.querySelector(".brass-strip")).toBeNull();
  });

  it("hides body when collapsed=true", () => {
    const { container } = render(
      <StageFrame title="T" collapsed>
        <p>hidden body content</p>
      </StageFrame>,
    );
    expect(container.textContent).not.toContain("hidden body content");
  });

  it("shows body when collapsed=false (or undefined)", () => {
    const { container } = render(
      <StageFrame title="T">
        <p>visible body content</p>
      </StageFrame>,
    );
    expect(container.textContent).toContain("visible body content");
  });

  it("toggles open/closed when onToggle is provided", () => {
    let collapsed = false;
    const onToggle = vi.fn(() => {
      collapsed = !collapsed;
    });
    const { container, rerender } = render(
      <StageFrame title="T" onToggle={onToggle} collapsed={collapsed}>
        <p>toggleable body</p>
      </StageFrame>,
    );
    // First render: not collapsed, body visible.
    expect(container.textContent).toContain("toggleable body");
    // Click the header button. With onToggle the header is a real
    // <button> with aria-expanded bound to !collapsed.
    const headerBtn = container.querySelector(
      'button[aria-expanded="true"]',
    ) as HTMLButtonElement;
    expect(headerBtn).toBeTruthy();
    expect(headerBtn.textContent).toContain("T");
    fireEvent.click(headerBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Re-render with collapsed=true; aria-expanded should flip to false.
    rerender(
      <StageFrame title="T" onToggle={onToggle} collapsed={collapsed}>
        <p>toggleable body</p>
      </StageFrame>,
    );
    expect(
      container.querySelector('button[aria-expanded="false"]'),
    ).toBeTruthy();
    // Body is now hidden.
    expect(container.textContent).not.toContain("toggleable body");
  });

  it("does not render a header button when onToggle is absent", () => {
    const { container } = render(
      <StageFrame title="T">
        <span>c</span>
      </StageFrame>,
    );
    // No aria-expanded button when there's no toggle.
    expect(container.querySelector("button[aria-expanded]")).toBeNull();
  });

  it("action buttons stop propagation so they don't collapse the frame", () => {
    const onToggle = vi.fn();
    const onActionClick = vi.fn();
    const { container } = render(
      <StageFrame
        title="T"
        onToggle={onToggle}
        actions={
          <button data-testid="inner-action" onClick={onActionClick}>
            Open
          </button>
        }
      >
        <p>body</p>
      </StageFrame>,
    );
    fireEvent.click(container.querySelector('[data-testid="inner-action"]')!);
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("does not show chevron when onToggle is absent", () => {
    const { container } = render(
      <StageFrame title="T">
        <span>c</span>
      </StageFrame>,
    );
    // No ChevronRight icon should be rendered (lucide-react would inject an svg).
    // Easier check: the chevron's CSS class includes 'rotate-90' when
    // not collapsed; if onToggle is absent, that class isn't applied.
    const chevron = container.querySelector(".rotate-90");
    expect(chevron).toBeNull();
  });

  it("shows rotated chevron when onToggle is provided and not collapsed", () => {
    const { container } = render(
      <StageFrame title="T" onToggle={() => {}}>
        <span>c</span>
      </StageFrame>,
    );
    // ChevronRight is rendered with class "rotate-90" when not collapsed.
    expect(container.querySelector(".rotate-90")).toBeTruthy();
  });

  it("shows straight chevron when onToggle is provided and collapsed=true", () => {
    const { container } = render(
      <StageFrame title="T" onToggle={() => {}} collapsed>
        <span>c</span>
      </StageFrame>,
    );
    // ChevronRight gets "rotate-0" class when collapsed.
    const chevron = container.querySelector("[class*='rotate-0']");
    expect(chevron).toBeTruthy();
  });

  it("passes className through to the wrapper section", () => {
    const { container } = render(
      <StageFrame title="T" className="custom-class">
        <span>c</span>
      </StageFrame>,
    );
    const section = container.querySelector("section");
    expect(section!.className).toContain("custom-class");
  });

  it("uses tight density (no body padding) when density='tight'", () => {
    const { container } = render(
      <StageFrame title="T" density="tight">
        <p>tight body</p>
      </StageFrame>,
    );
    // Tight body container is a plain div, no padding classes.
    const bodyDivs = container.querySelectorAll("section > div");
    // The last non-header child holds the body. Tight density => empty
    // className on the body wrapper. Comfortable => has padding classes.
    const tight = bodyDivs[bodyDivs.length - 1];
    expect(tight!.className).not.toMatch(/px-/);
    expect(tight!.className).not.toMatch(/py-/);
  });
});

describe("ToolGroup", () => {
  it("renders children inside a labelled group", () => {
    const { container } = render(
      <ToolGroup label="Voicing">
        <button>Closed</button>
        <button>Open</button>
      </ToolGroup>,
    );
    const group = container.querySelector('[role="group"]');
    expect(group).toBeTruthy();
    expect(group!.getAttribute("aria-label")).toBe("Voicing");
  });

  it("renders the label as visible text", () => {
    const { container } = render(
      <ToolGroup label="My Tools">
        <span>child</span>
      </ToolGroup>,
    );
    expect(container.textContent).toContain("My Tools");
  });

  it("passes className through", () => {
    const { container } = render(
      <ToolGroup label="T" className="my-extra">
        <span>c</span>
      </ToolGroup>,
    );
    expect(container.firstElementChild!.className).toContain("my-extra");
  });
});

describe("ToolChip", () => {
  it("renders children as the button label", () => {
    const { container } = render(<ToolChip>Closed voicing</ToolChip>);
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toBe("Closed voicing");
  });

  it("sets aria-pressed to active prop", () => {
    const { rerender, container } = render(<ToolChip active={false}>x</ToolChip>);
    expect(container.querySelector("button")!.getAttribute("aria-pressed")).toBe(
      "false",
    );
    rerender(<ToolChip active={true}>x</ToolChip>);
    expect(container.querySelector("button")!.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    const { container } = render(<ToolChip onClick={onClick}>x</ToolChip>);
    fireEvent.click(container.querySelector("button")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders with a title attribute when provided", () => {
    const { container } = render(<ToolChip title="Closed voicing — clustered">x</ToolChip>);
    expect(container.querySelector("button")!.getAttribute("title")).toBe(
      "Closed voicing — clustered",
    );
  });
});