/**
 * src/components/TexturePanel.tsx — 3 track mute toggles + counter-line
 * layer toggle. Binds to useSessionStore.
 */

import React from "react";
import { Drum, Music, VolumeX } from "lucide-react";

interface TexturePanelProps {
  drumsMuted: boolean;
  bassMuted: boolean;
  pianoMuted: boolean;
  setDrumsMuted: (v: boolean) => void;
  setBassMuted: (v: boolean) => void;
  setPianoMuted: (v: boolean) => void;
  /** When true, "Layer counter-line" is shown as active. */
  counterLineActive?: boolean;
  onToggleCounterLine?: () => void;
}

const TRACKS: Array<{
  key: "drums" | "bass" | "piano";
  label: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false" }>;
  hint: string;
}> = [
  { key: "drums", label: "Drums", Icon: Drum, hint: "Drum track (bus gain)" },
  { key: "bass", label: "Bass", Icon: Music, hint: "Bass track (bus gain)" },
  { key: "piano", label: "Piano", Icon: Music, hint: "Piano track (bus gain)" },
];

export const TexturePanel: React.FC<TexturePanelProps> = ({
  drumsMuted,
  bassMuted,
  pianoMuted,
  setDrumsMuted,
  setBassMuted,
  setPianoMuted,
  counterLineActive,
  onToggleCounterLine,
}) => {
  const muted = { drums: drumsMuted, bass: bassMuted, piano: pianoMuted };
  const setters = { drums: setDrumsMuted, bass: setBassMuted, piano: setPianoMuted };

  return (
    <section
      role="region"
      aria-label="Texture"
      className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3 flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          Texture
        </span>
        {onToggleCounterLine && (
          <button
            type="button"
            onClick={onToggleCounterLine}
            aria-pressed={!!counterLineActive}
            className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${
              counterLineActive
                ? "border-amber-700/70 bg-amber-900/40 text-amber-100"
                : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {counterLineActive ? "Counter-line on" : "Layer counter-line"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TRACKS.map(({ key, label, Icon, hint }) => {
          const isMuted = muted[key];
          const setMuted = setters[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setMuted(!isMuted)}
              aria-pressed={isMuted}
              title={hint}
              className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-mono rounded border transition-colors ${
                isMuted
                  ? "border-red-800/60 bg-red-950/40 text-red-200 hover:bg-red-950/60"
                  : "border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-800"
              }`}
            >
              {isMuted ? <VolumeX size={11} aria-hidden="true" /> : <Icon size={11} aria-hidden="true" />}
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
};
