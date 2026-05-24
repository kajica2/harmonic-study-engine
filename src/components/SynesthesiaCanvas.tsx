import React, { useRef, useEffect } from 'react';
import { getShapeForNote, getColorForNote } from '../lib/theory';

function calculateDissonance(midis: number[]): number {
  if (midis.length < 2) return 0;
  let dissonanceScore = 0;
  let pairs = 0;
  for (let i = 0; i < midis.length; i++) {
    for (let j = i + 1; j < midis.length; j++) {
      const interval = Math.abs(midis[i] - midis[j]) % 12;
      if (interval === 1 || interval === 11) dissonanceScore += 1.0; // m2, M7
      else if (interval === 6) dissonanceScore += 0.8; // tritone
      else if (interval === 2 || interval === 10) dissonanceScore += 0.4; // M2, m7
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
    if (interval === 1 || interval === 11) dissonanceScore += 1.0; // m2, M7
    else if (interval === 6) dissonanceScore += 0.8; // tritone
    else if (interval === 2 || interval === 10) dissonanceScore += 0.4; // M2, m7
    else if ([3, 4, 8, 9].includes(interval)) dissonanceScore += 0.1; // 3rds, 6ths
    pairs++;
  }
  return Math.min(dissonanceScore / pairs, 1);
}

function getIntervalLabel(midi: number, rootMidi: number): string {
  const interval = ((midi - rootMidi) % 12 + 12) % 12;
  const isOctave = midi >= rootMidi + 12;
  
  switch (interval) {
    case 0: return 'Root';
    case 1: return 'b9';
    case 2: return isOctave ? '9th' : 'M2';
    case 3: return 'm3';
    case 4: return '3rd';
    case 5: return isOctave ? '11th' : '4th';
    case 6: return '#11/b5';
    case 7: return '5th';
    case 8: return isOctave ? 'b13' : '#5';
    case 9: return isOctave ? '13th' : '6th';
    case 10: return 'b7';
    case 11: return 'M7';
    default: return '';
  }
}

interface CanvasProps {
  activeMidis: number[];
  width: number;
  height: number;
  showLabels?: boolean;
  rootMidi?: number;
}

// Kandinsky inspired visualization
export const SynesthesiaCanvas: React.FC<CanvasProps> = ({ activeMidis, width, height, showLabels, rootMidi }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Store persistent fading shapes
  const artifactsRef = useRef<{midi: number, x: number, y: number, alpha: number, scale: number}[]>([]);
  const currentDissonanceRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // Calculate target dissonance and smooth the value
      const targetDissonance = calculateDissonance(activeMidis);
      currentDissonanceRef.current += (targetDissonance - currentDissonanceRef.current) * 0.05;
      const d = currentDissonanceRef.current;
      
      // Interpolate colors based on dissonance
      // Consonant base: deep charcoal-slate
      const baseR = 15, baseG = 17, baseB = 24;
      const dissR = 45, dissG = 10, dissB = 15;
      
      const r = baseR + (dissR - baseR) * d;
      const g = baseG + (dissG - baseG) * d;
      const b = baseB + (dissB - baseB) * d;

      // Clear with slight fade for motion blur effect
      const cx = width / 2;
      const cy = height / 2;
      const maxDist = Math.max(width, height) / 1.5;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDist);
      
      // The center becomes more intensely red/orange as global dissonance increases
      const centerR = baseR + (220 - baseR) * d;
      const centerG = baseG + (60 - baseG) * d;
      const centerB = baseB + (20 - baseB) * d;

      gradient.addColorStop(0, `rgba(${Math.round(centerR)}, ${Math.round(centerG)}, ${Math.round(centerB)}, 0.2)`);
      gradient.addColorStop(1, `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.2)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Add new active notes to artifacts if not present or boost their alpha
      activeMidis.forEach(midi => {
        let artifact = artifactsRef.current.find(a => a.midi === midi);
        if (!artifact) {
          // Map position deterministically but scattered
          // Midi range approx 48 to 72
          const normPitch = (midi - 48) / 24; // 0 to 1
          
          // Use golden ratio to scatter
          const x = (normPitch * width * 1.618) % width;
          const y = height - (normPitch * height * 0.8) - 40; // Higher pitch = higher visually

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
          artifact.alpha -= 0.02;
          artifact.scale += 0.01; // Expand slightly as it fades
        }

        if (artifact.alpha <= 0) {
          artifactsRef.current.splice(i, 1);
          continue;
        }

        const shape = getShapeForNote(artifact.midi);
        const color = getColorForNote(artifact.midi);
        const noteDissonance = calculateNoteDissonance(artifact.midi, activeMidis);
        
        ctx.save();
        ctx.translate(artifact.x, artifact.y);

        // Draw radial gradient heatmap behind the shape if it's contributing to tension
        if (artifact.alpha > 0 && noteDissonance > 0) {
           const glowRadius = 80 * artifact.scale * (1 + noteDissonance);
           const radGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
           // Warmer/redder glow for higher dissonance contribution
           const glowAlpha = Math.min(artifact.alpha * (0.1 + noteDissonance * 0.4), 0.6);
           radGrad.addColorStop(0, `rgba(255, 60, 20, ${glowAlpha})`);
           radGrad.addColorStop(1, `rgba(255, 60, 20, 0)`);
           ctx.fillStyle = radGrad;
           ctx.beginPath();
           ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
           ctx.fill();
        }

        ctx.globalAlpha = Math.min(artifact.alpha, 1);
        
        // Rotate base on time and pitch
        const rot = (performance.now() / 1000) * (artifact.midi % 12 === 0 ? 0.5 : 1);
        ctx.rotate(rot);
        ctx.scale(artifact.scale, artifact.scale);

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;

        const size = 30 + (artifact.midi % 12) * 2;

        ctx.beginPath();
        if (shape === 'circle') {
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (shape === 'triangle') {
          ctx.moveTo(0, -size);
          ctx.lineTo(size, size);
          ctx.lineTo(-size, size);
          ctx.closePath();
          ctx.stroke();
          // Add a discordant inner element
          ctx.beginPath();
          ctx.moveTo(0, -size/2);
          ctx.lineTo(size/2, size/2);
          ctx.lineTo(-size/2, size/2);
          ctx.closePath();
          ctx.stroke();
        } else if (shape === 'square') {
          ctx.rect(-size/2, -size/2, size, size);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.fillRect(-size/4, -size/4, size/2, size/2); // Hollow center
        } else {
          // Line / Abstract slash
          ctx.moveTo(-size*2, -size*2);
          ctx.lineTo(size*2, size*2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(size*2, -size);
          ctx.lineTo(-size*2, size);
          ctx.stroke();
        }
        
        ctx.restore();
        
        if (showLabels && rootMidi !== undefined && artifact.alpha > 0.1) {
          ctx.save();
          ctx.translate(artifact.x, artifact.y);
          ctx.globalAlpha = Math.min(artifact.alpha, 1);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = 'bold 12px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
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
        const activeArtifacts = artifactsRef.current.filter(a => activeMidis.includes(a.midi));
        
        for (let i = 0; i < activeArtifacts.length; i++) {
          const a1 = activeArtifacts[i];
          for (let j = i + 1; j < activeArtifacts.length; j++) {
            const a2 = activeArtifacts[j];
            ctx.moveTo(a1.x, a1.y);
            ctx.lineTo(a2.x, a2.y);
          }
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeMidis, width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="bg-gray-950 rounded-xl shadow-inner outline outline-1 outline-gray-800"
    />
  );
};
