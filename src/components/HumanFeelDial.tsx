/**
 * HumanFeelDial — practice-rail control for the Magenta humanizer.
 *
 * Renders inside a ToolGroup alongside the existing Backing select
 * and Track mutes. Three controls:
 *   - amount slider (0..1, default 0 = off / grid)
 *   - persona select (Kandinsky / Coltrane / Miles / …)
 *   - live indicator chip that lights up when amount > 0
 *
 * The persona select lists every entry from PERSONAS (the source
 * of truth in `src/lib/personas.ts`) — we don't maintain a separate
 * list of humanizer-supported personas because getPersonaProfile()
 * falls back to Kandinsky for any id we haven't tuned.
 *
 * The label "Human feel" matches the language in `harmonic-magenta-plan.md`
 * §7 — "Practice tab: Human feel dial". Keeping it short so the
 * ToolGroup stays single-line on mobile.
 */
import React from "react";
import { ToolGroup, ToolChip } from "./StageFrame";
import { PERSONAS } from "../lib/personas";
import { getPersonaProfile } from "../magenta/personaProfiles";

interface HumanFeelDialProps {
  amount: number;
  setAmount: (v: number) => void;
  personaId: string;
  setPersonaId: (id: string) => void;
}

export const HumanFeelDial: React.FC<HumanFeelDialProps> = ({
  amount,
  setAmount,
  personaId,
  setPersonaId,
}) => {
  const active = amount > 0.001;
  const label = personaId
    ? (PERSONAS.find((p) => p.id === personaId)?.name ?? "Kandinsky")
    : "Kandinsky";
  const profile = getPersonaProfile(personaId);

  return (
    <ToolGroup label={`Human feel${active ? ` · ${label}` : ""}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(amount * 100)}
          onChange={(e) => setAmount(Number(e.target.value) / 100)}
          className="flex-1 min-w-0"
          aria-label="Human feel amount"
          title={`0 = grid, 100 = full persona profile. Profile: ${label} (placement ${profile.placementMs}ms, σ ${profile.timSigmaMs}ms)`}
        />
        <span className="font-mono text-xs text-[color:var(--color-text-2)] w-8 text-right tabular-nums">
          {Math.round(amount * 100)}
        </span>
      </div>
      <select
        value={personaId || "kandinsky"}
        onChange={(e) => setPersonaId(e.target.value === "kandinsky" ? "" : e.target.value)}
        className="bg-transparent text-xs text-[color:var(--color-text-1)] outline-none cursor-pointer hover:text-[color:var(--color-brand-strong)] font-medium px-1 py-1"
        aria-label="Humanizer persona"
        title="Which persona's feel to apply"
      >
        {PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ToolChip
        active={active}
        onClick={() => setAmount(active ? 0 : 0.7)}
        title={active ? "Reset to grid" : "Apply 70% persona feel"}
        aria-label={active ? "Reset human feel to grid" : "Enable human feel at 70%"}
        aria-pressed={active}
      >
        {active ? "● feel" : "○ feel"}
      </ToolChip>
    </ToolGroup>
  );
};