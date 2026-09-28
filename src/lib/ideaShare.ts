/**
 * src/lib/ideaShare.ts - PRD-001 Phase 8 S1 (D148/D149): THE one
 * codec for the `?idea=` URL param, shared by App boot, IdeaBar's
 * Share, and PlaySurface (one truth per value).
 *
 * The shipped scheme is byte-compatible by law (links are already in
 * the wild): encode = btoa(encodeURIComponent(JSON.stringify(idea)))
 * (IdeaBar.tsx:68-76), decode = decodeURIComponent(atob(raw)) ->
 * JSON.parse -> isIdea guard, malformed -> warn + drop
 * (App.tsx:1445-1462, relocated here verbatim). The byte-compat pin
 * in the colocated test locks this module against BOTH shipped paths.
 *
 * Governor asymmetry (D149): the DEBOUNCED writer skips the idea key
 * past IDEA_URL_MAX chars (a paste-bomb guard on ephemeral URL
 * churn); an EXPLICIT copyShareUrl() always sets the param (user
 * intent beats compactness); boot decode has NO cap (it accepts what
 * it can parse, so copied links always land).
 */

import type { Idea } from "../../engine/core/idea";
import { isIdea } from "../../engine/core/idea";

export const IDEA_URL_KEY = "idea";

/** Writer governor (D149): the debounced writer skips the idea key
 *  past this; explicit copy always sets it; boot decode is uncapped. */
export const IDEA_URL_MAX = 1500;

/** Raw shipped scheme (NO governor) - the explicit-copy encoder. */
function encodeIdeaRaw(idea: Idea): string {
  // base64 of UTF-8 (btoa requires latin-1; we encodeURIComponent
  // first to escape non-ASCII bytes defensively) - the shipped
  // IdeaBar comment, kept verbatim because the CODE is byte-equal.
  return btoa(encodeURIComponent(JSON.stringify(idea)));
}

/** Encode for the WRITER: null idea -> null (delete the key);
 *  payload past IDEA_URL_MAX -> null (skip the key ONLY - other
 *  families are untouched; the compose-wipe discipline). */
export function encodeIdeaParam(idea: Idea | null): string | null {
  if (idea === null) return null;
  const enc = encodeIdeaRaw(idea);
  return enc.length > IDEA_URL_MAX ? null : enc;
}

/** Decode a raw param value (URLSearchParams hands us the
 *  percent-decoded string). Malformed -> null + console.warn ONCE
 *  (the shipped App boot behavior, relocated). Valid JSON that fails
 *  the isIdea guard -> null WITHOUT a warn (the shipped guard was
 *  silent - a legacy payload is not an error). Absent -> null. */
export function decodeIdeaParam(raw: string | null): Idea | null {
  if (raw === null) return null;
  try {
    const json = decodeURIComponent(atob(raw));
    const parsed = JSON.parse(json);
    // The engine's `isIdea` type guard so every IdeaKind
    // (chord / progression / scale / melody / seed) round-trips,
    // not just chord-kind Ideas.
    if (isIdea(parsed)) return parsed;
    return null;
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[App] ?idea= payload was malformed; ignoring");
    return null;
  }
}

/** Read-modify-write ONE param on a full href (preserves every other
 *  key - the writer's own discipline, reused for copy). The explicit
 *  copy path: sets REGARDLESS of the governor (D149 asymmetry);
 *  null idea deletes the key. */
export function withIdeaParam(href: string, idea: Idea | null): string {
  const url = new URL(href);
  if (idea === null) {
    url.searchParams.delete(IDEA_URL_KEY);
  } else {
    url.searchParams.set(IDEA_URL_KEY, encodeIdeaRaw(idea));
  }
  return url.toString();
}
