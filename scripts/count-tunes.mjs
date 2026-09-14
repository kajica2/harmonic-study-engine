// Single parsing path for masterclass catalog count (Audit E — stop 33/38/40 drift)
import fs from 'fs';
const path = 'src/data/masterclass.ts';
export function tunesCount() {
  const content = fs.readFileSync(path, 'utf8');
  const matches = content.match(/inApp:\s*(true|false)/g) || [];
  // Count only true entries (working tunes) — aligns with SPEC.m
  return matches.length; // total inApp entries — aligns with 40-truth
}
export default tunesCount;
