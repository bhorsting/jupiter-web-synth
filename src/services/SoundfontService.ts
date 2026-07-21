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
      // Use slice to avoid consuming the original array buffer directly if we need to keep references
      const bufferToDecode = arrayBuffer.slice(0);
      const audioBuffer = await ctx.decodeAudioData(bufferToDecode);
      this.decodedCache.set(name, audioBuffer);
      return audioBuffer;
    } catch (e) {
      console.error(`Failed to decode audio data for file ${name}:`, e);
      throw new Error(`Could not decode file ${name}. Ensure it is a valid audio or soundfont file.`);
    }
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
