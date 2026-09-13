# Terminology

How identifiers in this codebase map to the **Harmonic Study Engine
(HSE)** vocabulary. This is a reference for naming new code and for
deciding which existing names are worth renaming. No code changes are
mandated by this doc — it's the source of truth, not a migration
plan.

## Status legend

- **Aligned** — your proposed term matches the existing identifier
  (no change needed)
- **Rename candidate** — your proposed term is a better fit; rename is
  optional but recommended
- **Out of scope** — this is an app-domain identifier, not in the HSE
  glossary; keep the existing name
- **Decision pending** — ambiguous; needs human judgment

---

## Tier 1: core data types (already match the proposal)

| Existing | HSE term | Status | Notes |
|---|---|---|---|
| `HarmonicPath` | Harmonic Path | Aligned | Already named this way. 105+ usages across the codebase. |
| `HarmonicStep` | Harmonic Event / Harmonic Token | Aligned | "Step" is implementation-specific; the conceptual unit is "one event in a path." Renaming would touch ~23 usages. |
| `HarmonicPath.steps` | Harmonic Path sequence | Aligned | The path itself; the steps are the ordered transitions. |

## Tier 2: music-domain functions

These map to your "music harmony" glossary. Some are clean renames,
some are ambiguous, some are domain-specific enough that the rename
would lose meaning.

| Existing | HSE term | Status | Notes |
|---|---|---|---|
| `analyzeChord(notes)` | Harmonic Analyzer / `scoreHarmonicEvent` | Rename candidate | Pure chord-family classifier (major/minor/dominant/etc.). Your `scoreHarmonicEvent` is broader. Keep `analyzeChord` if you want clarity; rename to `scoreChord` if you want consistency. |
| `applyVoicing(notes, voicingId)` | Harmonic Relation / `applyHarmonicRelation` | Rename candidate | Applies a voicing shape (closed, drop2, quartal, etc.). Maps to your "how events connect" idea, but `voicing` is the jazz-specific term. |
| `applyVoiceLeading(prev, target)` | `findRoot` or `trackVoice` | Decision pending | Greedy octave-preserving voice leading. Maps to "how two events connect" but the music-specific name is more informative. |
| `voiceLeadingDistance` | Harmonic Score | Rename candidate | Returns a numeric distance. Could be `roughScore` if you want consonance/dissonance framing. |
| `voiceLeadingScore` | Harmonic Score (label) | Rename candidate | Returns a human-readable label like "common tone on top — held". Maps to "label for a property." |
| `analyzeChord` `family` field | Function (Tonic/Dominant/Subdominant) | Aligned | The output is already a string enum: `tonic`, `subdominant`, `dominant`, `predominant`, `color`. |
| `analyzeChord` `roman` field | (no HSE term — domain-specific) | Out of scope | Roman numeral analysis is jazz-specific; no HSE equivalent. |
| `analyzeChord` `tensions` field | Tension | Aligned | Already called "tensions" in the codebase. Maps to your `Tension` concept. |
| `analyzeChord` `bass` field | (domain-specific) | Out of scope | "Bass note" is a music concept; no HSE term. |

## Tier 3: sound/signal functions

These map to your "audio/signal harmonics" glossary. The codebase
has few of these today — mostly via the Web Audio API directly.

| Existing | HSE term | Status | Notes |
|---|---|---|---|
| `buildWarmthCurve(samples, k)` | Sampler / Window | Out of scope | Soft-knee saturation curve for `WaveShaperNode`. Music-domain, not signal-analysis. |
| `velocityToGain(velocity)` | Magnitude | Rename candidate | Maps velocity to amplitude. `velocityToMagnitude` would be HSE-aligned but loses the music-specific term. |
| `midiToFreq(midi)` | Frequency | Aligned | Standard MIDI-to-Hz. Universal concept. |
| `AudioEngine.ctx` | (Web Audio API object) | Out of scope | `AudioContext` is a Web Audio API type. HSE has no equivalent. |
| `WaveShaperNode` | (Web Audio API object) | Out of scope | Same. |
| `BiquadFilterNode` | FilterBank | Out of scope | Same — but the *concept* of a filter bank is HSE-aligned. The Web Audio type isn't. |

## Tier 4: behavioral markers (already aligned conceptually)

| Existing | HSE term | Status | Notes |
|---|---|---|---|
| `deriveBehavioralMarkers(path, persona)` | Harmonic Rule engine | Aligned | Returns per-bar markers from rules. |
| `deriveBarTransposeDrift(path, persona)` | Harmonic Transition (keyDrift) | Aligned | Computes per-bar shift from start to end key. |
| `BehavioralMarker.isMotifTransformation` | Harmonic Rule (motifTracker) | Aligned | |
| `BehavioralMarker.bassFrozen` | Harmonic Rule (bassIsolation / frozenBass) | Aligned | |
| `BehavioralMarker.accentHex` | (UI styling — out of HSE scope) | Out of scope | |

## Tier 5: app-domain identifiers (OUT OF SCOPE for HSE)

These don't fit the HSE glossary because they're app-specific
concepts, not general "harmonic study" primitives. They stay as-is.

| Existing | Concept | Why not HSE |
|---|---|---|
| `Persona` | A composer's stylistic profile | Composers, painters, and theorists — HSE has no concept for "named persona with custom rules." Could rename to `HarmonicProfile` if you want generic-flavored naming. |
| `Masterclass` / `MasterclassEntry` | Curated jazz standard catalog | App-domain — HSE has no "teaching curriculum" concept. |
| `PracticeSet` / `PracticeSession` | User-editable practice session | App-domain — HSE has no "scheduled practice unit" concept. |
| `PathCatalog` | UI surface for browsing paths | App-domain UI component. |
| `PracticeSetBrowser` | UI surface for browsing practice sets | App-domain UI component. |
| `PracticeSessionPlayer` | UI surface for running practice | App-domain UI component. |
| `BackingEngine` | Style-specific backing track | Music-domain but not "harmonic study" — it's a rhythm-section generator. |
| `BackingStyle` | One style preset (swing/bossa/etc.) | Music-domain. |
| `AudioEngine` | Web Audio wrapper | Engine implementation detail. |
| `SynesthesiaCanvas` | Visualization component | App-domain — visualization is out of HSE scope. |
| `LeadSheet` | MusicXML/abcjs export | Music-domain — exports the rendered notation. |
| `RecordingModal` | MediaRecorder capture flow | App-domain. |
| `ScalePlayer` | Diatonic scale practice | Music-domain. |
| `RhythmDrill` | 3-iteration rhythm drill | Music-domain. |
| `MidiOut` / `MidiIn` | Web MIDI wrappers | Engine implementation detail. |

**Rationale for keeping these out of scope:** HSE describes a
*framework for studying harmonics*. The app — its personas, its
practice sets, its UI surfaces — uses HSE terminology for the
study-side, but the app's own domain (composers as personas, jazz
standards, iReal Pro import) doesn't fit the framework. Forcing it
to would lose meaning.

## Tier 6: identifiers to consider renaming (cost/benefit)

| Rename | Cost | Benefit | Recommendation |
|---|---|---|---|
| `HarmonicStep` → `HarmonicEvent` | Low (23 usages, mostly in `paths.ts`) | Aligned with HSE | Rename when touching `paths.ts` next |
| `analyzeChord` → `scoreChord` | Medium (32 usages + tests) | Aligned with HSE | Defer — current name is clear in jazz context |
| `applyVoicing` → `applyHarmonicRelation` | Medium (11 usages) | More generic | **No** — loses music context |
| `voiceLeadingDistance` → `roughScore` | Low (few usages) | Matches your consonance framing | Rename optional |
| `Persona` → `HarmonicProfile` | High (204 usages) | Generic-flavored | **No** — too expensive for marginal gain |
| `Masterclass` → `Curriculum` | High (36 usages) | Generic-flavored | **No** — same reason |

## Naming patterns (your proposal)

Use these patterns for new code:

- **Actions:** verb + noun — `scanHarmony`, `findRoot`, `trackVoice`, `scoreTension`, `compareRuns`
- **Data:** noun + type — `ChordEvent`, `NoteList`, `KeyProfile`, `RuleSet`
- **Suffixes:** keep consistent — `-Map`, `-Path`, `-Track`, `-Score`, `-Set`, `-Run`
- **Syllables:** prefer 1-2 syllables (dyslexia-friendly)

## UI glyph conventions (your accessibility proposal)

These are now applied in the bar strip + canvas:

- **RootPath** (chord roots through time) — solid line
- **TensionLine** (tension score over bars) — dashed line
- **VoiceTrack** (single voice) — dotted line
- **Tonic** — circle (○), label `T`
- **Dominant** — triangle (△), label `D`
- **Subdominant** — square (□), label `S`

Colorblind-safe: every shape is paired with a letter label so the
information is not color-dependent. The glyphs `Δ` (motif
transformation) and `≈` (frozen bass) in the bar strip are already
shape-encoded, not color-encoded.

## Future migration path

When (if ever) you want to migrate to the HSE terminology:

1. **Pick Tier 1 / Tier 4 first.** `HarmonicStep` → `HarmonicEvent`
   is low-cost and improves naming.
2. **Add backward-compat aliases.** E.g. `export const analyzeChord =
   scoreChord` lets old code keep working while new code uses the
   HSE name.
3. **Deprecate incrementally.** Mark the old name with `@deprecated`
   JSDoc, run a codemod to rename usages over a few PRs, then
   remove the alias.
4. **Leave Tier 5 alone.** App-domain names don't migrate to HSE —
   they'd need their own rename plan (out of scope here).

---

**Last reviewed:** 2026-09-12. The doc is the reference for any future
naming decisions. If you add a new identifier, look here first; if
it doesn't fit any row, that's a hint the concept may be missing
from the HSE glossary — flag it and we'll add a row.