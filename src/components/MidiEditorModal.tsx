import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Play, Pause, Square, Save, Download, Plus, Trash2, Volume2, VolumeX,
  Music, Wand2, Grid, ZoomIn, ZoomOut, Check, ChevronDown, ChevronUp, AlertCircle, RefreshCw, HardDrive, CloudUpload
} from 'lucide-react';
import { Midi } from '@tonejs/midi';
import { JupiterEngine } from '../engine/JupiterEngine';
import { soundfontService } from '../services/SoundfontService';
import { googleDriveService } from '../services/GoogleDriveService';
import { googleSheetsService } from '../services/GoogleSheetsService';
import { useSettings } from '../contexts/SettingsContext';

interface MidiEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFileName?: string;
  engine: JupiterEngine | null;
  onAssignToSong?: (fileName: string) => void;
}

interface EditorNote {
  id: string;
  note: number; // 0 - 127
  time: number; // seconds
  duration: number; // seconds
  velocity: number; // 0 - 1
}

interface EditorTrack {
  id: string;
  name: string;
  channel: number; // 0 - 15
  instrumentNumber: number; // 0 - 127
  muted: boolean;
  solo: boolean;
  color: string;
  notes: EditorNote[];
}

const TRACK_COLORS = [
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#f97316', // orange
  '#84cc16', // lime
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function getNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[midi % 12];
  return `${noteName}${octave}`;
}

const GM_INSTRUMENTS = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
  'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass', 'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'SynthStrings 1', 'SynthStrings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'SynthBrass 1', 'SynthBrass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)', 'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)', 'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)', 'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bag pipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'
];

export const MidiEditorModal: React.FC<MidiEditorModalProps> = ({
  isOpen,
  onClose,
  initialFileName,
  engine,
  onAssignToSong
}) => {
  const { settings } = useSettings();
  const [fileName, setFileName] = useState<string>(initialFileName || 'New_Backing_Track.mid');
  const [bpm, setBpm] = useState<number>(120);
  const [beatsPerBar, setBeatsPerBar] = useState<number>(4);
  const [tracks, setTracks] = useState<EditorTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string>('');
  const [tool, setTool] = useState<'pointer' | 'pencil' | 'eraser'>('pointer');
  const [gridSnap, setGridSnap] = useState<number>(0.25); // beat sub-division (1/4 beat = 16th note)
  
  // View Zoom & Dimensions
  const [pxPerBeat, setPxPerBeat] = useState<number>(120); // Horizontal scale: 120px per beat
  const [noteRowHeight, setNoteRowHeight] = useState<number>(18); // Vertical scale: 18px per note
  const [minNote, setMinNote] = useState<number>(36); // C2
  const [maxNote, setMaxNote] = useState<number>(84); // C6
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadTime, setPlayheadTime] = useState<number>(0);
  const playbackRef = useRef<{ isPlaying: boolean; startTime: number; pauseOffset: number; animationFrame: any }>({
    isPlaying: false,
    startTime: 0,
    pauseOffset: 0,
    animationFrame: null
  });

  // Storage / Status
  const [saveStatus, setSaveStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [showClickGenerator, setShowClickGenerator] = useState<boolean>(false);
  const [clickCountInBars, setClickCountInBars] = useState<number>(2);
  const [clickAccentNote, setClickAccentNote] = useState<number>(76); // High Woodblock
  const [clickUpbeatNote, setClickUpbeatNote] = useState<number>(77); // Low Woodblock

  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Load MIDI File on Mount or initialFileName change
  useEffect(() => {
    if (!isOpen) return;

    const loadMidi = async () => {
      if (initialFileName) {
        setFileName(initialFileName);
        try {
          const buffer = await soundfontService.getFileBuffer(initialFileName);
          const parsed = new Midi(buffer);

          if (parsed.header.tempos.length > 0) {
            setBpm(Math.round(parsed.header.tempos[0].bpm));
          }
          if (parsed.header.timeSignatures.length > 0) {
            setBeatsPerBar(parsed.header.timeSignatures[0].timeSignature[0]);
          }

          let noteIdCounter = 0;
          const loadedTracks: EditorTrack[] = parsed.tracks.map((t, idx) => ({
            id: `track-${idx}-${Date.now()}`,
            name: t.name || (t.channel === 9 ? 'Click / Drums' : `Track ${idx + 1}`),
            channel: t.channel,
            instrumentNumber: t.instrument.number || 0,
            muted: false,
            solo: false,
            color: TRACK_COLORS[idx % TRACK_COLORS.length],
            notes: t.notes.map(n => ({
              id: `note-${++noteIdCounter}`,
              note: n.midi,
              time: n.time,
              duration: n.duration,
              velocity: n.velocity
            }))
          }));

          if (loadedTracks.length === 0) {
            // Default empty track
            loadedTracks.push({
              id: `track-0-${Date.now()}`,
              name: 'Track 1',
              channel: 0,
              instrumentNumber: 0,
              muted: false,
              solo: false,
              color: TRACK_COLORS[0],
              notes: []
            });
          }

          setTracks(loadedTracks);
          setActiveTrackId(loadedTracks[0].id);

          // Calculate auto pitch range
          let minMidi = 127;
          let maxMidi = 0;
          loadedTracks.forEach(tr => {
            tr.notes.forEach(n => {
              if (n.note < minMidi) minMidi = n.note;
              if (n.note > maxMidi) maxMidi = n.note;
            });
          });
          if (minMidi <= maxMidi) {
            setMinNote(Math.max(0, minMidi - 5));
            setMaxNote(Math.min(127, maxMidi + 5));
          }
          return;
        } catch (err) {
          console.warn('Could not parse initial MIDI file, starting fresh project:', err);
        }
      }

      // Default fresh MIDI project with 1 track
      const defaultTrack: EditorTrack = {
        id: `track-0-${Date.now()}`,
        name: 'Track 1',
        channel: 0,
        instrumentNumber: 0,
        muted: false,
        solo: false,
        color: TRACK_COLORS[0],
        notes: []
      };
      setTracks([defaultTrack]);
      setActiveTrackId(defaultTrack.id);
    };

    loadMidi();
  }, [isOpen, initialFileName]);

  // Clean up playback on unmount
  useEffect(() => {
    return () => {
      if (playbackRef.current.animationFrame) {
        cancelAnimationFrame(playbackRef.current.animationFrame);
      }
    };
  }, []);

  const activeTrack = useMemo(() => {
    return tracks.find(t => t.id === activeTrackId) || tracks[0];
  }, [tracks, activeTrackId]);

  // Calculate Total Song Duration in Seconds
  const totalSongDuration = useMemo(() => {
    let maxTime = 16 * (60 / bpm); // minimum 16 beats (4 bars in 4/4)
    tracks.forEach(tr => {
      tr.notes.forEach(n => {
        if (n.time + n.duration > maxTime) {
          maxTime = n.time + n.duration;
        }
      });
    });
    return maxTime + (4 * (60 / bpm)); // add 4 padding beats at end
  }, [tracks, bpm]);

  const totalBeats = useMemo(() => {
    return Math.ceil(totalSongDuration / (60 / bpm));
  }, [totalSongDuration, bpm]);

  // Audition a note sound
  const playAuditionNote = (midiNote: number) => {
    if (!engine) return;
    engine.noteOn(midiNote, 0.8);
    setTimeout(() => {
      engine.noteOff(midiNote);
    }, 250);
  };

  // Playhead transport animation loop
  const startPlayback = () => {
    if (!engine) return;
    const ctx = engine.getCtx();
    if (!ctx) return;

    const secondsPerBeat = 60 / bpm;
    playbackRef.current.isPlaying = true;
    playbackRef.current.startTime = ctx.currentTime - playbackRef.current.pauseOffset;
    setIsPlaying(true);

    // Schedule all notes across active tracks
    tracks.forEach(t => {
      if (t.muted) return;
      const hasAnySolo = tracks.some(tr => tr.solo);
      if (hasAnySolo && !t.solo) return;

      t.notes.forEach(n => {
        if (n.time >= playbackRef.current.pauseOffset) {
          const startDelaySec = n.time - playbackRef.current.pauseOffset;
          const endDelaySec = (n.time + n.duration) - playbackRef.current.pauseOffset;

          setTimeout(() => {
            if (playbackRef.current.isPlaying) {
              engine.noteOn(n.note, n.velocity);
            }
          }, Math.max(0, startDelaySec * 1000));

          setTimeout(() => {
            engine.noteOff(n.note);
          }, Math.max(0, endDelaySec * 1000));
        }
      });
    });

    const updateFrame = () => {
      if (!playbackRef.current.isPlaying) return;
      const currentPos = ctx.currentTime - playbackRef.current.startTime;
      if (currentPos >= totalSongDuration) {
        stopPlayback();
        return;
      }
      setPlayheadTime(currentPos);
      playbackRef.current.animationFrame = requestAnimationFrame(updateFrame);
    };

    playbackRef.current.animationFrame = requestAnimationFrame(updateFrame);
  };

  const pausePlayback = () => {
    if (playbackRef.current.animationFrame) {
      cancelAnimationFrame(playbackRef.current.animationFrame);
    }
    playbackRef.current.isPlaying = false;
    playbackRef.current.pauseOffset = playheadTime;
    setIsPlaying(false);
    if (engine) engine.panic();
  };

  const stopPlayback = () => {
    if (playbackRef.current.animationFrame) {
      cancelAnimationFrame(playbackRef.current.animationFrame);
    }
    playbackRef.current.isPlaying = false;
    playbackRef.current.pauseOffset = 0;
    setPlayheadTime(0);
    setIsPlaying(false);
    if (engine) engine.panic();
  };

  // Note Manipulations
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>, midiNote: number) => {
    if (!gridContainerRef.current || !activeTrack) return;
    const rect = gridContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    
    // Convert X position to beat time in seconds
    const secondsPerBeat = 60 / bpm;
    const beatIndex = clickX / pxPerBeat;
    
    // Snap beat index to grid sub-division
    const snappedBeat = Math.round(beatIndex / gridSnap) * gridSnap;
    const timeInSeconds = snappedBeat * secondsPerBeat;
    const noteDuration = gridSnap * secondsPerBeat;

    if (tool === 'pencil') {
      playAuditionNote(midiNote);
      const newNote: EditorNote = {
        id: `note-${Date.now()}-${Math.random()}`,
        note: midiNote,
        time: Math.max(0, timeInSeconds),
        duration: noteDuration,
        velocity: 0.8
      };

      setTracks(prev => prev.map(tr => tr.id === activeTrackId ? { ...tr, notes: [...tr.notes, newNote] } : tr));
    }
  };

  const handleDeleteNote = (noteId: string) => {
    setTracks(prev => prev.map(tr => ({
      ...tr,
      notes: tr.notes.filter(n => n.id !== noteId)
    })));
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
  };

  // Add / Delete Track
  const handleAddTrack = () => {
    const newTrack: EditorTrack = {
      id: `track-${tracks.length}-${Date.now()}`,
      name: `Track ${tracks.length + 1}`,
      channel: (tracks.length % 15),
      instrumentNumber: 0,
      muted: false,
      solo: false,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
      notes: []
    };
    setTracks([...tracks, newTrack]);
    setActiveTrackId(newTrack.id);
  };

  const handleDeleteTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    const filtered = tracks.filter(t => t.id !== trackId);
    setTracks(filtered);
    if (activeTrackId === trackId) {
      setActiveTrackId(filtered[0].id);
    }
  };

  // Generate Click / Metronome Track
  const handleGenerateClickTrack = () => {
    const secondsPerBeat = 60 / bpm;
    const totalBeatsInSong = Math.max(16, totalBeats);
    const countInBeats = clickCountInBars * beatsPerBar;
    
    const clickNotes: EditorNote[] = [];
    const totalBeatsToGenerate = countInBeats + totalBeatsInSong;

    for (let b = 0; b < totalBeatsToGenerate; b++) {
      const isDownbeat = (b % beatsPerBar) === 0;
      const notePitch = isDownbeat ? clickAccentNote : clickUpbeatNote;
      const timeInSec = b * secondsPerBeat;

      clickNotes.push({
        id: `click-${b}-${Date.now()}`,
        note: notePitch,
        time: timeInSec,
        duration: 0.1, // short punchy click
        velocity: isDownbeat ? 1.0 : 0.7
      });
    }

    // Check if Click track already exists or add new
    const existingClickIdx = tracks.findIndex(t => t.channel === 9 || t.name.toLowerCase().includes('click'));
    if (existingClickIdx !== -1) {
      setTracks(prev => prev.map((tr, idx) => idx === existingClickIdx ? { ...tr, notes: clickNotes } : tr));
      setActiveTrackId(tracks[existingClickIdx].id);
    } else {
      const newClickTrack: EditorTrack = {
        id: `click-track-${Date.now()}`,
        name: 'Click / Metronome Track',
        channel: 9, // Drums / Percussion channel
        instrumentNumber: 115, // Woodblock
        muted: false,
        solo: false,
        color: '#f59e0b',
        notes: clickNotes
      };
      setTracks([newClickTrack, ...tracks]);
      setActiveTrackId(newClickTrack.id);
    }

    setShowClickGenerator(false);
    setSaveStatus({ type: 'success', message: `Generated ${clickNotes.length} click track events!` });
  };

  // Build ToneJS MIDI object & Save to OPFS + Google Drive
  const handleSaveMidi = async () => {
    setSaveStatus({ type: 'saving', message: 'Encoding MIDI file...' });

    try {
      const exportMidi = new Midi();
      exportMidi.name = fileName;
      exportMidi.header.tempos = [{ bpm, ticks: 0 }];
      exportMidi.header.timeSignatures = [{ timeSignature: [beatsPerBar, 4], ticks: 0 }];

      tracks.forEach(tr => {
        if (tr.notes.length === 0) return;
        const midiTrack = exportMidi.addTrack();
        midiTrack.name = tr.name;
        midiTrack.channel = tr.channel;
        midiTrack.instrument.number = tr.instrumentNumber;

        tr.notes.forEach(n => {
          midiTrack.addNote({
            midi: n.note,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity
          });
        });
      });

      const uint8 = exportMidi.toArray();
      const arrayBuffer = new Uint8Array(uint8).buffer as ArrayBuffer;

      // 1. Save locally in OPFS
      const sanitizedName = fileName.endsWith('.mid') || fileName.endsWith('.midi') ? fileName : `${fileName}.mid`;
      await soundfontService.saveFileToOPFS(sanitizedName, arrayBuffer);

      // 2. Upload to Google Drive if authorized
      let driveMessage = '';
      if (googleSheetsService.isConnected()) {
        const driveResult = await googleDriveService.uploadFileToDrive(
          sanitizedName,
          arrayBuffer,
          settings.googleDriveFolderId
        );
        if (driveResult.success) {
          driveMessage = ' & Uploaded to Google Drive!';
        } else {
          driveMessage = ` (Drive sync: ${driveResult.message})`;
        }
      } else {
        driveMessage = ' (Connect Google Drive in Settings to auto-sync)';
      }

      setSaveStatus({
        type: 'success',
        message: `Successfully saved "${sanitizedName}" to storage${driveMessage}`
      });

      if (onAssignToSong) {
        onAssignToSong(sanitizedName);
      }
    } catch (err: any) {
      console.error('Failed to save MIDI:', err);
      setSaveStatus({ type: 'error', message: err.message || 'Failed to save MIDI file' });
    }
  };

  // Direct Download
  const handleExportDownload = () => {
    try {
      const exportMidi = new Midi();
      exportMidi.name = fileName;
      exportMidi.header.tempos = [{ bpm, ticks: 0 }];
      exportMidi.header.timeSignatures = [{ timeSignature: [beatsPerBar, 4], ticks: 0 }];

      tracks.forEach(tr => {
        if (tr.notes.length === 0) return;
        const midiTrack = exportMidi.addTrack();
        midiTrack.name = tr.name;
        midiTrack.channel = tr.channel;
        midiTrack.instrument.number = tr.instrumentNumber;

        tr.notes.forEach(n => {
          midiTrack.addNote({
            midi: n.note,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity
          });
        });
      });

      const uint8 = exportMidi.toArray();
      const blob = new Blob([uint8], { type: 'audio/midi' });
      const sanitizedName = fileName.endsWith('.mid') || fileName.endsWith('.midi') ? fileName : `${fileName}.mid`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = sanitizedName;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err: any) {
      console.error('Export error:', err);
    }
  };

  if (!isOpen) return null;

  const secondsPerBeat = 60 / bpm;
  const noteRows: number[] = [];
  for (let n = maxNote; n >= minNote; n--) {
    noteRows.push(n);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 md:p-6 overflow-hidden">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden text-zinc-100 font-sans">
        
        {/* TOP HEADER BAR */}
        <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 text-amber-400 font-mono text-sm px-2 py-0.5 rounded focus:border-amber-500 outline-none w-64"
                />
                <span className="text-[10px] text-zinc-500 font-mono">MIDI Editor & Piano Roll</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowClickGenerator(true)}
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-mono font-medium flex items-center gap-1.5 transition-colors"
              title="Generate metronome click track with accent downbeats"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Generate Click Track
            </button>

            <button
              onClick={handleExportDownload}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export .MID
            </button>

            <button
              onClick={handleSaveMidi}
              disabled={saveStatus.type === 'saving'}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded text-xs font-mono flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all"
            >
              {saveStatus.type === 'saving' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save to Local & Drive
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SAVE STATUS NOTIFICATION BANNER */}
        {saveStatus.message && (
          <div className={`px-4 py-1.5 text-xs font-mono flex items-center justify-between border-b ${
            saveStatus.type === 'success' ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300' :
            saveStatus.type === 'error' ? 'bg-rose-950/60 border-rose-800/80 text-rose-300' :
            'bg-amber-950/60 border-amber-800/80 text-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              {googleSheetsService.isConnected() ? (
                <CloudUpload className="w-4 h-4 text-emerald-400" />
              ) : (
                <HardDrive className="w-4 h-4 text-amber-400" />
              )}
              <span>{saveStatus.message}</span>
            </div>
            <button
              onClick={() => setSaveStatus({ type: 'idle', message: '' })}
              className="text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TOOLBAR / TRANSPORT CONTROL BAR */}
        <div className="bg-zinc-900/90 border-b border-zinc-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shrink-0">
          
          {/* Transport Controls */}
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-1 rounded">
            {!isPlaying ? (
              <button
                onClick={startPlayback}
                className="p-1.5 bg-amber-500 text-black hover:bg-amber-400 rounded transition-colors"
                title="Play"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={pausePlayback}
                className="p-1.5 bg-amber-500 text-black hover:bg-amber-400 rounded transition-colors"
                title="Pause"
              >
                <Pause className="w-4 h-4 fill-current" />
              </button>
            )}
            <button
              onClick={stopPlayback}
              className="p-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>

            <div className="px-3 py-1 font-mono text-amber-400 bg-black/60 rounded text-xs border border-zinc-900">
              {playheadTime.toFixed(2)}s / Bar {Math.floor(playheadTime / (beatsPerBar * secondsPerBeat)) + 1}
            </div>
          </div>

          {/* Tempo & Time Signature */}
          <div className="flex items-center gap-4 bg-zinc-950 border border-zinc-800 px-3 py-1 rounded">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[10px] uppercase">BPM:</span>
              <input
                type="number"
                min={40}
                max={280}
                value={bpm}
                onChange={(e) => setBpm(Math.max(40, Math.min(280, Number(e.target.value))))}
                className="w-14 bg-zinc-900 border border-zinc-800 text-amber-400 font-mono text-center px-1 py-0.5 rounded focus:border-amber-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-3">
              <span className="text-zinc-400 text-[10px] uppercase">Time Sig:</span>
              <select
                value={beatsPerBar}
                onChange={(e) => setBeatsPerBar(Number(e.target.value))}
                className="bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono text-center px-1.5 py-0.5 rounded focus:border-amber-500 outline-none"
              >
                <option value={4}>4/4</option>
                <option value={3}>3/4</option>
                <option value={6}>6/8</option>
                <option value={2}>2/4</option>
              </select>
            </div>
          </div>

          {/* Editing Tools */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-1 rounded">
            <button
              onClick={() => setTool('pointer')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                tool === 'pointer' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
              title="Select / Move Tool"
            >
              Pointer
            </button>
            <button
              onClick={() => setTool('pencil')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                tool === 'pencil' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
              title="Pencil / Draw Note Tool"
            >
              Draw
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                tool === 'eraser' ? 'bg-rose-500 text-white font-bold' : 'text-zinc-400 hover:text-white'
              }`}
              title="Eraser / Delete Tool"
            >
              Eraser
            </button>
          </div>

          {/* Grid Snap & Zoom */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[10px] uppercase">Snap:</span>
              <select
                value={gridSnap}
                onChange={(e) => setGridSnap(Number(e.target.value))}
                className="bg-zinc-950 border border-zinc-800 text-amber-400 text-[11px] px-2 py-1 rounded outline-none"
              >
                <option value={1}>1/4 (Beat)</option>
                <option value={0.5}>1/8 Note</option>
                <option value={0.25}>1/16 Note</option>
                <option value={0.125}>1/32 Note</option>
              </select>
            </div>

            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-1 rounded">
              <button
                onClick={() => setPxPerBeat(Math.max(40, pxPerBeat - 20))}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
                title="Zoom Out Timeline"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-zinc-500 font-mono px-1">{pxPerBeat}px</span>
              <button
                onClick={() => setPxPerBeat(Math.min(300, pxPerBeat + 20))}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
                title="Zoom In Timeline"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* MAIN BODY: TRACK SIDEBAR + PIANO ROLL STAGE */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* TRACKS SIDEBAR (LEFT) */}
          <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0 overflow-hidden">
            <div className="p-2.5 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-zinc-300 uppercase tracking-wider text-[10px]">MIDI Tracks ({tracks.length})</span>
              <button
                onClick={handleAddTrack}
                className="p-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded flex items-center gap-1 text-[10px]"
                title="Add New Track"
              >
                <Plus className="w-3 h-3" />
                Add Track
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {tracks.map((tr) => {
                const isActive = tr.id === activeTrackId;
                return (
                  <div
                    key={tr.id}
                    onClick={() => setActiveTrackId(tr.id)}
                    className={`p-2.5 rounded border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-zinc-900 border-amber-500/60 shadow-md'
                        : 'bg-zinc-900/40 border-zinc-850 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tr.color }}
                        />
                        <input
                          type="text"
                          value={tr.name}
                          onChange={(e) => {
                            const newName = e.target.value;
                            setTracks(prev => prev.map(t => t.id === tr.id ? { ...t, name: newName } : t));
                          }}
                          className="bg-transparent text-xs font-semibold text-zinc-200 outline-none truncate focus:bg-zinc-950 px-1 rounded"
                        />
                      </div>
                      
                      {tracks.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrack(tr.id);
                          }}
                          className="text-zinc-600 hover:text-rose-400 p-0.5"
                          title="Delete Track"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Track Instrument & Channel */}
                    <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-zinc-400 mb-2">
                      <div>
                        <span className="text-zinc-600">Ch:</span> {tr.channel === 9 ? '10 (Drums)' : tr.channel + 1}
                      </div>
                      <div>
                        <span className="text-zinc-600">Notes:</span> {tr.notes.length}
                      </div>
                    </div>

                    <select
                      value={tr.instrumentNumber}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTracks(prev => prev.map(t => t.id === tr.id ? { ...t, instrumentNumber: val } : t));
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 p-1 rounded font-mono truncate outline-none focus:border-amber-500"
                    >
                      {GM_INSTRUMENTS.map((inst, idx) => (
                        <option key={idx} value={idx}>
                          {idx + 1}. {inst}
                        </option>
                      ))}
                    </select>

                    {/* Mute & Solo Toggles */}
                    <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-zinc-800/60 text-[10px] font-mono">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTracks(prev => prev.map(t => t.id === tr.id ? { ...t, muted: !t.muted } : t));
                        }}
                        className={`px-2 py-0.5 rounded border transition-colors ${
                          tr.muted ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        Mute
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTracks(prev => prev.map(t => t.id === tr.id ? { ...t, solo: !t.solo } : t));
                        }}
                        className={`px-2 py-0.5 rounded border transition-colors ${
                          tr.solo ? 'bg-amber-500 text-black border-amber-500 font-bold' : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        Solo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PIANO ROLL CANVAS STAGE (RIGHT) */}
          <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
            
            {/* TIMELINE RULER (TOP) */}
            <div className="h-7 bg-zinc-900 border-b border-zinc-800 flex items-center shrink-0 overflow-hidden font-mono text-[10px] text-zinc-400 relative">
              <div className="w-16 border-r border-zinc-800 shrink-0 h-full flex items-center justify-center font-bold text-zinc-500">
                Key
              </div>
              <div
                className="flex-1 h-full relative cursor-pointer overflow-x-hidden"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const newTime = (clickX / pxPerBeat) * secondsPerBeat;
                  setPlayheadTime(Math.max(0, newTime));
                  playbackRef.current.pauseOffset = Math.max(0, newTime);
                }}
              >
                {/* Render measure numbers */}
                {Array.from({ length: totalBeats }).map((_, beatIdx) => {
                  const isMeasure = (beatIdx % beatsPerBar) === 0;
                  const leftPx = beatIdx * pxPerBeat;
                  return (
                    <div
                      key={beatIdx}
                      className="absolute top-0 bottom-0 border-l border-zinc-800 flex items-center pl-1 select-none"
                      style={{ left: `${leftPx}px` }}
                    >
                      {isMeasure && (
                        <span className="font-bold text-amber-400/90">
                          {Math.floor(beatIdx / beatsPerBar) + 1}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* PLAYHEAD SCRUB LINE */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-30 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                  style={{ left: `${(playheadTime / secondsPerBeat) * pxPerBeat}px` }}
                />
              </div>
            </div>

            {/* GRID + PIANO KEYBOARD SCROLL AREA */}
            <div className="flex-1 overflow-auto custom-scrollbar flex relative" ref={gridContainerRef}>
              
              {/* PIANO KEYBOARD (LEFT COLUMN) */}
              <div className="w-16 bg-zinc-900 border-r border-zinc-800 shrink-0 sticky left-0 z-20 font-mono text-[9px]">
                {noteRows.map((midiNote) => {
                  const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
                  const isC = (midiNote % 12) === 0;
                  return (
                    <div
                      key={midiNote}
                      onClick={() => playAuditionNote(midiNote)}
                      style={{ height: `${noteRowHeight}px` }}
                      className={`border-b border-zinc-800/60 flex items-center justify-end pr-1 cursor-pointer select-none transition-colors ${
                        isBlackKey
                          ? 'bg-zinc-950 text-zinc-400 hover:bg-amber-500/20'
                          : 'bg-zinc-800/80 text-zinc-200 hover:bg-amber-500/30'
                      }`}
                    >
                      <span className={isC ? 'font-bold text-amber-400' : ''}>
                        {getNoteName(midiNote)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* MIDI NOTE GRID AREA */}
              <div
                className="flex-1 relative bg-zinc-950 cursor-crosshair"
                style={{
                  width: `${totalBeats * pxPerBeat}px`,
                  height: `${noteRows.length * noteRowHeight}px`
                }}
              >
                {/* Horizontal Pitch Lines */}
                {noteRows.map((midiNote, rowIdx) => {
                  const isBlackKey = [1, 3, 6, 8, 10].includes(midiNote % 12);
                  return (
                    <div
                      key={midiNote}
                      onClick={(e) => handleGridClick(e, midiNote)}
                      style={{
                        top: `${rowIdx * noteRowHeight}px`,
                        height: `${noteRowHeight}px`
                      }}
                      className={`absolute left-0 right-0 border-b border-zinc-900/80 ${
                        isBlackKey ? 'bg-zinc-950/90' : 'bg-zinc-900/30'
                      }`}
                    />
                  );
                })}

                {/* Vertical Beat Lines */}
                {Array.from({ length: totalBeats }).map((_, beatIdx) => {
                  const isMeasure = (beatIdx % beatsPerBar) === 0;
                  const leftPx = beatIdx * pxPerBeat;
                  return (
                    <div
                      key={beatIdx}
                      className={`absolute top-0 bottom-0 pointer-events-none ${
                        isMeasure ? 'border-l border-zinc-800/80' : 'border-l border-zinc-900/40'
                      }`}
                      style={{ left: `${leftPx}px` }}
                    />
                  );
                })}

                {/* RENDER ALL NOTES ACROSS TRACKS */}
                {tracks.map((tr) => {
                  if (tr.muted) return null;
                  return tr.notes.map((n) => {
                    if (n.note < minNote || n.note > maxNote) return null;

                    const rowIndex = maxNote - n.note;
                    const topPx = rowIndex * noteRowHeight;
                    const leftPx = (n.time / secondsPerBeat) * pxPerBeat;
                    const widthPx = Math.max(8, (n.duration / secondsPerBeat) * pxPerBeat);
                    const isSelected = selectedNoteIds.has(n.id);

                    return (
                      <div
                        key={n.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tool === 'eraser') {
                            handleDeleteNote(n.id);
                          } else {
                            playAuditionNote(n.note);
                            setSelectedNoteIds(new Set([n.id]));
                          }
                        }}
                        style={{
                          top: `${topPx + 1}px`,
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                          height: `${noteRowHeight - 2}px`,
                          backgroundColor: tr.color,
                          opacity: n.velocity * 0.4 + 0.6
                        }}
                        className={`absolute rounded-xs cursor-pointer select-none text-[8px] font-mono text-black font-bold flex items-center px-1 truncate shadow border ${
                          isSelected ? 'ring-2 ring-white border-white z-20' : 'border-black/30 hover:brightness-125 z-10'
                        }`}
                        title={`${getNoteName(n.note)} | Beat: ${(n.time / secondsPerBeat).toFixed(2)} | Vel: ${Math.round(n.velocity * 127)}`}
                      >
                        {widthPx > 24 && (
                          <span className="truncate drop-shadow">{getNoteName(n.note)}</span>
                        )}
                      </div>
                    );
                  });
                })}

                {/* PLAYHEAD LINE IN GRID */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-30 pointer-events-none shadow-[0_0_10px_rgba(245,158,11,0.9)]"
                  style={{ left: `${(playheadTime / secondsPerBeat) * pxPerBeat}px` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CLICK TRACK GENERATOR MODAL DIALOG */}
      {showClickGenerator && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg max-w-md w-full p-4 space-y-4 font-sans text-zinc-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2 text-amber-400 font-mono font-bold text-sm">
                <Wand2 className="w-4 h-4" />
                Generate Metronome Click Track
              </div>
              <button
                onClick={() => setShowClickGenerator(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-zinc-400 mb-1">Count-In Bars:</label>
                <select
                  value={clickCountInBars}
                  onChange={(e) => setClickCountInBars(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-800 text-amber-400 p-2 rounded focus:border-amber-500 outline-none"
                >
                  <option value={1}>1 Bar Count-In</option>
                  <option value={2}>2 Bars Count-In</option>
                  <option value={4}>4 Bars Count-In</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Downbeat Pitch:</label>
                  <select
                    value={clickAccentNote}
                    onChange={(e) => setClickAccentNote(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 p-2 rounded focus:border-amber-500 outline-none"
                  >
                    <option value={76}>High Woodblock (76)</option>
                    <option value={80}>Mute Cuica (80)</option>
                    <option value={75}>Claves (75)</option>
                    <option value={37}>Side Stick (37)</option>
                    <option value={56}>Cowbell (56)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Upbeat Pitch:</label>
                  <select
                    value={clickUpbeatNote}
                    onChange={(e) => setClickUpbeatNote(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 p-2 rounded focus:border-amber-500 outline-none"
                  >
                    <option value={77}>Low Woodblock (77)</option>
                    <option value={81}>Open Cuica (81)</option>
                    <option value={75}>Claves (75)</option>
                    <option value={37}>Side Stick (37)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowClickGenerator(false)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded text-xs font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateClickTrack}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded text-xs font-mono shadow-md"
              >
                Generate Click Track
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
