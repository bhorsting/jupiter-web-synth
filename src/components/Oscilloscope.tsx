/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { X, Maximize2 } from 'lucide-react';

interface OscilloscopeProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

export const Oscilloscope = React.memo<OscilloscopeProps>(({ analyser, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bigCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const draw = () => {
    if (!analyser || !isActive) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    [canvasRef.current, bigCanvasRef.current].forEach(canvas => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Background grid
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6'; // blue-500
      ctx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    });

    requestRef.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    if (isActive && analyser) {
      requestRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, analyser]);

  return (
    <div className="flex items-center gap-2 h-full px-2 border-l border-synth-border">
      <button
        popoverTarget="oscilloscope-popover"
        className="relative group block p-0 bg-transparent border-none appearance-none cursor-pointer"
      >
        <canvas
          ref={canvasRef}
          width={80}
          height={32}
          className="bg-black/40 rounded border border-white/5 hover:border-blue-500/50 transition-colors"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
          <Maximize2 size={12} className="text-blue-400" />
        </div>
      </button>

      <div 
        id="oscilloscope-popover" 
        popover="auto" 
        className="bg-zinc-900 border border-synth-border rounded-lg shadow-2xl p-4 w-[80vw] max-w-2xl fixed inset-0 m-auto h-fit"
      >
        <div className="flex items-center justify-center mb-4 relative">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Output Analysis</h3>
          <button 
            popoverTarget="oscilloscope-popover"
            popoverTargetAction="hide"
            className="absolute right-0 p-1 hover:bg-white/5 rounded-full text-zinc-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="aspect-video bg-black rounded-lg border border-white/5 overflow-hidden ring-1 ring-blue-500/20 shadow-inner">
          <canvas
            ref={bigCanvasRef}
            width={800}
            height={450}
            className="w-full h-full"
          />
        </div>

        <div className="mt-4 flex justify-between items-center px-1">
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-tighter">Domain</span>
              <span className="text-[10px] font-mono text-blue-400">TIME/FREQ</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-tighter">Sensitivity</span>
              <span className="text-[10px] font-mono text-zinc-300">AUTO</span>
            </div>
          </div>
          <div className="text-[9px] font-mono text-zinc-500 italic">
            Jupiter Engine Real-time Analysis
          </div>
        </div>
      </div>
    </div>
  );
});
