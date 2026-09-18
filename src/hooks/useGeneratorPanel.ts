/**
 * useGeneratorPanel — generative/ML panel ephemeral state: DDSP backend
 * status, path generator knobs, etude + HD (harmonic distillation)
 * lifecycle. Extracted from App (rerender-split-combined-hooks).
 */

import { useState } from "react";
import { EtudeAlgorithm } from "../lib/etude";

export function useGeneratorPanel() {
  const [isDDSPLoading, setIsDDSPLoading] = useState(false);
  const [ddspServerOnline, setDDSPServerOnline] = useState(false);
  // Generator knobs
  const [genLength, setGenLength] = useState(1);
  const [genComplexity, setGenComplexity] = useState(1);
  // Etude state
  const [etudeAlgorithm, setEtudeAlgorithm] =
    useState<EtudeAlgorithm>("magenta_rnn");
  const [isGeneratingML, setIsGeneratingML] = useState(false);
  const [etudeStatus, setEtudeStatus] = useState<string | null>(null);
  const [hdStatus, setHdStatus] = useState<string | null>(null);

  return {
    isDDSPLoading,
    setIsDDSPLoading,
    ddspServerOnline,
    setDDSPServerOnline,
    genLength,
    setGenLength,
    genComplexity,
    setGenComplexity,
    etudeAlgorithm,
    setEtudeAlgorithm,
    isGeneratingML,
    setIsGeneratingML,
    etudeStatus,
    setEtudeStatus,
    hdStatus,
    setHdStatus,
  };
}