/**
 * DailyStudyMode - wrapper for DailyStudy in the mode system
 */

import React from "react";
import { DailyStudy } from "./DailyStudy";
import { useSessionStore } from "../state/sessionStore";

type VoicingStyle = "block" | "arp" | "block_then_arp" | "mono";

export const DailyStudyMode: React.FC = () => {
  const setMode = useSessionStore((s) => s.setMode);
  
  const handleSelectTune = (pathId: string, voicingStyle: VoicingStyle) => {
    // Navigate to the selected path with the voicing style
    // First switch to etude mode
    setMode("etude");
    // Then the URL can carry the path and voicing params
    window.history.pushState({}, "", `?mode=etude&path=${pathId}&wavMode=${voicingStyle}`);
    // Reload to pick up the params
    window.location.reload();
  };
  
  const handleStartDrill = (pattern: string) => {
    // Switch to etude mode with drill parameter
    setMode("etude");
    window.history.pushState({}, "", `?mode=etude&drill=${pattern}`);
    window.location.reload();
  };
  
  return (
    <DailyStudy
      onSelectTune={handleSelectTune}
      onStartDrill={handleStartDrill}
    />
  );
};
