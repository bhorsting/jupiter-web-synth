import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X, Plus, Trash2, Copy, ArrowUp, ArrowDown, Music, Volume2, Sliders,
  Check, RefreshCw, Layers, Radio, Sparkles, ChevronDown, ChevronRight,
  Info, Keyboard, Activity
} from 'lucide-react';
import { Multi, MultiSlot, Patch } from '../types';

interface MultiSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMulti: Multi | null;
  multis: Multi[];
  patches: Patch[];
  activeNotes: number[];
  lastPlayedNote: { note: number; name: string; velocity: number } | null;
  selectedSlotIndex: number;
  onSelectSlot: (index: number) => void;
  onUpdateSlot: (slotIndex: number, fields: Partial<MultiSlot>) => Promise<void>;
  onAddSlot: () => Promise<void>;
  onDeleteSlot: (slotIndex: number) => Promise<void>;
  onDuplicateSlot?: (slotIndex: number) => Promise<void>;
  onMoveSlot?: (slotIndex: number, direction: 'up' | 'down') => Promise<void>;
  onSelectMulti: (multi: Multi) => void;
  onCreateMulti: () => Promise<void>;
  onRenameMulti: (id: string, name: string) => Promise<void>;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  globalMidiChannel?: number;
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

export const getNoteName = (midiNote: number): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${noteName}${octave}`;
};

export const MultiSetupModal: React.FC<MultiSetupModalProps> = ({
  isOpen,
  onClose,
  activeMulti,
  multis,
  patches,
  activeNotes,
  lastPlayedNote,
  selectedSlotIndex,
  onSelectSlot,
  onUpdateSlot,
  onAddSlot,
  onDeleteSlot,
  onDuplicateSlot,
  onMoveSlot,
  onSelectMulti,
  onCreateMulti,
  onRenameMulti,
  onNoteOn,
  onNoteOff,
  globalMidiChannel = 0
}) => {
  const [learningSlotIndex, setLearningSlotIndex] = useState<number | null>(null);
  const [learnStep, setLearnStep] = useState<'low' | 'high'>('low');
  const [isEditingName, setIsEditingName] = useState(false);
  const [multiNameInput, setMultiNameInput] = useState('');
  const [patchSearchQuery, setPatchSearchQuery] = useState('');
  const [auditionOctave, setAuditionOctave] = useState<number>(3); // Default middle octave C3-B4

  // Initialize or sync name input when activeMulti changes
  useEffect(() => {
    if (activeMulti) {
      setMultiNameInput(activeMulti.name);
    }
  }, [activeMulti?.id, activeMulti?.name]);

  // "Learn Split" Mode logic: capture note when learning
  const lastCapturedNoteRef = useRef<number | null>(null);
  useEffect(() => {
    if (learningSlotIndex !== null && lastPlayedNote) {
      if (lastCapturedNoteRef.current === lastPlayedNote.note) return;
      lastCapturedNoteRef.current = lastPlayedNote.note;

      const curSlot = activeMulti?.slots[learningSlotIndex];
      if (!curSlot) return;

      if (learnStep === 'low') {
        const newLow = Math.max(0, Math.min(127, lastPlayedNote.note));
        const newHigh = Math.max(newLow, curSlot.highNote ?? 127);
        onUpdateSlot(learningSlotIndex, { lowNote: newLow, highNote: newHigh });
        setLearnStep('high');
      } else {
        const newHigh = Math.max(0, Math.min(127, lastPlayedNote.note));
        const curLow = curSlot.lowNote ?? 0;
        if (newHigh >= curLow) {
          onUpdateSlot(learningSlotIndex, { highNote: newHigh });
        } else {
          // If played lower, swap them
          onUpdateSlot(learningSlotIndex, { lowNote: newHigh, highNote: curLow });
        }
        setLearningSlotIndex(null);
        setLearnStep('low');
      }
    }
  }, [lastPlayedNote, learningSlotIndex, learnStep, activeMulti?.slots, onUpdateSlot]);

  // Handle outside escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (learningSlotIndex !== null) {
          setLearningSlotIndex(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, learningSlotIndex, onClose]);

  // Categorize patches for easier selection
  const categorizedPatches = useMemo(() => {
    const categories: Record<string, Patch[]> = {};
    patches.forEach(patch => {
      let cat = patch.group || 'General';
      if (!patch.group) {
        const name = patch.name.toLowerCase();
        if (name.includes('bass') || name.includes('sub')) cat = 'Bass';
        else if (name.includes('lead')) cat = 'Lead';
        else if (name.includes('pad') || name.includes('string')) cat = 'Pad / Strings';
        else if (name.includes('brass') || name.includes('horn')) cat = 'Brass';
        else if (name.includes('piano') || name.includes('key') || name.includes('ep')) cat = 'Keyboard / Piano';
        else if (name.includes('organ')) cat = 'Organ';
        else if (name.includes('bell') || name.includes('pluck')) cat = 'Pluck / Bell';
        else if (name.includes('fx') || name.includes('noise')) cat = 'FX / Sound';
      }
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(patch);
    });
    return categories;
  }, [patches]);

  if (!isOpen) return null;

  const currentMulti = activeMulti || (multis.length > 0 ? multis[0] : null);
  const slots = currentMulti?.slots || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-5xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col max-h-[94vh] overflow-hidden text-white font-sans rounded-none animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-orange-500/10 border border-orange-500/40 text-orange-400">
              <Layers size={18} />
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-orange-400 font-bold">
                  Multi Setup & Key Split Panel
                </span>
                <span className="text-[9px] font-mono bg-zinc-800 px-2 py-0.5 text-zinc-400 border border-zinc-700">
                  {slots.length} {slots.length === 1 ? 'Part' : 'Parts'}
                </span>
              </div>

              {/* Multi Preset Selector & Renamer */}
              <div className="flex items-center gap-2 mt-0.5">
                {isEditingName ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (currentMulti && multiNameInput.trim()) {
                        onRenameMulti(currentMulti.id, multiNameInput.trim());
                      }
                      setIsEditingName(false);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={multiNameInput}
                      onChange={(e) => setMultiNameInput(e.target.value)}
                      autoFocus
                      className="bg-black border border-orange-500 text-sm font-bold uppercase tracking-wider px-2 py-0.5 text-white outline-none"
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 bg-orange-500 text-black text-xs font-bold uppercase hover:bg-orange-400"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase hover:text-white"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={currentMulti?.id || ''}
                      onChange={(e) => {
                        const m = multis.find(item => item.id === e.target.value);
                        if (m) onSelectMulti(m);
                      }}
                      className="bg-black border border-zinc-700 hover:border-zinc-500 text-sm font-bold uppercase tracking-wide text-white px-2.5 py-1 focus:border-orange-500 outline-none cursor-pointer max-w-[220px] sm:max-w-xs truncate"
                    >
                      {multis.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.slots.length} parts)</option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        setMultiNameInput(currentMulti?.name || '');
                        setIsEditingName(true);
                      }}
                      className="text-[10px] font-mono text-zinc-400 hover:text-orange-400 underline underline-offset-2 px-1 py-0.5"
                      title="Rename Multi Preset"
                    >
                      Rename
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCreateMulti()}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              title="Create brand new Multi"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">New Multi</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors"
              title="Close Multi Setup (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* LIVE PLAYED NOTE & SPLIT VISUALIZER MONITOR */}
        <div className="bg-zinc-900/90 border-b border-zinc-800 px-4 py-2.5 flex flex-col gap-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Live Note Indicator */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  activeNotes.length > 0 
                    ? 'bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse' 
                    : lastPlayedNote 
                      ? 'bg-orange-500 shadow-[0_0_6px_#f97316]' 
                      : 'bg-zinc-700'
                }`} />
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                  MIDI Monitor:
                </span>
              </div>

              {lastPlayedNote ? (
                <div className="flex items-center gap-2 bg-black/60 border border-zinc-700 px-2.5 py-1">
                  <span className="text-xs font-mono font-black text-orange-400">
                    {lastPlayedNote.name}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    (MIDI {lastPlayedNote.note})
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">|</span>
                  <span className="text-[10px] font-mono text-zinc-300">
                    Vel: <span className="text-amber-400 font-bold">{lastPlayedNote.velocity}</span>
                  </span>
                  {activeNotes.length > 1 && (
                    <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.2">
                      {activeNotes.length} keys active
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] font-mono text-zinc-500 italic">
                  Play keyboard to see note and set split points instantly
                </span>
              )}

              {learningSlotIndex !== null && (
                <div className="flex items-center gap-2 bg-orange-500/20 border border-orange-500 text-orange-300 px-3 py-1 animate-pulse text-xs font-mono font-bold">
                  <Radio size={12} className="text-orange-400 animate-spin" />
                  <span>
                    PART {learningSlotIndex + 1} LEARN: Play {learnStep.toUpperCase()} note on keyboard...
                  </span>
                  <button
                    onClick={() => setLearningSlotIndex(null)}
                    className="text-[9px] bg-black/60 px-1.5 py-0.5 border border-orange-400/50 text-orange-200 hover:text-white ml-1"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Overlapping Info Pill */}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 bg-zinc-950/60 border border-zinc-800 px-2 py-0.5">
              <Info size={11} className="text-cyan-400 shrink-0" />
              <span>Overlapping parts supported (shared keys layer together)</span>
            </div>
          </div>

          {/* KEYBOARD SPLIT OVERVIEW STRIP (0 - 127) */}
          <div className="bg-black border border-zinc-800 p-2 relative flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 px-0.5 select-none">
              <span>C-1 (0)</span>
              <span>C1 (24)</span>
              <span>C2 (36)</span>
              <span>C3 (48)</span>
              <span>C4 (60)</span>
              <span>C5 (72)</span>
              <span>C6 (84)</span>
              <span>C7 (96)</span>
              <span>G9 (127)</span>
            </div>

            {/* Parts Track Lanes */}
            <div className="relative w-full h-14 bg-zinc-950 border border-zinc-800/80 rounded-none overflow-hidden flex flex-col justify-center gap-1 p-1">
              {/* Background Octave Grid Guides */}
              <div className="absolute inset-0 flex pointer-events-none opacity-15">
                {Array.from({ length: 11 }, (_, i) => (
                  <div key={i} className="flex-1 border-r border-zinc-500 h-full" />
                ))}
              </div>

              {/* Current Note Marker Line */}
              {lastPlayedNote && (
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#ffffff] z-20 pointer-events-none transition-all duration-75"
                  style={{ left: `${(lastPlayedNote.note / 127) * 100}%` }}
                />
              )}

              {/* Slot Range Bars */}
              {slots.map((slot, index) => {
                const color = PART_COLORS[index % PART_COLORS.length];
                const low = slot.lowNote ?? 0;
                const high = slot.highNote ?? 127;
                const leftPercent = Math.max(0, Math.min(100, (low / 127) * 100));
                const widthPercent = Math.max(1, Math.min(100 - leftPercent, ((high - low + 1) / 128) * 100));
                const patch = patches.find(p => p.id === slot.patchId);
                const isSelected = selectedSlotIndex === index;
                const isNoteActiveInSlot = lastPlayedNote && lastPlayedNote.note >= low && lastPlayedNote.note <= high;

                return (
                  <div
                    key={index}
                    onClick={() => onSelectSlot(index)}
                    className={`relative h-4 rounded-none cursor-pointer transition-all border text-[9px] font-mono flex items-center px-1.5 truncate select-none ${
                      isSelected 
                        ? `${color.bg} text-black font-black border-white shadow-md z-10` 
                        : isNoteActiveInSlot
                          ? `${color.bg} text-black font-bold border-white/60 opacity-90 z-10`
                          : `${color.bg}/25 ${color.text} ${color.border} hover:bg-opacity-40`
                    }`}
                    style={{
                      marginLeft: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                    title={`Part ${index + 1}: ${patch?.name || 'Empty'} (${getNoteName(low)} - ${getNoteName(high)}) - Click to edit`}
                  >
                    <span className="truncate">
                      P{index + 1}: {patch?.name || 'Empty'} [{getNoteName(low)}-{getNoteName(high)}]
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Quick Audition Piano Keys Strip */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold">Audition Octave:</span>
                <button
                  onClick={() => setAuditionOctave(prev => Math.max(1, prev - 1))}
                  disabled={auditionOctave <= 1}
                  className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 text-[10px] font-mono"
                >
                  ◀ Oct
                </button>
                <span className="text-[10px] font-mono text-orange-400 font-bold w-12 text-center">
                  C{auditionOctave} - B{auditionOctave + 1}
                </span>
                <button
                  onClick={() => setAuditionOctave(prev => Math.min(6, prev + 1))}
                  disabled={auditionOctave >= 6}
                  className="px-1.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 text-[10px] font-mono"
                >
                  Oct ▶
                </button>
              </div>

              {/* 2-Octave Clickable Audition Keys */}
              <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
                {Array.from({ length: 24 }, (_, i) => {
                  const midiNum = (auditionOctave + 1) * 12 + i;
                  const isBlack = [1, 3, 6, 8, 10].includes(midiNum % 12);
                  const isCurrent = activeNotes.includes(midiNum) || (lastPlayedNote?.note === midiNum);
                  return (
                    <button
                      key={midiNum}
                      onMouseDown={() => onNoteOn(midiNum, 0.8)}
                      onMouseUp={() => onNoteOff(midiNum)}
                      onMouseLeave={() => onNoteOff(midiNum)}
                      onTouchStart={() => onNoteOn(midiNum, 0.8)}
                      onTouchEnd={() => onNoteOff(midiNum)}
                      className={`h-6 text-[8px] font-mono transition-all select-none flex flex-col justify-end items-center pb-0.5 ${
                        isBlack 
                          ? `w-4 ${isCurrent ? 'bg-orange-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}` 
                          : `w-5.5 ${isCurrent ? 'bg-orange-400 text-black font-bold' : 'bg-zinc-200 text-black hover:bg-white'}`
                      }`}
                      title={`${getNoteName(midiNum)} (${midiNum})`}
                    >
                      {midiNum % 12 === 0 ? `C${Math.floor(midiNum / 12) - 1}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* PARTS LIST CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {slots.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-zinc-800 bg-zinc-950/40">
              <Layers className="w-10 h-10 text-zinc-600 mb-2" />
              <span className="text-sm font-bold uppercase tracking-wider text-zinc-300">No Parts in this Multi</span>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                Add parts to layer different synth patches or split your keyboard into bass, lead, and pad zones.
              </p>
              <button
                onClick={() => onAddSlot()}
                className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 shadow-lg shadow-orange-500/20"
              >
                <Plus size={14} /> Add First Part
              </button>
            </div>
          ) : (
            slots.map((slot, index) => {
              const color = PART_COLORS[index % PART_COLORS.length];
              const isSelected = selectedSlotIndex === index;
              const isLearning = learningSlotIndex === index;
              const lowNote = slot.lowNote ?? 0;
              const highNote = slot.highNote ?? 127;
              const lowVel = slot.lowVelocity ?? 0;
              const highVel = slot.highVelocity ?? 127;
              const currentPatch = patches.find(p => p.id === slot.patchId);

              return (
                <div
                  key={index}
                  onClick={() => onSelectSlot(index)}
                  className={`border transition-all duration-150 p-3 sm:p-4 cursor-pointer relative ${
                    isSelected
                      ? `bg-zinc-900 border-orange-500/80 shadow-lg ${color.ring} ring-1`
                      : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* PART HEADER & PATCH ASSIGNMENT */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Part Badge */}
                      <div className={`px-2.5 py-1 text-xs font-mono font-black uppercase tracking-wider text-black ${color.bg} flex items-center gap-1.5`}>
                        <span>PART {index + 1}</span>
                      </div>

                      {/* Patch Selector Dropdown */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                          Assigned Patch:
                        </span>
                        <select
                          value={slot.patchId}
                          onChange={(e) => onUpdateSlot(index, { patchId: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-black border border-zinc-700 hover:border-orange-500/70 focus:border-orange-500 text-white font-bold uppercase text-xs px-3 py-1.5 outline-none min-w-[200px] max-w-[280px] truncate cursor-pointer"
                        >
                          {(Object.entries(categorizedPatches) as [string, Patch[]][]).map(([category, catPatches]) => (
                            <optgroup key={category} label={category} className="bg-zinc-900 text-orange-400 font-bold">
                              {catPatches.map(p => (
                                <option key={p.id} value={p.id} className="bg-black text-white font-normal">
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {/* Active Edit Indicator */}
                      {isSelected && (
                        <span className="text-[9px] font-mono font-bold uppercase text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5">
                          Editing Knobs Active
                        </span>
                      )}
                    </div>

                    {/* Part Management Actions */}
                    <div className="flex items-center gap-1 self-end md:self-auto" onClick={(e) => e.stopPropagation()}>
                      {/* Move Up */}
                      {onMoveSlot && (
                        <button
                          onClick={() => onMoveSlot(index, 'up')}
                          disabled={index === 0}
                          className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-20 hover:bg-zinc-800 transition-colors"
                          title="Move Part Up"
                        >
                          <ArrowUp size={14} />
                        </button>
                      )}

                      {/* Move Down */}
                      {onMoveSlot && (
                        <button
                          onClick={() => onMoveSlot(index, 'down')}
                          disabled={index === slots.length - 1}
                          className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-20 hover:bg-zinc-800 transition-colors"
                          title="Move Part Down"
                        >
                          <ArrowDown size={14} />
                        </button>
                      )}

                      {/* Duplicate Part */}
                      {onDuplicateSlot && (
                        <button
                          onClick={() => onDuplicateSlot(index)}
                          className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-colors"
                          title="Duplicate this Part (creates layer/split clone)"
                        >
                          <Copy size={14} />
                        </button>
                      )}

                      {/* Delete Part */}
                      <button
                        onClick={() => onDeleteSlot(index)}
                        disabled={slots.length <= 1}
                        className="p-1.5 text-zinc-500 hover:text-red-400 disabled:opacity-20 hover:bg-red-500/10 transition-colors"
                        title="Delete this Part"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* PART CONFIGURATION GRID */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-3" onClick={(e) => e.stopPropagation()}>
                    {/* KEY RANGE SPLIT CONTROLS (Cols 1-7) */}
                    <div className="lg:col-span-7 flex flex-col gap-2 bg-black/40 border border-zinc-800/80 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                          <span>Key Range Split</span>
                          <span className="text-zinc-500 font-normal">({getNoteName(lowNote)} - {getNoteName(highNote)})</span>
                        </span>

                        {/* Interactive Learn Split Button */}
                        <button
                          onClick={() => {
                            if (isLearning) {
                              setLearningSlotIndex(null);
                            } else {
                              setLearningSlotIndex(index);
                              setLearnStep('low');
                            }
                          }}
                          className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider border transition-all ${
                            isLearning
                              ? 'bg-orange-500 text-black border-orange-400 animate-pulse'
                              : 'bg-zinc-900 hover:bg-zinc-800 text-orange-400 border-orange-500/40'
                          }`}
                          title="Click, then play LOW key, then HIGH key on keyboard to automatically set split range"
                        >
                          {isLearning ? `Press ${learnStep.toUpperCase()} Key...` : '⚡ Learn Range'}
                        </button>
                      </div>

                      {/* Low & High Note Input Controls */}
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Low Note */}
                        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 px-2 py-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400 font-bold">Low:</label>
                          <input
                            type="number"
                            min="0"
                            max="127"
                            value={lowNote}
                            onChange={(e) => onUpdateSlot(index, { lowNote: Math.min(highNote, Math.max(0, parseInt(e.target.value) || 0)) })}
                            className="w-12 bg-black border border-zinc-800 text-xs font-mono font-bold text-white text-center p-0.5 focus:border-orange-500 outline-none"
                          />
                          <span className="text-xs font-mono font-bold text-orange-400 w-9 text-center">
                            {getNoteName(lowNote)}
                          </span>
                          <button
                            onClick={() => {
                              if (lastPlayedNote) {
                                const newLow = Math.min(highNote, lastPlayedNote.note);
                                onUpdateSlot(index, { lowNote: newLow });
                              }
                            }}
                            disabled={!lastPlayedNote}
                            className="px-1.5 py-0.5 bg-black hover:bg-zinc-800 disabled:opacity-30 border border-zinc-700 text-[8px] font-mono text-zinc-300 hover:text-white"
                            title={lastPlayedNote ? `Set Low to Last Played Note (${lastPlayedNote.name})` : "Play a note first"}
                          >
                            Set {lastPlayedNote ? lastPlayedNote.name : 'Played'}
                          </button>
                        </div>

                        {/* Arrow separator */}
                        <span className="text-zinc-600 font-mono text-xs hidden sm:inline">➔</span>

                        {/* High Note */}
                        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 px-2 py-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400 font-bold">High:</label>
                          <input
                            type="number"
                            min="0"
                            max="127"
                            value={highNote}
                            onChange={(e) => onUpdateSlot(index, { highNote: Math.max(lowNote, Math.min(127, parseInt(e.target.value) || 127)) })}
                            className="w-12 bg-black border border-zinc-800 text-xs font-mono font-bold text-white text-center p-0.5 focus:border-orange-500 outline-none"
                          />
                          <span className="text-xs font-mono font-bold text-orange-400 w-9 text-center">
                            {getNoteName(highNote)}
                          </span>
                          <button
                            onClick={() => {
                              if (lastPlayedNote) {
                                const newHigh = Math.max(lowNote, lastPlayedNote.note);
                                onUpdateSlot(index, { highNote: newHigh });
                              }
                            }}
                            disabled={!lastPlayedNote}
                            className="px-1.5 py-0.5 bg-black hover:bg-zinc-800 disabled:opacity-30 border border-zinc-700 text-[8px] font-mono text-zinc-300 hover:text-white"
                            title={lastPlayedNote ? `Set High to Last Played Note (${lastPlayedNote.name})` : "Play a note first"}
                          >
                            Set {lastPlayedNote ? lastPlayedNote.name : 'Played'}
                          </button>
                        </div>
                      </div>

                      {/* Quick Split Range Presets */}
                      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-zinc-800/60">
                        <span className="text-[8px] font-mono uppercase text-zinc-500 font-bold mr-1">Quick:</span>
                        <button
                          onClick={() => onUpdateSlot(index, { lowNote: 0, highNote: 127 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowNote === 0 && highNote === 127 ? 'bg-orange-500 text-black border-orange-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                        >
                          Full (0-127)
                        </button>
                        <button
                          onClick={() => onUpdateSlot(index, { lowNote: 0, highNote: 59 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowNote === 0 && highNote === 59 ? 'bg-orange-500 text-black border-orange-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                          title="Lower Keyboard Split (C-1 to B3)"
                        >
                          Lower Split (0-59)
                        </button>
                        <button
                          onClick={() => onUpdateSlot(index, { lowNote: 60, highNote: 127 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowNote === 60 && highNote === 127 ? 'bg-orange-500 text-black border-orange-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                          title="Upper Keyboard Split (C4 to G9)"
                        >
                          Upper Split (60-127)
                        </button>
                        <button
                          onClick={() => onUpdateSlot(index, { lowNote: 0, highNote: 48 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowNote === 0 && highNote === 48 ? 'bg-orange-500 text-black border-orange-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                          title="Bass Range (C-1 to C3)"
                        >
                          Bass (0-48)
                        </button>
                        <button
                          onClick={() => onUpdateSlot(index, { lowNote: 48, highNote: 84 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowNote === 48 && highNote === 84 ? 'bg-orange-500 text-black border-orange-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                          title="Mid / Lead Range (C3 to C6)"
                        >
                          Lead (48-84)
                        </button>
                      </div>
                    </div>

                    {/* VELOCITY RANGE & TUNING (Cols 8-12) */}
                    <div className="lg:col-span-5 flex flex-col gap-2 bg-black/40 border border-zinc-800/80 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                          Velocity Range
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500">
                          {lowVel === 0 && highVel === 127 ? 'All Velocities' : `Vel: ${lowVel} - ${highVel}`}
                        </span>
                      </div>

                      {/* Velocity inputs */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 px-2 py-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400">Min:</label>
                          <input
                            type="number"
                            min="0"
                            max="127"
                            value={lowVel}
                            onChange={(e) => onUpdateSlot(index, { lowVelocity: Math.min(highVel, Math.max(0, parseInt(e.target.value) || 0)) })}
                            className="w-12 bg-black border border-zinc-800 text-xs font-mono font-bold text-white text-center p-0.5 focus:border-amber-500 outline-none"
                          />
                        </div>

                        <span className="text-zinc-600 font-mono text-xs">➔</span>

                        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 px-2 py-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400">Max:</label>
                          <input
                            type="number"
                            min="0"
                            max="127"
                            value={highVel}
                            onChange={(e) => onUpdateSlot(index, { highVelocity: Math.max(lowVel, Math.min(127, parseInt(e.target.value) || 127)) })}
                            className="w-12 bg-black border border-zinc-800 text-xs font-mono font-bold text-white text-center p-0.5 focus:border-amber-500 outline-none"
                          />
                        </div>

                        {lastPlayedNote && (
                          <button
                            onClick={() => {
                              onUpdateSlot(index, { lowVelocity: lastPlayedNote.velocity });
                            }}
                            className="px-1.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[8px] font-mono text-amber-300"
                            title={`Set Min Velocity to Last Played (${lastPlayedNote.velocity})`}
                          >
                            Set Min ({lastPlayedNote.velocity})
                          </button>
                        )}
                      </div>

                      {/* Velocity Presets */}
                      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-zinc-800/60">
                        <span className="text-[8px] font-mono uppercase text-zinc-500 font-bold mr-1">Vel:</span>
                        <button
                          onClick={() => onUpdateSlot(index, { lowVelocity: 0, highVelocity: 127 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowVel === 0 && highVel === 127 ? 'bg-amber-500 text-black border-amber-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                        >
                          All (0-127)
                        </button>
                        <button
                          onClick={() => onUpdateSlot(index, { lowVelocity: 0, highVelocity: 70 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowVel === 0 && highVel === 70 ? 'bg-amber-500 text-black border-amber-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                          title="Soft Touch Only"
                        >
                          Soft (0-70)
                        </button>
                        <button
                          onClick={() => onUpdateSlot(index, { lowVelocity: 71, highVelocity: 127 })}
                          className={`px-1.5 py-0.5 text-[8px] font-mono border transition-colors ${
                            lowVel === 71 && highVel === 127 ? 'bg-amber-500 text-black border-amber-500 font-bold' : 'bg-black hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                          }`}
                          title="Hard Velocity Stabs Only"
                        >
                          Hard (71-127)
                        </button>
                      </div>

                      {/* Transpose & MIDI Channel */}
                      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-zinc-800/60 mt-1">
                        {/* Octave Transpose */}
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400">Oct:</label>
                          <select
                            value={slot.transposeOctave || 0}
                            onChange={(e) => onUpdateSlot(index, { transposeOctave: parseInt(e.target.value) || 0 })}
                            className="bg-black border border-zinc-700 text-xs font-mono text-white px-1 py-0.5"
                          >
                            <option value="-3">-3</option>
                            <option value="-2">-2</option>
                            <option value="-1">-1</option>
                            <option value="0">0</option>
                            <option value="1">+1</option>
                            <option value="2">+2</option>
                            <option value="3">+3</option>
                          </select>
                        </div>

                        {/* Semitone Transpose */}
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400">Semi:</label>
                          <select
                            value={slot.transposeNote || 0}
                            onChange={(e) => onUpdateSlot(index, { transposeNote: parseInt(e.target.value) || 0 })}
                            className="bg-black border border-zinc-700 text-xs font-mono text-white px-1 py-0.5"
                          >
                            {Array.from({ length: 25 }, (_, i) => i - 12).map(val => (
                              <option key={val} value={val}>{val > 0 ? `+${val}` : val}</option>
                            ))}
                          </select>
                        </div>

                        {/* MIDI Channel */}
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] font-mono uppercase text-zinc-400">Ch:</label>
                          <select
                            value={slot.midiChannel === undefined || slot.midiChannel === 'patch' ? 'patch' : String(slot.midiChannel)}
                            onChange={(e) => {
                              const val = e.target.value;
                              const resolvedVal = val === 'patch' ? 'patch' : val === 'default' ? 'default' : parseInt(val, 10);
                              onUpdateSlot(index, { midiChannel: resolvedVal });
                            }}
                            className="bg-black border border-zinc-700 text-xs font-mono text-amber-300 px-1 py-0.5"
                            title="MIDI Channel route for this part"
                          >
                            <option value="patch">Patch Def</option>
                            <option value="default">Global ({globalMidiChannel === 0 ? 'Omni' : `Ch ${globalMidiChannel}`})</option>
                            <option value="0">Omni (All)</option>
                            {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => (
                              <option key={ch} value={String(ch)}>Ch {ch}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-4 py-3 bg-zinc-900 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAddSlot()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
            >
              <Plus size={14} /> Add Part / Layer
            </button>

            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              Default: Full Range (0-127) & All Velocities
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-wider text-xs border border-zinc-700 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
