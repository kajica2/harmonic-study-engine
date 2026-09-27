/**
 * src/lib/practiceSessions.test.ts - PRD-001 Phase 7 S3 (REQ-PRAC-61,
 * D133/D136).
 *
 * Node env (localStorage polyfilled by tests/setup.ts).
 * cap-50 prune; corrupt -> []; the shape guard REJECTS legacy
 * set-runner rows (different schema - D119 pin); appendAttempt
 * DUAL-WRITE (session + pedagogy.log) with a localStorage spy - the
 * D136 fork-risk cover; the two-write upsert law (D133 rule 3).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { K } from "./storage";
import { loadLog } from "./pedagogyLog";
import {
  SESSION_CAP,
  appendAttempt,
  appendSession,
  loadSessions,
  markRampCompleted,
  outcomeOf,
} from "./practiceSessions";
import {
  closeSession,
  foldAttempt,
  openSession,
  type AttemptV1,
  type SessionRecordV1,
} from "../../engine/practice/session";

const T0 = 1_700_000_000_000;

function session(i: number, over: Partial<SessionRecordV1> = {}): SessionRecordV1 {
  const base = closeSession(openSession({
    startedAtMs: T0 + i * 1000,
    refId: `path-${i}`,
    meter: "4/4",
    tempoStartBpm: 120,
    metronome: null,
    windows: {},
  }), T0 + i * 1000 + 30_000);
  return { ...base, ...over };
}

function attempt(over: Partial<AttemptV1> = {}): AttemptV1 {
  return {
    atMs: T0 + 5000,
    bpm: 120,
    phaseKind: "play",
    source: "detect",
    success: true,
    matchedFraction: 1,
    avgOffsetMs: 10,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("practiceSessions persistence", () => {
  it("K-entry + cap constant", () => {
    expect(K.completedSessions).toBe("practice.sessions");
    expect(SESSION_CAP).toBe(50);
  });

  it("append + load round-trip", () => {
    appendSession(session(1));
    const all = loadSessions();
    expect(all.length).toBe(1);
    expect(all[0].refId).toBe("path-1");
  });

  it("cap-50 prune keeps the NEWEST 50", () => {
    for (let i = 0; i < 60; i++) appendSession(session(i));
    const all = loadSessions();
    expect(all.length).toBe(SESSION_CAP);
    expect(all[0].refId).toBe("path-10");
    expect(all[49].refId).toBe("path-59");
  });

  it("corrupt -> []", () => {
    localStorage.setItem(K.completedSessions, "nope{");
    expect(loadSessions()).toEqual([]);
    localStorage.setItem(K.completedSessions, JSON.stringify({ not: "array" }));
    expect(loadSessions()).toEqual([]);
  });

  it("shape guard REJECTS legacy set-runner rows (D119/D133 disjointness)", () => {
    localStorage.setItem(
      K.completedSessions,
      JSON.stringify([
        // A synesthesia_practice_sessions row (the set-runner schema):
        { id: "s1", pathId: "p", startedAt: "2026-01-01", endedAt: "2026-01-01", tempo: 120 },
      ]),
    );
    expect(loadSessions()).toEqual([]);
  });

  it("two writes, ONE record: the ramp-complete upsert (D133 rule 3)", () => {
    const open = openSession({
      startedAtMs: T0,
      refId: "path-x",
      meter: "4/4",
      tempoStartBpm: 90,
      metronome: null,
      windows: {},
    });
    markRampCompleted(open);
    expect(loadSessions().length).toBe(1);
    const closed = closeSession({ ...open, rampCompleted: true }, T0 + 30_000);
    appendSession(closed);
    expect(loadSessions().length).toBe(1); // upsert, not a duplicate
    expect(loadSessions()[0].endedAtMs).toBe(T0 + 30_000);
    expect(loadSessions()[0].rampCompleted).toBe(true);
  });
});

describe("appendAttempt: THE dual-write seam (D136)", () => {
  it("writes the folded attempt AND a pedagogy.log 'practice' row", () => {
    const draft = openSession({
      startedAtMs: T0,
      refId: "path-duo",
      meter: "4/4",
      tempoStartBpm: 120,
      metronome: null,
      windows: {},
    });
    const folded = appendAttempt(draft, attempt(), 8, 6);
    // Session side: folded aggregates.
    expect(folded.aggregates.attemptsTotal).toBe(1);
    expect(folded.aggregates.notesHit).toBe(6);
    // Log side: one 'practice' entry, refId + outcome + minutes.
    const log = loadLog();
    expect(log.length).toBe(1);
    expect(log[0].mode).toBe("practice");
    expect(log[0].refId).toBe("path-duo");
    expect(log[0].outcome).toBe("correct");
    expect(log[0].durationSec).toBe(8);
  });

  it("outcome mapping: correct/partial/incorrect + manual (the coherence law)", () => {
    expect(outcomeOf(attempt({ success: true, matchedFraction: 1 }))).toBe("correct");
    expect(outcomeOf(attempt({ success: true, matchedFraction: 0.85 }))).toBe("partial");
    expect(outcomeOf(attempt({ success: false, matchedFraction: 0.4 }))).toBe("incorrect");
    expect(outcomeOf(attempt({ source: "manual", success: true, matchedFraction: null }))).toBe("correct");
    expect(outcomeOf(attempt({ source: "manual", success: false, matchedFraction: null }))).toBe("incorrect");
  });

  it("markRampCompleted latches + logs + is idempotent", () => {
    const draft = foldAttempt(
      openSession({
        startedAtMs: T0,
        refId: "path-rc",
        meter: "4/4",
        tempoStartBpm: 120,
        metronome: null,
        windows: {},
      }),
      attempt(),
      3,
    );
    const latched = markRampCompleted(draft);
    expect(latched.rampCompleted).toBe(true);
    expect(markRampCompleted(latched)).toBe(latched); // idempotent
    const log = loadLog();
    expect(log.length).toBe(1);
    expect(log[0].mode).toBe("practice");
    expect(log[0].outcome).toBe("correct");
    expect(log[0].durationSec).toBe(0); // milestone, not minutes
  });
});
