/**
 * src/components/ConceptSearch.tsx - PRD-001 Phase 6 (REQ-PED-12, D111).
 *
 * Global concept search for the App header: input + datalist of the
 * 10 titles; filters on title/definition substring (case-insensitive);
 * Enter opens the first match; datalist selection opens exact.
 * No store, no URL (transient).
 */

import React, { useId, useMemo } from "react";
import { allConcepts } from "../../engine/pedagogy/concepts";

export interface ConceptSearchProps {
  value: string;
  onChange: (text: string) => void;
  onOpen: (conceptId: string) => void;
}

export function ConceptSearch(props: ConceptSearchProps): React.ReactElement {
  const { value, onChange, onOpen } = props;
  const listId = useId();
  const concepts = useMemo(() => allConcepts(), []);
  const query = value.trim().toLowerCase();

  const matches = useMemo(() => {
    if (query === "") return concepts;
    return concepts.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.definition.toLowerCase().includes(query),
    );
  }, [concepts, query]);

  const openByText = (text: string): void => {
    const t = text.trim().toLowerCase();
    const exact = concepts.find((c) => c.title.toLowerCase() === t || c.id === t);
    if (exact) {
      onOpen(exact.id);
      return;
    }
    if (matches.length > 0) onOpen(matches[0].id);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="search"
        role="searchbox"
        aria-label="Search concepts"
        placeholder="Search concepts"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            openByText((e.target as HTMLInputElement).value);
          }
        }}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          const exact = concepts.find((c) => c.title === v || c.id === v);
          if (exact) onOpen(exact.id);
        }}
        className="rounded border border-[color:var(--color-border)] bg-black/20 px-2 py-1 text-sm text-[color:var(--color-text-1)]"
        data-testid="concept-search"
      />
      <datalist id={listId}>
        {concepts.map((c) => (
          <option key={c.id} value={c.title} data-testid={`concept-search-option-${c.id}`}>
            {c.title}
          </option>
        ))}
      </datalist>
    </div>
  );
}
