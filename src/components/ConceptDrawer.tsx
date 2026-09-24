/**
 * src/components/ConceptDrawer.tsx - PRD-001 Phase 3 Slice 3 (D38,
 * REQ-PED-5). Right-slide concept panel built ON ModalShell: the
 * focus trap, Escape handling, focus restore, body scroll lock and
 * aria-modal all come FREE from the shell - do NOT reimplement them.
 * z-50 matches the modal rung of the D8 z-ladder.
 *
 * Hosts render <ConceptDrawer key={conceptId} ... /> so related-chip
 * navigation (local `shown` state) resets cleanly when the host
 * switches concepts (the key-prop pattern).
 *
 * DEFERRED (D38, honest): REQ-PED-12 global search + REQ-PED-13
 * "Hear an example" / "Send to Explore" land in the footer slot
 * below in a later slice.
 */

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ModalShell, useModalLabel } from "./ModalShell";
import { getConcept } from "../../engine/pedagogy/concepts";
import type { ConceptCategory } from "../../engine/pedagogy/types";
import { composePreviewPlayer } from "../lib/composePreview";
import { hearExampleNumerals } from "../lib/earHear";
import { ideaToSeedText } from "../../engine/explore/seeds";
import { useSessionStore } from "../state/sessionStore";
import { asCanonicalId, makeInstanceId } from "../../engine/core/ids";

export interface ConceptDrawerProps {
  conceptId: string;
  onClose: () => void;
  /** Optional Hear override (tests); default renders exampleNumerals in C. */
  onHearExample?: () => void;
  /** Optional Send override (tests); default carries seed + requests explore. */
  onSendToExplore?: (seedText: string) => void;
}

/** Category -> badge color token. The TEXT label is always present
 *  (the badge is never the sole carrier of the category). */
const CATEGORY_CLASS: Record<ConceptCategory, string> = {
  harmony: "border-amber-500/40 text-amber-300",
  "voice-leading": "border-teal-500/40 text-teal-300",
  melody: "border-violet-500/40 text-violet-300",
  form: "border-emerald-500/40 text-emerald-300",
  rhythm: "border-orange-500/40 text-orange-300",
};

/** "label - URL" -> parts, splitting on the LAST " - " (labels may
 *  contain dashes). null when the tail is not an http(s) URL. */
function splitReference(ref: string): { label: string; url: string } | null {
  const idx = ref.lastIndexOf(" - ");
  if (idx <= 0) return null;
  const url = ref.slice(idx + 3).trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return null;
  }
  return { label: ref.slice(0, idx).trim(), url };
}

export function ConceptDrawer({
  conceptId,
  onClose,
  onHearExample,
  onSendToExplore,
}: ConceptDrawerProps): React.ReactElement | null {
  // `shown` diverges from the prop only via RELATED navigation; the
  // host's key={conceptId} remount resets it (key-prop pattern).
  const [shown, setShown] = useState(conceptId);
  const labelId = useModalLabel("concept-drawer");
  const [hearState, setHearState] = useState(composePreviewPlayer.getState());
  useEffect(() => {
    const unsubscribe = composePreviewPlayer.subscribe(setHearState);
    setHearState(composePreviewPlayer.getState());
    return unsubscribe;
  }, []);
  useEffect(() => {
    return () => {
      composePreviewPlayer.stop();
    };
  }, []);
  const concept = getConcept(shown);
  // Registry resolution is test-pinned upstream (concepts.test.ts);
  // this null-guard is purely defensive - render nothing, no noise.
  if (!concept) return null;

  const paragraphs = concept.body
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const related = (concept.related ?? [])
    .map((id) => getConcept(id))
    .filter((c) => c !== null);

  return (
    <ModalShell
      labelledBy={labelId}
      onDismiss={onClose}
      // print-hide on BOTH the backdrop and the panel (fix round,
      // DOCS M3): hosts render this drawer INSIDE the .print-area
      // section (EtudeViews), where the print stylesheet keeps
      // everything visible - an open drawer during Cmd+P would
      // otherwise print over the score (panel) or tint the page
      // (fixed bg-black/50 backdrop).
      backdropClassName="bg-black/50 print-hide"
      className={
        // Right-anchored full-height card + slide-in (drawer-in
        // keyframe lives in index.css; the global reduced-motion
        // block collapses it for users who prefer that).
        "drawer-in print-hide fixed right-0 top-0 h-full w-full max-w-md rounded-none " +
        "border-y-0 border-r-0 border-l border-[color:var(--color-border)] " +
        "bg-[color:var(--color-bg-1)] text-[color:var(--color-text-1)] " +
        "flex flex-col overflow-hidden"
      }
    >
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[color:var(--color-border)]">
        <div className="min-w-0">
          <span
            className={`t-label inline-block mb-1 rounded-full border px-2 py-0.5 ${
              CATEGORY_CLASS[concept.category]
            }`}
          >
            {concept.category}
          </span>
          <h2
            id={labelId}
            className="t-h1 text-[color:var(--color-text-1)] leading-tight"
          >
            {concept.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close concept"
          className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        <p className="t-small italic text-[color:var(--color-text-2)]">
          {concept.definition}
        </p>
        {paragraphs.map((p, i) => (
          <p key={i} className="t-body text-[color:var(--color-text-1)]">
            {p}
          </p>
        ))}

        {concept.references && concept.references.length > 0 && (
          <div>
            <h3 className={`t-label mb-1 ${CATEGORY_CLASS[concept.category]}`}>
              References
            </h3>
            <ul className="flex flex-col gap-1">
              {concept.references.map((ref, i) => {
                const parsed = splitReference(ref);
                if (!parsed) {
                  return (
                    <li
                      key={i}
                      className="t-small text-[color:var(--color-text-2)]"
                    >
                      {ref}
                    </li>
                  );
                }
                return (
                  <li key={i}>
                    <a
                      href={parsed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="t-small text-[color:var(--color-brand-strong)] underline"
                    >
                      {parsed.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {related.length > 0 && (
          <div>
            <h3 className={`t-label mb-1 ${CATEGORY_CLASS[concept.category]}`}>
              Related concepts
            </h3>
            <div className="flex flex-wrap gap-2">
              {related.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setShown(c.id)}
                  aria-label={`Open concept ${c.title}`}
                  className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[11px] t-mono text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] hover:border-[color:var(--color-brand)]"
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* REQ-PED-13 footer (Phase 6, D111/D112): Hear an example
            (generated exampleNumerals in C) + Send to Explore (seed
            carry, never a literal transplant claim). */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-border)] px-5 py-3">
          <button
            type="button"
            disabled={concept.exampleNumerals === null}
            title={
              concept.exampleNumerals === null
                ? "No example available for this concept"
                : `Hear ${concept.title} in C`
            }
            aria-label={`Hear ${concept.title} example`}
            data-testid="concept-hear"
            data-preview={hearState}
            onClick={() => {
              if (onHearExample) {
                onHearExample();
                return;
              }
              if (concept.exampleNumerals === null) return;
              void hearExampleNumerals(concept.exampleNumerals);
            }}
            className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-1)] disabled:opacity-50"
          >
            Hear an example
          </button>
          <button
            type="button"
            aria-label="Send concept to Explore"
            data-testid="concept-send-explore"
            onClick={() => {
              const numerals = concept.exampleNumerals ?? [];
              const seedText = ideaToSeedText({
                kind: "progression",
                chord: null,
                progression: [...numerals],
                scale: null,
                melody: null,
                seed: null,
              });
              if (onSendToExplore) {
                onSendToExplore(seedText);
                return;
              }
              const nowMs = Date.now();
              const store = useSessionStore.getState();
              store.setCurrentIdea({
                version: 1,
                id: asCanonicalId(`idea-concept-${concept.id}`),
                instanceId: makeInstanceId(nowMs, 0),
                source: "explore",
                kind: "progression",
                chord: null,
                progression: [...numerals],
                scale: null,
                melody: null,
                seed: null,
                tags: null,
                createdAt: nowMs,
              });
              composePreviewPlayer.stop();
              store.requestMode("explore");
              onClose();
            }}
            className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)]"
          >
            Send to Explore
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
