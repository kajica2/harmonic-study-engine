/**
 * src/components/ComposerChartNotation.tsx — lazily-loaded abcjs
 * renderer for a ComposerChart. Imported via React.lazy() so the
 * ComposerChartViewer (already eagerly loaded in App.tsx:141) does
 * NOT pull abcjs into the first-paint bundle.
 *
 * One ref'd <div> + abcjs.renderAbc() inside try/catch — failure
 * surfaces as console.warn, mirroring EtudeStaffView's GAP-2 pattern.
 */

import React, { useEffect, useRef } from "react";
import abcjs from "abcjs";
import type { ComposerChart } from "../lib/composerCatalog";
import { buildComposerChartAbc } from "../lib/composerChartAbc";

interface Props {
  chart: ComposerChart;
}

const ComposerChartNotation: React.FC<Props> = ({ chart }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    try {
      abcjs.renderAbc(hostRef.current, buildComposerChartAbc(chart), {
        staffwidth: 560,
        add_classes: true,
      });
    } catch (err) {
      console.warn("[ComposerChartNotation] abcjs render failed:", err);
    }
  }, [chart]);

  return (
    <div
      ref={hostRef}
      data-testid={`composer-chart-notation-${chart.composerId}`}
      className="abcjs-render-target"
    />
  );
};

export default ComposerChartNotation;