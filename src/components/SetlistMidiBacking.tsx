import React, { useEffect, useState, useRef } from 'react';
import { Play, Square, Pause, Music, Sliders, Wand2, Volume2, VolumeX, ChevronDown, ChevronUp, Search, X, Activity, Edit3, Radio, Disc } from 'lucide-react';
import { Song, Patch, Multi } from '../types';
import { midiTrackService, ParsedMidiFile, LeadInInfo } from '../services/MidiTrackService';
import { audioClickTrackService, AudioClickSongPair } from '../services/AudioClickTrackService';
import { soundfontService } from '../services/SoundfontService';
import { JupiterEngine } from '../engine/JupiterEngine';
import { useSettings } from '../contexts/SettingsContext';
import { MidiEditorModal } from './MidiEditorModal';
import { AudioWaveform } from './AudioWaveform';
import { ClickProgressIndicator } from './ClickProgressIndicator';

interface SearchableSoundSelectProps {
  value: string;
  onChange: (patchId: string) => void;
  patches: Patch[];
}

const SearchableSoundSelect: React.FC<SearchableSoundSelectProps> = ({ value, onChange, patches }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedPatch = patches.find(p => p.id === value);
  const selectedLabel = selectedPatch ? selectedPatch.name : '-- Select Sound --';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredPatches = patches.filter(p => {
    const query = search.toLowerCase();
    const nameMatch = p.name.toLowerCase().includes(query);
    const engineMatch = p.engineType ? p.engineType.toLowerCase().includes(query) : false;
    return nameMatch || engineMatch;
  });

  return (
    <div className="relative w-full text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-300 px-2 py-1 focus:border-amber-500 outline-none w-full flex items-center justify-between gap-1 truncate rounded-none hover:bg-zinc-800 transition-colors"
        title={selectedLabel}
      >
        <span className={`truncate text-left font-bold ${selectedPatch ? 'text-amber-400/90' : 'text-zinc-500 font-normal italic'}`}>
          {selectedLabel}
        </span>
        <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-zinc-950 border border-zinc-700 shadow-2xl z-50 p-1.5 space-y-1.5 max-h-60 flex flex-col">
          <div className="relative flex items-center">
            <Search className="w-3 h-3 absolute left-2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patch..."
              className="w-full bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-200 pl-6 pr-6 py-1 focus:border-amber-500 outline-none font-mono"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-1.5 text-zinc-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 custom-scrollbar space-y-0.5 max-h-40">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setSearch('');
              }}
              className={`w-full text-left px-2 py-1 text-[9px] font-mono hover:bg-zinc-800 transition-colors ${
                value === '' ? 'bg-amber-500/20 text-amber-400 font-bold' : 'text-zinc-400'
              }`}
            >
              -- None (Muted) --
            </button>

            {filteredPatches.length === 0 ? (
              <div className="px-2 py-1.5 text-[9px] text-zinc-600 font-mono italic text-center">
                No patches found
              </div>
            ) : (
              filteredPatches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-2 py-1 text-[9px] font-mono hover:bg-amber-500/10 hover:text-amber-300 transition-colors truncate flex items-center justify-between gap-2 ${
                    value === p.id ? 'bg-amber-500/20 text-amber-400 font-bold' : 'text-zinc-300'
                  }`}
                  title={p.name}
                >
                  <span className="truncate">{p.name}</span>
                  {p.engineType && (
                    <span className="text-[7px] uppercase tracking-wider px-1 py-0.5 bg-zinc-800 text-zinc-400 shrink-0">
                      {p.engineType}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SetlistMidiBackingProps {
  song: Song;
  setlistId: string;
  patches: Patch[];
  multis: Multi[];
  engine: JupiterEngine | null;
  onUpdateSong: (updatedSong: Song) => void;
  onAddPatchesAndMulti: (newPatches: Patch[], newMulti: Multi) => void;
  onLoadSong?: (song: Song) => void;
}

export const SetlistMidiBacking: React.FC<SetlistMidiBackingProps> = ({
  song,
  patches,
  engine,
  onUpdateSong,
  onAddPatchesAndMulti,
  onLoadSong,
}) => {
  const { settings, updateSettings } = useSettings();
  const [midiFiles, setMidiFiles] = useState<string[]>([]);
  const [audioClickPairs, setAudioClickPairs] = useState<AudioClickSongPair[]>([]);
  const [parsedMidi, setParsedMidi] = useState<ParsedMidiFile | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; duration: number }>({ current: 0, duration: 0 });
  const [activeTrackIndexes, setActiveTrackIndexes] = useState<Set<number>>(new Set());
  const [leadInState, setLeadInState] = useState<LeadInInfo | null>(null);
  const [showTrackDetails, setShowTrackDetails] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  const isAudioClickSong = song.trackType === 'audio_click' || !!song.clickAudioFile || !!song.soundAudioFile;

  useEffect(() => {
    soundfontService.listDownloadedMidiFiles().then(setMidiFiles);
    soundfontService.listDownloadedFiles().then(files => {
      setAudioClickPairs(audioClickTrackService.detectAudioClickTracks(files));
    });
    
    const handleUpdate = () => {
      soundfontService.listDownloadedMidiFiles().then(setMidiFiles);
      soundfontService.listDownloadedFiles().then(files => {
        setAudioClickPairs(audioClickTrackService.detectAudioClickTracks(files));
      });
    };

    window.addEventListener('soundfontsUpdated', handleUpdate);
    return () => window.removeEventListener('soundfontsUpdated', handleUpdate);
  }, []);

  // Audio click track progress listener
  useEffect(() => {
    if (!isAudioClickSong) return;
    const unsub = audioClickTrackService.addProgressListener((cur, dur, playing) => {
      if (playing !== isPlayingRef.current) {
        isPlayingRef.current = playing;
        setIsPlaying(playing);
      }
      setProgress({ current: cur, duration: dur });
    });
    return unsub;
  }, [isAudioClickSong]);

  useEffect(() => {
    if (song.midiFile && !isAudioClickSong) {
      midiTrackService
        .parseMidiFile(song.midiFile)
        .then(setParsedMidi)
        .catch(err => {
          console.error('Failed to parse assigned MIDI file:', err);
          setParsedMidi(null);
        });
    } else {
      setParsedMidi(null);
    }
  }, [song.midiFile, isAudioClickSong]);

  const isPlayingRef = useRef<boolean>(false);
  const lastProgressRef = useRef<number>(0);
  const activeTracksKeyRef = useRef<string>('');
  const leadInKeyRef = useRef<string>('');

  useEffect(() => {
    if (isAudioClickSong) return;

    const unsub = midiTrackService.addProgressListener((cur, dur, playing, activeTracks, lInInfo) => {
      if (song.midiFile && midiTrackService.getPlayingFileName() === song.midiFile) {
        if (playing !== isPlayingRef.current) {
          isPlayingRef.current = playing;
          setIsPlaying(playing);
        }

        const now = Date.now();
        if (now - lastProgressRef.current >= 250 || playing !== isPlayingRef.current) {
          lastProgressRef.current = now;
          setProgress({ current: cur, duration: dur });
        }

        const tracksKey = activeTracks ? Array.from(activeTracks).sort().join(',') : '';
        if (tracksKey !== activeTracksKeyRef.current) {
          activeTracksKeyRef.current = tracksKey;
          setActiveTrackIndexes(activeTracks || new Set());
        }

        const lKey = lInInfo ? `${lInInfo.currentBar}:${lInInfo.currentBeat}:${lInInfo.isLeadIn}` : '';
        if (lKey !== leadInKeyRef.current) {
          leadInKeyRef.current = lKey;
          setLeadInState(lInInfo || null);
        }
      } else {
        if (isPlayingRef.current) {
          isPlayingRef.current = false;
          setIsPlaying(false);
        }
        if (activeTracksKeyRef.current !== '') {
          activeTracksKeyRef.current = '';
          setActiveTrackIndexes(new Set());
        }
        if (leadInKeyRef.current !== '') {
          leadInKeyRef.current = '';
          setLeadInState(null);
        }
      }
    });
    return unsub;
  }, [song.midiFile, isAudioClickSong]);

  const handleMidiSelect = (fileName: string) => {
    onUpdateSong({
      ...song,
      trackType: 'midi',
      midiFile: fileName || undefined,
      midiTrackOverrides: {},
    });
  };

  const handleAudioPairSelect = (pairSongName: string) => {
    if (!pairSongName) {
      onUpdateSong({
        ...song,
        trackType: 'none',
        clickAudioFile: undefined,
        soundAudioFile: undefined,
      });
      return;
    }
    const found = audioClickPairs.find(p => p.songName === pairSongName);
    if (found) {
      onUpdateSong({
        ...song,
        trackType: 'audio_click',
        clickAudioFile: found.clickFile,
        soundAudioFile: found.soundFile,
        bpm: song.bpm || 120,
      });
    }
  };

  const handleBpmChange = (newBpm: number) => {
    onUpdateSong({
      ...song,
      bpm: newBpm,
    });
    if (engine) {
      engine.params.bpm = newBpm;
    }
  };

  const handleLeadInChange = (leadInBars: number) => {
    onUpdateSong({
      ...song,
      leadInBars,
    });
  };

  const handleTogglePlay = async () => {
    if (!engine) return;

    if (isAudioClickSong) {
      if (isPlaying) {
        audioClickTrackService.pausePlayback(engine);
        setIsPlaying(false);
      } else {
        if (onLoadSong) {
          onLoadSong(song);
        }
        const ok = await audioClickTrackService.startPlayback({
          clickFile: song.clickAudioFile,
          soundFile: song.soundAudioFile,
          engine,
          startOffset: progress.current,
          bpm: song.bpm || 120,
        });
        if (ok) setIsPlaying(true);
      }
      return;
    }

    if (!song.midiFile) return;

    if (isPlaying) {
      midiTrackService.pausePlayback(engine);
      setIsPlaying(false);
    } else {
      if (onLoadSong) {
        onLoadSong(song);
      }
      await midiTrackService.startPlayback(
        song.midiFile,
        engine,
        song.midiTrackOverrides,
        progress.current,
        song.leadInBars || 0,
        patches,
        song.autoGMMode ?? false
      );
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (engine) {
      if (isAudioClickSong) {
        audioClickTrackService.stopPlayback(engine);
      } else {
        midiTrackService.stopPlayback(engine);
      }
    }
    setIsPlaying(false);
    setProgress({ current: 0, duration: isAudioClickSong ? progress.duration : (parsedMidi?.duration || 0) });
    setActiveTrackIndexes(new Set());
    setLeadInState(null);
  };

  const handleSeek = (seconds: number) => {
    if (isAudioClickSong && engine) {
      audioClickTrackService.seekPlayback(seconds, engine);
    }
  };

  const handleGenerateGM = async () => {
    if (!song.midiFile) return;
    setIsGenerating(true);
    try {
      const { multi, newPatches } = await midiTrackService.generateMultiFromMidi(song.midiFile);
      onAddPatchesAndMulti(newPatches, multi);
      onUpdateSong({
        ...song,
        type: 'multi',
        targetId: multi.id,
      });
    } catch (e) {
      console.error('Error generating GM Multi from MIDI:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTrackMuteToggle = (trackIdx: number) => {
    const overrides = { ...(song.midiTrackOverrides || {}) };
    const current = overrides[trackIdx] || {};
    const newMute = !current.mute;
    overrides[trackIdx] = { ...current, mute: newMute };
    const updatedSong = { ...song, midiTrackOverrides: overrides };
    onUpdateSong(updatedSong);

    if (isPlaying && engine && song.midiFile) {
      midiTrackService.startPlayback(
        song.midiFile,
        engine,
        overrides,
        progress.current,
        song.leadInBars || 0,
        patches,
        song.autoGMMode ?? false
      );
    }
  };

  const handleTrackSoloToggle = (trackIdx: number) => {
    const overrides = { ...(song.midiTrackOverrides || {}) };
    const current = overrides[trackIdx] || {};
    const newSolo = !current.solo;
    overrides[trackIdx] = { ...current, solo: newSolo };
    const updatedSong = { ...song, midiTrackOverrides: overrides };
    onUpdateSong(updatedSong);

    if (isPlaying && engine && song.midiFile) {
      midiTrackService.startPlayback(
        song.midiFile,
        engine,
        overrides,
        progress.current,
        song.leadInBars || 0,
        patches,
        song.autoGMMode ?? false
      );
    }
  };

  const handleTrackPatchChange = (trackIdx: number, patchId: string) => {
    const overrides = { ...(song.midiTrackOverrides || {}) };
    const current = overrides[trackIdx] || {};
    overrides[trackIdx] = { ...current, patchId };
    const updatedSong = { ...song, midiTrackOverrides: overrides };
    onUpdateSong(updatedSong);

    if (isPlaying && engine && song.midiFile) {
      midiTrackService.startPlayback(
        song.midiFile,
        engine,
        overrides,
        progress.current,
        song.leadInBars || 0,
        patches,
        song.autoGMMode ?? false
      );
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const currentLeadIn = song.leadInBars || 0;
  const isAutoGM = song.autoGMMode ?? false;

  return (
    <div className="mt-3 p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-none text-xs space-y-2.5">
      {/* Track Type Switcher */}
      <div className="flex items-center gap-1 bg-black p-1 border border-zinc-800">
        <button
          type="button"
          onClick={() => onUpdateSong({ ...song, trackType: 'midi' })}
          className={`flex-1 py-1 px-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
            !isAudioClickSong ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          MIDI Backing Track
        </button>
        <button
          type="button"
          onClick={() => onUpdateSong({ ...song, trackType: 'audio_click', bpm: song.bpm || 120 })}
          className={`flex-1 py-1 px-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
            isAudioClickSong ? 'bg-cyan-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Dual Audio Click Track
        </button>
        <button
          type="button"
          onClick={() => onUpdateSong({ ...song, midiReceive: song.midiReceive === false ? true : false })}
          className={`py-1 px-2.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all border shrink-0 ${
            song.midiReceive !== false
              ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-300'
              : 'bg-red-950/80 border-red-500/80 text-red-300'
          }`}
          title={song.midiReceive !== false ? "MIDI Receive is ON: Synth responds to incoming notes" : "MIDI Receive is OFF: Clicktrack only (external synth in use)"}
        >
          MIDI RX: {song.midiReceive !== false ? 'ON' : 'OFF'}
        </button>
      </div>

      {isAudioClickSong ? (
        /* DUAL AUDIO CLICK TRACK UI */
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                WAV DUAL AUDIO TRACK (CLICK + SOUND)
              </span>
            </div>

            {/* Manual BPM Setter */}
            <div className="flex items-center gap-1.5 bg-black border border-zinc-800 px-2 py-1">
              <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase">MANUAL BPM:</span>
              <button
                type="button"
                onClick={() => handleBpmChange(Math.max(40, (song.bpm || 120) - 1))}
                className="px-1.5 text-zinc-400 hover:text-white font-bold"
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
                  if (!isNaN(val)) handleBpmChange(val);
                }}
                className="w-12 bg-transparent text-amber-400 text-center font-mono font-bold outline-none"
              />
              <button
                type="button"
                onClick={() => handleBpmChange(Math.min(280, (song.bpm || 120) + 1))}
                className="px-1.5 text-zinc-400 hover:text-white font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Audio Pair Selector Dropdown */}
          <div className="w-full flex items-center gap-2">
            <select
              value={
                audioClickPairs.find(
                  p => (p.clickFile && p.clickFile === song.clickAudioFile) ||
                       (p.soundFile && p.soundFile === song.soundAudioFile)
                )?.songName || ''
              }
              onChange={(e) => handleAudioPairSelect(e.target.value)}
              className="flex-1 bg-black border border-zinc-800 text-cyan-300 font-mono text-[11px] p-2 focus:border-cyan-500 outline-none rounded-none cursor-pointer truncate"
            >
              <option value="">-- SELECT AUDIO CLICK TRACK PAIR --</option>
              {audioClickPairs.map((pair) => (
                <option key={pair.songName} value={pair.songName}>
                  {pair.songName.toUpperCase()} ({pair.clickFile || 'no click'} + {pair.soundFile || 'no sound'})
                </option>
              ))}
            </select>
          </div>

          {/* Transport Controls Bar for Audio Track */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-black/60 p-2 border border-zinc-900">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePlay}
                disabled={!song.clickAudioFile && !song.soundAudioFile}
                className={`p-1.5 border transition-all shrink-0 ${
                  isPlaying
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'bg-zinc-900 text-amber-400 border-zinc-800 hover:border-amber-500/50 disabled:opacity-50'
                }`}
                title={isPlaying ? 'Pause Audio Track' : 'Play Audio Track'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={handleStop}
                disabled={!song.clickAudioFile && !song.soundAudioFile}
                className="p-1.5 bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition-all shrink-0 disabled:opacity-50"
                title="Stop Audio Track"
              >
                <Square className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="text-amber-400 font-bold">{formatTime(progress.current)}</span>
                <span className="text-zinc-600">/</span>
                <span>{formatTime(progress.duration)}</span>
                <span className="text-cyan-400 font-bold">({song.bpm || 120} BPM)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateSettings({ enableSurround51: !settings.enableSurround51 })}
              className={`px-2 py-1 text-[8px] font-bold uppercase tracking-wider border transition-all rounded-none ${
                settings.enableSurround51
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
              }`}
              title="5.1 Surround Output: Sound -> Front Ch 0/1, Click -> Rear Ch 4/5"
            >
              5.1 Click: {settings.enableSurround51 ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Interactive Waveform with Moving Cursor */}
          {(song.clickAudioFile || song.soundAudioFile) && (
            <AudioWaveform
              song={song}
              currentTime={progress.current}
              duration={progress.duration}
              isPlaying={isPlaying}
              onSeek={handleSeek}
              onBpmChange={handleBpmChange}
              audioContext={engine?.ctx}
            />
          )}
        </div>
      ) : (
        /* MIDI BACKING TRACK UI */
        <>
          <div className="flex flex-col gap-2 border-b border-zinc-900 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Music className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                MIDI Click & Backing Track
              </span>
            </div>

            {/* Lead-in count-in selection */}
            <div className="flex items-center gap-1 bg-black border border-zinc-800 px-1.5 py-1">
              <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Lead-in:</span>
              {[0, 1, 2, 4].map((bars) => (
                <button
                  key={bars}
                  type="button"
                  onClick={() => handleLeadInChange(bars)}
                  className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-all ${
                    currentLeadIn === bars
                      ? 'bg-amber-500 text-black font-bold'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  {bars === 0 ? 'OFF' : `${bars}B`}
                </button>
              ))}
            </div>
          </div>

          {/* Backing Track Combo Dropdown & Edit Button */}
          <div className="w-full flex items-center gap-2">
            <select
              value={song.midiFile || ''}
              onChange={(e) => handleMidiSelect(e.target.value)}
              className="flex-1 bg-black border border-zinc-800 text-amber-400 font-mono text-[11px] p-2 focus:border-amber-500 outline-none rounded-none cursor-pointer truncate"
            >
              <option value="">-- NO BACKING TRACK --</option>
              {midiFiles.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsEditorOpen(true)}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-[11px] flex items-center gap-1.5 transition-colors shrink-0 shadow-md"
              title="Open Signal MIDI Piano Roll Editor to edit click & backing tracks"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{song.midiFile ? 'Edit MIDI' : 'New MIDI Editor'}</span>
            </button>
          </div>

          {song.midiFile && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                const newAutoGM = !isAutoGM;
                onUpdateSong({ ...song, autoGMMode: newAutoGM });
                if (isPlaying && engine) {
                  midiTrackService.startPlayback(
                    song.midiFile!,
                    engine,
                    song.midiTrackOverrides,
                    progress.current,
                    song.leadInBars || 0,
                    patches,
                    newAutoGM
                  );
                }
              }}
              className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider border transition-all ${
                isAutoGM
                  ? 'bg-amber-500 text-black border-amber-500 font-bold'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
              title="When Auto GM is OFF, only tracks with assigned custom patches will play sound."
            >
              Auto GM: {isAutoGM ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={handleGenerateGM}
              disabled={isGenerating}
              className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all rounded-none"
              title="Auto-create General MIDI Patches and Multi for each track"
            >
              <Wand2 className="w-3 h-3" />
              {isGenerating ? 'Generating...' : 'Auto GM Multi'}
            </button>
          </div>
        )}
      </div>

      {/* MIDI Editor Modal */}
      <MidiEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        initialFileName={song.midiFile}
        songName={song.name}
        songBpm={song.bpm}
        engine={engine}
        onAssignToSong={(newFileName, newBpm) => {
          handleMidiSelect(newFileName);
          if (newBpm && onUpdateSong) {
            onUpdateSong({ ...song, midiFile: newFileName, bpm: newBpm });
          }
          soundfontService.listDownloadedMidiFiles().then(setMidiFiles);
        }}
      />

      {parsedMidi && (
        <div className="space-y-2">
          {/* Lead-in Active Banner */}
          {leadInState?.isLeadIn && (
            <div className="bg-amber-500/20 border border-amber-500/60 p-2 text-center text-amber-400 font-mono text-[11px] font-bold tracking-widest animate-pulse flex items-center justify-center gap-2">
              <Activity className="w-4 h-4 text-amber-400 animate-spin" />
              <span>
                COUNT-IN: BAR {leadInState.currentBar} / {leadInState.totalBars} — BEAT {leadInState.currentBeat}
              </span>
            </div>
          )}

          {/* Transport Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-black/60 p-2 border border-zinc-900">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <button
                onClick={handleTogglePlay}
                className={`p-1.5 border transition-all shrink-0 ${
                  isPlaying
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'bg-zinc-900 text-amber-400 border-zinc-800 hover:border-amber-500/50'
                }`}
                title={isPlaying ? 'Pause Backing Track' : 'Play Backing Track'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={handleStop}
                className="p-1.5 bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition-all shrink-0"
                title="Stop Backing Track"
              >
                <Square className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="text-amber-400 font-bold">{formatTime(progress.current)}</span>
                <span className="text-zinc-600">/</span>
                <span>{formatTime(parsedMidi.duration)}</span>
                <span className="text-zinc-500 text-[9px] font-sans">({parsedMidi.bpm} BPM)</span>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-zinc-900/80">
              <button
                type="button"
                onClick={() => updateSettings({ enableSurround51: !settings.enableSurround51 })}
                className={`px-2 py-1 text-[8px] font-bold uppercase tracking-wider border transition-all rounded-none ${
                  settings.enableSurround51
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/60'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                }`}
                title="5.1 Surround Output: Synth -> Front, Click -> Rear"
              >
                5.1 Click: {settings.enableSurround51 ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={() => setShowTrackDetails(!showTrackDetails)}
                className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 border border-zinc-800 rounded-none shrink-0"
              >
                <Sliders className="w-3 h-3 text-amber-500" />
                <span>{parsedMidi.tracks.length} Tracks</span>
                {showTrackDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-900 h-1 relative overflow-hidden">
            <div
              className="bg-amber-500 h-full transition-all duration-100"
              style={{
                width: `${parsedMidi.duration ? (progress.current / parsedMidi.duration) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Track Inspector */}
          {showTrackDetails && (
            <div className="space-y-1.5 pt-2 border-t border-zinc-900">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                  MIDI Tracks, Events & Soundfont Overrides
                </span>
                {activeTrackIndexes.size > 0 && (
                  <span className="text-[8px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    {activeTrackIndexes.size} active track{activeTrackIndexes.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                {parsedMidi.tracks.map((track) => {
                  const override = song.midiTrackOverrides?.[track.index];
                  const isMuted = override?.mute || false;
                  const isSolo = override?.solo || false;
                  const isTrackActive = activeTrackIndexes.has(track.index);

                  return (
                    <div
                      key={track.index}
                      className={`p-2 border flex flex-col gap-2 transition-all ${
                        isTrackActive
                          ? 'bg-amber-950/20 border-amber-500/50 shadow-sm'
                          : isSolo
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : isMuted
                          ? 'bg-zinc-900/30 border-zinc-900 opacity-50'
                          : 'bg-black/40 border-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Mute Button */}
                        <button
                          type="button"
                          onClick={() => handleTrackMuteToggle(track.index)}
                          className={`p-1 border text-[9px] font-bold transition-all shrink-0 ${
                            isMuted
                              ? 'bg-red-950/40 border-red-800 text-red-400'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                          title={isMuted ? 'Unmute Track' : 'Mute Track'}
                        >
                          {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        </button>

                        {/* Solo Button */}
                        <button
                          type="button"
                          onClick={() => handleTrackSoloToggle(track.index)}
                          className={`px-1.5 py-0.5 border text-[9px] font-mono font-black transition-all shrink-0 ${
                            isSolo
                              ? 'bg-amber-500 border-amber-400 text-black font-black'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-200'
                          }`}
                          title={isSolo ? 'Unsolo Track' : 'Solo Track'}
                        >
                          S
                        </button>

                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-bold text-zinc-200 truncate">
                              {track.name}
                            </span>

                            {/* Live MIDI Event Activity Badge */}
                            {isTrackActive && (
                              <span className="px-1 py-0.5 text-[7px] font-mono font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/60 animate-pulse shrink-0 flex items-center gap-0.5">
                                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                                MIDI
                              </span>
                            )}
                          </div>

                          <span className="text-[8px] font-mono text-amber-500/80 truncate">
                            GM: {track.instrumentName} ({track.notesCount} notes)
                          </span>
                        </div>
                      </div>

                      <div className="w-full">
                        <SearchableSoundSelect
                          value={override?.patchId || ''}
                          onChange={(patchId) => handleTrackPatchChange(track.index, patchId)}
                          patches={patches}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )}
</div>
);
};
