import React, { useState } from 'react';
import { X, Download, Upload, FileAudio } from 'lucide-react';
import { HarmonicPath } from '../lib/paths';
import { importIReal, exportIReal } from '../lib/ireal';
import { exportToMidiFile } from '../lib/midiExport';

interface Props {
  currentPath: HarmonicPath;
  onImport: (path: HarmonicPath) => void;
  onClose: () => void;
}

export const ImportExportModal: React.FC<Props> = ({ currentPath, onImport, onClose }) => {
  const [importText, setImportText] = useState('');
  const [error, setError] = useState('');
  
  const handleImport = () => {
    const path = importIReal(importText);
    if (path) {
      onImport(path);
      onClose();
    } else {
      setError('Could not parse any chords from the input. Please check the format.');
    }
  };

  const handleExportMidi = () => {
    const uri = exportToMidiFile(currentPath);
    const link = document.createElement('a');
    link.href = uri;
    link.download = `${currentPath.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mid`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportText = exportIReal(currentPath);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-xl p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
        <h2 className="text-lg font-medium text-white mb-6">Import & Export</h2>
        
        <div className="space-y-6">
          <div className="flex gap-4">
            <button
               onClick={handleExportMidi}
               className="flex-1 flex items-center justify-center gap-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 py-3 rounded-lg transition-colors font-medium text-sm"
            >
              <FileAudio size={18} /> Download MIDI File
            </button>
          </div>

          <div className="h-px w-full bg-neutral-800"></div>

          <div>
            <h3 className="text-sm text-neutral-400 mb-2 flex items-center gap-2">
              <Download size={14} /> Export iReal Progression
            </h3>
            <textarea 
              readOnly 
              value={exportText}
              className="w-full bg-neutral-950 border border-neutral-800 rounded py-2 px-3 text-xs font-mono text-neutral-300 h-20 focus:outline-none focus:border-neutral-700 transition-colors resize-none"
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
            <p className="text-[10px] text-neutral-500 mt-1">Copy this link or text. Paste into compatible apps like iReal Pro.</p>
          </div>

          <div className="h-px w-full bg-neutral-800"></div>

          <div>
            <h3 className="text-sm text-neutral-400 mb-2 flex items-center gap-2">
              <Upload size={14} /> Import Progression
            </h3>
            <textarea 
              value={importText}
              onChange={e => {
                setImportText(e.target.value);
                setError('');
              }}
              placeholder="Paste iRealBook URL (irealpro://...) or raw chord sequence (e.g. Cmaj7 | A7 | Dm7 | G7)"
              className="w-full bg-neutral-950 border border-neutral-800 rounded py-2 px-3 text-xs font-mono text-neutral-300 h-24 focus:outline-none focus:border-purple-500 transition-colors resize-none"
            />
            {error && <div className="text-red-400 text-xs mt-2">{error}</div>}
            
            <button 
              onClick={handleImport}
              disabled={importText.trim().length === 0}
              className="mt-4 w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white px-4 py-2 rounded text-sm transition-colors font-medium flex justify-center"
            >
              Import Progression
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
