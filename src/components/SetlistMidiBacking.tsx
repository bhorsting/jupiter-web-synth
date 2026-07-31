import React, { useEffect, useState, useRef } from 'react';
import { Play, Square, Pause, Music, Sliders, Wand2, Volume2, VolumeX, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Song, Patch, Multi } from '../types';
import { midiTrackService, ParsedMidiFile } from '../services/MidiTrackService';
import { soundfontService } from '../services/SoundfontService';
import { JupiterEngine } from '../engine/JupiterEngine';
import { useSettings } from '../contexts/SettingsContext';

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
  const selectedLabel = selectedPatch ? selectedPatch.name : 'Default Soundfont';

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
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-300 px-2 py-1 focus:border-amber-500 outline-none w-[130px] sm:w-[150px] flex items-center justify-between gap-1 truncate rounded-none hover:bg-zinc-800 transition-colors"
        title={selectedLabel}
      >
        <span className="truncate text-left text-amber-400/90 font-bold">{selectedLabel}</span>
        <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-zinc-950 border border-zinc-700 shadow-2xl z-50 p-1.5 space-y-1.5 max-h-60 flex flex-col">
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
              Default Soundfont
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
  const [parsedMidi, setParsedMidi] = useState<ParsedMidiFile | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; duration: number }>({ current: 0, duration: 0 });
  const [showTrackDetails, setShowTrackDetails] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  useEffect(() => {
    soundfontService.listDownloadedMidiFiles().then(setMidiFiles);
    
    const handleUpdate = () => {
      soundfontService.listDownloadedMidiFiles().then(setMidiFiles);
    };

    window.addEventListener('soundfontsUpdated', handleUpdate);
    return () => window.removeEventListener('soundfontsUpdated', handleUpdate);
  }, []);

  useEffect(() => {
    if (song.midiFile) {
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
  }, [song.midiFile]);

  useEffect(() => {
    const unsub = midiTrackService.addProgressListener((cur, dur, playing) => {
      if (song.midiFile && midiTrackService.getPlayingFileName() === song.midiFile) {
        setProgress({ current: cur, duration: dur });
        setIsPlaying(playing);
      } else {
        setIsPlaying(false);
      }
    });
    return unsub;
  }, [song.midiFile]);

  const handleMidiSelect = (fileName: string) => {
    onUpdateSong({
      ...song,
      midiFile: fileName || undefined,
      midiTrackOverrides: {},
    });
  };

  const handleTogglePlay = async () => {
    if (!engine || !song.midiFile) return;

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
        progress.current
      );
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (engine) {
      midiTrackService.stopPlayback(engine);
    }
    setIsPlaying(false);
    setProgress({ current: 0, duration: parsedMidi?.duration || 0 });
  };

  const handleGenerateGM = async () => {
    if (!song.midiFile) return;
    setIsGenerating(true);
    try {
      const { multi, newPatches } = await midiTrackService.generateMultiFromMidi(song.midiFile);
      onAddPatchesAndMulti(newPatches, multi);
      // Point song targetId to generated multi if desired
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
    overrides[trackIdx] = { ...current, mute: !current.mute };
    onUpdateSong({ ...song, midiTrackOverrides: overrides });
  };

  const handleTrackPatchChange = (trackIdx: number, patchId: string) => {
    const overrides = { ...(song.midiTrackOverrides || {}) };
    const current = overrides[trackIdx] || {};
    overrides[trackIdx] = { ...current, patchId };
    onUpdateSong({ ...song, midiTrackOverrides: overrides });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="mt-3 p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-none text-xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2">
        <div className="flex items-center gap-2">
          <Music className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
            MIDI Click & Backing Track
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={song.midiFile || ''}
            onChange={(e) => handleMidiSelect(e.target.value)}
            className="bg-black border border-zinc-800 text-amber-400 font-mono text-[10px] p-1.5 focus:border-amber-500 outline-none max-w-[200px] truncate"
          >
            <option value="">-- NO BACKING TRACK --</option>
            {midiFiles.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>

          {song.midiFile && (
            <button
              onClick={handleGenerateGM}
              disabled={isGenerating}
              className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all rounded-none"
              title="Auto-create General MIDI Patches and Multi for each track"
            >
              <Wand2 className="w-3 h-3" />
              {isGenerating ? 'Generating...' : 'Auto GM Multi'}
            </button>
          )}
        </div>
      </div>

      {parsedMidi && (
        <div className="space-y-2">
          {/* Transport Controls Bar */}
          <div className="flex items-center justify-between bg-black/60 p-2 border border-zinc-900">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePlay}
                className={`p-1.5 border transition-all ${
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
                className="p-1.5 bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition-all"
                title="Stop Backing Track"
              >
                <Square className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 ml-2">
                <span className="text-amber-400 font-bold">{formatTime(progress.current)}</span>
                <span>/</span>
                <span>{formatTime(parsedMidi.duration)}</span>
                <span className="text-zinc-600">({parsedMidi.bpm} BPM)</span>
                <button
                  type="button"
                  onClick={() => updateSettings({ enableSurround51: !settings.enableSurround51 })}
                  className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider border transition-all ml-1 ${
                    settings.enableSurround51
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/60'
                      : 'bg-zinc-900 text-zinc-600 border-zinc-800 hover:text-zinc-400'
                  }`}
                  title="5.1 Surround Output: Synth -> Front, Click -> Rear"
                >
                  5.1 Click: {settings.enableSurround51 ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowTrackDetails(!showTrackDetails)}
              className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              {parsedMidi.tracks.length} Tracks {showTrackDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
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
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                MIDI Track Instruments & Soundfont Overrides
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                {parsedMidi.tracks.map((track) => {
                  const override = song.midiTrackOverrides?.[track.index];
                  const isMuted = override?.mute || false;

                  return (
                    <div
                      key={track.index}
                      className={`p-2 border flex items-center justify-between gap-2 ${
                        isMuted
                          ? 'bg-zinc-900/30 border-zinc-900 opacity-50'
                          : 'bg-black/40 border-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => handleTrackMuteToggle(track.index)}
                          className={`p-1 border text-[9px] font-bold transition-all ${
                            isMuted
                              ? 'bg-red-950/40 border-red-800 text-red-400'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                          title={isMuted ? 'Unmute Track' : 'Mute Track'}
                        >
                          {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        </button>

                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold text-zinc-200 truncate">
                            {track.name}
                          </span>
                          <span className="text-[8px] font-mono text-amber-500/80 truncate">
                            GM: {track.instrumentName} ({track.notesCount} notes)
                          </span>
                        </div>
                      </div>

                      <SearchableSoundSelect
                        value={override?.patchId || ''}
                        onChange={(patchId) => handleTrackPatchChange(track.index, patchId)}
                        patches={patches}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
