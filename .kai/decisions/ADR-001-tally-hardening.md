# ADR-001 — Guide-tone live tally hardening

Date: 2026-09-22
Commit: eced8ed (`feat(practice): live guide-tone tally — idempotent begin + reset on path + dim on pause`)

## Context

FUTURE_PLANNING #1 asked for a "live streak" chip. Implementation already existed as a cumulative tally (`useGuideToneTrail` + `PracticeHeader` chip + `formatGuideToneTally`). Lifecycle was wired only in header `onPlayPause`, bypassed by Space and PlaySessionRail.

## Decisions

- ARCH-2026-01: `begin()` is transition-guarded idempotent; `reset()` added (clears tally, preserves active). Record flow relies on no-op re-entry → pre-record notes preserved (continuous-practice semantics).
- ARCH-2026-02: Cumulative tally canonical (`✓ guideHits · ✗ (total-guideHits)`). "Streak" wording retired without code change; true consecutive-streak is a separate feature.
- ARCH-2026-03: MIDI-only retained. PianoKeyboard bridge deferred (needs loopback-dedup design).

## Consequences

- All 3 transport writers (header, Space, Rail) drive tally via central `useEffect` on `isPlayingAuto`.
- Path change resets tally without stopping active run.
- Pause freezes + dims chip (`opacity-60`, title "Paused — tally frozen").
- Take-purity change: takes now include pre-record noodling when transport was already playing (see tech-debt TD-001 for clean-take alternative).
