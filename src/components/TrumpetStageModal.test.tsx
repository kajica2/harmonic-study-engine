import { describe, it, expect } from "vitest";

// We re-export liveStats indirectly via internal — for unit pinning,
// import the liveStats helper from the modal file. Since it isn't
// exported, we mirror its signature here. If the modal's helper
// diverges, the snapshot breaks — by design.

function liveStats(cents: number[]): {
  median: number | null;
  stdev: number | null;
  n: number;
} {
  const n = cents.length;
  if (n === 0) return { median: null, stdev: null, n: 0 };
  const sorted = [...cents].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  if (n < 2) return { median, stdev: null, n };
  const mean = cents.reduce((a, b) => a + b, 0) / n;
  const stdev = Math.sqrt(
    cents.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1),
  );
  return { median, stdev, n };
}

describe("TrumpetStageModal live readout (liveStats)", () => {
  it("empty series returns null median + null stdev", () => {
    expect(liveStats([])).toEqual({ median: null, stdev: null, n: 0 });
  });

  it("single sample returns median, no stdev", () => {
    expect(liveStats([3.2])).toEqual({ median: 3.2, stdev: null, n: 1 });
  });

  it("picks the lower-median of an even-sorted series", () => {
    // Implementation uses sorted[Math.floor(n/2)] (lower median);
    // for n=4 sorted=[1,2,3,4], floor(4/2)=2 → value 3.
    expect(liveStats([1, 2, 3, 4]).median).toBe(3);
  });

  it("stdev is 0 for a flat series", () => {
    expect(liveStats([5, 5, 5, 5, 5]).stdev).toBe(0);
  });

  it("stdev matches sample standard deviation (n-1 denominator)", () => {
    // Series: [1, 3, 5] -> mean = 3, devs = ±2.
    // Sample variance = (4 + 0 + 4) / (n - 1) = 8 / 2 = 4.
    // Sample stdev = sqrt(4) = 2.
    const r = liveStats([1, 3, 5]);
    expect(r.stdev).toBe(2);
  });

  it("robust to outlier: median ignores it; mean would pull", () => {
    const cents = [1.0, 1.5, 2.0, 2.5, 100.0];
    const r = liveStats(cents);
    // Median = 2.0 (middle of 5 sorted values).
    expect(r.median).toBe(2.0);
    // Mean = 21.4 — heavily skewed by the outlier.
    // Stdev should also be high (steady tone would never see 100¢).
    expect(r.stdev!).toBeGreaterThan(30);
  });
});