# ADR-005: canonicalId / instanceId scheme (REQ-FND-6)

- Date: 2026-09-22
- Status: Accepted (implemented in `engine/core/ids.ts`, reviewed clean)
- Context: PRD-001 Phase 0; consumed by Etude generators in Phase 3
- Deciders: @architect (design), @reviewer (verified)

## Decision

- `canonicalId` = identity of the WORK: `"<kind>-<base36(hashSeed(canonicalize(constraints) + "|" + seed))>"` (kind: "etu" now, "acc" later). Same seed + same constraints => same id, any device, any day. `canonicalize` = stable stringify (recursive key sort, undefined keys dropped, arrays order-preserved, key-insertion-order independence pinned by test).
- `instanceId` = identity of one MATERIALIZATION: `"i-<base36(nowMs)>-<base36(seq).padStart(4,'0')>"`. `makeInstanceId(nowMs, seq)` TAKES the timestamp as a parameter - the engine never reads the clock itself, which keeps the purity guard absolute (REQ-NFR-7/R9).
- Branded string types (`CanonicalId`/`InstanceId` via unique-symbol brands) prevent mixing at compile time; `asCanonicalId`/`asInstanceId` escape hatches for tests/parsing only.
- 32-bit hash space: collisions are cosmetic in a local-first single-user store, documented in-file as a non-security property.

## Consequences

- Phase 3 generators must thread `(seed, constraints)` unchanged into `deriveCanonicalId` for REQ-ETU-15 determinism, and REQ-PED-40 practice-log `refId` points at canonical ids ("regenerate the same etude tomorrow" works).
- Adapter/UI layer supplies `Date.now()` at instantiation time.
