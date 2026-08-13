import { useState, useEffect } from "react";
import type { PracticeSet, PracticeSetItem } from "../lib/paths";
import { ALL_PATHS } from "../lib/paths";
import { FOCUS_TAGS } from "../data/practice_sets";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";

interface Props {
  /** The set to edit. Pass null to create a new set. */
  initial?: PracticeSet | null;
  onSave: (set: PracticeSet) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function SetEditor({ initial, onSave, onDelete, onClose }: Props) {
  const isNew = !initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [focusTags, setFocusTags] = useState<string[]>(initial?.focusTags ?? []);
  const [items, setItems] = useState<PracticeSetItem[]>(
    initial?.items ?? [{ pathId: "path-1" }],
  );
  const [defaultTempo, setDefaultTempo] = useState(
    initial?.defaultTempo ?? 100,
  );
  const [defaultReps, setDefaultReps] = useState(
    initial?.defaultReps ?? 1,
  );
  const [defaultTranspose, setDefaultTranspose] = useState(
    initial?.defaultTransposeSemitones ?? 0,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function toggleTag(tag: string) {
    setFocusTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function updateItem(idx: number, patch: Partial<PracticeSetItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { pathId: "path-1" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required.";
    if (items.length === 0) errs.items = "Add at least one path.";
    if (defaultTempo < 30 || defaultTempo > 300) errs.tempo = "Tempo must be 30–300 BPM.";
    if (defaultReps < 1 || defaultReps > 20) errs.reps = "Reps must be 1–20.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const set: PracticeSet = {
      id: initial?.id ?? `set-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      focusTags,
      items,
      defaultTempo,
      defaultReps,
      defaultTransposeSemitones: defaultTranspose,
      seed: false,
    };
    onSave(set);
  }

  // Path options grouped by type
  const pathGroups = {
    PATHS: ALL_PATHS.filter((p) => !p.id.startsWith("study-")),
    STUDIES: ALL_PATHS.filter((p) => p.id.startsWith("study-")),
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal */}
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 sticky top-0 bg-neutral-900 rounded-t-2xl z-10">
          <h2 className="text-base font-semibold text-purple-200">
            {isNew ? "New Practice Set" : "Edit Practice Set"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 p-5">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Autumn Leaves — Root Movement"
              className={`w-full px-3 py-2 rounded-lg bg-white/5 border text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-purple-500/50 ${
                errors.title ? "border-red-500/50" : "border-white/10"
              }`}
            />
            {errors.title && (
              <p className="text-xs text-red-400">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What skill does this set build?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-purple-500/50 resize-none"
            />
          </div>

          {/* Focus Tags */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
              Focus Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    focusTags.includes(tag)
                      ? "bg-purple-900/40 text-purple-300 border border-purple-500/40"
                      : "bg-white/5 text-neutral-400 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Paths */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Paths <span className="text-red-400">*</span>
              </label>
              <button
                onClick={addItem}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-purple-400 hover:text-purple-200 hover:bg-purple-900/20 transition-colors"
              >
                <Plus size={12} />
                Add path
              </button>
            </div>

            {errors.items && (
              <p className="text-xs text-red-400">{errors.items}</p>
            )}

            <div className="flex flex-col gap-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex-1 min-w-0">
                    {/* Path selector */}
                    <select
                      value={item.pathId}
                      onChange={(e) => updateItem(idx, { pathId: e.target.value })}
                      className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-neutral-300 focus:outline-none focus:border-purple-500/50 mb-1.5"
                    >
                      <optgroup label="PATHS">
                        {pathGroups.PATHS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Studies">
                        {pathGroups.STUDIES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    {/* Bar range */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-600 whitespace-nowrap">Bars</span>
                      <input
                        type="number"
                        min={1}
                        value={item.startBar ?? 1}
                        onChange={(e) =>
                          updateItem(idx, { startBar: Math.max(1, parseInt(e.target.value) || 1) })
                        }
                        className="w-14 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-neutral-300 focus:outline-none focus:border-purple-500/50 text-center"
                      />
                      <span className="text-neutral-600 text-xs">to</span>
                      <input
                        type="number"
                        min={1}
                        value={item.endBar ?? ""}
                        onChange={(e) =>
                          updateItem(idx, {
                            endBar: e.target.value ? Math.max(1, parseInt(e.target.value) || 1) : undefined,
                          })
                        }
                        placeholder="end"
                        className="w-14 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-neutral-300 focus:outline-none focus:border-purple-500/50 text-center"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(idx)}
                    className="flex-shrink-0 p-1.5 rounded text-neutral-600 hover:text-red-400 hover:bg-red-950/30 transition-colors mt-1"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-xs text-neutral-600 py-3 text-center">
                  No paths added. Click "Add path" above.
                </p>
              )}
            </div>
          </div>

          {/* Tempo / Reps / Transpose row */}
          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Tempo (BPM)
              </label>
              <input
                type="number"
                min={30}
                max={300}
                value={defaultTempo}
                onChange={(e) => setDefaultTempo(Math.max(30, Math.min(300, parseInt(e.target.value) || 100)))}
                className={`w-full px-3 py-2 rounded-lg bg-white/5 border text-sm text-neutral-200 focus:outline-none focus:border-purple-500/50 ${
                  errors.tempo ? "border-red-500/50" : "border-white/10"
                }`}
              />
              {errors.tempo && <p className="text-xs text-red-400">{errors.tempo}</p>}
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Default Reps
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={defaultReps}
                onChange={(e) => setDefaultReps(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className={`w-full px-3 py-2 rounded-lg bg-white/5 border text-sm text-neutral-200 focus:outline-none focus:border-purple-500/50 ${
                  errors.reps ? "border-red-500/50" : "border-white/10"
                }`}
              />
              {errors.reps && <p className="text-xs text-red-400">{errors.reps}</p>}
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Transpose (st)
              </label>
              <input
                type="number"
                min={-12}
                max={12}
                value={defaultTranspose}
                onChange={(e) =>
                  setDefaultTranspose(Math.max(-12, Math.min(12, parseInt(e.target.value) || 0)))
                }
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-200 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-white/10 sticky bottom-0 bg-neutral-900 rounded-b-2xl">
          {!isNew && onDelete ? (
            <button
              onClick={() => {
                if (confirm(`Delete "${initial.title}"? This cannot be undone.`)) {
                  onDelete(initial!.id);
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-200 hover:bg-red-950/30 transition-colors border border-red-950/50"
            >
              Delete set
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-700/80 hover:bg-purple-600/80 text-white transition-colors"
            >
              {isNew ? "Create Set" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
