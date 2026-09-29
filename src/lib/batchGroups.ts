/**
 * src/lib/batchGroups.ts — bucket every path in ALL_PATHS into a small
 * fixed set of export groups for the MIDI batch export UI.
 *
 * Bucket order, first-match-wins (a path appears in exactly one group):
 *   1. "Masterclass (in-app)"  — paths whose id is in
 *      `masterclassInAppIds`. Order preserved as ALL_PATHS reports them.
 *   2. "Curated & concept"     — anything in PATHS not already claimed.
 *   3. "Standards (studies)"   — anything in STUDIES_PATHS not claimed.
 *   4. "Composer demos"        — anything in COMPOSER_PATHS or
 *      SECTION_PATHS not claimed. Includes 17 hand-curated demos and
 *      10 section composers.
 *
 * `ALL_PATHS === PATHS ∪ STUDIES_PATHS ∪ COMPOSER_PATHS ∪ SECTION_PATHS`
 * (paths.ts:1432-1436), so the union of all groups' paths ≡ ALL_PATHS,
 * each id appearing exactly once. Empty groups are dropped.
 *
 * Pure: callers (ImportExportModal) pass the in-app id set once at
 * memoization time; the result is a stable ordered list of
 * { label, paths } buckets.
 */

import {
  ALL_PATHS,
  PATHS,
  STUDIES_PATHS,
  COMPOSER_PATHS,
  SECTION_PATHS,
  type HarmonicPath,
} from "./paths";

export interface BatchGroup {
  label: string;
  paths: HarmonicPath[];
}

const MASTERCLASS_IN_APP_LABEL = "Masterclass (in-app)";
const CURATED_LABEL = "Curated & concept";
const STANDARDS_LABEL = "Standards (studies)";
const COMPOSER_DEMOS_LABEL = "Composer demos";

/**
 * Build the export groups for the batch MIDI picker.
 *
 * @param masterclassInAppIds  set of path ids that have
 *   `inApp: true` in the masterclass catalog. These land in group 0
 *   in ALL_PATHS order.
 * @returns ordered list of {label, paths}. Empty buckets are dropped.
 */
export function buildBatchGroups(
  masterclassInAppIds: ReadonlySet<string>,
): BatchGroup[] {
  const used = new Set<string>();
  const masterclass: HarmonicPath[] = [];
  for (const p of ALL_PATHS) {
    if (masterclassInAppIds.has(p.id)) {
      masterclass.push(p);
      used.add(p.id);
    }
  }

  const curated: HarmonicPath[] = [];
  for (const p of PATHS) {
    if (!used.has(p.id)) {
      curated.push(p);
      used.add(p.id);
    }
  }

  const standards: HarmonicPath[] = [];
  for (const p of STUDIES_PATHS) {
    if (!used.has(p.id)) {
      standards.push(p);
      used.add(p.id);
    }
  }

  const composerDemos: HarmonicPath[] = [];
  for (const p of [...COMPOSER_PATHS, ...SECTION_PATHS]) {
    if (!used.has(p.id)) {
      composerDemos.push(p);
      used.add(p.id);
    }
  }

  const groups: BatchGroup[] = [];
  if (masterclass.length > 0) {
    groups.push({ label: MASTERCLASS_IN_APP_LABEL, paths: masterclass });
  }
  if (curated.length > 0) {
    groups.push({ label: CURATED_LABEL, paths: curated });
  }
  if (standards.length > 0) {
    groups.push({ label: STANDARDS_LABEL, paths: standards });
  }
  if (composerDemos.length > 0) {
    groups.push({ label: COMPOSER_DEMOS_LABEL, paths: composerDemos });
  }
  return groups;
}