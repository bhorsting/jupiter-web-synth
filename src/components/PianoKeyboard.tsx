import React, { useState, useEffect, useCallback } from 'react';

interface PianoKeyboardProps {
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const PianoKeyboard: React.FC<PianoKeyboardProps> = React.memo(({ onNoteOn, onNoteOff }) => {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const activeNotesRef = React.useRef<Set<number>>(new Set());
  const startNote = 48; // C3
  const numNotes = 25; // 2 octaves

  useEffect(() => {
    return () => {
      activeNotesRef.current.forEach(note => {
        onNoteOff(note);
      });
      activeNotesRef.current.clear();
    };
  }, [onNoteOff]);

  const handlePointerDown = useCallback((note: number) => {
    if (activeNotesRef.current.has(note)) return;
    activeNotesRef.current.add(note);
    onNoteOn(note);
    setActiveNotes(new Set(activeNotesRef.current));
  }, [onNoteOn]);

  const handlePointerUp = useCallback((note: number) => {
    if (!activeNotesRef.current.has(note)) return;
    activeNotesRef.current.delete(note);
    onNoteOff(note);
    setActiveNotes(new Set(activeNotesRef.current));
  }, [onNoteOff]);

  const handlePointerLeave = useCallback((note: number, pointerType?: string) => {
    if (pointerType === 'touch') return;
    handlePointerUp(note);
  }, [handlePointerUp]);

  const whiteNotes = Array.from({ length: numNotes })
    .map((_, i) => startNote + i)
    .filter(n => !NOTES[n % 12].includes('#'));

  const blackNotes = Array.from({ length: numNotes })
    .map((_, i) => startNote + i)
    .filter(n => NOTES[n % 12].includes('#'));

  const getWhiteIndex = (note: number) => {
    return whiteNotes.indexOf(note);
  };

  const getBlackKeyLeft = (note: number) => {
    // Find the white key that this black key sits after
    const prevWhiteNote = note - 1;
    const whiteIndex = whiteNotes.indexOf(prevWhiteNote);
    if (whiteIndex === -1) return 0;
    
    // Percentage-based position
    const whiteKeyWidth = 100 / whiteNotes.length;
    return (whiteIndex + 1) * whiteKeyWidth;
  };

  return (
    <div 
      className="w-full bg-[#111] border-t border-synth-border p-2 sm:p-4 h-40 sm:h-52 flex flex-col select-none touch-none shadow-[0_-15px_40px_rgba(0,0,0,0.6)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex-1 relative w-full max-w-6xl mx-auto h-full group">
        {/* White Keys */}
        <div className="flex w-full h-full">
          {whiteNotes.map((noteNumber) => {
            const noteName = NOTES[noteNumber % 12];
            const octave = Math.floor(noteNumber / 12) - 1;

            return (
              <div
                key={noteNumber}
                className={`flex-1 border-r last:border-r-0 border-zinc-400/50 bg-zinc-100 hover:bg-white relative shadow-[0_4px_0_rgba(0,0,0,0.2)] touch-none select-none ${
                  activeNotes.has(noteNumber) ? '!bg-orange-500 shadow-none' : ''
                }`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handlePointerDown(noteNumber);
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  handlePointerUp(noteNumber);
                }}
                onPointerCancel={(e) => {
                  e.preventDefault();
                  handlePointerUp(noteNumber);
                }}
                onPointerEnter={(e) => {
                  e.preventDefault();
                  if (e.pointerType === 'touch') return;
                  if (e.buttons === 1) handlePointerDown(noteNumber);
                }}
                onPointerLeave={(e) => {
                  e.preventDefault();
                  handlePointerLeave(noteNumber, e.pointerType);
                }}
              >
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-zinc-500 uppercase tracking-tighter opacity-50">
                  {noteName}{octave}
                </span>
              </div>
            );
          })}
        </div>

        {/* Black Keys */}
        {blackNotes.map((noteNumber) => {
          const left = getBlackKeyLeft(noteNumber);
          const whiteKeyWidthPercent = 100 / whiteNotes.length;
          
          return (
            <div
              key={noteNumber}
              className={`absolute top-0 h-[62%] z-10 shadow-2xl touch-none select-none ${
                activeNotes.has(noteNumber) 
                  ? 'bg-orange-600 shadow-none' 
                  : 'bg-zinc-900 hover:bg-zinc-800'
              }`}
              style={{
                left: `${left}%`,
                width: `${whiteKeyWidthPercent * 0.7}%`,
                transform: `translateX(-50%)`,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                handlePointerDown(noteNumber);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                handlePointerUp(noteNumber);
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                handlePointerUp(noteNumber);
              }}
              onPointerEnter={(e) => {
                e.preventDefault();
                if (e.pointerType === 'touch') return;
                if (e.buttons === 1) handlePointerDown(noteNumber);
              }}
              onPointerLeave={(e) => {
                e.preventDefault();
                handlePointerLeave(noteNumber, e.pointerType);
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-2 bg-white/10" />
            </div>
          );
        })}
      </div>
    </div>
  );
});
