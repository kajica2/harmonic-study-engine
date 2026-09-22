/**
 * src/components/DirtyPromptModal.tsx - PRD-001 REQ-MODE-4, REQ-MODE-5.
 *
 * Modal-driven Save / Discard / Cancel flow when the user tries to
 * switch modes while the current mode is dirty (Phase 1 = Etude).
 * Built on the existing `ModalShell` so focus trap + Escape + backdrop
 * click + ARIA plumbing are handled by the shared primitive.
 *
 * Render is driven by `pendingModeRequest` in the store: when non-null,
 * the modal is open; when null, it returns null. This lets the
 * orchestrator (App.tsx) mount the modal once at the top of the tree
 * without conditionally rendering it on every state change.
 *
 * The modal is intentionally z-40 (per D8 ladder): above sticky
 * surfaces, below other modals.
 */

import React from "react";
import { ModalShell, useModalLabel } from "./ModalShell";
import { useSessionStore, MODES, MODE_LABELS } from "../state/sessionStore";

export interface DirtyPromptModalProps {
  /** When provided, used instead of reading the store (test-only escape hatch). */
  pending?: import("../state/sessionStore").Mode | null;
  /** When provided, used instead of calling the store (test-only escape hatch). */
  onResolve?: (action: "save" | "discard" | "cancel") => void;
}

export const DirtyPromptModal: React.FC<DirtyPromptModalProps> = ({
  pending: pendingOverride,
  onResolve,
}) => {
  const pending = useSessionStore((s) => s.pendingModeRequest);
  const currentMode = useSessionStore((s) => s.mode);
  const titleId = useModalLabel("dirty-prompt");

  const effectivePending = pendingOverride ?? pending;
  if (!effectivePending) return null;

  const targetLabel = MODE_LABELS[effectivePending];
  const fromLabel = currentMode ? MODE_LABELS[currentMode] : "the current mode";

  const handleSave = () => {
    if (onResolve) onResolve("save");
    else useSessionStore.getState().resolveDirty("save");
  };
  const handleDiscard = () => {
    if (onResolve) onResolve("discard");
    else useSessionStore.getState().resolveDirty("discard");
  };
  const handleCancel = () => {
    if (onResolve) onResolve("cancel");
    else useSessionStore.getState().resolveDirty("cancel");
  };

  return (
    <ModalShell
      labelledBy={titleId}
      onDismiss={handleCancel}
      className="bg-neutral-900 border border-[color:var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col"
    >
      <h2
        id={titleId}
        className="text-base font-semibold text-[color:var(--color-text-1)] mb-2"
      >
        Unsaved changes in {fromLabel}
      </h2>
      <p className="text-sm text-[color:var(--color-text-2)] mb-5">
        You have unsaved work. Save it before switching to {targetLabel}, or
        discard the changes?
      </p>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="px-3 py-2 rounded border border-[color:var(--color-border)] surface-1 text-neutral-300 hover:text-white text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
        >
          Discard changes
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-2 rounded bg-[color:var(--color-brand)] hover:bg-[color:var(--color-brand-strong)] text-[color:var(--color-text-inverse)] text-sm font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/60"
        >
          Save and switch
        </button>
      </div>
      {/* Mention every known mode so this component stays honest if a
          new mode ever grows a real dirty flag. */}
      <p className="text-[11px] t-mono text-[color:var(--color-text-3)] mt-4">
        Modes: {MODES.map((m) => MODE_LABELS[m]).join(" / ")}
      </p>
    </ModalShell>
  );
};