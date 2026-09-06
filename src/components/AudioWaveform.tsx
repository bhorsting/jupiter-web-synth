import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Song } from '../types';
import { audioClickTrackService } from '../services/AudioClickTrackService';
import { Volume2, Radio, Clock, Disc } from 'lucide-react';

interface AudioWaveformProps {
  song: Song;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  peaks?: number[];
  onSeek?: (seconds: number) => void;
  compact?: boolean;
  onBpmChange?: (bpm: number) => void;
  audioContext?: AudioContext | null;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  song,
  currentTime,
  duration,
  isPlaying,
  peaks: providedPeaks,
  onSeek,
  compact = false,
  onBpmChange,
  audioContext,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadedPeaks, setLoadedPeaks] = useState<number[]>([]);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);

  // Load peaks if not provided
  useEffect(() => {
    if (providedPeaks && providedPeaks.length > 0) {
      setLoadedPeaks(providedPeaks);
      return;
    }

    let isMounted = true;
    const targetFile = song.soundAudioFile || song.clickAudioFile;
    if (targetFile && audioContext) {
      audioClickTrackService.getWaveformPeaks(targetFile, audioContext, compact ? 120 : 180)
        .then(({ peaks }) => {
          if (isMounted && peaks && peaks.length > 0) {
            setLoadedPeaks(peaks);
          }
        })
        .catch(err => console.warn('Could not load waveform peaks:', err));
    }
    return () => { isMounted = false; };
  }, [song.soundAudioFile, song.clickAudioFile, audioContext, compact, providedPeaks]);

  // Fallback synthetic peaks if none loaded yet
  const peaksToRender = useMemo(() => {
    if (loadedPeaks.length > 0) return loadedPeaks;
    const count = compact ? 100 : 160;
    return Array.from({ length: count }, (_, i) => {
      const x = (i / count) * Math.PI * 6;
      return 0.25 + 0.5 * Math.abs(Math.sin(x) * Math.cos(x * 0.5));
    });
  }, [loadedPeaks, compact]);

  const effectiveDuration = duration > 0 ? duration : (song.bpm ? (120 / song.bpm) * 32 : 180);
  const progressRatio = effectiveDuration > 0 ? Math.min(1, Math.max(0, currentTime / effectiveDuration)) : 0;

  // Format time mm:ss
  const formatTime = (secs: number): string => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const numBars = peaksToRender.length;
    const barWidth = width / numBars;
    const barGap = Math.max(1, barWidth * 0.25);
    const actualBarWidth = Math.max(1, barWidth - barGap);

    const playheadX = progressRatio * width;
    const centerY = height / 2;

    for (let i = 0; i < numBars; i++) {
      const x = i * barWidth;
      const peak = peaksToRender[i];
      const barHeight = Math.max(3, peak * (height - 6));
      const topY = centerY - barHeight / 2;

      const isPlayed = x <= playheadX;

      if (isPlayed) {
        // Glowing played gradient
        const grad = ctx.createLinearGradient(0, topY, 0, topY + barHeight);
        grad.addColorStop(0, '#38bdf8'); // sky-400
        grad.addColorStop(0.5, '#06b6d4'); // cyan-500
        grad.addColorStop(1, '#0284c7'); // sky-600
        ctx.fillStyle = grad;
        ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
        ctx.shadowBlur = 4;
      } else {
        // Unplayed background bars
        ctx.fillStyle = 'rgba(100, 116, 139, 0.35)'; // slate-500 with opacity
        ctx.shadowBlur = 0;
      }

      ctx.fillRect(x, topY, actualBarWidth, barHeight);
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw Moving Cursor (Playhead)
    if (effectiveDuration > 0) {
      // Glow background for cursor
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.fillRect(playheadX - 2, 0, 5, height);

      // Main cursor line
      ctx.fillStyle = '#f59e0b'; // amber-500
      ctx.fillRect(playheadX - 1, 0, 2, height);

      // Top and bottom cursor marker caps
      ctx.fillStyle = '#fef3c7'; // amber-100
      ctx.beginPath();
      ctx.arc(playheadX, 3, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(playheadX, height - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Hover Cursor Line if hovering
    if (isHovering && hoverX !== null) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [peaksToRender, progressRatio, isHovering, hoverX, effectiveDuration]);

  // Handle click / seek
  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !containerRef.current || effectiveDuration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = clickX / rect.width;
    const targetSec = ratio * effectiveDuration;
    onSeek(targetSec);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || effectiveDuration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = x / rect.width;
    setHoverX(x);
    setHoverTime(ratio * effectiveDuration);
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setHoverTime(null);
    setHoverX(null);
  };

  if (compact) {
    return (
      <div 
        ref={containerRef}
        onClick={handleSeekClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="flex items-center gap-2 bg-black/60 border border-cyan-500/40 px-2 py-1 rounded-none cursor-pointer group relative select-none"
        title="Click anywhere to jump/seek in audio track"
      >
        <div className="flex items-center gap-1 shrink-0">
          <Disc size={12} className={`text-cyan-400 ${isPlaying ? 'animate-spin' : ''}`} />
          <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
            {formatTime(currentTime)}
          </span>
        </div>

        <div className="relative w-28 sm:w-40 h-7 overflow-hidden bg-zinc-950/80 border border-zinc-800">
          <canvas
            ref={canvasRef}
            width={160}
            height={28}
            className="w-full h-full block"
          />
          {isHovering && hoverTime !== null && (
            <div 
              className="absolute top-0.5 bg-black/90 border border-amber-500 text-[8px] font-mono text-amber-300 px-1 py-0.2 pointer-events-none transform -translate-x-1/2 z-10"
              style={{ left: `${hoverX}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        <span className="text-[9px] font-mono text-zinc-500 shrink-0">
          {formatTime(effectiveDuration)}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full bg-black/70 border border-cyan-500/40 p-3 rounded-none relative select-none shadow-[0_0_15px_rgba(6,182,212,0.1)]">
      {/* Header Info & Audio Routing Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold uppercase tracking-wider">
            <Radio size={12} className="text-cyan-400 animate-pulse" />
            <span>DUAL AUDIO CLICK TRACK</span>
          </div>

          {song.clickAudioFile && (
            <div 
              className="flex items-center gap-1 px-2 py-0.5 bg-amber-950/70 border border-amber-500/40 text-amber-300 font-mono text-[9px] font-bold uppercase truncate max-w-[180px]"
              title={`Click track (${song.clickAudioFile}) routed to Rear Click Output`}
            >
              <Volume2 size={10} className="text-amber-400 shrink-0" />
              <span className="truncate">CLICK: {song.clickAudioFile}</span>
            </div>
          )}

          {song.soundAudioFile && (
            <div 
              className="flex items-center gap-1 px-2 py-0.5 bg-sky-950/70 border border-sky-500/40 text-sky-300 font-mono text-[9px] font-bold uppercase truncate max-w-[180px]"
              title={`Sound track (${song.soundAudioFile}) routed to Front Main Output`}
            >
              <Volume2 size={10} className="text-sky-400 shrink-0" />
              <span className="truncate">SOUND: {song.soundAudioFile}</span>
            </div>
          )}
        </div>

        {/* Manual BPM Setter & Clock */}
        <div className="flex items-center gap-2">
          {onBpmChange && (
            <div className="flex items-center bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-300">
              <span className="text-zinc-500 mr-1.5 text-[9px]">BPM:</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBpmChange(Math.max(40, (song.bpm || 120) - 1));
                }}
                className="px-1 text-zinc-400 hover:text-white font-bold"
              >
                -
              </button>
              <input
                type="number"
                min="40"
                max="280"
                value={song.bpm || 120}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) onBpmChange(val);
                }}
                className="w-10 bg-transparent text-amber-400 text-center outline-none focus:text-white"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBpmChange(Math.min(280, (song.bpm || 120) + 1));
                }}
                className="px-1 text-zinc-400 hover:text-white font-bold"
              >
                +
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 font-mono text-xs font-bold">
            <Clock size={12} className="text-zinc-500" />
            <span className="text-amber-400">{formatTime(currentTime)}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{formatTime(effectiveDuration)}</span>
          </div>
        </div>
      </div>

      {/* Waveform Canvas Area */}
      <div 
        ref={containerRef}
        onClick={handleSeekClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-16 sm:h-20 bg-zinc-950 border border-zinc-800 relative cursor-pointer group overflow-hidden"
        title="Click or drag anywhere on waveform to seek"
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={80}
          className="w-full h-full block"
        />

        {/* Hover Time Tooltip */}
        {isHovering && hoverTime !== null && (
          <div 
            className="absolute top-1 bg-black/90 border border-amber-500 text-[10px] font-mono font-bold text-amber-300 px-1.5 py-0.5 pointer-events-none transform -translate-x-1/2 z-20 shadow-md"
            style={{ left: `${hoverX}px` }}
          >
            SEEK: {formatTime(hoverTime)}
          </div>
        )}

        {/* Real-time Percentage Indicator */}
        <div className="absolute bottom-1 right-2 text-[9px] font-mono text-zinc-500 bg-black/80 px-1 py-0.2 pointer-events-none border border-zinc-900">
          {Math.floor(progressRatio * 100)}%
        </div>
      </div>
    </div>
  );
};
