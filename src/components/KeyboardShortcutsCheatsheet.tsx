/**
 * KeyboardShortcutsCheatsheet — modal listing every keyboard
 * shortcut in the app. Opened via the `?` key.
 *
 * Uses ModalShell (already in the codebase) for backdrop / Esc /
 * focus trap; this file just provides the body content.
 */

import React from "react";
import { Keyboard, X } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
  group: "Navigation" | "Playback" | "Modals" | "Mixer";
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  {
    keys: ["←", "→"],
    description: "Step through chord",
    group: "Navigation",
  },
  {
    keys: ["↑", "↓"],
    description: "Switch path (resets to step 1)",
    group: "Navigation",
  },
  {
    keys: ["[", "]"],
    description: "Tempo down / up by 5 BPM",
    group: "Navigation",
  },

  // Playback
  {
    keys: ["Space"],
    description: "Toggle Auto-playback",
    group: "Playback",
  },
  {
    keys: ["M"],
    description: "Toggle Play Along (mute synth melody)",
    group: "Playback",
  },

  // Modals
  {
    keys: ["?"],
    description: "Show / hide this cheatsheet",
    group: "Modals",
  },
  {
    keys: ["Esc"],
    description: "Close top modal / stop playback",
    group: "Modals",
  },

  // Mixer
  // (transposed shortcuts etc. could live here — kept empty for now)
];

const GROUP_ORDER: Shortcut["group"][] = [
  "Navigation",
  "Playback",
  "Modals",
  "Mixer",
];

export const KeyboardShortcutsCheatsheet: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cheatsheet-title"
      className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
    >
      <div className="flex justify-between items-center px-5 py-3 border-b border-white/10">
        <h2
          id="cheatsheet-title"
          className="text-base font-bold flex items-center gap-2 text-[color:var(--color-text-1)]"
        >
          <Keyboard
            size={16}
            className="text-[color:var(--color-brand-strong)]"
            aria-hidden="true"
          />
          Keyboard Shortcuts
        </h2>
        <button
          onClick={onClose}
          className="px-2 py-1 rounded text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] hover:bg-white/5 transition-colors"
          aria-label="Close cheatsheet"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
        {GROUP_ORDER.map((group) => {
          const items = SHORTCUTS.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} className="mb-4 last:mb-0">
              <h3 className="text-[10px] uppercase tracking-widest text-[color:var(--color-text-3)] font-mono mb-2">
                {group}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {items.map((s, i) => (
                  <li
                    key={`${s.group}-${i}`}
                    className="flex items-center justify-between gap-3 text-sm py-1"
                  >
                    <span className="text-[color:var(--color-text-2)] flex-1">
                      {s.description}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, j) => (
                        <React.Fragment key={`${k}-${j}`}>
                          <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 surface-1 border border-[color:var(--color-border)] rounded text-[11px] t-mono font-bold text-[color:var(--color-text-1)]">
                            {k}
                          </kbd>
                          {j < s.keys.length - 1 && (
                            <span
                              aria-hidden="true"
                              className="text-[color:var(--color-text-3)] text-xs"
                            >
                              +
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-white/10 text-[10px] t-mono text-[color:var(--color-text-3)]">
        Shortcuts are inactive when a text field is focused.
      </div>
    </div>
  );
};