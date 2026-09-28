// Shim process.hrtime for browser compatibility before any other imports
const g = (typeof globalThis !== "undefined" ? globalThis : window) as any;
g.process = g.process || {};
if (!g.process.hrtime) {
  g.process.hrtime = function (previousTimestamp?: [number, number]): [number, number] {
    const clocktime = performance.now() * 1e-3;
    let seconds = Math.floor(clocktime);
    let nanoseconds = Math.floor((clocktime % 1) * 1e9);
    if (previousTimestamp) {
      seconds = seconds - previousTimestamp[0];
      nanoseconds = nanoseconds - previousTimestamp[1];
      if (nanoseconds < 0) {
        seconds--;
        nanoseconds += 1e9;
      }
    }
    return [seconds, nanoseconds];
  };
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// PRD-001 Phase 8 S1 (D148): the whole "router" - one pathname
// branch, no router dep, no history API. On /play the App NEVER
// mounts (no boot effects, no URL writer): the shared ?idea= link
// stays pristine and the minimal armed-state page answers the
// autoplay policy honestly.
import { isPlayRoute } from "./lib/playRoute";
import { PlaySurface } from "./components/PlaySurface";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary scope="App">
      {isPlayRoute(window.location.pathname) ? <PlaySurface /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
