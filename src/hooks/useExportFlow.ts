/**
 * useExportFlow — everything around "get this take/generation out of the
 * app": modal visibility, sheet-music PDF export, WAV render, media/rec
 * recording lifecycle. Extracted from App (rerender-split-combined-hooks)
 * so one recording change doesn't live next to unrelated UI states.
 */

import { useState } from "react";

export function useExportFlow() {
  const [isRenderingWav, setIsRenderingWav] = useState(false);
  const [wavExportError, setWavExportError] = useState<string | null>(null);
  const [wavExportStatus, setWavExportStatus] = useState<string | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  // Sheet-music PDF export — busy state while jsPDF/svg2pdf run
  // (typically <1s but can spike on long paths).
  const [isExportingSheetMusic, setIsExportingSheetMusic] = useState(false);
  const [lastExportFilename, setLastExportFilename] = useState<string | null>(
    null,
  );
  const [showLeadSheet, setShowLeadSheet] = useState(false);
  const [showChordInspector, setShowChordInspector] = useState(false);
  const [showLiveScore, setShowLiveScore] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [isMediaRecording, setIsMediaRecording] = useState(false);
  const [mediaRecordingStatus, setMediaRecordingStatus] = useState<string | null>(
    null,
  );
  const [mediaRecordingError, setMediaRecordingError] = useState<string | null>(
    null,
  );
  const [mediaRecordingElapsed, setMediaRecordingElapsed] = useState(0);
  const [mp4BlobUrl, setMp4BlobUrl] = useState<string | null>(null);
  const [, setHDSoundsTick] = useState(0);

  return {
    isRenderingWav,
    setIsRenderingWav,
    wavExportError,
    setWavExportError,
    wavExportStatus,
    setWavExportStatus,
    showImportExport,
    setShowImportExport,
    showCheatsheet,
    setShowCheatsheet,
    isExportingSheetMusic,
    setIsExportingSheetMusic,
    lastExportFilename,
    setLastExportFilename,
    showLeadSheet,
    setShowLeadSheet,
    showChordInspector,
    setShowChordInspector,
    showLiveScore,
    setShowLiveScore,
    isRecording,
    setIsRecording,
    showRecordingModal,
    setShowRecordingModal,
    isMediaRecording,
    setIsMediaRecording,
    mediaRecordingStatus,
    setMediaRecordingStatus,
    mediaRecordingError,
    setMediaRecordingError,
    mediaRecordingElapsed,
    setMediaRecordingElapsed,
    mp4BlobUrl,
    setMp4BlobUrl,
    setHDSoundsTick,
  };
}