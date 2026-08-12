import React from "react";
import { AlertCircle, CheckCircle2, Info, RefreshCw, X } from "lucide-react";

/**
 * InlineError / InlineStatus — a token-driven, ARIA-correct pair of
 * feedback messages that replaces the old alert() popups.
 *
 * - role="status" with aria-live="polite" for non-urgent info.
 * - role="alert" with aria-live="assertive" for errors the user
 *   must acknowledge (still polite, not screaming — this is not a
 *   system-modal dialog).
 * - Built-in Retry button.
 * - tone="info" | "success" | "warning" | "error" controls the icon
 *   and accent (color comes from the design tokens).
 */

type Tone = "info" | "success" | "warning" | "error";

interface BaseProps {
  tone: Tone;
  title?: string;
  children: React.ReactNode;
  /** Optional inline retry button. */
  onRetry?: () => void;
  /** When true, uses role="alert" + aria-live="assertive" (errors). */
  assertive?: boolean;
  /** Optional className for the wrapper. */
  className?: string;
}

const TONE_CLASS: Record<Tone, string> = {
  info: "border-[color:var(--color-info)]/40 text-[color:var(--color-text-1)] bg-[color:var(--color-info)]/10",
  success: "border-[color:var(--color-ok)]/40 text-[color:var(--color-text-1)] bg-[color:var(--color-ok)]/10",
  warning:
    "border-[color:var(--color-warn)]/40 text-[color:var(--color-text-1)] bg-[color:var(--color-warn)]/10",
  error:
    "border-[color:var(--color-err)]/50 text-[color:var(--color-text-1)] bg-[color:var(--color-err)]/10",
};

const TONE_ICON: Record<Tone, React.ReactNode> = {
  info: <Info size={14} className="text-[color:var(--color-info)]" />,
  success: <CheckCircle2 size={14} className="text-[color:var(--color-ok)]" />,
  warning: <AlertCircle size={14} className="text-[color:var(--color-warn)]" />,
  error: <AlertCircle size={14} className="text-[color:var(--color-err)]" />,
};

export const InlineStatus: React.FC<BaseProps> = ({
  tone,
  title,
  children,
  onRetry,
  assertive,
  className = "",
}) => {
  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
      className={`flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 t-small leading-snug ${TONE_CLASS[tone]} ${className}`}
    >
      <span className="mt-0.5 flex-shrink-0">{TONE_ICON[tone]}</span>
      <div className="flex-1 min-w-0">
        {title && (
          <div className="t-label text-[color:var(--color-text-1)] mb-0.5">
            {title}
          </div>
        )}
        <div>{children}</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] hover:border-[color:var(--color-text-1)] transition-colors"
        >
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
};

/**
 * Convenience wrappers for the common cases.
 */
export const InlineError: React.FC<Omit<BaseProps, "tone">> = (props) => (
  <InlineStatus tone="error" assertive {...props} />
);

export const InlineInfo: React.FC<Omit<BaseProps, "tone">> = (props) => (
  <InlineStatus tone="info" {...props} />
);

export const InlineSuccess: React.FC<Omit<BaseProps, "tone">> = (props) => (
  <InlineStatus tone="success" {...props} />
);

export const InlineWarning: React.FC<Omit<BaseProps, "tone">> = (props) => (
  <InlineStatus tone="warning" {...props} />
);

/**
 * Tiny dismissable error pill — used for transient failures where
 * the next action will produce its own status.
 */
export const InlineErrorPill: React.FC<{
  children: React.ReactNode;
  onDismiss: () => void;
}> = ({ children, onDismiss }) => (
  <div
    role="alert"
    className="flex items-center gap-2 t-small text-[color:var(--color-err)] bg-[color:var(--color-err)]/10 border border-[color:var(--color-err)]/30 rounded-[var(--radius-md)] px-2.5 py-1.5"
  >
    <AlertCircle size={12} />
    <span className="flex-1">{children}</span>
    <button
      onClick={onDismiss}
      aria-label="Dismiss"
      className="p-0.5 hover:bg-[color:var(--color-err)]/20 rounded"
    >
      <X size={12} />
    </button>
  </div>
);