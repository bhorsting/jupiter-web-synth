import { Midi } from '@tonejs/midi';
import { soundfontService } from './SoundfontService';
import { Patch, Multi, MultiSlot, DEFAULT_PARAMS } from '../types';
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

class MidiTrackService {
  private activePlayer: {
    fileName: string;
    midi: Midi;
    isPlaying: boolean;
    startTime: number;
    pauseOffset: number;
    scheduledTimeouts: number[];
  } | null = null;

  private progressListeners: Set<(currentTime: number, duration: number, isPlaying: boolean) => void> = new Set();
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
    trackOverrides?: Record<number, { patchId?: string; mute?: boolean; volume?: number }>,
    startOffset: number = 0
  ) {
    this.stopPlayback(engine);

    const buffer = await soundfontService.getFileBuffer(fileName);
    const midi = new Midi(buffer);

    const scheduledTimeouts: number[] = [];
    const audioCtx = engine.getCtx();
    if (!audioCtx) return;

    const startTime = audioCtx.currentTime - startOffset;

    midi.tracks.forEach((track, trackIdx) => {
      const override = trackOverrides?.[trackIdx];
      if (override?.mute) return;

      const trackVol = override?.volume ?? 1.0;

      track.notes.forEach(note => {
        if (note.time >= startOffset) {
          const delayStartMs = Math.max(0, (note.time - startOffset) * 1000);
          const delayEndMs = Math.max(0, (note.time + note.duration - startOffset) * 1000);

          const startT = window.setTimeout(() => {
            engine.noteOn(note.midi, note.velocity * trackVol);
          }, delayStartMs);

          const endT = window.setTimeout(() => {
            engine.noteOff(note.midi);
          }, delayEndMs);

          scheduledTimeouts.push(startT, endT);
        }
      });
    });

    this.activePlayer = {
      fileName,
      midi,
      isPlaying: true,
      startTime: audioCtx.currentTime - startOffset,
      pauseOffset: startOffset,
      scheduledTimeouts,
    };

    this.startProgressTimer(audioCtx, midi.duration);
  }

  stopPlayback(engine?: JupiterEngine) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.activePlayer) {
      this.activePlayer.scheduledTimeouts.forEach(t => clearTimeout(t));
      this.activePlayer.isPlaying = false;
      this.activePlayer.pauseOffset = 0;
      this.activePlayer = null;
    }

    if (engine) {
      engine.panic();
    }

    this.notifyProgress(0, 0, false);
  }

  pausePlayback(engine: JupiterEngine) {
    if (!this.activePlayer) return;

    const audioCtx = engine.getCtx();
    if (!audioCtx) return;

    const currentPos = audioCtx.currentTime - this.activePlayer.startTime;

    this.activePlayer.scheduledTimeouts.forEach(t => clearTimeout(t));
    this.activePlayer.isPlaying = false;
    this.activePlayer.pauseOffset = currentPos;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    engine.panic();
    this.notifyProgress(currentPos, this.activePlayer.midi.duration, false);
  }

  getIsPlaying(fileName?: string): boolean {
    if (!this.activePlayer) return false;
    if (fileName && this.activePlayer.fileName !== fileName) return false;
    return this.activePlayer.isPlaying;
  }

  getPlayingFileName(): string | null {
    return this.activePlayer?.fileName || null;
  }

  addProgressListener(fn: (currentTime: number, duration: number, isPlaying: boolean) => void) {
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

      const current = audioCtx.currentTime - this.activePlayer.startTime;
      if (current >= duration) {
        this.stopPlayback();
      } else {
        this.notifyProgress(current, duration, true);
      }
    }, 100);
  }

  private notifyProgress(currentTime: number, duration: number, isPlaying: boolean) {
    this.progressListeners.forEach(fn => fn(currentTime, duration, isPlaying));
  }
}

export const midiTrackService = new MidiTrackService();
