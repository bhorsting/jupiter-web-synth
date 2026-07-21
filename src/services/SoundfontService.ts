import { PerformanceSettings } from '../types';

export interface SoundfontFile {
  id: string;
  name: string;
  size?: number;
  isDownloaded: boolean;
}

class SoundfontService {
  private decodedCache: Map<string, AudioBuffer> = new Map();

  /**
   * List all soundfont files from the configured Google Drive directory
   */
  async listFromDrive(settings: PerformanceSettings): Promise<SoundfontFile[]> {
    const apiKey = settings.googleDriveApiKey;
    const folderId = settings.googleDriveFolderId;

    if (!apiKey || !folderId) {
      throw new Error('Google Drive API Key and Folder ID must be configured in settings.');
    }

    const q = `'${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType)&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to list files from Google Drive: ${response.statusText}. Details: ${errText}`);
    }

    const data = await response.json();
    const driveFiles = data.files || [];

    // Filter files: .sft, .sf2, .wav, .mp3
    const filtered = driveFiles.filter((f: any) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.sft') || name.endsWith('.sf2') || name.endsWith('.wav') || name.endsWith('.mp3');
    });

    const downloadedNames = await this.listDownloadedFiles();

    return filtered.map((f: any) => ({
      id: f.id,
      name: f.name,
      size: f.size ? parseInt(f.size) : undefined,
      isDownloaded: downloadedNames.includes(f.name),
    }));
  }

  /**
   * List all files currently downloaded in OPFS
   */
  async listDownloadedFiles(): Promise<string[]> {
    try {
      const root = await navigator.storage.getDirectory();
      const files: string[] = [];
      const iterator = (root as any).values();
      while (true) {
        const { value, done } = await iterator.next();
        if (done) break;
        if (value.kind === 'file') {
          files.push(value.name);
        }
      }
      return files;
    } catch (e) {
      console.error('Failed to list downloaded files from OPFS:', e);
      return [];
    }
  }

  /**
   * Delete a soundfont file from OPFS
   */
  async deleteFile(name: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name);
      this.decodedCache.delete(name);
    } catch (e) {
      console.error(`Failed to delete file ${name} from OPFS:`, e);
      throw e;
    }
  }

  /**
   * Download a file from Drive and save to OPFS
   */
  async downloadAndSave(fileId: string, name: string, settings: PerformanceSettings): Promise<void> {
    const apiKey = settings.googleDriveApiKey;
    if (!apiKey) {
      throw new Error('Google Drive API Key is not configured.');
    }

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    // Clear from memory cache if it was there (so it reloads with new data)
    this.decodedCache.delete(name);
  }

  /**
   * Load a soundfont file from OPFS, decode it, and cache it in memory
   */
  async loadAndDecode(name: string, ctx: AudioContext): Promise<AudioBuffer> {
    if (this.decodedCache.has(name)) {
      return this.decodedCache.get(name)!;
    }

    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(name);
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    // Decode audio data
    try {
      const bufferToDecode = arrayBuffer.slice(0);
      const audioBuffer = await ctx.decodeAudioData(bufferToDecode);
      this.decodedCache.set(name, audioBuffer);
      return audioBuffer;
    } catch (e) {
      // If native decodeAudioData fails (e.g. .sf2 or .sft SoundFont binary), try SF2 parser fallback
      try {
        const sf2Buffer = this.parseSF2(arrayBuffer, ctx);
        this.decodedCache.set(name, sf2Buffer);
        return sf2Buffer;
      } catch (sf2Err: any) {
        console.error(`Failed to decode audio or SF2 data for file ${name}:`, e, sf2Err);
        throw new Error(`Could not decode file ${name}. Ensure it is a valid audio or soundfont file (${sf2Err?.message || 'Invalid format'}).`);
      }
    }
  }

  /**
   * SoundFont 2 (SF2) RIFF Parser
   * Extracts PCM audio data and sample headers from SF2 files to generate Web Audio AudioBuffers
   */
  private parseSF2(arrayBuffer: ArrayBuffer, ctx: AudioContext): AudioBuffer {
    const data = new DataView(arrayBuffer);
    const totalLength = arrayBuffer.byteLength;

    if (totalLength < 12) {
      throw new Error('File too small to be a valid SF2 SoundFont.');
    }

    const getString = (offset: number, length: number): string => {
      let str = '';
      for (let i = 0; i < length; i++) {
        if (offset + i >= totalLength) break;
        const charCode = data.getUint8(offset + i);
        if (charCode === 0) break;
        str += String.fromCharCode(charCode);
      }
      return str;
    };

    const riff = getString(0, 4);
    if (riff !== 'RIFF') {
      throw new Error('Not a valid RIFF container.');
    }

    const formType = getString(8, 4);
    if (formType !== 'sfbk') {
      throw new Error(`Not an SF2 SoundFont (Form Type: ${formType}).`);
    }

    let smplOffset = -1;
    let smplLength = 0;
    let shdrOffset = -1;
    let shdrLength = 0;

    const scanChunks = (start: number, end: number) => {
      let pos = start;
      while (pos <= end - 8) {
        const chunkId = getString(pos, 4);
        const chunkSize = data.getUint32(pos + 4, true);
        const chunkDataStart = pos + 8;

        if (chunkId === 'LIST') {
          if (pos + 12 <= end) {
            scanChunks(chunkDataStart + 4, Math.min(end, chunkDataStart + chunkSize));
          }
        } else if (chunkId === 'smpl') {
          smplOffset = chunkDataStart;
          smplLength = chunkSize;
        } else if (chunkId === 'shdr') {
          shdrOffset = chunkDataStart;
          shdrLength = chunkSize;
        }

        pos = chunkDataStart + chunkSize;
        if (pos % 2 !== 0) pos++; // Word alignment padding
      }
    };

    scanChunks(12, totalLength);

    if (smplOffset === -1 || shdrOffset === -1) {
      throw new Error('SF2 file missing smpl or shdr data chunks.');
    }

    interface SF2SampleHeader {
      name: string;
      start: number;
      end: number;
      sampleRate: number;
      originalPitch: number;
      sampleType: number;
    }

    const samples: SF2SampleHeader[] = [];
    const numSamples = Math.floor(shdrLength / 46);

    for (let i = 0; i < numSamples; i++) {
      const hOffset = shdrOffset + i * 46;
      if (hOffset + 46 > totalLength) break;

      const name = getString(hOffset, 20).trim();
      const start = data.getUint32(hOffset + 20, true);
      const end = data.getUint32(hOffset + 24, true);
      const sampleRate = data.getUint32(hOffset + 36, true);
      const originalPitch = data.getUint8(hOffset + 40);
      const sampleType = data.getUint16(hOffset + 44, true);

      // Filter out EOS terminal sample or invalid/empty samples
      if (end > start + 100 && (sampleType & 0x7fff) <= 4) {
        samples.push({
          name,
          start,
          end,
          sampleRate: sampleRate > 0 ? sampleRate : 44100,
          originalPitch: (originalPitch >= 12 && originalPitch <= 108) ? originalPitch : 60,
          sampleType
        });
      }
    }

    if (samples.length === 0) {
      throw new Error('No valid sample entries found in SF2 headers.');
    }

    // Sort samples to pick the best main sample (closest to middle C 60 and longest length)
    samples.sort((a, b) => {
      const distA = Math.abs(a.originalPitch - 60);
      const distB = Math.abs(b.originalPitch - 60);
      if (distA !== distB) return distA - distB;
      return (b.end - b.start) - (a.end - a.start);
    });

    const bestSample = samples[0];
    const sampleCount = bestSample.end - bestSample.start;
    const startByte = smplOffset + bestSample.start * 2;

    if (startByte + sampleCount * 2 > totalLength) {
      throw new Error('Sample boundaries exceed SF2 file length.');
    }

    const pcm16 = new Int16Array(arrayBuffer, startByte, sampleCount);

    // Calibrate sample rate relative to Middle C (60 / 261.63 Hz)
    const pitchShiftRatio = Math.pow(2, (60 - bestSample.originalPitch) / 12);
    const effectiveSampleRate = Math.round(bestSample.sampleRate * pitchShiftRatio);
    const finalSampleRate = Math.max(8000, Math.min(192000, effectiveSampleRate));

    const audioBuffer = ctx.createBuffer(1, sampleCount, finalSampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      channelData[i] = pcm16[i] / 32768.0;
    }

    return audioBuffer;
  }

  /**
   * Get an already decoded buffer synchronously from memory cache
   */
  getDecodedBuffer(name: string): AudioBuffer | undefined {
    return this.decodedCache.get(name);
  }

  /**
   * Preload a soundfont from OPFS into the memory cache
   */
  async preload(name: string, ctx: AudioContext): Promise<void> {
    try {
      if (this.decodedCache.has(name)) return;
      await this.loadAndDecode(name, ctx);
    } catch (e) {
      console.error(`Failed to preload soundfont ${name}:`, e);
    }
  }

  /**
   * Quick check if file exists in OPFS
   */
  async existsInOPFS(name: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }
}

export const soundfontService = new SoundfontService();
