import React, { useMemo } from 'react';
import { Clock, Activity, Zap } from 'lucide-react';

interface ClickProgressIndicatorProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  bpm?: number;
  timeSignature?: string;
  leadInBars?: number;
  currentBar?: number;
  currentBeat?: number;
  compact?: boolean;
  onBpmChange?: (bpm: number) => void;
  title?: string;
}

export const ClickProgressIndicator: React.FC<ClickProgressIndicatorProps> = ({
  currentTime,
  duration,
  isPlaying,
  bpm = 120,
  timeSignature = '4/4',
  leadInBars = 0,
  currentBar,
  currentBeat,
  compact = false,
  onBpmChange,
  title = 'MIDI CLICK TRACK',
}) => {
  const beatsPerBar = useMemo(() => {
    const parts = timeSignature.split('/');
    return parseInt(parts[0], 10) || 4;
  }, [timeSignature]);

  // If beat isn't directly supplied by MIDI engine, calculate dynamically from current time & BPM
  const computedBeat = useMemo(() => {
    if (currentBeat !== undefined) return currentBeat;
    if (bpm <= 0 || !isPlaying) return 0;
    const beatInterval = 60 / bpm;
    return Math.floor(currentTime / beatInterval) % beatsPerBar;
  }, [currentBeat, currentTime, bpm, isPlaying, beatsPerBar]);

  const computedBar = useMemo(() => {
    if (currentBar !== undefined) return currentBar;
    if (bpm <= 0 || !isPlaying) return 1;
    const beatInterval = 60 / bpm;
    return Math.floor(currentTime / (beatInterval * beatsPerBar)) + 1;
  }, [currentBar, currentTime, bpm, isPlaying, beatsPerBar]);

  const formatTime = (secs: number): string => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-black/60 border border-amber-500/40 px-2 py-1 select-none">
        {/* Visual 4-beat dots */}
        <div className="flex items-center gap-1">
          {Array.from({ length: beatsPerBar }).map((_, idx) => {
            const isCurrentBeat = isPlaying && computedBeat === idx;
            const isDownbeat = idx === 0;
            return (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-all duration-75 ${
                  isCurrentBeat
                    ? isDownbeat
                      ? 'bg-amber-400 scale-125 shadow-[0_0_8px_rgba(245,158,11,1)]'
                      : 'bg-emerald-400 scale-110 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                    : 'bg-zinc-800'
                }`}
              />
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="w-20 sm:w-28 h-2 bg-zinc-900 border border-zinc-800 overflow-hidden relative">
          <div
            className={`h-full transition-all duration-200 ${
              isPlaying ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-zinc-700'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Time */}
        <span className="text-[10px] font-mono font-bold text-amber-400 shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full bg-black/70 border border-amber-500/40 p-3 rounded-none select-none shadow-[0_0_15px_rgba(245,158,11,0.1)] space-y-2">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold uppercase tracking-wider">
            <Activity size={12} className={`text-amber-400 ${isPlaying ? 'animate-pulse' : ''}`} />
            <span>{title}</span>
          </div>

          {/* Measure and Beat indicator */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-300">
            <span className="text-zinc-500">BAR</span>
            <span className="text-amber-400 font-bold">{computedBar}</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-500">BEAT</span>
            <span className="text-emerald-400 font-bold">{computedBeat + 1}</span>
          </div>
        </div>

        {/* Visual Metronome Beat Indicator & BPM */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2 py-1">
            {Array.from({ length: beatsPerBar }).map((_, idx) => {
              const isCurrentBeat = isPlaying && computedBeat === idx;
              const isDownbeat = idx === 0;
              return (
                <div key={idx} className="flex flex-col items-center gap-0.5">
                  <div
                    className={`w-3 h-3 rounded-full transition-all duration-75 ${
                      isCurrentBeat
                        ? isDownbeat
                          ? 'bg-amber-400 scale-125 shadow-[0_0_10px_rgba(245,158,11,1)] ring-2 ring-amber-300/50'
                          : 'bg-emerald-400 scale-110 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                        : 'bg-zinc-800'
                    }`}
                  />
                  <span className={`text-[7px] font-mono ${isCurrentBeat ? 'text-white font-bold' : 'text-zinc-600'}`}>
                    {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>

          {onBpmChange && (
            <div className="flex items-center bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-300">
              <span className="text-zinc-500 mr-1.5 text-[9px]">BPM:</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBpmChange(Math.max(40, bpm - 1));
                }}
                className="px-1 text-zinc-400 hover:text-white font-bold"
              >
                -
              </button>
              <input
                type="number"
                min="40"
                max="280"
                value={bpm}
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
                  onBpmChange(Math.min(280, bpm + 1));
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
            <span className="text-zinc-400">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3.5 bg-zinc-950 border border-zinc-800 overflow-hidden relative">
        <div
          className={`h-full transition-all duration-150 relative ${
            isPlaying ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-zinc-700'
          }`}
          style={{ width: `${progressPercent}%` }}
        >
          {isPlaying && (
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/70 animate-pulse shadow-[0_0_6px_#fff]" />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-end pr-2 pointer-events-none">
          <span className="text-[8px] font-mono text-zinc-400 font-bold bg-black/60 px-1">
            {Math.floor(progressPercent)}%
          </span>
        </div>
      </div>
    </div>
  );
};
