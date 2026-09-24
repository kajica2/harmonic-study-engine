/**
 * src/lib/chordInput.ts - PRD-001 Phase 4 Slice 4 (D82): SHIM.
 *
 * The chord-symbol grammar MOVED to engine/compose/chordsym.ts
 * (purity-forced: the S4 chart parser in engine/ must reuse THE ONE
 * grammar; engine -> src imports are illegal). This re-export keeps
 * every existing importer (ChordCellPopover + tests) compiling
 * UNTOUCHED - zero import-churn, one grammar.
 *
 * New code should import from "../../engine/compose/chordsym"
 * directly.
 */

export {
  parseChordSymbol,
  buildCellFromSymbol,
  suggestChordSymbols,
} from "../../engine/compose/chordsym";
export type { ParsedSymbol } from "../../engine/compose/chordsym";
