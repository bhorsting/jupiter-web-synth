import { Midi } from '@tonejs/midi';
import { soundfontService } from './SoundfontService';
import { Patch, Multi, MultiSlot, DEFAULT_PARAMS, VoiceParams } from '../types';
import { JupiterEngine } from '../engine/JupiterEngine';

export interface ParsedMidiTrack {
  index: number;
  name: string;
  channel: number;
  instrumentNumber: number;
  instrumentName: string;
  notesCount: number;
  notes: Array<{
    note: number;
    time: number;
    duration: number;
    velocity: number;
  }>;
}

export interface ParsedMidiFile {
  name: string;
  duration: number;
  bpm: number;
  tracks: ParsedMidiTrack[];
}

export interface LeadInInfo {
  isLeadIn: boolean;
  currentBar: number;
  totalBars: number;
  currentBeat: number;
  beatsPerBar: number;
}

export type MidiProgressListener = (
  currentTime: number,
  duration: number,
  isPlaying: boolean,
  activeTrackIndexes: Set<number>,
  leadInInfo?: LeadInInfo
) => void;

interface MidiScheduledEvent {
  time: number; // relative to song start (0-indexed seconds)
  type: 'click' | 'noteOn' | 'noteOff';
  isDownbeat?: boolean;
  midi?: number;
  velocity?: number;
  trackIdx?: number;
  assignedPatchId?: string;
  patchParams?: VoiceParams;
}

class MidiTrackService {
  private activePlayer: {
    fileName: string;
    midi: Midi;
    isPlaying: boolean;
    startTime: number;
    pauseOffset: number;
    scheduledTimeouts: Set<number>;
    leadInDurationSeconds: number;
    bpm: number;
    beatsPerBar: number;
    effectiveLeadInBars: number;
    events: MidiScheduledEvent[];
    eventPointer: number;
    schedulerInterval: any;
    trackOverrides?: Record<number, { patchId?: string; mute?: boolean; solo?: boolean; volume?: number }>;
    patches?: Patch[];
    autoGMMode?: boolean;
  } | null = null;

  private activeTrackNotesCount: Map<number, number> = new Map();
  private progressListeners: Set<MidiProgressListener> = new Set();
  private timerInterval: any = null;

  /**
   * Parse a MIDI file ArrayBuffer or load from OPFS
   */
  async parseMidiFile(fileName: string): Promise<ParsedMidiFile> {
    const buffer = await soundfontService.getFileBuffer(fileName);
    const midi = new Midi(buffer);

    const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
    const duration = midi.duration;

    const tracks: ParsedMidiTrack[] = midi.tracks
      .filter(t => t.notes.length > 0)
      .map((t, index) => {
        return {
          index,
          name: t.name || (t.channel === 9 ? 'Drums (Ch 10)' : `Track ${index + 1} (${t.instrument.name || 'GM'})`),
          channel: t.channel,
          instrumentNumber: t.instrument.number,
          instrumentName: t.instrument.name || (t.channel === 9 ? 'Drums' : 'Acoustic Grand Piano'),
          notesCount: t.notes.length,
          notes: t.notes.map(n => ({
            note: n.midi,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity,
          })),
        };
      });

    return {
      name: fileName,
      duration,
      bpm,
      tracks,
    };
  }

  /**
   * Auto-generate Patches and a Multi for each track of a MIDI file.
   * Uses GeneralUser-GS.sf2 sample preset matching the GM instrument number.
   */
  async generateMultiFromMidi(
    fileName: string
  ): Promise<{ multi: Multi; newPatches: Patch[] }> {
    const parsed = await this.parseMidiFile(fileName);
    const newPatches: Patch[] = [];
    const slots: MultiSlot[] = [];

    const baseGroup = `MIDI: ${fileName.replace(/\.[^/.]+$/, '')}`;

    for (const track of parsed.tracks) {
      const patchId = `patch-midi-${Date.now()}-${track.index}`;
      const patchName = `${track.name}`.slice(0, 30);

      // Determine preset index in GeneralUser-GS.sf2 matching GM instrument or default
      const sampleIndex = Math.min(Math.max(0, track.instrumentNumber || 0), 127);

      const newPatch: Patch = {
        id: patchId,
        name: patchName,
        group: baseGroup,
        params: {
          ...DEFAULT_PARAMS,
          vco1SoundfontEnabled: true,
          vco1SoundfontName: 'GeneralUser-GS.sf2',
          vco1SoundfontSampleIndex: sampleIndex,
          masterVolume: 0.8,
        },
      };

      newPatches.push(newPatch);

      slots.push({
        patchId,
        lowNote: 0,
        highNote: 127,
        lowVelocity: 0,
        highVelocity: 127,
        lowMapVelocity: 0,
        highMapVelocity: 127,
        transposeOctave: 0,
        transposeNote: 0,
      });
    }

    const multi: Multi = {
      id: `multi-midi-${Date.now()}`,
      name: `${fileName.replace(/\.[^/.]+$/, '')} (Multi)`.toUpperCase(),
      group: baseGroup,
      slots,
    };

    return { multi, newPatches };
  }

  /**
   * Play MIDI file notes through JupiterEngine
   */
  async startPlayback(
    fileName: string,
    engine: JupiterEngine,
    trackOverrides?: Record<number, { patchId?: string; mute?: boolean; solo?: boolean; volume?: number }>,
    startOffset: number = 0,
    leadInBars: number = 0,
    patches?: Patch[],
    autoGMMode: boolean = false
  ): Promise<boolean> {
    this.stopPlayback(engine);

    if (patches && patches.length > 0) {
      engine.setLibraryPatches(patches);

      if (trackOverrides) {
        for (const override of Object.values(trackOverrides)) {
          if (override?.patchId) {
            const p = patches.find(item => item.id === override.patchId);
            if (p?.params) {
              if (p.params.vco1SoundfontEnabled && p.params.vco1SoundfontName) {
                try {
                  await soundfontService.getPresetsForFile(p.params.vco1SoundfontName, engine.getCtx() || undefined);
                  await soundfontService.getFileBuffer(p.params.vco1SoundfontName);
                } catch (e) {
                  console.warn('Failed to pre-cache VCO1 SF2:', e);
                }
              }
              if (p.params.vco2SoundfontEnabled && p.params.vco2SoundfontName) {
                try {
                  await soundfontService.getPresetsForFile(p.params.vco2SoundfontName, engine.getCtx() || undefined);
                  await soundfontService.getFileBuffer(p.params.vco2SoundfontName);
                } catch (e) {
                  console.warn('Failed to pre-cache VCO2 SF2:', e);
                }
              }
            }
          }
        }
      }
    }

    try {
      const buffer = await soundfontService.getFileBuffer(fileName);
      if (!buffer || buffer.byteLength === 0) {
        console.error("MIDI file buffer empty or missing:", fileName);
        return false;
      }
      const midi = new Midi(buffer);

      const detectedBpm = Math.round(midi.header.tempos[0]?.bpm || 120);
      engine.setBackingTrackActive(true, detectedBpm);

      const audioCtx = engine.getCtx();
      if (!audioCtx) return false;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const beatsPerBar = 4;
      const secondsPerBeat = 60 / detectedBpm;
      const effectiveLeadInBars = startOffset > 0 ? 0 : Math.max(0, leadInBars);
      const leadInDurationSeconds = effectiveLeadInBars * beatsPerBar * secondsPerBeat;

      const events: MidiScheduledEvent[] = [];

      // 1. Lead-In Metronome Clicks
      if (effectiveLeadInBars > 0) {
        const totalLeadInBeats = effectiveLeadInBars * beatsPerBar;
        for (let b = 0; b < totalLeadInBeats; b++) {
          const songTime = b * secondsPerBeat - leadInDurationSeconds;
          events.push({
            time: songTime,
            type: 'click',
            isDownbeat: (b % beatsPerBar) === 0,
          });
        }
      }

      // 2. Synchronized Metronome during Song Playback (if enabled)
      const metronomeEnabled = engine.getParams().metronomeEnabled;
      if (metronomeEnabled) {
        const totalSongBeats = Math.ceil(midi.duration / secondsPerBeat) + 4;
        const startBeatIndex = Math.floor(startOffset / secondsPerBeat);

        for (let b = startBeatIndex; b <= totalSongBeats; b++) {
          const beatSongTime = b * secondsPerBeat;
          if (beatSongTime >= startOffset) {
            events.push({
              time: beatSongTime,
              type: 'click',
              isDownbeat: (b % beatsPerBar) === 0,
            });
          }
        }
      }

      // 3. Track Solo / Mute Filtering & Notes
      const activeTracks = midi.tracks.filter(t => t.notes.length > 0);
      const hasAnySolo = Object.values(trackOverrides || {}).some(o => o?.solo);

      activeTracks.forEach((track, trackIdx) => {
        const override = trackOverrides?.[trackIdx];
        const isMuted = override?.mute || false;
        const isSolo = override?.solo || false;

        if (hasAnySolo) {
          if (!isSolo || isMuted) return;
        } else {
          if (isMuted) return;
        }

        const trackVol = override?.volume ?? 1.0;
        const assignedPatchId = override?.patchId;
        const assignedPatch = (assignedPatchId && patches) ? patches.find(p => p.id === assignedPatchId) : undefined;
        let patchParams = assignedPatch ? assignedPatch.params : undefined;

        if (!assignedPatchId && !patchParams) {
          if (!autoGMMode) {
            return;
          } else {
            const sampleIndex = Math.min(Math.max(0, track.instrument?.number || 0), 127);
            patchParams = {
              ...DEFAULT_PARAMS,
              vco1SoundfontEnabled: true,
              vco1SoundfontName: 'GeneralUser-GS.sf2',
              vco1SoundfontSampleIndex: sampleIndex,
              masterVolume: 0.8,
            };
          }
        }

        track.notes.forEach(note => {
          if (note.time >= startOffset) {
            events.push({
              time: note.time,
              type: 'noteOn',
              midi: note.midi,
              velocity: note.velocity * trackVol,
              trackIdx,
              assignedPatchId,
              patchParams,
            });
            events.push({
              time: note.time + note.duration,
              type: 'noteOff',
              midi: note.midi,
              trackIdx,
              assignedPatchId,
            });
          }
        });
      });

      // Sort all events by time
      events.sort((a, b) => a.time - b.time);

      const scheduledTimeouts = new Set<number>();
      const startTime = audioCtx.currentTime - startOffset + leadInDurationSeconds;

      const player = {
        fileName,
        midi,
        isPlaying: true,
        startTime,
        pauseOffset: startOffset,
        scheduledTimeouts,
        leadInDurationSeconds,
        bpm: detectedBpm,
        beatsPerBar,
        effectiveLeadInBars,
        events,
        eventPointer: 0,
        schedulerInterval: null as any,
        trackOverrides,
        patches,
        autoGMMode,
      };
      this.activePlayer = player;

      // Lookahead scheduler loop (runs every 25ms, schedules events up to 100ms in advance)
      const LOOKAHEAD = 0.1;
      const schedulerTick = () => {
        if (!this.activePlayer || !this.activePlayer.isPlaying) return;
        const currentAudioTime = audioCtx.currentTime;
        const currentSongTime = currentAudioTime - (player.startTime - player.leadInDurationSeconds) - player.leadInDurationSeconds;
        const horizon = currentSongTime + LOOKAHEAD;

        while (player.eventPointer < events.length) {
          const ev = events[player.eventPointer];
          if (ev.time > horizon) break;

          const delayMs = Math.max(0, (ev.time - currentSongTime) * 1000);
          const tId = window.setTimeout(() => {
            scheduledTimeouts.delete(tId);
            if (!this.activePlayer || !this.activePlayer.isPlaying) return;

            if (ev.type === 'click') {
              engine.playMetronomeClick(!!ev.isDownbeat);
            } else if (ev.type === 'noteOn' && ev.midi !== undefined) {
              engine.noteOn(ev.midi, ev.velocity ?? 0.8, ev.assignedPatchId, ev.patchParams);
              if (ev.trackIdx !== undefined) {
                this.activeTrackNotesCount.set(ev.trackIdx, (this.activeTrackNotesCount.get(ev.trackIdx) || 0) + 1);
              }
            } else if (ev.type === 'noteOff' && ev.midi !== undefined) {
              engine.noteOff(ev.midi, ev.assignedPatchId);
              if (ev.trackIdx !== undefined) {
                const cur = this.activeTrackNotesCount.get(ev.trackIdx) || 1;
                if (cur <= 1) {
                  this.activeTrackNotesCount.delete(ev.trackIdx);
                } else {
                  this.activeTrackNotesCount.set(ev.trackIdx, cur - 1);
                }
              }
            }
          }, delayMs);

          scheduledTimeouts.add(tId);
          player.eventPointer++;
        }
      };

      // Run immediately for time=0 window, then interval
      schedulerTick();
      player.schedulerInterval = setInterval(schedulerTick, 25);

      this.startProgressTimer(audioCtx, midi.duration);
      return true;
    } catch (err) {
      console.error("Failed to start MIDI playback:", err);
      return false;
    }
  }

  stopPlayback(engine?: JupiterEngine) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.activePlayer) {
      if (this.activePlayer.schedulerInterval) {
        clearInterval(this.activePlayer.schedulerInterval);
      }
      this.activePlayer.scheduledTimeouts.forEach(t => clearTimeout(t));
      this.activePlayer.scheduledTimeouts.clear();
      this.activePlayer.isPlaying = false;
      this.activePlayer.pauseOffset = 0;
      this.activePlayer = null;
    }

    this.activeTrackNotesCount.clear();

    if (engine) {
      engine.setBackingTrackActive(false);
      engine.panic();
    }

    this.notifyProgress(0, 0, false, new Set());
  }

  pausePlayback(engine: JupiterEngine) {
    if (!this.activePlayer) return;

    engine.setBackingTrackActive(false);

    const audioCtx = engine.getCtx();
    if (!audioCtx) return;

    const currentPos = audioCtx.currentTime - (this.activePlayer.startTime - this.activePlayer.leadInDurationSeconds) - this.activePlayer.leadInDurationSeconds;

    if (this.activePlayer.schedulerInterval) {
      clearInterval(this.activePlayer.schedulerInterval);
    }
    this.activePlayer.scheduledTimeouts.forEach(t => clearTimeout(t));
    this.activePlayer.scheduledTimeouts.clear();
    this.activePlayer.isPlaying = false;
    this.activePlayer.pauseOffset = Math.max(0, currentPos);

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.activeTrackNotesCount.clear();

    engine.panic();
    this.notifyProgress(Math.max(0, currentPos), this.activePlayer.midi.duration, false, new Set());
  }

  seekPlayback(seconds: number, engine?: JupiterEngine) {
    if (!this.activePlayer) return;
    const isCurrentlyPlaying = this.activePlayer.isPlaying;
    const currentFileName = this.activePlayer.fileName;
    const trackOverrides = this.activePlayer.trackOverrides;
    const patches = this.activePlayer.patches;
    const autoGMMode = this.activePlayer.autoGMMode;
    const duration = this.activePlayer.midi.duration;

    if (isCurrentlyPlaying && engine) {
      this.startPlayback(
        currentFileName,
        engine,
        trackOverrides,
        seconds,
        0,
        patches,
        autoGMMode
      );
    } else {
      this.activePlayer.pauseOffset = seconds;
      this.notifyProgress(seconds, duration, false, new Set());
    }
  }

  getIsPlaying(fileName?: string): boolean {
    if (!this.activePlayer) return false;
    if (fileName && this.activePlayer.fileName !== fileName) return false;
    return this.activePlayer.isPlaying;
  }

  getPlayingFileName(): string | null {
    return this.activePlayer?.fileName || null;
  }

  addProgressListener(fn: MidiProgressListener) {
    this.progressListeners.add(fn);
    return () => {
      this.progressListeners.delete(fn);
    };
  }

  private startProgressTimer(audioCtx: AudioContext, duration: number) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (!this.activePlayer || !this.activePlayer.isPlaying) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        return;
      }

      const elapsed = audioCtx.currentTime - (this.activePlayer.startTime - this.activePlayer.leadInDurationSeconds);
      const activeTrackSet = new Set(this.activeTrackNotesCount.keys());

      if (elapsed < this.activePlayer.leadInDurationSeconds) {
        const secondsPerBeat = 60 / this.activePlayer.bpm;
        const currentBeatIndex = Math.floor(elapsed / secondsPerBeat);
        const currentBar = Math.floor(currentBeatIndex / this.activePlayer.beatsPerBar) + 1;
        const currentBeat = (currentBeatIndex % this.activePlayer.beatsPerBar) + 1;

        const leadInInfo: LeadInInfo = {
          isLeadIn: true,
          currentBar,
          totalBars: this.activePlayer.effectiveLeadInBars,
          currentBeat,
          beatsPerBar: this.activePlayer.beatsPerBar,
        };

        this.notifyProgress(0, duration, true, activeTrackSet, leadInInfo);
      } else {
        const songTime = elapsed - this.activePlayer.leadInDurationSeconds;
        if (songTime >= duration) {
          this.stopPlayback();
        } else {
          this.notifyProgress(songTime, duration, true, activeTrackSet, {
            isLeadIn: false,
            currentBar: 0,
            totalBars: 0,
            currentBeat: 0,
            beatsPerBar: 4,
          });
        }
      }
    }, 80);
  }

  private notifyProgress(
    currentTime: number,
    duration: number,
    isPlaying: boolean,
    activeTrackIndexes: Set<number> = new Set(),
    leadInInfo?: LeadInInfo
  ) {
    this.progressListeners.forEach(fn => fn(currentTime, duration, isPlaying, activeTrackIndexes, leadInInfo));
  }
}

export const midiTrackService = new MidiTrackService();
