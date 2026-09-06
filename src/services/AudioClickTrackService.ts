import { soundfontService } from './SoundfontService';
import { Song } from '../types';
import { JupiterEngine } from '../engine/JupiterEngine';

export interface AudioClickSongPair {
  songName: string;
  clickFile?: string;
  soundFile?: string;
}

export type AudioClickProgressListener = (
  currentTime: number,
  duration: number,
  isPlaying: boolean,
  peaks?: number[],
  currentBeat?: number
) => void;

interface ActiveAudioPlayback {
  clickFile?: string;
  soundFile?: string;
  clickSource?: AudioBufferSourceNode;
  soundSource?: AudioBufferSourceNode;
  clickGain?: GainNode;
  soundGain?: GainNode;
  startTime: number;
  pauseOffset: number;
  duration: number;
  bpm: number;
  isPlaying: boolean;
  engine: JupiterEngine;
  peaks?: number[];
}

class AudioClickTrackService {
  private activePlayback: ActiveAudioPlayback | null = null;
  private progressListeners: Set<AudioClickProgressListener> = new Set();
  private animFrameId: number | null = null;
  private waveformCache: Map<string, number[]> = new Map();
  private decodedBufferCache: Map<string, AudioBuffer> = new Map();

  /**
   * Detect pairs of CLICK_{Name}.wav and SOUND_{name}.wav from a list of files
   */
  public detectAudioClickTracks(fileList: string[]): AudioClickSongPair[] {
    const map = new Map<string, AudioClickSongPair>();

    for (const file of fileList) {
      const clickMatch = file.match(/^click_(.+?)\.(wav|mp3|ogg|m4a|aac|flac)$/i);
      const soundMatch = file.match(/^sound_(.+?)\.(wav|mp3|ogg|m4a|aac|flac)$/i);

      if (clickMatch) {
        const rawName = clickMatch[1];
        const key = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const existing = map.get(key) || { songName: rawName.replace(/_/g, ' ') };
        existing.clickFile = file;
        map.set(key, existing);
      } else if (soundMatch) {
        const rawName = soundMatch[1];
        const key = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const existing = map.get(key) || { songName: rawName.replace(/_/g, ' ') };
        existing.soundFile = file;
        map.set(key, existing);
      }
    }

    // Return entries that have at least one of the files
    return Array.from(map.values()).filter(p => p.clickFile || p.soundFile);
  }

  /**
   * Automatically detect and add songs that exist in storage but are not yet in the song list
   */
  public autoDetectAndAddSongs(
    existingSongs: Song[],
    availableFiles: string[],
    defaultPatchId: string = '1'
  ): { updatedSongs: Song[]; addedSongs: Song[] } {
    const detectedPairs = this.detectAudioClickTracks(availableFiles);
    const addedSongs: Song[] = [];

    for (const pair of detectedPairs) {
      const exists = existingSongs.some(s => {
        if (s.trackType === 'audio_click') {
          if (pair.clickFile && s.clickAudioFile === pair.clickFile) return true;
          if (pair.soundFile && s.soundAudioFile === pair.soundFile) return true;
        }
        const sNorm = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const pNorm = pair.songName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return sNorm === pNorm;
      });

      if (!exists) {
        const newSong: Song = {
          id: `song-audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: pair.songName.toUpperCase(),
          type: 'patch',
          targetId: defaultPatchId,
          trackType: 'audio_click',
          clickAudioFile: pair.clickFile,
          soundAudioFile: pair.soundFile,
          bpm: 120, // default manual BPM
        };
        addedSongs.push(newSong);
      }
    }

    return {
      updatedSongs: [...existingSongs, ...addedSongs],
      addedSongs,
    };
  }

  /**
   * Load and decode an audio buffer from OPFS
   */
  public async loadAudioBuffer(fileName: string, ctx: AudioContext): Promise<AudioBuffer> {
    if (this.decodedBufferCache.has(fileName)) {
      return this.decodedBufferCache.get(fileName)!;
    }

    const arrayBuffer = await soundfontService.getFileBuffer(fileName);
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.decodedBufferCache.set(fileName, decoded);
    return decoded;
  }

  /**
   * Extract normalized waveform peaks (default 180 bars) for visualization
   */
  public async getWaveformPeaks(
    fileName: string,
    ctx: AudioContext,
    numBars: number = 180
  ): Promise<{ peaks: number[]; duration: number }> {
    if (this.waveformCache.has(fileName)) {
      const peaks = this.waveformCache.get(fileName)!;
      const buf = this.decodedBufferCache.get(fileName);
      return { peaks, duration: buf?.duration || 0 };
    }

    try {
      const buffer = await this.loadAudioBuffer(fileName, ctx);
      const channelData = buffer.getChannelData(0);
      const totalSamples = channelData.length;
      const samplesPerBar = Math.floor(totalSamples / numBars);
      const peaks: number[] = new Array(numBars).fill(0);

      for (let i = 0; i < numBars; i++) {
        const start = i * samplesPerBar;
        const end = Math.min(start + samplesPerBar, totalSamples);
        let max = 0;
        // Step in increments of 4 for speed
        for (let j = start; j < end; j += 4) {
          const val = Math.abs(channelData[j]);
          if (val > max) max = val;
        }
        peaks[i] = max;
      }

      // Normalize peaks so highest peak is 1.0 (with a minimum floor for visibility)
      const maxPeak = Math.max(...peaks, 0.001);
      const normalized = peaks.map(p => Math.max(0.05, Math.min(1.0, p / maxPeak)));

      this.waveformCache.set(fileName, normalized);
      return { peaks: normalized, duration: buffer.duration };
    } catch (e) {
      console.warn(`Could not extract waveform for ${fileName}:`, e);
      // Return synthetic fallback waveform
      const fallback = Array.from({ length: numBars }, (_, i) => 
        0.2 + 0.6 * Math.abs(Math.sin((i / numBars) * Math.PI * 8))
      );
      return { peaks: fallback, duration: 180 };
    }
  }

  /**
   * Get peaks for a song (preferring SOUND file, then CLICK file)
   */
  public async getPeaksForSong(
    soundFile?: string,
    clickFile?: string,
    ctx?: AudioContext
  ): Promise<{ peaks: number[]; duration: number }> {
    if (!ctx) return { peaks: [], duration: 0 };
    const targetFile = soundFile || clickFile;
    if (!targetFile) return { peaks: [], duration: 0 };
    return this.getWaveformPeaks(targetFile, ctx);
  }

  public addProgressListener(listener: AudioClickProgressListener): () => void {
    this.progressListeners.add(listener);
    // If currently playing, notify immediately
    if (this.activePlayback) {
      const cur = this.getCurrentTime();
      listener(
        cur,
        this.activePlayback.duration,
        this.activePlayback.isPlaying,
        this.activePlayback.peaks,
        this.calculateBeat(cur, this.activePlayback.bpm)
      );
    }
    return () => this.progressListeners.delete(listener);
  }

  private notifyProgress(
    cur: number,
    dur: number,
    playing: boolean,
    peaks?: number[],
    beat?: number
  ) {
    this.progressListeners.forEach(fn => fn(cur, dur, playing, peaks, beat));
  }

  private calculateBeat(currentTimeSec: number, bpm: number): number {
    if (bpm <= 0) return 0;
    const beatDuration = 60 / bpm;
    return Math.floor(currentTimeSec / beatDuration) % 4; // 0, 1, 2, 3
  }

  public getCurrentTime(): number {
    if (!this.activePlayback) return 0;
    if (!this.activePlayback.isPlaying) {
      return this.activePlayback.pauseOffset;
    }
    const ctx = this.activePlayback.engine.ctx;
    if (!ctx) return this.activePlayback.pauseOffset;
    const elapsed = ctx.currentTime - this.activePlayback.startTime;
    return Math.min(this.activePlayback.duration, this.activePlayback.pauseOffset + elapsed);
  }

  public getDuration(): number {
    return this.activePlayback?.duration || 0;
  }

  public isPlaying(): boolean {
    return !!this.activePlayback?.isPlaying;
  }

  public getPlayingFiles(): { clickFile?: string; soundFile?: string } | null {
    if (!this.activePlayback) return null;
    return {
      clickFile: this.activePlayback.clickFile,
      soundFile: this.activePlayback.soundFile,
    };
  }

  /**
   * Start or resume playback of the dual audio click track
   */
  public async startPlayback(options: {
    clickFile?: string;
    soundFile?: string;
    engine: JupiterEngine;
    startOffset?: number;
    bpm?: number;
  }): Promise<boolean> {
    const { clickFile, soundFile, engine, startOffset = 0, bpm = 120 } = options;

    if (!clickFile && !soundFile) {
      console.warn('Cannot start audio click track: neither clickFile nor soundFile provided.');
      return false;
    }

    await engine.resume();
    const ctx = engine.ctx;
    if (!ctx) {
      console.warn('AudioContext is not initialized on JupiterEngine.');
      return false;
    }

    // Stop existing playback first
    this.stopPlayback();

    try {
      let clickBuffer: AudioBuffer | null = null;
      let soundBuffer: AudioBuffer | null = null;

      if (clickFile) {
        clickBuffer = await this.loadAudioBuffer(clickFile, ctx);
      }
      if (soundFile) {
        soundBuffer = await this.loadAudioBuffer(soundFile, ctx);
      }

      const duration = Math.max(
        clickBuffer?.duration || 0,
        soundBuffer?.duration || 0
      );

      if (duration === 0) {
        console.warn('Audio click track buffers are empty or failed to decode.');
        return false;
      }

      const offset = Math.min(Math.max(0, startOffset), duration);

      // Extract peaks for waveform
      const { peaks } = await this.getPeaksForSong(soundFile, clickFile, ctx);

      // Set up click audio routing: goes directly to click output (Rear Ch 4/5 in 5.1, or destination in stereo)
      let clickSource: AudioBufferSourceNode | undefined;
      let clickGain: GainNode | undefined;
      if (clickBuffer) {
        clickSource = ctx.createBufferSource();
        clickSource.buffer = clickBuffer;
        clickGain = ctx.createGain();
        clickGain.gain.value = 1.0;
        clickSource.connect(clickGain);
        const clickDest = engine.getClickDestinationNode();
        if (clickDest) {
          clickGain.connect(clickDest);
        } else {
          clickGain.connect(ctx.destination);
        }
      }

      // Set up sound audio routing: goes to main output (analyser & Front Ch 0/1 in 5.1, or destination in stereo)
      let soundSource: AudioBufferSourceNode | undefined;
      let soundGain: GainNode | undefined;
      if (soundBuffer) {
        soundSource = ctx.createBufferSource();
        soundSource.buffer = soundBuffer;
        soundGain = ctx.createGain();
        soundGain.gain.value = 1.0;
        soundSource.connect(soundGain);
        const soundDest = engine.getMainDestinationNode();
        if (soundDest) {
          soundGain.connect(soundDest);
        } else {
          soundGain.connect(ctx.destination);
        }
      }

      const startTime = ctx.currentTime + 0.05; // tiny lead buffer for sample-accurate sync

      if (clickSource) {
        clickSource.start(startTime, offset);
      }
      if (soundSource) {
        soundSource.start(startTime, offset);
      }

      this.activePlayback = {
        clickFile,
        soundFile,
        clickSource,
        soundSource,
        clickGain,
        soundGain,
        startTime,
        pauseOffset: offset,
        duration,
        bpm,
        isPlaying: true,
        engine,
        peaks,
      };

      // Handle track ended
      const primarySource = soundSource || clickSource;
      if (primarySource) {
        primarySource.onended = () => {
          if (this.activePlayback && this.activePlayback.isPlaying) {
            const cur = this.getCurrentTime();
            if (cur >= duration - 0.2) {
              this.stopPlayback();
            }
          }
        };
      }

      this.startProgressTicker();
      this.notifyProgress(offset, duration, true, peaks, this.calculateBeat(offset, bpm));
      return true;
    } catch (err) {
      console.error('Failed to play audio click track:', err);
      this.stopPlayback();
      return false;
    }
  }

  /**
   * Pause current playback
   */
  public pausePlayback(engine?: JupiterEngine) {
    if (!this.activePlayback || !this.activePlayback.isPlaying) return;

    const current = this.getCurrentTime();
    this.stopAudioNodes();

    this.activePlayback.isPlaying = false;
    this.activePlayback.pauseOffset = current;

    this.stopProgressTicker();
    this.notifyProgress(
      current,
      this.activePlayback.duration,
      false,
      this.activePlayback.peaks,
      this.calculateBeat(current, this.activePlayback.bpm)
    );
  }

  /**
   * Stop current playback and reset position to 0
   */
  public stopPlayback(engine?: JupiterEngine) {
    if (!this.activePlayback) return;

    this.stopAudioNodes();
    this.stopProgressTicker();

    const dur = this.activePlayback.duration;
    const peaks = this.activePlayback.peaks;
    this.activePlayback = null;

    this.notifyProgress(0, dur, false, peaks, 0);
  }

  /**
   * Seek to a specific timestamp in the audio track
   */
  public async seekPlayback(offsetSec: number, engine?: JupiterEngine): Promise<void> {
    if (!this.activePlayback) return;

    const eng = engine || this.activePlayback.engine;
    const wasPlaying = this.activePlayback.isPlaying;
    const clickFile = this.activePlayback.clickFile;
    const soundFile = this.activePlayback.soundFile;
    const bpm = this.activePlayback.bpm;
    const targetOffset = Math.max(0, Math.min(offsetSec, this.activePlayback.duration));

    this.stopAudioNodes();

    if (wasPlaying) {
      await this.startPlayback({
        clickFile,
        soundFile,
        engine: eng,
        startOffset: targetOffset,
        bpm,
      });
    } else {
      this.activePlayback.pauseOffset = targetOffset;
      this.notifyProgress(
        targetOffset,
        this.activePlayback.duration,
        false,
        this.activePlayback.peaks,
        this.calculateBeat(targetOffset, bpm)
      );
    }
  }

  private stopAudioNodes() {
    if (!this.activePlayback) return;
    try {
      this.activePlayback.clickSource?.stop();
      this.activePlayback.clickSource?.disconnect();
    } catch (e) {}
    try {
      this.activePlayback.soundSource?.stop();
      this.activePlayback.soundSource?.disconnect();
    } catch (e) {}
    try {
      this.activePlayback.clickGain?.disconnect();
      this.activePlayback.soundGain?.disconnect();
    } catch (e) {}
  }

  private startProgressTicker() {
    this.stopProgressTicker();

    const tick = () => {
      if (!this.activePlayback || !this.activePlayback.isPlaying) {
        return;
      }
      const cur = this.getCurrentTime();
      const dur = this.activePlayback.duration;
      const beat = this.calculateBeat(cur, this.activePlayback.bpm);

      this.notifyProgress(cur, dur, true, this.activePlayback.peaks, beat);

      if (cur < dur) {
        this.animFrameId = requestAnimationFrame(tick);
      } else {
        this.stopPlayback();
      }
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopProgressTicker() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}

export const audioClickTrackService = new AudioClickTrackService();
