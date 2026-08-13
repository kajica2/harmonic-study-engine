import React, { useRef, useEffect, useCallback } from "react";
import { getShapeForNote, getColorForNote } from "../lib/theory";
import { VisualTheme } from "../lib/personas";

function calculateDissonance(midis: number[]): number {
  if (midis.length < 2) return 0;
  let dissonanceScore = 0;
  let pairs = 0;
  for (let i = 0; i < midis.length; i++) {
    for (let j = i + 1; j < midis.length; j++) {
      const interval = Math.abs(midis[i] - midis[j]) % 12;
      if (interval === 1 || interval === 11)
        dissonanceScore += 1.0; // m2, M7
      else if (interval === 6)
        dissonanceScore += 0.8; // tritone
      else if (interval === 2 || interval === 10)
        dissonanceScore += 0.4; // M2, m7
      else if ([3, 4, 8, 9].includes(interval)) dissonanceScore += 0.1; // 3rds, 6ths
      pairs++;
    }
  }
  return Math.min(dissonanceScore / pairs, 1);
}

function calculateNoteDissonance(midi: number, allMidis: number[]): number {
  if (allMidis.length < 2 || !allMidis.includes(midi)) return 0;
  let dissonanceScore = 0;
  let pairs = 0;
  for (const other of allMidis) {
    if (midi === other) continue;
    const interval = Math.abs(midi - other) % 12;
    if (interval === 1 || interval === 11)
      dissonanceScore += 1.0; // m2, M7
    else if (interval === 6)
      dissonanceScore += 0.8; // tritone
    else if (interval === 2 || interval === 10)
      dissonanceScore += 0.4; // M2, m7
    else if ([3, 4, 8, 9].includes(interval)) dissonanceScore += 0.1; // 3rds, 6ths
    pairs++;
  }
  return Math.min(dissonanceScore / pairs, 1);
}

function getIntervalLabel(midi: number, rootMidi: number): string {
  const interval = (((midi - rootMidi) % 12) + 12) % 12;
  const isOctave = midi >= rootMidi + 12;

  switch (interval) {
    case 0:
      return "Root";
    case 1:
      return "b9";
    case 2:
      return isOctave ? "9th" : "M2";
    case 3:
      return "m3";
    case 4:
      return "3rd";
    case 5:
      return isOctave ? "11th" : "4th";
    case 6:
      return "#11/b5";
    case 7:
      return "5th";
    case 8:
      return isOctave ? "b13" : "#5";
    case 9:
      return isOctave ? "13th" : "6th";
    case 10:
      return "b7";
    case 11:
      return "M7";
    default:
      return "";
  }
}

interface CanvasProps {
  activeMidis: number[];
  width: number;
  height: number;
  showLabels?: boolean;
  rootMidi?: number;
  visualTheme?: VisualTheme;
  /** Optional click handler — fired with the MIDI number of the
   *  closest artifact to the click point. Used for click-to-play. */
  onNoteClick?: (midi: number) => void;
  /** Optional hover handler — receives the hovered MIDI or null when
   *  the cursor leaves. Used to surface a tooltip. */
  onNoteHover?: (midi: number | null) => void;
  /** Called once the canvas DOM node is mounted, so the parent can
   *  hold a ref to it (used by the audio recorder to capture the
   *  canvas video stream via `canvas.captureStream()`). */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

// Kandinsky inspired visualization
export const SynesthesiaCanvas: React.FC<CanvasProps> = ({
  activeMidis,
  width,
  height,
  showLabels,
  rootMidi,
  visualTheme = "default",
  onNoteClick,
  onNoteHover,
  onCanvasReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store persistent fading shapes
  const artifactsRef = useRef<
    { midi: number; x: number; y: number; alpha: number; scale: number }[]
  >([]);
  const currentDissonanceRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // Calculate target dissonance and smooth the value
      const targetDissonance = calculateDissonance(activeMidis);
      currentDissonanceRef.current +=
        (targetDissonance - currentDissonanceRef.current) * 0.05;
      const d = currentDissonanceRef.current;

      // Interpolate colors based on dissonance
      // Consonant base: deep charcoal-slate
      const baseR = 15,
        baseG = 17,
        baseB = 24;
      const dissR = 45,
        dissG = 10,
        dissB = 15;

      const r = baseR + (dissR - baseR) * d;
      const g = baseG + (dissG - baseG) * d;
      const b = baseB + (dissB - baseB) * d;

      // Clear with slight fade for motion blur effect (Eno gets slower fade, 0.04 alpha)
      const fadeAlpha = visualTheme === "eno" ? 0.04 : 0.22;
      const cx = width / 2;
      const cy = height / 2;
      const maxDist = Math.max(width, height) / 1.5;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDist);

      // The center becomes more intensely red/orange as global dissonance increases
      const centerR = baseR + (220 - baseR) * d;
      const centerG = baseG + (60 - baseG) * d;
      const centerB = baseB + (20 - baseB) * d;

      gradient.addColorStop(
        0,
        `rgba(${Math.round(centerR)}, ${Math.round(centerG)}, ${Math.round(centerB)}, ${fadeAlpha})`,
      );
      gradient.addColorStop(
        1,
        `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${fadeAlpha})`,
      );

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // --- Custom Background Geometric / Visual Overlay Themes ---
      if (visualTheme === "bach") {
        ctx.strokeStyle = "rgba(212, 175, 55, 0.05)";
        ctx.lineWidth = 1;
        for (let yOffset = 40; yOffset < height; yOffset += 45) {
          ctx.beginPath();
          ctx.moveTo(0, yOffset);
          ctx.lineTo(width, yOffset);
          ctx.stroke();
        }
      } else if (visualTheme === "coltrane") {
        ctx.strokeStyle = "rgba(32, 178, 170, 0.03)";
        ctx.lineWidth = 1.5;
        for (let radius = 60; radius < maxDist; radius += 70) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (visualTheme === "debussy") {
        ctx.strokeStyle = "rgba(52, 152, 219, 0.04)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height - 70);
        for (let xOffset = 0; xOffset < width; xOffset += 15) {
          const yOffset =
            height -
            70 +
            Math.sin(xOffset * 0.015 + performance.now() / 1500) * 20;
          ctx.lineTo(xOffset, yOffset);
        }
        ctx.stroke();
      } else if (visualTheme === "glass") {
        ctx.strokeStyle = "rgba(231, 76, 60, 0.03)";
        ctx.lineWidth = 1;
        const numRays = 12;
        const timeVal = performance.now() / 1500;
        for (let rayIdx = 0; rayIdx < numRays; rayIdx++) {
          const angle = rayIdx * ((Math.PI * 2) / numRays) + timeVal * 0.15;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(
            cx + Math.cos(angle) * maxDist,
            cy + Math.sin(angle) * maxDist,
          );
          ctx.stroke();
        }
      } else if (visualTheme === "monk") {
        ctx.strokeStyle = "rgba(230, 126, 34, 0.03)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(width * 0.15, height * 0.2);
        ctx.lineTo(width * 0.85, height * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(width * 0.8, height * 0.15);
        ctx.lineTo(width * 0.2, height * 0.85);
        ctx.stroke();
      } else if (visualTheme === "miles") {
        // Cool restraint — soft, slow, very low contrast
        ctx.strokeStyle = "rgba(91, 124, 153, 0.025)";
        ctx.lineWidth = 0.5;
        for (let yOff = 60; yOff < height; yOff += 80) {
          ctx.beginPath();
          ctx.moveTo(0, yOff);
          ctx.bezierCurveTo(
            width * 0.3,
            yOff + 8,
            width * 0.7,
            yOff - 8,
            width,
            yOff,
          );
          ctx.stroke();
        }
      } else if (visualTheme === "chet") {
        // Lyrical ballad — gentle verticals like breath marks
        ctx.strokeStyle = "rgba(232, 200, 160, 0.04)";
        ctx.lineWidth = 1;
        const cx2 = width / 2;
        for (let i = 0; i < 5; i++) {
          const x = cx2 - 80 + i * 40;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      } else if (visualTheme === "dizzy") {
        // Bebop — tight, fast diagonals (rotated each frame)
        ctx.strokeStyle = "rgba(255, 51, 102, 0.05)";
        ctx.lineWidth = 1.5;
        const angle = performance.now() / 800;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        for (let off = -maxDist; off < maxDist; off += 22) {
          ctx.beginPath();
          ctx.moveTo(off, -maxDist);
          ctx.lineTo(off + maxDist, maxDist);
          ctx.stroke();
        }
        ctx.restore();
      } else if (visualTheme === "hubbard") {
        // Quartal — concentric squares (4-sided polyrhythm feel)
        ctx.strokeStyle = "rgba(46, 134, 171, 0.04)";
        ctx.lineWidth = 1.2;
        const sideMax = Math.max(width, height);
        for (let s = 50; s < sideMax; s += 60) {
          ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
        }
      } else if (visualTheme === "shorter") {
        // Modal cartographer — topographical contour lines
        ctx.strokeStyle = "rgba(155, 93, 229, 0.04)";
        ctx.lineWidth = 1;
        for (let r = 30; r < maxDist; r += 28) {
          ctx.beginPath();
          for (let t = 0; t < Math.PI * 2; t += 0.05) {
            const wobble = Math.sin(t * 5 + performance.now() / 3000) * 12;
            const x = cx + (r + wobble) * Math.cos(t);
            const y = cy + (r + wobble) * Math.sin(t);
            if (t === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Add new active notes to artifacts if not present or boost their alpha
      activeMidis.forEach((midi) => {
        let artifact = artifactsRef.current.find((a) => a.midi === midi);
        if (!artifact) {
          // Map position deterministically but scattered
          // Midi range approx 48 to 72
          const normPitch = (midi - 48) / 24; // 0 to 1

          // Use golden ratio to scatter
          const x = (normPitch * width * 1.618) % width;
          const y = height - normPitch * height * 0.8 - 40; // Higher pitch = higher visually

          artifact = { midi, x, y, alpha: 1.5, scale: 0.1 };
          artifactsRef.current.push(artifact);
        } else {
          artifact.alpha = Math.min(artifact.alpha + 0.1, 1.2);
          artifact.scale = Math.min(artifact.scale + 0.05, 1);
        }
      });

      // Render and degrade artifacts
      for (let i = artifactsRef.current.length - 1; i >= 0; i--) {
        const artifact = artifactsRef.current[i];

        // Decay
        if (!activeMidis.includes(artifact.midi)) {
          const decayRate = visualTheme === "eno" ? 0.005 : 0.02;
          artifact.alpha -= decayRate;
          artifact.scale += 0.005; // Expand slightly as it fades
        }

        if (artifact.alpha <= 0) {
          artifactsRef.current.splice(i, 1);
          continue;
        }

        const shape = getShapeForNote(artifact.midi);
        const color = getColorForNote(artifact.midi);
        const noteDissonance = calculateNoteDissonance(
          artifact.midi,
          activeMidis,
        );

        ctx.save();
        ctx.translate(artifact.x, artifact.y);

        // Draw radial gradient heatmap behind the shape if it's contributing to tension
        if (artifact.alpha > 0 && noteDissonance > 0) {
          const glowRadius = 80 * artifact.scale * (1 + noteDissonance);
          const radGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
          // Warmer/redder glow for higher dissonance contribution
          const glowAlpha = Math.min(
            artifact.alpha * (0.1 + noteDissonance * 0.4),
            0.6,
          );
          radGrad.addColorStop(0, `rgba(255, 60, 20, ${glowAlpha})`);
          radGrad.addColorStop(1, `rgba(255, 60, 20, 0)`);
          ctx.fillStyle = radGrad;
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = Math.min(artifact.alpha, 1);

        // Rotate base on time and pitch
        const rot =
          (performance.now() / 1000) * (artifact.midi % 12 === 0 ? 0.5 : 1);
        ctx.rotate(rot);
        ctx.scale(artifact.scale, artifact.scale);

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;

        const size = 30 + (artifact.midi % 12) * 2;

        ctx.beginPath();
        if (shape === "circle") {
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (shape === "triangle") {
          ctx.moveTo(0, -size);
          ctx.lineTo(size, size);
          ctx.lineTo(-size, size);
          ctx.closePath();
          ctx.stroke();
          // Add a discordant inner element
          ctx.beginPath();
          ctx.moveTo(0, -size / 2);
          ctx.lineTo(size / 2, size / 2);
          ctx.lineTo(-size / 2, size / 2);
          ctx.closePath();
          ctx.stroke();
        } else if (shape === "square") {
          ctx.rect(-size / 2, -size / 2, size, size);
          ctx.fill();
          ctx.fillStyle = "#000";
          ctx.fillRect(-size / 4, -size / 4, size / 2, size / 2); // Hollow center
        } else {
          // Line / Abstract slash
          ctx.moveTo(-size * 2, -size * 2);
          ctx.lineTo(size * 2, size * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(size * 2, -size);
          ctx.lineTo(-size * 2, size);
          ctx.stroke();
        }

        ctx.restore();

        if (showLabels && rootMidi !== undefined && artifact.alpha > 0.1) {
          ctx.save();
          ctx.translate(artifact.x, artifact.y);
          ctx.globalAlpha = Math.min(artifact.alpha, 1);
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.font =
            'bold 12px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 4;
          const label = getIntervalLabel(artifact.midi, rootMidi);
          const offsetSize = 30 + (artifact.midi % 12) * 2;
          ctx.fillText(label, offsetSize + 10, -offsetSize - 10);
          ctx.restore();
        }
      }

      // Draw connecting lines between currently active notes to show the "harmonic web"
      if (activeMidis.length > 1) {
        ctx.beginPath();
        const activeArtifacts = artifactsRef.current.filter((a) =>
          activeMidis.includes(a.midi),
        );

        for (let i = 0; i < activeArtifacts.length; i++) {
          const a1 = activeArtifacts[i];
          for (let j = i + 1; j < activeArtifacts.length; j++) {
            const a2 = activeArtifacts[j];
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
          }
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeMidis, width, height, visualTheme]);

  // Find the artifact whose center is within HIT_RADIUS px of the
  // given canvas-relative point. Returns the closest one or null.
  const hitTest = useCallback(
    (px: number, py: number): number | null => {
      const HIT_RADIUS = 36;
      let bestMidi: number | null = null;
      let bestDist = HIT_RADIUS;
      for (const a of artifactsRef.current) {
        if (a.alpha <= 0) continue;
        const dx = a.x - px;
        const dy = a.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestMidi = a.midi;
        }
      }
      return bestMidi;
    },
    [],
  );

  // Surface the canvas DOM node to the parent so the audio
  // recorder can capture it via canvas.captureStream(). We do
  // this in a useEffect (not a callback ref) so the contract is
  // a single source of truth.
  useEffect(() => {
    onCanvasReady?.(canvasRef.current);
    return () => onCanvasReady?.(null);
  }, [onCanvasReady]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={(e) => {
        if (!onNoteClick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const hit = hitTest(px, py);
        if (hit !== null) onNoteClick(hit);
      }}
      onMouseMove={(e) => {
        if (!onNoteHover) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const hit = hitTest(px, py);
        onNoteHover(hit);
        e.currentTarget.style.cursor = hit !== null ? "pointer" : "default";
      }}
      onMouseLeave={() => {
        if (!onNoteHover) return;
        onNoteHover(null);
        if (canvasRef.current) canvasRef.current.style.cursor = "default";
      }}
      className="bg-gray-950 rounded-xl shadow-inner outline outline-1 outline-gray-800"
    />
  );
};
