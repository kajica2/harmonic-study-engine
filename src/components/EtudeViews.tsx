/**
 * EtudeViews.tsx - PRD-001 Phase 3 Slice 2 (D22/D25/D26) + Slice 3
 * annotations/print surfaces (D37/D40).
 *
 * The etude read-out surface: a Roll/Staff tab pair mounted in the
 * right column of the Etude surface. The piano roll is a static
 * import (small, SVG); the abcjs staff view is lazy so the notation
 * library stays code-split (this component is itself lazy in App).
 *
 * Slice 3 additions (all inside this section - the host already owns
 * the etude object + tab state, so annotations ride in without new
 * App wiring, D37):
 *   - margin-note chip strip (REQ-PED-4 etude portion) with a
 *     "Notes" on/off toggle (REQ-PED-7) - chip click opens the
 *     ConceptDrawer (REQ-PED-5);
 *   - "About this etude" details panel (full annotation list);
 *   - a WYSIWYG "Print" button + print-area/print-hide classes
 *     (REQ-ETU-32; the @media print block lives in index.css -
 *     LiveScoreDisplay and the view chrome are DIRTY files, so the
 *     print rules MUST live in a clean global surface, D40).
 *
 * Drawer state is LOCAL (useState<string | null>): other surfaces
 * (Compose/Explore) lift it to a global slot only when a second
 * consumer actually exists - premature now (D37).
 */

import React, { lazy, Suspense, useState } from "react";
import type { Etude } from "../../engine/etude/types";
import type { Annotation } from "../../engine/pedagogy/types";
import { getConcept } from "../../engine/pedagogy/concepts";
import { NOTE_NAMES } from "../lib/theory";
import { ConceptDrawer } from "./ConceptDrawer";
import { EtudePianoRoll } from "./EtudePianoRoll";

const EtudeStaffView = lazy(() =>
  import("./EtudeStaffView").then((m) => ({ default: m.EtudeStaffView })),
);

export interface EtudeViewsProps {
  etude: Etude;
  pathId: string;
  transposeShift: number;
  /**
   * FORM-relative bar index to highlight (0 .. etude.bars - 1) or
   * null. FIX-ROUND INVARIANT (DOCS-CATCH): etude practice paths
   * carry ONE STEP PER BAR (slice-1 finding 4), so App derives this
   * with `etudeActiveBarFor(etude, activeStepIndex)` =
   * `stepIndex % etude.bars` - NOT the legacy
   * `Math.floor(stepIndex / STEPS_PER_BAR)` (4 steps/bar), which
   * advances the highlight at 1/4 speed and falls out of range after
   * the first third of the padded loop. EtudePianoRoll clamps
   * out-of-range values defensively; with the correct mapping the
   * highlight is ALWAYS in range while the form loops.
   */
  activeBar: number | null;
}

/** Bar-resolvable target -> the chip's position prefix (1-based bars,
 *  matching the roll/staff labels). null = no bar anchor today
 *  (note{slot}/scale targets are not emitted by the slice-1
 *  detectors; voicing{bar} is handled like chord{bar} for free). */
function annotationPrefix(a: Annotation): string | null {
  const t = a.target;
  switch (t.kind) {
    case "chord":
    case "voicing":
      return `m${t.bar + 1}`;
    case "progression":
      return `m${t.fromBar + 1}-${t.toBar + 1}`;
    case "melody":
      return "melody";
    default:
      return null;
  }
}

/** 0-based form bars an annotation covers (active-bar highlight).
 *  Progressions span their inclusive range; melody is bar-less. */
function annotationBars(a: Annotation): number[] {
  const t = a.target;
  if (t.kind === "chord" || t.kind === "voicing") return [t.bar];
  if (t.kind === "progression") {
    const out: number[] = [];
    for (let b = t.fromBar; b <= t.toBar; b += 1) out.push(b);
    return out;
  }
  return [];
}

const chipBase =
  "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] t-mono";

export function EtudeViews({
  etude,
  pathId,
  transposeShift,
  activeBar,
}: EtudeViewsProps): React.ReactElement {
  const [tab, setTab] = useState<"roll" | "staff">("roll");
  // REQ-PED-7: margin-note visibility. LOCAL VIEW state (a per-
  // session reading preference) - deliberately NOT persisted, unlike
  // metronome taste (D32): the PRD does not mandate it and this is
  // view chrome, not user setup.
  const [notesOn, setNotesOn] = useState(true);
  // D37: drawer target concept id (null = closed).
  const [drawerConceptId, setDrawerConceptId] = useState<string | null>(
    null,
  );

  const annotations = etude.annotations;
  const chips = annotations
    .map((a) => ({ a, prefix: annotationPrefix(a) }))
    .filter((c): c is { a: Annotation; prefix: string } => c.prefix !== null);

  const tabClass = (active: boolean): string =>
    `px-3 py-1 rounded-[var(--radius-sm)] text-xs font-mono transition-colors ${
      active
        ? "bg-[color:var(--color-brand)] text-[color:var(--color-text-inverse)]"
        : "text-[color:var(--color-text-2)] hover:bg-[color:var(--color-bg-2)] hover:text-[color:var(--color-text-1)]"
    }`;

  const toggleClass = (active: boolean): string =>
    `px-3 py-1 rounded-[var(--radius-sm)] text-xs font-mono border transition-colors ${
      active
        ? "border-[color:var(--color-brand)] text-[color:var(--color-brand)]"
        : "border-[color:var(--color-border)] text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)]"
    }`;

  // D40: WYSIWYG browser print of the ACTIVE tab (staff is the
  // notation-first default players print; the roll is SVG too). No
  // forced tab switch, no lazy-load race, no print-after-Suspense
  // timing machinery. jsdom has no window.print - never assert the
  // call in unit tests (the button + print-hide ancestor are pinned).
  const handlePrint = () => {
    try {
      window.print();
    } catch {
      /* non-browser environment: no-op */
    }
  };

  return (
    <section
      aria-label={`Etude views for ${pathId}`}
      className="print-area w-full rounded-[var(--radius-xl)] border border-[color:var(--color-border)] bg-[color:var(--color-bg-1)] p-3 sm:p-4 flex flex-col gap-3"
    >
      <div className="print-hide flex items-center gap-2 flex-wrap">
        <span className="t-label text-[color:var(--color-text-3)]">
          Etude view
        </span>
        <button
          type="button"
          className={tabClass(tab === "roll")}
          aria-pressed={tab === "roll"}
          onClick={() => setTab("roll")}
        >
          Piano roll
        </button>
        <button
          type="button"
          className={tabClass(tab === "staff")}
          aria-pressed={tab === "staff"}
          onClick={() => setTab("staff")}
        >
          Staff
        </button>
        <span className="flex-1" aria-hidden="true" />
        {/* REQ-PED-7: annotations on/off (hides chips + About). */}
        <button
          type="button"
          className={toggleClass(notesOn)}
          aria-pressed={notesOn}
          onClick={() => setNotesOn((v) => !v)}
          title="Show or hide margin notes and the About panel"
        >
          Notes
        </button>
        <button
          type="button"
          className={toggleClass(false)}
          onClick={handlePrint}
          title="Print this view (browser print, print-optimized stylesheet)"
        >
          Print
        </button>
      </div>
      {tab === "roll" ? (
        <EtudePianoRoll
          etude={etude}
          transposeShift={transposeShift}
          activeBar={activeBar}
        />
      ) : (
        <Suspense
          fallback={
            <p className="text-xs text-[color:var(--color-text-3)]">
              Loading staff renderer...
            </p>
          }
        >
          <EtudeStaffView etude={etude} transposeShift={transposeShift} />
        </Suspense>
      )}

      {/* Margin-note strip (REQ-PED-4 etude portion): one chip per
          bar-resolvable annotation. The ACTIVE bar's chips get a
          brand-border highlight - live by construction via the
          existing activeBar prop (ADR-011 render-time rule honored,
          no subscriptions). Chips with a resolvable conceptId are
          buttons that open the ConceptDrawer (REQ-PED-5); null-
          conceptId annotations render as static text (no dead click
          target). */}
      {notesOn && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Margin notes">
          {chips.map(({ a, prefix }) => {
            const live =
              activeBar !== null && annotationBars(a).indexOf(activeBar) >= 0;
            const cls = `${chipBase} ${
              live
                ? "border-[color:var(--color-brand)] text-[color:var(--color-text-1)]"
                : "border-[color:var(--color-border)] text-[color:var(--color-text-2)]"
            }`;
            if (a.conceptId === null) {
              return (
                <span
                  key={a.id}
                  className={cls}
                  title={a.text}
                  data-testid={`annotation-static-${a.id}`}
                >
                  {`[${prefix}] ${a.label}`}
                </span>
              );
            }
            return (
              <button
                key={a.id}
                type="button"
                className={`${cls} hover:text-[color:var(--color-text-1)]`}
                onClick={() => setDrawerConceptId(a.conceptId)}
                title={a.text}
                data-testid={`annotation-chip-${a.id}`}
              >
                {`[${prefix}] ${a.label}`}
              </button>
            );
          })}
        </div>
      )}

      {/* "About this etude" - <details> default CLOSED (house pattern
          from the composer Advanced fold): title line echoes the
          etude's own fields (no new data path) + the FULL annotation
          list in margin-note style. */}
      {notesOn && (
        <details className="surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] px-3 py-2">
          <summary className="t-label text-[color:var(--color-text-2)] cursor-pointer select-none">
            About this etude
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="t-small text-[color:var(--color-text-3)]">
              {`${etude.styleId} . ${NOTE_NAMES[etude.key % 12]} ${
                etude.mode
              } . ${etude.bars} bars . difficulty ${etude.difficulty} . seed ${etude.seed}`}
            </p>
            {annotations.map((a) => {
              const prefix = annotationPrefix(a);
              const concept =
                a.conceptId !== null ? getConcept(a.conceptId) : null;
              return (
                <div
                  key={a.id}
                  className="border-t border-[color:var(--color-border)] pt-2"
                >
                  <p className="text-xs font-semibold text-[color:var(--color-text-1)]">
                    {prefix ? `[${prefix}] ` : ""}
                    {a.label}
                  </p>
                  <p className="t-small text-[color:var(--color-text-2)]">
                    {a.text}
                  </p>
                  {concept && (
                    <button
                      type="button"
                      onClick={() => setDrawerConceptId(concept.id)}
                      className="mt-1 text-[11px] t-mono text-[color:var(--color-brand-strong)] underline"
                    >
                      {`What is ${concept.title}?`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {drawerConceptId !== null && (
        <ConceptDrawer
          // key-prop pattern: switching concepts remounts the drawer
          // so scroll + internal state reset (D37/D38).
          key={drawerConceptId}
          conceptId={drawerConceptId}
          onClose={() => setDrawerConceptId(null)}
        />
      )}
    </section>
  );
}
