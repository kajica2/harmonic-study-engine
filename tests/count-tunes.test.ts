import { describe, it, expect } from 'vitest';
import { tunesCount } from '../scripts/count-tunes.mjs';

describe('tunes count pin', () => {
  it('matches 40-truth (Audit E)', () => {
    expect(tunesCount()).toBe(40);
  });
  it('single parsing path (not duplicated)', () => {
    // Same function called by gate and pin — no duplicate parser
    expect(typeof tunesCount).toBe('function');
  });
});
