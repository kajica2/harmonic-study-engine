/**
 * SynesthesiaProvider — minimal-context holder for the live `activeMidis`
 * note set. Implements the Vercel `rerender-defer-reads` pattern.
 *
 * Previously `activeMidis` lived in App state: every synth/MIDI note
 * on/off updated it, re-rendering the ENTIRE App tree (all sibling
 * panels — even ones that never look at notes) dozens of times per
 * second during playback. Now the value lives here and is consumed only
 * by components that actually draw from it (the canvas, the keyboard,
 * the audition controls). App subscribes ONLY to the stable setter
 * context, so note events re-render exactly the consumers and nothing
 * else.
 */

import React, {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

const ActiveMidisContext = createContext<number[]>([]);

// The dispatcher is React's stable useState setter — its identity never
// changes, so consumers of the setter context never re-render.
const SetActiveMidisContext = createContext<
  Dispatch<SetStateAction<number[]>> | null
>(null);

export function SynesthesiaProvider({ children }: { children: ReactNode }) {
  const [activeMidis, setActiveMidis] = useState<number[]>([]);
  return (
    <ActiveMidisContext.Provider value={activeMidis}>
      <SetActiveMidisContext.Provider value={setActiveMidis}>
        {children}
      </SetActiveMidisContext.Provider>
    </ActiveMidisContext.Provider>
  );
}

/** Read the live set of sounding notes (re-renders consumer only). */
export function useSynesthesiaActive(): number[] {
  return useContext(ActiveMidisContext);
}

/** Stable setter — safe to call from App without subscribing to changes. */
export function useSynesthesiaSetActive(): Dispatch<
  SetStateAction<number[]>
> {
  const setter = useContext(SetActiveMidisContext);
  if (setter === null) {
    throw new Error(
      "useSynesthesiaSetActive must be used within <SynesthesiaProvider>",
    );
  }
  return setter;
}