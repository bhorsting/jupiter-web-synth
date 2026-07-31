import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, Music, Layers, Sliders, Check, Radio, Volume2 } from 'lucide-react';
import { Setlist, Song, Patch, Multi } from '../types';

interface LivePerformanceViewProps {
  setlists: Setlist[];
  activeSetlistId: string | null;
  setActiveSetlistId: (id: string) => void;
  activeSong: Song | null;
  isMidiPlaying: boolean;
  midiProgress: { current: number; duration: number };
  handleLoadSong: (song: Song) => void;
  handleToggleMainSongPlay: (targetSong?: Song) => void;
  handleStopMainSongPlay: () => void;
  patches: Patch[];
  multis: Multi[];
  activePatchId: string | null;
  activeMultiId: string | null;
  isMidiMappingMode: boolean;
  selectedMapParam: string | null;
  setSelectedMapParam: (param: any) => void;
  songPlayPauseCc: number | null | undefined;
}

export const LivePerformanceView: React.FC<LivePerformanceViewProps> = ({
  setlists,
  activeSetlistId,
  setActiveSetlistId,
  activeSong,
  isMidiPlaying,
  midiProgress,
  handleLoadSong,
  handleToggleMainSongPlay,
  handleStopMainSongPlay,
  patches,
  multis,
  activePatchId,
  activeMultiId,
  isMidiMappingMode,
  selectedMapParam,
  setSelectedMapParam,
  songPlayPauseCc
}) => {
  const currentSetlist = setlists.find(s => s.id === activeSetlistId) || setlists[0];

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectSong = (song: Song) => {
    handleLoadSong(song);
  };

  const handlePrevSong = () => {
    if (!currentSetlist || !currentSetlist.songs || currentSetlist.songs.length === 0) return;
    const currentIndex = currentSetlist.songs.findIndex(s => s.id === activeSong?.id);
    if (currentIndex > 0) {
      handleLoadSong(currentSetlist.songs[currentIndex - 1]);
    } else {
      handleLoadSong(currentSetlist.songs[currentSetlist.songs.length - 1]);
    }
  };

  const handleNextSong = () => {
    if (!currentSetlist || !currentSetlist.songs || currentSetlist.songs.length === 0) return;
    const currentIndex = currentSetlist.songs.findIndex(s => s.id === activeSong?.id);
    if (currentIndex >= 0 && currentIndex < currentSetlist.songs.length - 1) {
      handleLoadSong(currentSetlist.songs[currentIndex + 1]);
    } else {
      handleLoadSong(currentSetlist.songs[0]);
    }
  };

  // Find sound label for active song
  const getSongSoundLabel = (song: Song) => {
    if (song.type === 'multi') {
      const m = multis.find(item => item.id === song.targetId);
      return m ? `MULTI: ${m.name}` : 'MULTI SOUND';
    } else {
      const p = patches.find(item => item.id === song.targetId);
      return p ? `PATCH: ${p.name}` : 'SYNTH PATCH';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080809] text-white overflow-hidden select-none">
      {/* Top Setlist Header Banner */}
      <div className="bg-[#111114] border-b border-zinc-800 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-red-600 text-white font-mono text-[10px] font-black uppercase tracking-widest border border-red-500 flex items-center gap-1.5 rounded-none shadow-[0_0_10px_rgba(220,38,38,0.5)]">
            <Radio size={12} className="animate-pulse" />
            <span>LIVE STAGE</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 font-bold uppercase tracking-wider">SETLIST:</span>
            {setlists.length > 1 ? (
              <select
                value={currentSetlist?.id || ''}
                onChange={(e) => setActiveSetlistId(e.target.value)}
                className="bg-zinc-900 border border-red-500/60 text-red-400 font-mono text-xs sm:text-sm font-bold px-3 py-1 focus:outline-none focus:border-red-400 cursor-pointer rounded-none"
              >
                {setlists.map(s => (
                  <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                    {s.name} ({s.songs.length} songs)
                  </option>
                ))}
              </select>
            ) : (
              <h2 className="text-sm sm:text-base font-bold font-mono text-white tracking-wider uppercase">
                {currentSetlist?.name || 'NO SETLIST LOADED'}
              </h2>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>{currentSetlist?.songs?.length || 0} SONGS IN SET</span>
          {songPlayPauseCc !== null && songPlayPauseCc !== undefined && (
            <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-600/50 text-[10px] font-bold rounded-none">
              FOOTSWITCH: CC {songPlayPauseCc}
            </span>
          )}
        </div>
      </div>

      {/* Main Stage Controls & Active Song Banner */}
      <div className="bg-[#0d0d10] border-b border-zinc-800 p-4 sm:p-6 flex flex-col lg:flex-row items-stretch justify-between gap-4 shrink-0 shadow-lg">
        {/* BIG STAGE START & STOP BUTTONS */}
        <div className="flex items-stretch gap-3 shrink-0">
          <button
            onClick={() => {
              if (isMidiMappingMode) {
                setSelectedMapParam('songPlayPause');
              } else {
                handleToggleMainSongPlay();
              }
            }}
            className={`flex-1 sm:flex-initial min-w-[160px] sm:min-w-[220px] h-20 sm:h-24 px-6 sm:px-8 flex items-center justify-center gap-3 font-mono text-sm sm:text-lg font-black uppercase tracking-widest transition-all border-2 rounded-none cursor-pointer touch-manipulation active:scale-[0.98] ${
              isMidiMappingMode && selectedMapParam === 'songPlayPause'
                ? 'bg-blue-600 text-white border-blue-400 animate-pulse ring-4 ring-blue-400 shadow-[0_0_25px_rgba(37,99,235,0.8)]'
                : isMidiPlaying
                  ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.6)]'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
            }`}
            title={isMidiMappingMode ? "Click to assign MIDI CC to Stage Play/Pause" : "Start / Pause Song"}
          >
            {isMidiPlaying ? (
              <>
                <Pause size={28} className="fill-current shrink-0" />
                <div className="flex flex-col text-left leading-none">
                  <span className="text-base sm:text-xl font-black">PAUSE</span>
                  <span className="text-[9px] opacity-80 font-mono tracking-wider">STAGE PLAYING</span>
                </div>
              </>
            ) : (
              <>
                <Play size={28} className="fill-current shrink-0" />
                <div className="flex flex-col text-left leading-none">
                  <span className="text-base sm:text-xl font-black">START</span>
                  <span className="text-[9px] opacity-80 font-mono tracking-wider">CLICK TO PLAY</span>
                </div>
              </>
            )}
          </button>

          <button
            onClick={handleStopMainSongPlay}
            className="w-20 sm:w-24 h-20 sm:h-24 flex flex-col items-center justify-center gap-1 bg-red-950 hover:bg-red-900 active:bg-red-800 text-red-400 border-2 border-red-600/70 font-mono text-xs font-black uppercase tracking-widest transition-all rounded-none cursor-pointer touch-manipulation active:scale-[0.98] shadow-[0_0_15px_rgba(220,38,38,0.3)]"
            title="Stop Song"
          >
            <Square size={24} className="fill-current text-red-500" />
            <span className="text-[10px]">STOP</span>
          </button>

          {/* Quick Nav Controls */}
          <div className="flex flex-col gap-1.5 justify-center">
            <button
              onClick={handlePrevSong}
              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 rounded-none transition-colors"
              title="Previous Song in Set"
            >
              <SkipBack size={12} />
              <span>PREV</span>
            </button>
            <button
              onClick={handleNextSong}
              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 rounded-none transition-colors"
              title="Next Song in Set"
            >
              <span>NEXT</span>
              <SkipForward size={12} />
            </button>
          </div>
        </div>

        {/* ACTIVE SONG STAGE DISPLAY */}
        <div className="flex-1 bg-black/60 border border-zinc-800 p-4 flex flex-col justify-between gap-3 rounded-none relative overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[9px] font-mono text-red-500 font-bold uppercase tracking-widest flex items-center gap-1">
                <div className={`w-2 h-2 ${isMidiPlaying ? 'bg-emerald-500 animate-ping' : 'bg-red-500'}`} />
                <span>CURRENT STAGE SONG</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-wide uppercase text-white mt-0.5 truncate max-w-[400px]">
                {activeSong ? activeSong.name : 'NO SONG SELECTED'}
              </h1>
            </div>

            {activeSong && (
              <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-300 font-mono text-[11px] font-bold uppercase tracking-wider rounded-none shrink-0">
                {getSongSoundLabel(activeSong)}
              </div>
            )}
          </div>

          {/* Song Backing Track Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono font-bold mb-1">
              <span className="text-amber-400">{formatTime(midiProgress.current)}</span>
              <span className="text-zinc-500">{formatTime(midiProgress.duration)}</span>
            </div>
            <div className="w-full h-3 bg-zinc-900 border border-zinc-800 rounded-none overflow-hidden relative">
              <div
                className={`h-full transition-all duration-200 ${
                  isMidiPlaying ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-zinc-700'
                }`}
                style={{
                  width: `${midiProgress.duration > 0 ? (midiProgress.current / midiProgress.duration) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SETLIST SONGS LIST AREA */}
      <div className="flex-1 p-3 sm:p-6 overflow-y-auto space-y-2">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <Music size={14} className="text-red-500" />
            <span>SETLIST TRACK LISTING (CLICK TO JUMP)</span>
          </h3>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            {currentSetlist?.songs?.length || 0} ITEMS
          </span>
        </div>

        {!currentSetlist || !currentSetlist.songs || currentSetlist.songs.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-zinc-800 text-zinc-600 font-mono text-sm uppercase">
            No songs added to setlist yet. Go to Library &gt; Setlists to create songs.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {currentSetlist.songs.map((song, idx) => {
              const isActive = activeSong?.id === song.id;
              const soundLabel = getSongSoundLabel(song);

              return (
                <div
                  key={song.id}
                  onClick={() => handleSelectSong(song)}
                  className={`p-3 sm:p-4 flex items-center justify-between gap-3 border transition-all cursor-pointer rounded-none group ${
                    isActive
                      ? 'bg-amber-500/15 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                      : 'bg-[#111114] border-zinc-800 hover:border-zinc-700 hover:bg-[#16161a]'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <span
                      className={`font-mono text-sm sm:text-base font-black w-7 sm:w-8 shrink-0 ${
                        isActive ? 'text-amber-400' : 'text-zinc-600 group-hover:text-zinc-400'
                      }`}
                    >
                      {(idx + 1).toString().padStart(2, '0')}
                    </span>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-sm sm:text-base tracking-wide uppercase truncate ${
                            isActive ? 'text-white' : 'text-zinc-200 group-hover:text-white'
                          }`}
                        >
                          {song.name}
                        </span>
                        {isActive && isMidiPlaying && (
                          <span className="px-1.5 py-0.2 bg-emerald-500 text-black text-[9px] font-mono font-black uppercase rounded-none animate-pulse shrink-0">
                            PLAYING
                          </span>
                        )}
                        {isActive && !isMidiPlaying && (
                          <span className="px-1.5 py-0.2 bg-amber-500 text-black text-[9px] font-mono font-black uppercase rounded-none shrink-0">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-0.5 text-[10px] font-mono text-zinc-400">
                        <span className="text-amber-400/90 font-semibold">{soundLabel}</span>
                        <span>•</span>
                        <span>{song.midiFile ? 'MIDI BACKING LOADED' : 'NO BACKING TRACK'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMainSongPlay(song);
                      }}
                      className={`px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-wider border transition-all rounded-none flex items-center gap-1.5 touch-manipulation active:scale-[0.98] ${
                        isActive && isMidiPlaying
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                          : 'bg-zinc-800 hover:bg-amber-600 hover:text-black text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {isActive && isMidiPlaying ? (
                        <>
                          <Volume2 size={12} className="animate-pulse" />
                          <span>PAUSE</span>
                        </>
                      ) : (
                        <>
                          <Play size={12} className="fill-current" />
                          <span>SELECT & PLAY</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
