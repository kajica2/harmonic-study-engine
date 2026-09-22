# ADR-007: Phase 1 dirty-state semantics per mode

- Date: 2026-09-23
- Status: Accepted (PRD-001 Phase 1 implemented)
- Context: PRD §8.1 REQ-MODE-4 ("Switching modes with unsaved work must prompt Save / Discard / Cancel") + REQ-MODE-5 ("each mode exposes a dirty flag"); Phase 1 ships Etude surface; Compose/Explore are stub surfaces with no mutable state yet.

## Decision

- **Compose = always clean** in Phase 1 (no upload surface ships — stub + privacy aside only).
- **Explore = always clean** in Phase 1 (no mutable surface — FormPlanner/FormTemplatePicker are read-only renders).
- **Etude = dirty = `handleCoComposeAccept` mutation since last save/export**. Specifically: the `setHarmonicStep` write that the CoCompose "Accept" button performs. Inspector path edits through `paths.setPaths` are NOT marked dirty in Phase 1 (acceptable; CoCompose accept is the documented dirty trigger).
- **Save** snapshots the current Idea to `hse.ideas` (capped at 100; LRU eviction) and clears the dirty flag. `currentIdea` stays in the store so the user keeps referencing it after saving (no work-loss UX).
- **Discard** dispatches `hse:revert-last-accept` (existing App.tsx revert listener); clears dirty.
- **Share** writes `?idea=<base64>` to clipboard (no server round-trip, per REQ-IO-50 / REQ-NFR-1).

## Rejected alternatives

- Auto-detect via window `hse:etude-mutated` custom event from inside the legacy `useSessionStore.ts`'s `setHarmonicStep`. Rejected for Phase 1: requires editing the legacy hook (preserved intact per ADR-008); the hook has exactly one caller (`handleCoComposeAccept`) so the observer-vs-caller distinction is a wash. Phase 1.5 slice migration will collapse this to a single source.
- Mark Inspector path edits dirty. Rejected for Phase 1: those edits don't change the played chord (the inspector is a view), so marking them dirty would mislead.

## Consequences

- Etude dirty = "you have a new chord from CoCompose since your last save." Predictable; matches user mental model.
- Compose/Explore surfaces in Phase 1 never open the dirty prompt even when switching with an unsaved Idea. The Idea bar is honest about this (Save button visible in the bar even with no dirty flag, since Save writes the current Idea regardless of dirty state).
- The IdeaBar's `+` button (REQ-IDEA / design §5) is wired to mint from the live `activeStep` when present; disabled (with title="No chord yet") when no path is loaded. Affordance is always visible per the design, not hidden when disabled. PREVENTION RULE PHASE-1-02: never ship an affordance as `disabled` without an explicit "what's missing" affordance (a placeholder, a tooltip, a discoverability hint).
- Save/Share in the IdeaBar are visible at all times (per D6) even when no current Idea exists — honest UI.
