/**
 * engine/core/idea.ts - PRD-001 REQ-IDEA-1.
 *
 * Idea - the normalized cross-mode currency. A discriminated union with
 * exactly ONE populated payload slot per `kind`:
 *
 *   kind=chord        -> chord: string
 *   kind=progression  -> progression: readonly string[]
 *   kind=scale        -> scale: string
 *   kind=melody       -> melody: readonly number[]    (MIDI 0-127)
 *   kind=seed         -> seed: number                 (reproducible gen)
 *
 * Purity contract (engine/purity.test.ts):
 *   - No external imports (engine/ allowlist: relative only).
 *   - No Date.now / Math.random / new Date / performance.now / console.
 *   - nowMs is supplied by the caller (App.tsx adapter layer passes Date.now()).
 *
 * Brand typing: `id` is CanonicalId (ADR-005), derived deterministically
 * from the canonical payload so two materials of the same idea land on
 * the same canonical id. `instanceId` is InstanceId (ADR-005), built
 * from caller-supplied nowMs + seq - the per-materialization token.
 */

import type { CanonicalId, InstanceId } from "./ids";
import { asCanonicalId, makeInstanceId } from "./ids";
import type { Versioned } from "./versioned";
import { hashSeed } from "./rng";

/** Source mode that minted this idea. PRD REQ-IDEA-2. */
export type IdeaSource = "compose" | "etude" | "explore";

/** Discriminator for the populated payload slot. */
export type IdeaKind = "chord" | "progression" | "scale" | "melody" | "seed";

/** Phase 1 minimal shape. Richer fields land as the modes' primary outputs
 *  stabilize in later phases. */
export interface Idea extends Versioned {
  readonly id: CanonicalId;
  readonly instanceId: InstanceId;
  readonly source: IdeaSource;
  readonly kind: IdeaKind;
  readonly chord: string | null;
  readonly progression: readonly string[] | null;
  readonly scale: string | null;
  readonly melody: readonly number[] | null;
  readonly seed: number | null;
  readonly tags: readonly string[] | null;
  /** Epoch ms (caller-supplied). UI display only; never read by engine logic. */
  readonly createdAt: number;
}

const SOURCES: readonly IdeaSource[] = ["compose", "etude", "explore"];
const KINDS: readonly IdeaKind[] = ["chord", "progression", "scale", "melody", "seed"];

/**
 * Type guard for trust boundaries (URL share link, localStorage `hse.ideas`).
 * Validates shape only; does not enforce that the populated slot matches
 * `kind` (the build helpers always populate the right slot; trust
 * boundaries may receive legacy or hand-rolled payloads).
 */
export function isIdea(raw: unknown): raw is Idea {
  if (typeof raw !== "object" || raw === null) return false;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.instanceId !== "string") return false;
  if (typeof o.source !== "string" || !SOURCES.includes(o.source as IdeaSource)) {
    return false;
  }
  if (typeof o.kind !== "string" || !KINDS.includes(o.kind as IdeaKind)) {
    return false;
  }
  if (
    typeof o.version !== "number" ||
    !Number.isInteger(o.version) ||
    o.version < 1
  ) {
    return false;
  }
  if (o.chord !== null && typeof o.chord !== "string") return false;
  if (o.scale !== null && typeof o.scale !== "string") return false;
  if (o.progression !== null && !Array.isArray(o.progression)) return false;
  if (o.melody !== null && !Array.isArray(o.melody)) return false;
  if (o.seed !== null && typeof o.seed !== "number") return false;
  if (o.tags !== null && !Array.isArray(o.tags)) return false;
  if (typeof o.createdAt !== "number") return false;
  return true;
}

/**
 * Pure helper: derive a deterministic canonical id from the Idea's
 * payload-only fields. Two ideas with the same source + kind + payload
 * collapse to the same canonical id (REQ-IDEA-1 dedup).
 *
 * Mirrors `deriveCanonicalId`'s hashSeed approach but works directly on
 * the Idea subset (no Versioned envelope) so an Idea's id is stable
 * even if the envelope version is bumped later.
 */
function deriveIdeaCanonicalId(p: {
  source: IdeaSource;
  kind: IdeaKind;
  chord: string | null;
}): CanonicalId {
  const key = `${p.source}|${p.kind}|${p.chord ?? ""}`;
  return asCanonicalId(`idea-${hashSeed(key).toString(36)}`);
}

/**
 * Build an Idea from a chord symbol. The Etude-mode day-1 source: a
 * bar click in the play-session rail mints one of these via
 * `useSessionStore.setCurrentIdea(...)`.
 *
 * `nowMs` MUST be supplied by the caller (App.tsx passes Date.now()).
 * `seq` disambiguates same-tick instantiations.
 */
export function ideaFromChord(
  source: IdeaSource,
  chord: string,
  nowMs: number,
  seq = 0,
): Idea {
  const payload = { source, kind: "chord" as const, chord };
  return {
    id: deriveIdeaCanonicalId(payload),
    instanceId: makeInstanceId(nowMs, seq),
    source,
    kind: "chord",
    chord,
    progression: null,
    scale: null,
    melody: null,
    seed: null,
    tags: null,
    createdAt: nowMs,
    version: 1,
  };
}