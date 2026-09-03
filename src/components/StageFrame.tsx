import React from "react";
import { ChevronRight } from "lucide-react";

interface StageFrameProps {
  /** Optional small uppercase eyebrow shown above the title */
  eyebrow?: React.ReactNode;
  /** Title (or content for a custom header) */
  title?: React.ReactNode;
  /** Secondary text on the right side of the header (count, status, badge) */
  meta?: React.ReactNode;
  /** Action elements (chips, buttons) on the far right of the header */
  actions?: React.ReactNode;
  /** When true, render the brass accent strip at the top of the frame */
  accent?: boolean;
  /** Visual density — "tight" removes the body padding (header-only frames) */
  density?: "comfortable" | "tight";
  /** Whether the frame is currently the active focus (brass stronger) */
  active?: boolean;
  /** When provided, the frame is collapsible — clicking the header toggles open */
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  /** Optional className passthrough */
  className?: string;
}

/**
 * StageFrame — the consistent card shell for every panel, modal,
 * and section. Anchored on the design tokens defined in index.css.
 *
 * Anatomy:
 *   ┌─────────────────────────────────┐
 *   │ brass strip (when accent=true)  │   ← the signature accent
 *   ├─────────────────────────────────┤
 *   │ eyebrow · title         meta · actions │   ← editorial header
 *   ├─────────────────────────────────┤
 *   │  body                            │
 *   └─────────────────────────────────┘
 *
 * Token usage:
 *   - bg, border, text all from --color-bg-* / --color-text-*
 *   - accent strip uses --color-brand gradient
 *   - focus ring inherited from :focus-visible global rule
 *
 * Mobile-first: every gap is on the 8px scale; touch targets are
 * at least 44×44px inside the header (handled by consumers).
 */
export const StageFrame: React.FC<StageFrameProps> = ({
  eyebrow,
  title,
  meta,
  actions,
  accent = false,
  density = "comfortable",
  active = false,
  collapsed,
  onToggle,
  children,
  className = "",
}) => {
  const bodyPad =
    density === "tight" ? "" : "px-4 sm:px-5 py-4 sm:py-5";
  const titleColor = active
    ? "text-[color:var(--color-brand-strong)]"
    : "text-[color:var(--color-text-1)]";

  const headerInner = (
    <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3">
      {onToggle && (
        <ChevronRight
          size={14}
          className={`text-[color:var(--color-text-3)] transition-transform ${collapsed ? "rotate-0" : "rotate-90"}`}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div className="t-label text-[color:var(--color-text-3)]">{eyebrow}</div>
        )}
        {title && (
          <div className={`t-h1 ${titleColor} truncate`}>{title}</div>
        )}
      </div>
      {meta && (
        <div className="t-small text-[color:var(--color-text-2)] whitespace-nowrap">
          {meta}
        </div>
      )}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );

  return (
    <section
      className={`relative surface-2 border border-[color:var(--color-border)] rounded-[var(--radius-xl)] overflow-hidden ${
        active
          ? "shadow-[0_0_0_1px_rgba(255,230,168,0.18),0_8px_28px_rgba(0,0,0,0.35)]"
          : "shadow-[0_4px_18px_rgba(0,0,0,0.35)]"
      } ${className}`}
    >
      {accent && <div className="brass-strip" aria-hidden="true" />}
      {(title || eyebrow || actions || meta) && headerInner}
      {title && eyebrow && (
        <div className="h-px w-full bg-[color:var(--color-border)]" aria-hidden="true" />
      )}
      {!collapsed && <div className={bodyPad}>{children}</div>}
    </section>
  );
};

/**
 * Smaller variant — just a labelled chip block, no header.
 * Used inside tool palettes (e.g. Voicing Type, Optimize Lead, Theory Labels).
 */
interface ToolGroupProps {
  label: string;
  children: React.ReactNode;
  /** Whether the group should highlight the selected chip with brass */
  active?: boolean;
  className?: string;
}

export const ToolGroup: React.FC<ToolGroupProps> = ({
  label,
  children,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col gap-1.5 ${className}`}
      role="group"
      aria-label={label}
    >
      <span className="t-label text-[color:var(--color-text-3)] px-1">
        {label}
      </span>
      <div className="inline-flex surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-0.5">
        {children}
      </div>
    </div>
  );
};

interface ToolChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}

/**
 * Pill-style chip used inside ToolGroup.
 *  - Default: muted text on neutral surface
 *  - Hover: lighter background
 *  - Active: brass background, dark text — the only place brass is "loud"
 */
export const ToolChip: React.FC<ToolChipProps> = ({
  active = false,
  onClick,
  children,
  title,
  ...rest
}) => {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      {...rest}
      className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-mono transition-colors ${
        active
          ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)] shadow-[0_0_0_1px_rgba(255,230,168,0.35)]"
          : "text-[color:var(--color-text-2)] hover:bg-[color:var(--color-bg-2)] hover:text-[color:var(--color-text-1)]"
      }`}
    >
      {children}
    </button>
  );
};