/**
 * engine/core/ids.ts - REQ-FND-6.
 *
 * canonicalId: deterministic identity of a generated WORK. Derived
 * from (kind, seed, constraints) only - same inputs, any device, any
 * day => same id.
 * instanceId: identity of one MATERIALIZATION. Built from a caller-
 * supplied timestamp; the engine never reads the clock itself (see
 * engine/purity.test.ts bans Date.now / new Date).
 *
 * Hash space is 32-bit (base36 suffix). Collisions are cosmetic in a
 * local-first single-user store, not a security property.
 */

import { hashSeed, type Seed } from "./rng";

declare const canonicalBrand: unique symbol;
declare const instanceBrand: unique symbol;

export type CanonicalId = string & { readonly [canonicalBrand]: true };
export type InstanceId = string & { readonly [instanceBrand]: true };

/** Escape hatches for tests / parsing persisted ids. */
export function asCanonicalId(raw: string): CanonicalId {
  return raw as CanonicalId;
}
export function asInstanceId(raw: string): InstanceId {
  return raw as InstanceId;
}

/**
 * Stable JSON stringify: object keys sorted recursively, arrays keep
 * order, undefined-valued keys dropped, undefined -> "null". Input
 * must be JSON-safe plain data (no functions, Map, Set, Date).
 * NaN/Infinity serialize as "null" (JSON.stringify semantics).
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) return "null";
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalize(v)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * kind: short artifact tag ("etu" etude; "acc" accompaniment later).
 * seed: the generator seed (REQ-FND-3 inputs are part of identity).
 * constraints: plain-data constraint object, order-independent.
 */
export function deriveCanonicalId(
  kind: string,
  seed: Seed,
  constraints: unknown,
): CanonicalId {
  const key = `${canonicalize(constraints)}|${seed >>> 0}`;
  return `${kind}-${hashSeed(key).toString(36)}` as CanonicalId;
}

/**
 * nowMs: caller-provided epoch ms (adapter layer passes Date.now()).
 * seq: per-process counter to disambiguate same-ms instantiations.
 */
export function makeInstanceId(nowMs: number, seq: number): InstanceId {
  const t = Math.trunc(nowMs).toString(36);
  const s = Math.trunc(seq).toString(36).padStart(4, "0");
  return `i-${t}-${s}` as InstanceId;
}
