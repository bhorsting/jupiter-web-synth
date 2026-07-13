import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Play, Square, Activity, Sliders, Music, Zap } from 'lucide-react';

export interface MidiDebugEvent {
  id: string;
  timestamp: string;
  type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Panic' | 'PC';
  channel: number | string;
  noteOrCC: string;
  numValue: number;
  velocityOrVal: string | number;
}

interface MidiDebuggerProps {
  isOpen: boolean;
  onClose: () => void;
  events: MidiDebugEvent[];
  onClear: () => void;
  // Callback to simulate note trigger
  onSimulateNoteOn?: (note: number, velocity: number) => void;
  onSimulateNoteOff?: (note: number) => void;
  onSimulateCC?: (cc: number, value: number, channel: number) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MidiDebugger: React.FC<MidiDebuggerProps> = ({
  isOpen,
  onClose,
  events,
  onClear,
  onSimulateNoteOn,
  onSimulateNoteOff,
  onSimulateCC,
}) => {
  // Simulator State
  const [simNote, setSimNote] = useState<number>(60); // C4
  const [simVelocity, setSimVelocity] = useState<number>(100); // 1-127
  const [simChannel, setSimChannel] = useState<number>(1);
  const [simCC, setSimCC] = useState<number>(74); // Cutoff
  const [simCCVal, setSimCCVal] = useState<number>(64);
  const [activeSimNotes, setActiveSimNotes] = useState<number[]>([]);

  const triggerSimNoteOn = () => {
    if (onSimulateNoteOn) {
      onSimulateNoteOn(simNote, simVelocity / 127);
      if (!activeSimNotes.includes(simNote)) {
        setActiveSimNotes(prev => [...prev, simNote]);
      }
    }
  };

  const triggerSimNoteOff = () => {
    if (onSimulateNoteOff) {
      onSimulateNoteOff(simNote);
      setActiveSimNotes(prev => prev.filter(n => n !== simNote));
    }
  };

  const triggerSimCC = (val: number) => {
    setSimCCVal(val);
    if (onSimulateCC) {
      onSimulateCC(simCC, val, simChannel - 1);
    }
  };

  const getNoteNameWithOctave = (midiNum: number) => {
    const name = NOTE_NAMES[midiNum % 12];
    const octave = Math.floor(midiNum / 12) - 1;
    return `${name}${octave} (${midiNum})`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 15, scale: 0.95 }}
          className="fixed bottom-24 right-4 z-50 w-full max-w-lg bg-[#141414] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[520px] max-h-[80vh]"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-orange-500 animate-pulse" />
              <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-100">MIDI Notes Debugger</h3>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={onClear}
                className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors rounded"
                title="Clear Logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button 
                onClick={onClose}
                className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid Layout: Top is Logger, Bottom is Simulator */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto divide-y divide-zinc-800">
            
            {/* Live Message Logger */}
            <div className="flex-1 flex flex-col min-h-0 p-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">
                Live MIDI Feed (Most Recent First)
              </span>
              <div className="flex-1 bg-black/40 border border-zinc-900 rounded-lg overflow-y-auto p-2 font-mono text-[10px] space-y-1.5 custom-scrollbar min-h-[140px]">
                {events.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-[10px] uppercase tracking-wider italic">
                    Waiting for MIDI signals...
                  </div>
                ) : (
                  events.map(ev => {
                    let typeBadgeColor = 'text-green-500 bg-green-500/10 border-green-500/20';
                    if (ev.type === 'Note Off') typeBadgeColor = 'text-red-400 bg-red-400/10 border-red-400/20';
                    if (ev.type === 'CC') typeBadgeColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
                    if (ev.type === 'Pitch Bend') typeBadgeColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
                    if (ev.type === 'Panic') typeBadgeColor = 'text-purple-500 bg-purple-500/10 border-purple-500/20';
                    if (ev.type === 'PC') typeBadgeColor = 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';

                    return (
                      <div 
                        key={ev.id} 
                        className="flex items-center gap-2 py-1 px-1.5 bg-zinc-900/40 border border-zinc-900 rounded hover:bg-zinc-900/70 transition-colors animate-in fade-in duration-200"
                      >
                        <span className="text-[9px] text-zinc-600">{ev.timestamp}</span>
                        <span className={`px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase tracking-tight ${typeBadgeColor}`}>
                          {ev.type}
                        </span>
                        <span className="text-[9px] text-zinc-400">
                          Ch:{ev.channel}
                        </span>
                        <span className="text-zinc-200 font-bold flex-1 truncate">
                          {ev.noteOrCC}
                        </span>
                        <span className="text-orange-500 font-bold shrink-0">
                          {ev.type === 'Note On' || ev.type === 'Note Off' ? `Vel:${ev.velocityOrVal}` : `Val:${ev.velocityOrVal}`}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Event Simulator Panel */}
            <div className="p-4 bg-zinc-950/40 space-y-3 shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  MIDI Simulator / Input Sandbox
                </span>
              </div>

              {/* Note Simulate */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex justify-between">
                    <span>Note Pitch</span>
                    <span className="text-orange-500 font-mono">{getNoteNameWithOctave(simNote)}</span>
                  </label>
                  <input 
                    type="range" min="36" max="96" step="1"
                    value={simNote}
                    onChange={(e) => setSimNote(parseInt(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex justify-between">
                    <span>Sim Velocity</span>
                    <span className="text-orange-500 font-mono">{simVelocity} ({Math.round(simVelocity/1.27)}%)</span>
                  </label>
                  <input 
                    type="range" min="1" max="127" step="1"
                    value={simVelocity}
                    onChange={(e) => setSimVelocity(parseInt(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={triggerSimNoteOn}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-green-600/10 hover:bg-green-600/20 border border-green-500/30 text-green-500 text-[9px] font-bold uppercase tracking-widest rounded transition-all cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  Note On
                </button>
                <button
                  onClick={triggerSimNoteOff}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-widest rounded transition-all cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  Note Off
                </button>
                <button
                  onClick={() => {
                    activeSimNotes.forEach(note => {
                      if (onSimulateNoteOff) onSimulateNoteOff(note);
                    });
                    setActiveSimNotes([]);
                  }}
                  disabled={activeSimNotes.length === 0}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-900 border border-zinc-800 disabled:opacity-30 disabled:pointer-events-none text-zinc-400 text-[9px] font-bold uppercase tracking-widest rounded transition-all cursor-pointer"
                >
                  Clear Notes
                </button>
              </div>

              {/* CC Simulate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800/60 pt-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex justify-between">
                    <span>CC Parameter</span>
                    <span className="text-blue-400 font-mono">CC {simCC}</span>
                  </label>
                  <select
                    value={simCC}
                    onChange={(e) => setSimCC(parseInt(e.target.value))}
                    className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-blue-500/50"
                  >
                    <option value={74}>CC 74 (Cutoff)</option>
                    <option value={71}>CC 71 (Resonance)</option>
                    <option value={1}>CC 1 (Mod Wheel)</option>
                    <option value={7}>CC 7 (Volume)</option>
                    <option value={5}>CC 5 (Portamento)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex justify-between">
                    <span>CC Value</span>
                    <span className="text-blue-400 font-mono">{simCCVal}</span>
                  </label>
                  <input 
                    type="range" min="0" max="127" step="1"
                    value={simCCVal}
                    onChange={(e) => triggerSimCC(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
