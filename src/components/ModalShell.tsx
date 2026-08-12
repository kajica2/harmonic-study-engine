import React, { useEffect, useRef } from "react";

interface ModalShellProps {
  /** Stable ID for the modal's title element — `aria-labelledby` will point here. */
  labelledBy: string;
  /** Optional description ID — used by `aria-describedby`. */
  describedBy?: string;
  /** Click on the backdrop calls this. Default: no-op. */
  onDismiss?: () => void;
  /** Disable Escape to close (e.g. busy async work). */
  disableEscape?: boolean;
  children: React.ReactNode;
  /** Tailwind classes for the inner card. */
  className?: string;
  /** Optional className for the outer backdrop. */
  backdropClassName?: string;
  /** Optional className for the close X. */
  closeButtonClassName?: string;
  /** Refs to elements that should NEVER receive focus on close (rare). */
  except?: (HTMLElement | null)[];
}

/**
 * ModalShell — token-driven modal wrapper that handles the
 * accessibility work that most apps skip:
 *
 *   1. role="dialog" + aria-modal="true" so screen readers know
 *      this is a modal window.
 *   2. aria-labelledby / aria-describedby for the title and body.
 *   3. Escape key closes (unless disableEscape is set).
 *   4. Focus trap: Tab and Shift+Tab cycle within the modal.
 *   5. Focus is moved to the first focusable element (or the modal
 *      container itself) when the modal opens, and returned to the
 *      trigger when it closes.
 *   6. Backdrop click calls onDismiss (optional).
 *
 * Visual: same dark backdrop + accent-border card style as the rest
 * of the app, but lets each consumer pass their own inner className.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  labelledBy,
  describedBy,
  onDismiss,
  disableEscape,
  children,
  className = "",
  backdropClassName = "bg-black/70 backdrop-blur",
  closeButtonClassName = "",
  except = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus management + Escape + body scroll lock
  useEffect(() => {
    const prev =
      (document.activeElement && (document.activeElement as HTMLElement)) ||
      null;
    previouslyFocused.current = prev && prev.focus ? prev : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the modal. If the modal contains a focusable
    // element, focus the first one; otherwise the container itself.
    const container = containerRef.current;
    if (container) {
      const focusable = container.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      if (focusable) {
        focusable.focus();
      } else {
        container.tabIndex = -1;
        container.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!onDismiss) return;
      if (e.key === "Escape" && !disableEscape) {
        e.stopPropagation();
        onDismiss();
        return;
      }
      if (e.key === "Tab" && containerRef.current) {
        // Focus trap
        const allRaw = containerRef.current.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        );
        const all: HTMLElement[] = [];
        allRaw.forEach((el) => all.push(el));
        const focusable = all.filter(
          (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !containerRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !containerRef.current.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus
      if (previouslyFocused.current && previouslyFocused.current.isConnected) {
        previouslyFocused.current.focus();
      }
    };
  }, [onDismiss, disableEscape, except]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 ${backdropClassName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && onDismiss) onDismiss();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={className}
      >
        {children}
      </div>
    </div>
  );
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Tiny helper that returns a stable, unique ID — used by the
 * `aria-labelledby` plumbing in modal consumers. Just calling
 * useId() each time is more robust than passing strings.
 */
export const useModalLabel = (prefix = "modal") => {
  const id = React.useId();
  return `${prefix}-${id}`;
};