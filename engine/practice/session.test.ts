/**
 * engine/practice/session.test.ts - PRD-001 Phase 7 S3 (D133).
 *
 * Lifecycle laws + the QUOTA fold: 400 attempts keep raw <= 50 with
 * exact aggregates; the 20s worth-saving boundary (19.9 no / 20
 * yes); rampCompleted latch; no input mutation (frozen fixture).
 */

import { describe, it, expect } from "vitest";
import {
  ATTEMPT_RAW_CAP,
  MIN_SESSION_SEC,
  closeSession,
  foldAttempt,
  isSessionWorthSaving,
  openSession,
  summarizeSession,
  type AttemptV1,
  type SessionRecordV1,
  type SessionSeed,
} from "./session";

const T0 = 1_000_000;

function seed(over: Partial<SessionSeed> = {}): SessionSeed {
  return {
    startedAtMs: T0,
    refId: "path-1",
    meter: "4/4",
    tempoStartBpm: 120,
    metronome: { clickOn: true },
    windows: { loop: { fromBar: 0, toBar: 7 } },
    ...over,
  };
}

function attempt(over: Partial<AttemptV1> = {}): AttemptV1 {
  return {
    atMs: T0 + 5000,
    bpm: 120,
    phaseKind: "play",
    source: "detect",
    success: true,
    matchedFraction: 1,
    avgOffsetMs: 12,
    ...over,
  };
}

describe("openSession", () => {
  it("seeds a version-1 record: open, unlatched, zero aggregates", () => {
    const s = openSession(seed());
    expect(s.version).toBe(1);
    expect(s.endedAtMs).toBeNull();
    expect(s.rampCompleted).toBe(false);
    expect(s.maxTempoBpm).toBe(120);
    expect(s.tempoStartBpm).toBe(120);
    expect(s.attempts).toEqual([]);
    expect(s.aggregates).toEqual({
      attemptsTotal: 0,
      successes: 0,
      notesHit: 0,
      totalPlaySec: 0,
    });
  });

  it("garbage tempoStartBpm -> 0-safe, never NaN", () => {
    const s = openSession(seed({ tempoStartBpm: Number.NaN }));
    expect(s.tempoStartBpm).toBe(0);
    expect(s.maxTempoBpm).toBe(0);
  });
});

describe("foldAttempt: QUOTA law (D133)", () => {
  it("400 attempts: raw stays <= 50, aggregates keep counting", () => {
    let s = openSession(seed());
    for (let i = 0; i < 400; i++) {
      s = foldAttempt(s, attempt({ atMs: T0 + i, bpm: 100 + (i % 50), success: i % 2 === 0 }), 3);
    }
    expect(s.attempts.length).toBe(ATTEMPT_RAW_CAP);
    expect(s.attempts.length).toBeLessThanOrEqual(50);
    expect(s.aggregates.attemptsTotal).toBe(400);
    expect(s.aggregates.successes).toBe(200);
    expect(s.aggregates.notesHit).toBe(400 * 3);
    // Oldest dropped: the kept window is the LAST 50 attempts.
    expect(s.attempts[0].atMs).toBe(T0 + 350);
    expect(s.attempts[49].atMs).toBe(T0 + 399);
  });

  it("maxTempoBpm ratchets with attempt tempos", () => {
    let s = openSession(seed({ tempoStartBpm: 90 }));
    s = foldAttempt(s, attempt({ bpm: 96 }));
    s = foldAttempt(s, attempt({ bpm: 92 }));
    s = foldAttempt(s, attempt({ bpm: 150 }));
    expect(s.maxTempoBpm).toBe(150);
  });

  it("manual attempts pass notesHit 0 (law 2: adapter owns the count)", () => {
    let s = openSession(seed());
    s = foldAttempt(
      s,
      attempt({ source: "manual", matchedFraction: null, avgOffsetMs: null }),
    );
    expect(s.aggregates.notesHit).toBe(0);
    expect(s.aggregates.attemptsTotal).toBe(1);
  });

  it("negative/garbage notesHit clamps to 0", () => {
    let s = openSession(seed());
    s = foldAttempt(s, attempt(), -5);
    s = foldAttempt(s, attempt(), Number.NaN);
    expect(s.aggregates.notesHit).toBe(0);
  });

  it("NO input mutation (frozen fixture, law 7)", () => {
    const base = openSession(seed());
    const frozen: SessionRecordV1 = Object.freeze({
      ...base,
      attempts: Object.freeze([]),
      aggregates: Object.freeze({ ...base.aggregates }),
      windows: Object.freeze(base.windows),
    });
    const next = foldAttempt(frozen, attempt(), 2);
    expect(next).not.toBe(frozen);
    expect(frozen.attempts.length).toBe(0);
    expect(frozen.aggregates.attemptsTotal).toBe(0);
    expect(next.aggregates.attemptsTotal).toBe(1);
  });
});

describe("closeSession + worth-saving (D133 lifecycle)", () => {
  it("stamps end + totalPlaySec; idempotent (first close wins)", () => {
    const s = openSession(seed());
    const closed = closeSession(s, T0 + 30_000);
    expect(closed.endedAtMs).toBe(T0 + 30_000);
    expect(closed.aggregates.totalPlaySec).toBe(30);
    const again = closeSession(closed, T0 + 999_000);
    expect(again).toBe(closed); // identity: already closed, untouched
  });

  it("ended BEFORE started clamps to 0 play seconds", () => {
    const closed = closeSession(openSession(seed()), T0 - 5000);
    expect(closed.aggregates.totalPlaySec).toBe(0);
  });

  it("MIN_SESSION_SEC boundary: 19.9s NO, 20s YES (the noise filter)", () => {
    expect(MIN_SESSION_SEC).toBe(20);
    const shorty = closeSession(openSession(seed()), T0 + 19_900);
    const exact = closeSession(openSession(seed()), T0 + 20_000);
    expect(isSessionWorthSaving(shorty)).toBe(false);
    expect(isSessionWorthSaving(exact)).toBe(true);
  });

  it("an OPEN session is never worth saving", () => {
    expect(isSessionWorthSaving(openSession(seed()))).toBe(false);
  });
});

describe("rampCompleted latch (REQ-PRAC-33, D132/D133)", () => {
  it("latches through fold + close once true", () => {
    let s = openSession(seed());
    s = { ...s, rampCompleted: true };
    s = foldAttempt(s, attempt({ success: false }));
    s = closeSession(s, T0 + 60_000);
    expect(s.rampCompleted).toBe(true);
  });

  it("openSession starts unlatched", () => {
    expect(openSession(seed()).rampCompleted).toBe(false);
  });
});

describe("summarizeSession (REQ-PRAC-62, pure derivation)", () => {
  it("reports max tempo, total time, attempts, accuracy %, notes hit, badge", () => {
    let s = openSession(seed({ tempoStartBpm: 90 }));
    s = foldAttempt(s, attempt({ bpm: 120, success: true }), 4);
    s = foldAttempt(s, attempt({ bpm: 120, success: false }), 1);
    s = closeSession(s, T0 + 40_000);
    const sum = summarizeSession(s);
    expect(sum).toEqual({
      maxTempoBpm: 120,
      totalSec: 40,
      attemptsMade: 2,
      successes: 1,
      accuracyPct: 50,
      notesHit: 5,
      rampCompleted: false,
    });
  });

  it("zero attempts -> accuracyPct null (never NaN/div-zero)", () => {
    const s = closeSession(openSession(seed()), T0 + 25_000);
    expect(summarizeSession(s).accuracyPct).toBeNull();
  });

  it("summarize NEVER mutates the record", () => {
    const s = closeSession(foldAttempt(openSession(seed()), attempt()), T0 + 25_000);
    const before = JSON.stringify(s);
    summarizeSession(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});
