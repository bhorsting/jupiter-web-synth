import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, Sliders, RotateCcw, ChevronDown, ChevronUp, Layers, Activity } from 'lucide-react';
import { Multi, MultiSlot, Patch } from '../types';
import { JupiterEngine } from '../engine/JupiterEngine';

interface MultiVolumeMixerProps {
  activeMulti: Multi | null;
  patches: Patch[];
  selectedSlotIndex: number;
  onSelectSlot: (index: number) => void;
  onUpdateSlot: (slotIndex: number, fields: Partial<MultiSlot>) => Promise<void>;
  engine?: JupiterEngine | null;
  onOpenMultiSetup?: () => void;
}

const PART_COLORS = [
  { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500', hex: '#f97316', ring: 'ring-orange-500/40' },
  { bg: 'bg-cyan-500', text: 'text-cyan-400', border: 'border-cyan-500', hex: '#06b6d4', ring: 'ring-cyan-500/40' },
  { bg: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-500', hex: '#a855f7', ring: 'ring-purple-500/40' },
  { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500', hex: '#10b981', ring: 'ring-emerald-500/40' },
  { bg: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500', hex: '#f59e0b', ring: 'ring-amber-500/40' },
  { bg: 'bg-pink-500', text: 'text-pink-400', border: 'border-pink-500', hex: '#ec4899', ring: 'ring-pink-500/40' },
  { bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500', hex: '#3b82f6', ring: 'ring-blue-500/40' },
  { bg: 'bg-lime-500', text: 'text-lime-400', border: 'border-lime-500', hex: '#84cc16', ring: 'ring-lime-500/40' },
];

const getNoteName = (midiNote: number): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${noteName}${octave}`;
};

const volumeToDbString = (vol: number): string => {
  if (vol <= 0.001) return '-∞ dB';
  const db = 20 * Math.log10(vol);
  if (db >= 0) return `+${db.toFixed(1)} dB`;
  return `${db.toFixed(1)} dB`;
};

// Interactive Hardware Fader Component
interface VerticalFaderProps {
  value: number; // 0.0 to 1.2
  onChange: (val: number) => void;
  colorHex: string;
  isMuted?: boolean;
}

const VerticalFader: React.FC<VerticalFaderProps> = ({ value, onChange, colorHex, isMuted }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  // Value range: 0.0 to 1.2 (1.0 = 0dB unity gain)
  const maxVal = 1.2;
  const clampedVal = Math.max(0, Math.min(maxVal, value));
  const normalizedHeight = (clampedVal / maxVal) * 100; // 0 to 100%

  const updateFromPointer = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const clampedY = Math.max(0, Math.min(rect.height, relativeY));
    // Inverted: top is maxVal, bottom is 0
    const ratio = 1 - clampedY / rect.height;
    const newVal = Math.round(ratio * maxVal * 100) / 100;
    onChange(Math.max(0, Math.min(maxVal, newVal)));
  }, [onChange, maxVal]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(maxVal, Math.round((clampedVal + 0.05) * 100) / 100));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(0, Math.round((clampedVal - 0.05) * 100) / 100));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(maxVal);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(0);
    }
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onChange(1.0); // Reset to unity gain
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="slider"
      aria-label="Part Volume Fader"
      aria-valuenow={Math.round(clampedVal * 100)}
      aria-valuemin={0}
      aria-valuemax={120}
      className="relative w-8 h-36 flex items-center justify-center cursor-pointer select-none outline-none focus:ring-1 focus:ring-orange-500/50"
      title="Drag to adjust volume, double-click for 0 dB (100%)"
    >
      {/* Background Track Slit */}
      <div className="w-1.5 h-full bg-black border border-zinc-800 rounded-none relative">
        {/* Unity Gain Notch (at 1.0 / 1.2 = ~83.3%) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-4 h-[1px] bg-zinc-600"
          style={{ bottom: `${(1.0 / maxVal) * 100}%` }}
        />
        {/* Active colored fill */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all ${
            isMuted ? 'bg-zinc-700' : ''
          }`}
          style={{
            height: `${normalizedHeight}%`,
            backgroundColor: isMuted ? undefined : colorHex,
            opacity: isMuted ? 0.3 : 0.85,
          }}
        />
      </div>

      {/* Hardware Fader Cap / Handle */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-7 h-5 bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 border border-zinc-600 shadow-md flex items-center justify-center transition-transform hover:border-zinc-400"
        style={{
          bottom: `calc(${normalizedHeight}% - 10px)`,
        }}
      >
        {/* Center Groove / Position Line */}
        <div
          className="w-full h-[2px]"
          style={{ backgroundColor: isMuted ? '#ef4444' : colorHex }}
        />
      </div>
    </div>
  );
};

export const MultiVolumeMixer: React.FC<MultiVolumeMixerProps> = ({
  activeMulti,
  patches,
  selectedSlotIndex,
  onSelectSlot,
  onUpdateSlot,
  engine,
  onOpenMultiSetup,
}) => {
  const [levels, setLevels] = useState<number[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // Real-time meter polling loop
  useEffect(() => {
    let isRunning = true;
    const updateMeters = () => {
      if (!isRunning) return;
      if (engine && activeMulti && activeMulti.slots.length > 0) {
        const newLevels = activeMulti.slots.map((_, idx) => engine.getSlotLevel(idx));
        setLevels(newLevels);
      } else {
        setLevels([]);
      }
      animFrameRef.current = requestAnimationFrame(updateMeters);
    };

    animFrameRef.current = requestAnimationFrame(updateMeters);
    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [engine, activeMulti]);

  if (!activeMulti || activeMulti.slots.length === 0) {
    return null;
  }

  const slots = activeMulti.slots;
  const anyMuted = slots.some(s => s.mute);
  const anySoloed = slots.some(s => s.solo);

  const handleVolumeChange = (index: number, newVol: number) => {
    // Immediate zero-latency audio engine gain adjustment
    if (engine) {
      engine.setSlotVolume(index, newVol);
    }
    // Update state & persistence
    onUpdateSlot(index, { volume: newVol });
  };

  const handleToggleMute = (index: number) => {
    const slot = slots[index];
    const newMute = !slot.mute;
    if (engine) {
      engine.setSlotMute(index, newMute);
    }
    onUpdateSlot(index, { mute: newMute });
  };

  const handleToggleSolo = (index: number) => {
    const slot = slots[index];
    const newSolo = !slot.solo;
    if (engine) {
      engine.setSlotSolo(index, newSolo);
    }
    onUpdateSlot(index, { solo: newSolo });
  };

  const handleResetAllVolumes = () => {
    slots.forEach((_, idx) => {
      if (engine) engine.setSlotVolume(idx, 1.0);
      onUpdateSlot(idx, { volume: 1.0 });
    });
  };

  const handleClearMutes = () => {
    slots.forEach((_, idx) => {
      if (engine) engine.setSlotMute(idx, false);
      onUpdateSlot(idx, { mute: false });
    });
  };

  const handleClearSolos = () => {
    slots.forEach((_, idx) => {
      if (engine) engine.setSlotSolo(idx, false);
      onUpdateSlot(idx, { solo: false });
    });
  };

  return (
    <div id="multi-volume-mixer-panel" className="bg-zinc-950 border border-zinc-800 shadow-2xl mb-6 overflow-hidden">
      {/* MIXER CONSOLE TOP BAR */}
      <div className="bg-zinc-900/95 border-b border-zinc-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/40">
            <Sliders size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Multi Part Mixer
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-orange-400 border border-zinc-700">
                {slots.length} {slots.length === 1 ? 'Part' : 'Parts'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 font-bold truncate max-w-[280px]">
              {activeMulti.name}
            </div>
          </div>
        </div>

        {/* Global Mixer Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {anyMuted && (
            <button
              onClick={handleClearMutes}
              className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 transition-colors cursor-pointer"
              title="Unmute all parts"
            >
              Unmute All
            </button>
          )}

          {anySoloed && (
            <button
              onClick={handleClearSolos}
              className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-950/80 hover:bg-amber-900 border border-amber-700 text-amber-200 transition-colors cursor-pointer"
              title="Clear all solo parts"
            >
              Clear Solos
            </button>
          )}

          <button
            onClick={handleResetAllVolumes}
            className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Reset all part volumes to unity gain 100% (0 dB)"
          >
            <RotateCcw size={11} /> Reset 100%
          </button>

          {onOpenMultiSetup && (
            <button
              onClick={onOpenMultiSetup}
              className="px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/50 text-orange-400 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Open full splits and key range setup dialog"
            >
              <Layers size={11} /> Splits & Setup
            </button>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700 flex items-center gap-1 cursor-pointer text-[10px] font-mono uppercase"
            title={isCollapsed ? "Expand Mixer" : "Collapse Mixer"}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span>{isCollapsed ? 'Show' : 'Hide'}</span>
          </button>
        </div>
      </div>

      {/* CHANNEL STRIPS AREA */}
      {!isCollapsed && (
        <div className="p-4 overflow-x-auto bg-zinc-950">
          <div className="flex gap-3 min-w-max items-stretch justify-start">
            {slots.map((slot, index) => {
              const color = PART_COLORS[index % PART_COLORS.length];
              const patch = patches.find(p => p.id === slot.patchId);
              const isSelected = selectedSlotIndex === index;
              const vol = slot.volume !== undefined ? slot.volume : 1.0;
              const isMuted = !!slot.mute;
              const isSoloed = !!slot.solo;
              const level = levels[index] || 0;
              const lowNote = slot.lowNote ?? 0;
              const highNote = slot.highNote ?? 127;
              const isFullKeyboard = lowNote === 0 && highNote === 127;

              return (
                <div
                  key={index}
                  onClick={() => onSelectSlot(index)}
                  className={`flex flex-col w-40 sm:w-44 border transition-all cursor-pointer select-none relative ${
                    isSelected
                      ? 'bg-zinc-900/90 border-orange-500 ring-1 ring-orange-500/40 shadow-lg shadow-orange-500/5'
                      : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* CHANNEL HEADER */}
                  <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-950/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold font-mono text-black ${color.bg}`}
                        >
                          {index + 1}
                        </span>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                          Part {index + 1}
                        </span>
                      </div>

                      {isSelected ? (
                        <span className="text-[8px] font-mono font-bold uppercase text-orange-400 bg-orange-500/10 px-1.5 py-0.5 border border-orange-500/30">
                          Editing
                        </span>
                      ) : (
                        <span className="text-[8px] font-mono text-zinc-500">
                          Slot {index + 1}
                        </span>
                      )}
                    </div>

                    {/* Patch Selector Dropdown */}
                    <select
                      value={slot.patchId}
                      onChange={(e) => onUpdateSlot(index, { patchId: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-black border border-zinc-700 hover:border-zinc-500 focus:border-orange-500 text-white font-bold text-[11px] px-2 py-1 outline-none truncate cursor-pointer uppercase font-mono"
                    >
                      {patches.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    {/* Key Range Pill */}
                    <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-zinc-400">
                      <span className="truncate">
                        {isFullKeyboard ? 'Full Range' : `${getNoteName(lowNote)} - ${getNoteName(highNote)}`}
                      </span>
                      {slot.transposeOctave !== 0 && (
                        <span className="text-orange-400 font-bold">
                          {slot.transposeOctave > 0 ? `+${slot.transposeOctave}8va` : `${slot.transposeOctave}8vb`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MUTE & SOLO BUTTONS */}
                  <div className="grid grid-cols-2 gap-1.5 p-2 bg-zinc-950/40 border-b border-zinc-800/80" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggleMute(index)}
                      className={`py-1 text-[10px] font-mono font-bold uppercase border transition-all cursor-pointer ${
                        isMuted
                          ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30 font-extrabold'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                      title={isMuted ? "Unmute Part" : "Mute Part"}
                    >
                      Mute
                    </button>

                    <button
                      onClick={() => handleToggleSolo(index)}
                      className={`py-1 text-[10px] font-mono font-bold uppercase border transition-all cursor-pointer ${
                        isSoloed
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30 font-extrabold'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                      title={isSoloed ? "Clear Solo" : "Solo Part"}
                    >
                      Solo
                    </button>
                  </div>

                  {/* FADER & METER SECTION */}
                  <div className="p-3 flex-1 flex flex-col items-center justify-between min-h-[220px] bg-zinc-950/70" onClick={(e) => e.stopPropagation()}>
                    <div className="w-full flex justify-between items-center text-[9px] font-mono text-zinc-500 mb-2">
                      <span className="text-zinc-400">{volumeToDbString(vol)}</span>
                      <span className={`font-bold ${color.text}`}>{Math.round(vol * 100)}%</span>
                    </div>

                    <div className="flex items-center justify-center gap-2.5 w-full my-auto">
                      {/* Scale / dB markings */}
                      <div className="flex flex-col justify-between h-36 text-[8px] font-mono text-zinc-600 select-none text-right pr-0.5">
                        <span className="text-red-400/90 font-bold">+2</span>
                        <span className="text-orange-400 font-bold">0</span>
                        <span>-6</span>
                        <span>-12</span>
                        <span>-24</span>
                        <span className="text-zinc-600">-∞</span>
                      </div>

                      {/* Interactive Physical Fader */}
                      <VerticalFader
                        value={vol}
                        onChange={(newVal) => handleVolumeChange(index, newVal)}
                        colorHex={color.hex}
                        isMuted={isMuted}
                      />

                      {/* Hardware Segmented LED Meter */}
                      <div className="h-36 w-3 bg-black border border-zinc-800 p-0.5 flex flex-col-reverse gap-0.5 rounded-none">
                        {Array.from({ length: 14 }).map((_, segIdx) => {
                          const threshold = (segIdx + 1) / 14;
                          const isLit = !isMuted && level >= threshold;
                          let segColor = 'bg-emerald-500';
                          if (segIdx >= 12) segColor = 'bg-red-500 shadow-sm shadow-red-500/50';
                          else if (segIdx >= 9) segColor = 'bg-amber-400';

                          return (
                            <div
                              key={segIdx}
                              className={`w-full flex-1 transition-opacity duration-75 ${
                                isLit ? `${segColor} opacity-100` : 'bg-zinc-800 opacity-20'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Quick 0 dB Reset button */}
                    <div className="mt-3 w-full flex items-center justify-between gap-1 pt-2 border-t border-zinc-800/80">
                      <button
                        onClick={() => handleVolumeChange(index, 1.0)}
                        className="w-full py-0.5 text-[8px] font-mono text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors uppercase cursor-pointer"
                        title="Set to Unity Gain (100% / 0 dB)"
                      >
                        0 dB (100%)
                      </button>
                    </div>
                  </div>

                  {/* BOTTOM SELECTION STRIP */}
                  <div
                    className={`py-1.5 px-2 text-center text-[9px] font-mono uppercase font-bold tracking-wider transition-colors ${
                      isSelected
                        ? `${color.bg} text-black`
                        : 'bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {isSelected ? 'Editing Knobs' : 'Select Sound'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
