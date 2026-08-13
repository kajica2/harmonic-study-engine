import React, { useState } from "react";
import type { PracticeSet, PracticeSession } from "../lib/paths";
import { FOCUS_TAGS } from "../data/practice_sets";
import { Lock, ChevronDown, ChevronRight, Play, Pencil, Trash2, Plus } from "lucide-react";

interface Props {
  sets: PracticeSet[];
  recentSessions: PracticeSession[];
  onStart: (set: PracticeSet) => void;
  onMutate: (sets: PracticeSet[]) => void;
}

function estimateDuration(set: PracticeSet): string {
  const barsPerItem = set.items.map((item) => {
    if (item.startBar != null && item.endBar != null) {
      return item.endBar - item.startBar + 1;
    }
    return 8;
  });
  const totalBars = barsPerItem.reduce((a, b) => a + b, 0);
  const secondsPerBar = (60 / set.defaultTempo) * 4;
  const totalSeconds = totalBars * secondsPerBar * set.defaultReps;
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PracticeSetBrowser({ sets, recentSessions, onStart, onMutate }: Props) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<PracticeSet | null>(undefined);
  // undefined = no modal; null = new set; PracticeSet = edit existing

  const filtered = selectedTag
    ? sets.filter((s) => s.focusTags.includes(selectedTag))
    : sets;

  const userSets = filtered.filter((s) => !s.seed);
  const seedSets = filtered.filter((s) => s.seed);

  function handleDelete(set: PracticeSet) {
    const updated = sets.filter((s) => s.id !== set.id || s.seed);
    // Re-add seed sets so they're not dropped
    const withSeeds = [...updated, ...sets.filter((s) => s.seed)];
    onMutate(withSeeds.filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i));
  }

  function handleSave(updated: PracticeSet) {
    const idx = sets.findIndex((s) => s.id === updated.id);
    let next: PracticeSet[];
    if (idx >= 0) {
      next = sets.map((s) => (s.id === updated.id ? updated : s));
    } else {
      next = [...sets, updated];
    }
    onMutate(next);
    setEditingSet(undefined);
  }

  function handleDeleteFromEditor(id: string) {
    const withSeeds = sets.filter((s) => s.seed);
    const others = sets.filter((s) => !s.seed && s.id !== id);
    onMutate([...withSeeds, ...others]);
    setEditingSet(undefined);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Editor modal ── */}
      {editingSet !== undefined && (
        <SetEditorModal
          initial={editingSet}
          onSave={handleSave}
          onDelete={editingSet ? handleDeleteFromEditor : undefined}
          onClose={() => setEditingSet(undefined)}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">Practice Sets</h3>
        <button
          onClick={() => setEditingSet(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-900/30 hover:bg-purple-800/40 text-purple-300 border border-purple-500/30 transition-colors"
        >
          <Plus size={12} />
          New Set
        </button>
      </div>

      {/* Tag filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        <button
          onClick={() => setSelectedTag(null)}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            selectedTag === null
              ? "bg-purple-900/30 text-purple-300 border border-purple-500/30"
              : "bg-white/5 text-neutral-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          All
        </button>
        {FOCUS_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedTag === tag
                ? "bg-purple-900/30 text-purple-300 border border-purple-500/30"
                : "bg-white/5 text-neutral-400 border border-white/10 hover:bg-white/10"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* User sets */}
      {userSets.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-semibold">
            My Sets
          </p>
          {userSets.map((s) =>
            renderSetCard(s, {
              onStart,
              onEdit: () => setEditingSet(s),
              onDelete: handleDelete,
            }),
          )}
        </div>
      )}

      {/* Seed sets */}
      {seedSets.length > 0 && (
        <div className="flex flex-col gap-2">
          {userSets.length > 0 && (
            <p className="text-[10px] text-neutral-600 uppercase tracking-widest font-semibold mt-2">
              Built-in Sets
            </p>
          )}
          {seedSets.map((s) =>
            renderSetCard(s, { onStart }),
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-xs text-neutral-500 py-4 text-center">
          No sets match this filter.
        </p>
      )}

      {/* Recent Sessions accordion */}
      {recentSessions.length > 0 && (
        <div className="border-t border-neutral-800 pt-3">
          <button
            onClick={() => setSessionsOpen(!sessionsOpen)}
            className="flex items-center gap-2 w-full text-left text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-2"
          >
            {sessionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Recent Sessions
          </button>

          {sessionsOpen && (
            <div className="flex flex-col gap-1.5">
              {recentSessions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/5"
                >
                  <div>
                    <div className="text-xs text-neutral-300 font-medium">{s.setTitle}</div>
                    <div className="text-[10px] text-neutral-600 mt-0.5">
                      {s.stepsCompleted} steps · {formatDate(s.completedAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-neutral-400 font-mono">{s.tempo} BPM</div>
                    <div className="text-[10px] text-neutral-600 font-mono">
                      {s.reps} rep{s.reps !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SetCard (plain render function — avoids JSX key prop typing issues) ───────

function renderSetCard(
  set: PracticeSet,
  opts: {
    onStart: (set: PracticeSet) => void;
    onEdit?: () => void;
    onDelete?: (set: PracticeSet) => void;
  },
): React.ReactElement {
  const { onStart, onEdit, onDelete } = opts;

  return (
    <div className="group relative p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all">
      {/* Seed lock */}
      {set.seed && (
        <Lock
          size={10}
          className="absolute top-2 right-2 text-neutral-600"
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-neutral-200 leading-tight">
            {set.title}
          </div>
          <div className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
            {set.description}
          </div>

          {/* Focus tags */}
          <div className="flex flex-wrap gap-1 mt-2">
            {set.focusTags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-neutral-500 border border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <button
            onClick={() => onStart(set)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 text-purple-300 text-xs font-medium transition-colors border border-purple-500/30"
          >
            <Play size={10} className="fill-current" />
            Start
          </button>

          {!set.seed && (onEdit || onDelete) && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-200 hover:bg-white/10 transition-colors"
                  title="Edit"
                >
                  <Pencil size={11} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(set); }}
                  className="p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral-600 font-mono">
        <span>{estimateDuration(set)}</span>
        <span>{set.items.length} path{set.items.length !== 1 ? "s" : ""}</span>
        <span>{set.defaultReps} rep{set.defaultReps !== 1 ? "s" : ""}</span>
        <span>{set.defaultTempo} BPM</span>
      </div>
    </div>
  );
}


// ── SetEditorModal ───────────────────────────────────────────────────────────
// Lazy-import to keep the bundle split
function SetEditorModal({ initial, onSave, onDelete, onClose }: {
  initial: PracticeSet | null;
  onSave: (set: PracticeSet) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  // Dynamic import so SetEditor doesn't load until the modal opens
  const [Editor, setEditor] = useState<React.ComponentType<{
    initial?: PracticeSet | null;
    onSave: (set: PracticeSet) => void;
    onDelete?: (id: string) => void;
    onClose: () => void;
  }> | null>(null);

  import("./SetEditor").then((mod) => {
    setEditor(() => mod.SetEditor);
  });

  if (!Editor) return null;
  return <Editor initial={initial} onSave={onSave} onDelete={onDelete} onClose={onClose} />;
}
