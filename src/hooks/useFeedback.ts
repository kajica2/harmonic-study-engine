/**
 * src/hooks/useFeedback.ts — L9 learning loop hook.
 *
 * Records per-suggestion accept/reject events to
 * useSessionStore.feedbackHistory. StylePackPicker.onPick +
 * CoComposePanel.onAccept + TexturePanel counter-line toggle all
 * pipe through this hook so the feedback log is the single source
 * of truth.
 */

import { useCallback } from "react";
import { useSessionStore } from "./useSessionStore";

export interface FeedbackEvent {
  personaId: string;
  suggestion: string;
  accepted: boolean;
}

export interface UseFeedback {
  /** Record a single feedback event. */
  record: (event: FeedbackEvent) => void;
  /** Record an accept. Sugar for record({accepted: true}). */
  accept: (personaId: string, suggestion: string) => void;
  /** Record a reject. */
  reject: (personaId: string, suggestion: string) => void;
  /** Read the full log. */
  history: () => FeedbackEvent[];
}

export function useFeedback(): UseFeedback {
  const session = useSessionStore();
  const setFeedbackHistory = session.setFeedbackHistory;

  // record() uses the functional setter form so consecutive calls
  // inside act() (where React doesn't re-render between calls) all
  // see the latest stored value. The setter is the React useState
  // dispatcher, which always reads the current state.
  const record = useCallback(
    (event: FeedbackEvent) => {
      setFeedbackHistory((prev) => [...prev, event]);
    },
    [setFeedbackHistory],
  );

  const accept = useCallback(
    (personaId: string, suggestion: string) => {
      record({ personaId, suggestion, accepted: true });
    },
    [record],
  );

  const reject = useCallback(
    (personaId: string, suggestion: string) => {
      record({ personaId, suggestion, accepted: false });
    },
    [record],
  );

  const history = useCallback(() => session.feedbackHistory, [session]);

  return { record, accept, reject, history };
}
