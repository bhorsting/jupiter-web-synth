import { PerformanceSettings } from '../types';

export interface SoundfontFile {
  id: string;
  name: string;
  size?: number;
  isDownloaded: boolean;
}

export interface SoundfontZone {
  sampleIndex: number;
  sampleName: string;
  keyLow: number;
  keyHigh: number;
  velLow: number;
  velHigh: number;
  rootKey: number;
  coarseTune: number;
  fineTune: number;
  attenuation: number; // 0..1 gain multiplier
  loopMode: number; // 0 = no loop, 1 = loop
  startSample: number;
  endSample: number;
  startLoopSample: number;
  endLoopSample: number;
  sampleRate: number;
  audioBuffer?: AudioBuffer;
}

export interface SoundfontPresetInfo {
  index: number;
  name: string;
  presetNum?: number;
  bankNum?: number;
  zones: SoundfontZone[];
}

class SoundfontService {
  private decodedCache: Map<string, AudioBuffer> = new Map();
  private fileBufferCache: Map<string, ArrayBuffer> = new Map();
  private sampleListCache: Map<string, Array<{ index: number; name: string }>> = new Map();
  private parsedSF2Cache: Map<string, SoundfontPresetInfo[]> = new Map();

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
      this.clearFileCache(name);
    } catch (e) {
      console.error(`Failed to delete file ${name} from OPFS:`, e);
      throw e;
    }
  }

  private clearFileCache(name: string) {
    this.fileBufferCache.delete(name);
    this.sampleListCache.delete(name);
    this.parsedSF2Cache.delete(name);
    for (const key of Array.from(this.decodedCache.keys())) {
      if (key === name || key.startsWith(`${name}::`)) {
        this.decodedCache.delete(key);
      }
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

    this.clearFileCache(name);
  }

  /**
   * Get raw ArrayBuffer from OPFS or memory cache
   */
  private async getFileBuffer(name: string): Promise<ArrayBuffer> {
    if (this.fileBufferCache.has(name)) {
      return this.fileBufferCache.get(name)!;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(name);
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    this.fileBufferCache.set(name, arrayBuffer);
    return arrayBuffer;
  }

  /**
   * Inspect file and return list of all contained presets / sounds
   */
  async getSamplesForFile(name: string, ctx?: AudioContext): Promise<Array<{ index: number; name: string }>> {
    if (!name) return [];
    if (this.sampleListCache.has(name)) {
      return this.sampleListCache.get(name)!;
    }

    try {
      const presets = await this.getPresetsForFile(name, ctx);
      if (presets && presets.length > 0) {
        const list = presets.map(p => ({ index: p.index, name: p.name }));
        this.sampleListCache.set(name, list);
        return list;
      }
    } catch (e) {
      // Not SF2 or failed parsing sample list
    }

    const defaultList = [{ index: 0, name: name }];
    this.sampleListCache.set(name, defaultList);
    return defaultList;
  }

  /**
   * Load a soundfont file from OPFS, parse multi-sample zones/presets, and cache in memory
   */
  async loadAndDecode(name: string, ctx: AudioContext, sampleIndex: number = 0): Promise<AudioBuffer> {
    const cacheKey = `${name}::${sampleIndex}`;
    if (this.decodedCache.has(cacheKey)) {
      return this.decodedCache.get(cacheKey)!;
    }
    if (sampleIndex === 0 && this.decodedCache.has(name)) {
      return this.decodedCache.get(name)!;
    }

    const arrayBuffer = await this.getFileBuffer(name);

    // Parse full SF2 presets and multi-sample zones
    await this.getPresetsForFile(name, ctx);

    // Decode audio data using native API or SF2 parser fallback for single buffer
    try {
      const bufferToDecode = arrayBuffer.slice(0);
      const audioBuffer = await ctx.decodeAudioData(bufferToDecode);
      this.decodedCache.set(cacheKey, audioBuffer);
      if (sampleIndex === 0) this.decodedCache.set(name, audioBuffer);
      return audioBuffer;
    } catch (e) {
      try {
        const sf2Buffer = this.parseSF2Fallback(arrayBuffer, ctx, sampleIndex);
        this.decodedCache.set(cacheKey, sf2Buffer);
        if (sampleIndex === 0) this.decodedCache.set(name, sf2Buffer);
        return sf2Buffer;
      } catch (sf2Err: any) {
        // If we have parsed SF2 zones for this preset, use the first zone's buffer
        const presets = this.parsedSF2Cache.get(name);
        if (presets && presets.length > sampleIndex && presets[sampleIndex].zones.length > 0) {
          const buf = presets[sampleIndex].zones[0].audioBuffer;
          if (buf) {
            this.decodedCache.set(cacheKey, buf);
            if (sampleIndex === 0) this.decodedCache.set(name, buf);
            return buf;
          }
        }
        console.error(`Failed to decode audio or SF2 data for file ${name}:`, e, sf2Err);
        throw new Error(`Could not decode file ${name}. Ensure it is a valid audio or soundfont file.`);
      }
    }
  }

  /**
   * Parse full SoundFont 2 (SF2) structure including Presets, Instruments, Generators, and Multi-Sample Zones
   */
  async getPresetsForFile(name: string, ctx?: AudioContext): Promise<SoundfontPresetInfo[]> {
    if (this.parsedSF2Cache.has(name)) {
      return this.parsedSF2Cache.get(name)!;
    }

    try {
      const arrayBuffer = await this.getFileBuffer(name);
      const audioCtx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
      const presets = this.parseSF2Full(arrayBuffer, audioCtx);
      if (presets && presets.length > 0) {
        this.parsedSF2Cache.set(name, presets);
        return presets;
      }
    } catch (e) {
      console.warn(`Failed to parse full SF2 structures for ${name}:`, e);
    }

    const defaultPresets: SoundfontPresetInfo[] = [{
      index: 0,
      name: name,
      zones: []
    }];
    this.parsedSF2Cache.set(name, defaultPresets);
    return defaultPresets;
  }

  /**
   * Synchronously get matching zones for note and velocity from parsed SF2 cache
   */
  getMatchingZonesSync(name: string, presetIndex: number = 0, midiNote: number = 60, velocity: number = 0.8): SoundfontZone[] {
    const presets = this.parsedSF2Cache.get(name);
    if (!presets || presets.length === 0) return [];

    const preset = presets.find(p => p.index === presetIndex) || presets[0];
    if (!preset || !preset.zones || preset.zones.length === 0) return [];

    const vel127 = Math.max(1, Math.min(127, Math.round(velocity * 127)));

    // Match both key range and velocity range
    let matching = preset.zones.filter(z => 
      midiNote >= z.keyLow && midiNote <= z.keyHigh &&
      vel127 >= z.velLow && vel127 <= z.velHigh
    );

    // Fallback 1: Match key range regardless of velocity range
    if (matching.length === 0) {
      matching = preset.zones.filter(z => midiNote >= z.keyLow && midiNote <= z.keyHigh);
    }

    // Fallback 2: Pick closest key range
    if (matching.length === 0 && preset.zones.length > 0) {
      let bestDist = Infinity;
      let bestZone = preset.zones[0];
      for (const z of preset.zones) {
        const center = (z.keyLow + z.keyHigh) / 2;
        const dist = Math.abs(midiNote - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestZone = z;
        }
      }
      matching.push(bestZone);
    }

    return matching;
  }

  /**
   * SoundFont 2 (SF2) Full Parser implementation
   */
  private parseSF2Full(arrayBuffer: ArrayBuffer, ctx: AudioContext): SoundfontPresetInfo[] {
    const data = new DataView(arrayBuffer);
    const totalLength = arrayBuffer.byteLength;

    if (totalLength < 12) return [];

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

    if (getString(0, 4) !== 'RIFF' || getString(8, 4) !== 'sfbk') {
      return [];
    }

    let smplOffset = -1;
    let shdrOffset = -1;
    let shdrLength = 0;
    let phdrOffset = -1;
    let phdrLength = 0;
    let pbagOffset = -1;
    let pbagLength = 0;
    let pgenOffset = -1;
    let pgenLength = 0;
    let instOffset = -1;
    let instLength = 0;
    let ibagOffset = -1;
    let ibagLength = 0;
    let igenOffset = -1;
    let igenLength = 0;

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
        } else if (chunkId === 'smpl') smplOffset = chunkDataStart;
        else if (chunkId === 'shdr') { shdrOffset = chunkDataStart; shdrLength = chunkSize; }
        else if (chunkId === 'phdr') { phdrOffset = chunkDataStart; phdrLength = chunkSize; }
        else if (chunkId === 'pbag') { pbagOffset = chunkDataStart; pbagLength = chunkSize; }
        else if (chunkId === 'pgen') { pgenOffset = chunkDataStart; pgenLength = chunkSize; }
        else if (chunkId === 'inst') { instOffset = chunkDataStart; instLength = chunkSize; }
        else if (chunkId === 'ibag') { ibagOffset = chunkDataStart; ibagLength = chunkSize; }
        else if (chunkId === 'igen') { igenOffset = chunkDataStart; igenLength = chunkSize; }

        pos = chunkDataStart + chunkSize;
        if (pos % 2 !== 0) pos++;
      }
    };

    scanChunks(12, totalLength);

    if (smplOffset === -1 || shdrOffset === -1) return [];

    // Parse Sample Headers (shdr)
    interface RawSampleHeader {
      index: number;
      name: string;
      start: number;
      end: number;
      startLoop: number;
      endLoop: number;
      sampleRate: number;
      originalPitch: number;
      pitchCorrection: number;
      sampleType: number;
    }

    const numSamples = Math.floor(shdrLength / 46);
    const samples: RawSampleHeader[] = [];

    for (let i = 0; i < numSamples; i++) {
      const hOffset = shdrOffset + i * 46;
      if (hOffset + 46 > totalLength) break;

      const name = getString(hOffset, 20).trim();
      const start = data.getUint32(hOffset + 20, true);
      const end = data.getUint32(hOffset + 24, true);
      const startLoop = data.getUint32(hOffset + 28, true);
      const endLoop = data.getUint32(hOffset + 32, true);
      const sampleRate = data.getUint32(hOffset + 36, true);
      const originalPitch = data.getUint8(hOffset + 40);
      const pitchCorrection = data.getInt8(hOffset + 41);
      const sampleType = data.getUint16(hOffset + 44, true);

      samples.push({
        index: i,
        name: name || `Sample ${i + 1}`,
        start,
        end,
        startLoop,
        endLoop,
        sampleRate: sampleRate > 0 ? sampleRate : 44100,
        originalPitch: (originalPitch >= 0 && originalPitch <= 127) ? originalPitch : 60,
        pitchCorrection,
        sampleType
      });
    }

    // Decode and cache PCM AudioBuffer per sample header index
    const sampleBufferCache = new Map<number, AudioBuffer>();
    const getSampleBuffer = (sIndex: number): AudioBuffer | undefined => {
      if (sampleBufferCache.has(sIndex)) return sampleBufferCache.get(sIndex);
      const smp = samples[sIndex];
      if (!smp) return undefined;

      const sampleCount = smp.end - smp.start;
      if (sampleCount <= 0) return undefined;

      const startByte = smplOffset + smp.start * 2;
      if (startByte + sampleCount * 2 > totalLength) return undefined;

      const pcm16 = new Int16Array(arrayBuffer, startByte, sampleCount);
      const audioBuffer = ctx.createBuffer(1, sampleCount, smp.sampleRate);
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < sampleCount; i++) {
        channelData[i] = pcm16[i] / 32768.0;
      }

      sampleBufferCache.set(sIndex, audioBuffer);
      return audioBuffer;
    };

    // If preset chunks are missing or invalid, generate multi-sample zones directly from sample headers
    if (phdrOffset === -1 || instOffset === -1 || pbagOffset === -1 || pgenOffset === -1 || ibagOffset === -1 || igenOffset === -1) {
      return this.buildMultiSamplePresetsFromHeaders(samples, getSampleBuffer);
    }

    // Generator Operators
    const GEN_KEY_RANGE = 43;
    const GEN_VEL_RANGE = 44;
    const GEN_INSTRUMENT = 41;
    const GEN_SAMPLE_ID = 53;
    const GEN_OVERRIDING_ROOT_KEY = 58;
    const GEN_COARSE_TUNE = 51;
    const GEN_FINE_TUNE = 52;
    const GEN_INITIAL_ATTENUATION = 48;
    const GEN_SAMPLE_MODES = 54;
    const GEN_START_ADDRS_OFFSET = 0;
    const GEN_END_ADDRS_OFFSET = 1;
    const GEN_START_LOOP_ADDRS_OFFSET = 2;
    const GEN_END_LOOP_ADDRS_OFFSET = 3;

    // Helper to parse generator chunks
    const readGens = (genChunkOffset: number, genChunkLength: number, startGenIdx: number, endGenIdx: number) => {
      const gens: Array<{ oper: number; amountUint: number; amountInt: number }> = [];
      const numGensTotal = Math.floor(genChunkLength / 4);

      for (let g = startGenIdx; g < Math.min(numGensTotal, endGenIdx); g++) {
        const offset = genChunkOffset + g * 4;
        if (offset + 4 > totalLength) break;
        const oper = data.getUint16(offset, true);
        const amountUint = data.getUint16(offset + 2, true);
        const amountInt = data.getInt16(offset + 2, true);
        gens.push({ oper, amountUint, amountInt });
      }
      return gens;
    };

    // Parse Instrument Headers (inst)
    interface InstZoneData {
      sampleID?: number;
      keyLow: number;
      keyHigh: number;
      velLow: number;
      velHigh: number;
      overridingRootKey: number;
      coarseTune: number;
      fineTune: number;
      attenuation: number;
      sampleModes: number;
      startOffset: number;
      endOffset: number;
      startLoopOffset: number;
      endLoopOffset: number;
    }

    const numInsts = Math.max(0, Math.floor(instLength / 22) - 1);
    const numIbags = Math.floor(ibagLength / 4);
    const instrumentsZonesMap = new Map<number, InstZoneData[]>();

    for (let i = 0; i < numInsts; i++) {
      const offset = instOffset + i * 22;
      const nextOffset = instOffset + (i + 1) * 22;
      if (nextOffset > totalLength) break;

      const ibagStart = data.getUint16(offset + 20, true);
      const ibagEnd = data.getUint16(nextOffset + 20, true);

      let globalZoneGens: any[] = [];
      const instZones: InstZoneData[] = [];

      for (let b = ibagStart; b < Math.min(numIbags - 1, ibagEnd); b++) {
        const bOffset = ibagOffset + b * 4;
        const bNextOffset = ibagOffset + (b + 1) * 4;
        const genStart = data.getUint16(bOffset, true);
        const genEnd = data.getUint16(bNextOffset, true);

        const gens = readGens(igenOffset, igenLength, genStart, genEnd);
        const hasSampleID = gens.some(g => g.oper === GEN_SAMPLE_ID);

        if (!hasSampleID) {
          globalZoneGens = gens;
        } else {
          // Combine global + zone generators
          let keyLow = 0, keyHigh = 127, velLow = 0, velHigh = 127;
          let overridingRootKey = -1, coarseTune = 0, fineTune = 0, attenuation = 0, sampleModes = 0;
          let startOffset = 0, endOffset = 0, startLoopOffset = 0, endLoopOffset = 0;
          let sampleID: number | undefined = undefined;

          const applyGen = (g: { oper: number; amountUint: number; amountInt: number }) => {
            if (g.oper === GEN_KEY_RANGE) { keyLow = g.amountUint & 0xff; keyHigh = (g.amountUint >> 8) & 0xff; }
            else if (g.oper === GEN_VEL_RANGE) { velLow = g.amountUint & 0xff; velHigh = (g.amountUint >> 8) & 0xff; }
            else if (g.oper === GEN_OVERRIDING_ROOT_KEY) overridingRootKey = g.amountInt;
            else if (g.oper === GEN_COARSE_TUNE) coarseTune += g.amountInt;
            else if (g.oper === GEN_FINE_TUNE) fineTune += g.amountInt;
            else if (g.oper === GEN_INITIAL_ATTENUATION) attenuation += g.amountInt;
            else if (g.oper === GEN_SAMPLE_MODES) sampleModes = g.amountUint;
            else if (g.oper === GEN_SAMPLE_ID) sampleID = g.amountUint;
            else if (g.oper === GEN_START_ADDRS_OFFSET) startOffset += g.amountInt;
            else if (g.oper === GEN_END_ADDRS_OFFSET) endOffset += g.amountInt;
            else if (g.oper === GEN_START_LOOP_ADDRS_OFFSET) startLoopOffset += g.amountInt;
            else if (g.oper === GEN_END_LOOP_ADDRS_OFFSET) endLoopOffset += g.amountInt;
          };

          globalZoneGens.forEach(applyGen);
          gens.forEach(applyGen);

          if (sampleID !== undefined) {
            instZones.push({
              sampleID, keyLow, keyHigh, velLow, velHigh,
              overridingRootKey, coarseTune, fineTune, attenuation, sampleModes,
              startOffset, endOffset, startLoopOffset, endLoopOffset
            });
          }
        }
      }
      instrumentsZonesMap.set(i, instZones);
    }

    // Parse Preset Headers (phdr)
    const numPresets = Math.max(0, Math.floor(phdrLength / 38) - 1);
    const numPbags = Math.floor(pbagLength / 4);
    const parsedPresets: SoundfontPresetInfo[] = [];

    for (let p = 0; p < numPresets; p++) {
      const offset = phdrOffset + p * 38;
      const nextOffset = phdrOffset + (p + 1) * 38;
      if (nextOffset > totalLength) break;

      const presetName = getString(offset, 20).trim();
      const presetNum = data.getUint16(offset + 20, true);
      const bankNum = data.getUint16(offset + 22, true);
      const pbagStart = data.getUint16(offset + 24, true);
      const pbagEnd = data.getUint16(nextOffset + 24, true);

      let globalPresetGens: any[] = [];
      const presetZones: SoundfontZone[] = [];

      for (let b = pbagStart; b < Math.min(numPbags - 1, pbagEnd); b++) {
        const bOffset = pbagOffset + b * 4;
        const bNextOffset = pbagOffset + (b + 1) * 4;
        const genStart = data.getUint16(bOffset, true);
        const genEnd = data.getUint16(bNextOffset, true);

        const gens = readGens(pgenOffset, pgenLength, genStart, genEnd);
        const hasInst = gens.some(g => g.oper === GEN_INSTRUMENT);

        if (!hasInst) {
          globalPresetGens = gens;
        } else {
          let presetKeyLow = 0, presetKeyHigh = 127, presetVelLow = 0, presetVelHigh = 127;
          let presetCoarseTune = 0, presetFineTune = 0, presetAtten = 0;
          let instID: number | undefined = undefined;

          const applyPGen = (g: { oper: number; amountUint: number; amountInt: number }) => {
            if (g.oper === GEN_KEY_RANGE) { presetKeyLow = g.amountUint & 0xff; presetKeyHigh = (g.amountUint >> 8) & 0xff; }
            else if (g.oper === GEN_VEL_RANGE) { presetVelLow = g.amountUint & 0xff; presetVelHigh = (g.amountUint >> 8) & 0xff; }
            else if (g.oper === GEN_COARSE_TUNE) presetCoarseTune += g.amountInt;
            else if (g.oper === GEN_FINE_TUNE) presetFineTune += g.amountInt;
            else if (g.oper === GEN_INITIAL_ATTENUATION) presetAtten += g.amountInt;
            else if (g.oper === GEN_INSTRUMENT) instID = g.amountUint;
          };

          globalPresetGens.forEach(applyPGen);
          gens.forEach(applyPGen);

          if (instID !== undefined && instrumentsZonesMap.has(instID)) {
            const instZones = instrumentsZonesMap.get(instID)!;
            for (const iz of instZones) {
              const smp = samples[iz.sampleID!];
              if (!smp) continue;

              const finalKeyLow = Math.max(presetKeyLow, iz.keyLow);
              const finalKeyHigh = Math.min(presetKeyHigh, iz.keyHigh);
              const finalVelLow = Math.max(presetVelLow, iz.velLow);
              const finalVelHigh = Math.min(presetVelHigh, iz.velHigh);

              if (finalKeyLow <= finalKeyHigh && finalVelLow <= finalVelHigh) {
                const totalAtten = presetAtten + iz.attenuation;
                const gainFactor = Math.pow(10, -Math.max(0, totalAtten) / 200);
                const rootKey = iz.overridingRootKey >= 0 ? iz.overridingRootKey : smp.originalPitch;
                const buf = getSampleBuffer(iz.sampleID!);

                presetZones.push({
                  sampleIndex: iz.sampleID!,
                  sampleName: smp.name,
                  keyLow: finalKeyLow,
                  keyHigh: finalKeyHigh,
                  velLow: finalVelLow,
                  velHigh: finalVelHigh,
                  rootKey,
                  coarseTune: presetCoarseTune + iz.coarseTune,
                  fineTune: presetFineTune + iz.fineTune + smp.pitchCorrection,
                  attenuation: Math.max(0.01, Math.min(1.0, gainFactor)),
                  loopMode: iz.sampleModes !== 0 ? iz.sampleModes : (smp.sampleType & 1),
                  startSample: smp.start + iz.startOffset,
                  endSample: smp.end + iz.endOffset,
                  startLoopSample: smp.startLoop + iz.startLoopOffset,
                  endLoopSample: smp.endLoop + iz.endLoopOffset,
                  sampleRate: smp.sampleRate,
                  audioBuffer: buf
                });
              }
            }
          }
        }
      }

      parsedPresets.push({
        index: p,
        name: `${presetNum.toString().padStart(3, '0')}:${bankNum.toString().padStart(3, '0')} ${presetName || 'Preset ' + p}`,
        presetNum,
        bankNum,
        zones: presetZones
      });
    }

    if (parsedPresets.length === 0) {
      return this.buildMultiSamplePresetsFromHeaders(samples, getSampleBuffer);
    }

    return parsedPresets;
  }

  /**
   * Auto-generate multi-sample zones directly from raw sample headers when preset chunks are absent
   */
  private buildMultiSamplePresetsFromHeaders(
    samples: any[],
    getSampleBuffer: (idx: number) => AudioBuffer | undefined
  ): SoundfontPresetInfo[] {
    const validSamples = samples.filter(s => (s.end - s.start) > 100 && (s.sampleType & 0x7fff) <= 4);
    if (validSamples.length === 0) return [];

    // Sort samples by pitch
    validSamples.sort((a, b) => a.originalPitch - b.originalPitch);

    const zones: SoundfontZone[] = [];
    for (let i = 0; i < validSamples.length; i++) {
      const current = validSamples[i];
      const prev = i > 0 ? validSamples[i - 1] : null;
      const next = i < validSamples.length - 1 ? validSamples[i + 1] : null;

      const keyLow = prev ? Math.floor((prev.originalPitch + current.originalPitch) / 2) + 1 : 0;
      const keyHigh = next ? Math.floor((current.originalPitch + next.originalPitch) / 2) : 127;

      zones.push({
        sampleIndex: current.index,
        sampleName: current.name,
        keyLow,
        keyHigh,
        velLow: 0,
        velHigh: 127,
        rootKey: current.originalPitch,
        coarseTune: 0,
        fineTune: current.pitchCorrection,
        attenuation: 1.0,
        loopMode: current.sampleType & 1,
        startSample: current.start,
        endSample: current.end,
        startLoopSample: current.startLoop,
        endLoopSample: current.endLoop,
        sampleRate: current.sampleRate,
        audioBuffer: getSampleBuffer(current.index)
      });
    }

    return [{
      index: 0,
      name: 'Multi-Sample Instrument',
      zones
    }];
  }

  /**
   * SoundFont 2 (SF2) fallback parser for raw sample array
   */
  private extractSF2SampleHeaders(arrayBuffer: ArrayBuffer) {
    const data = new DataView(arrayBuffer);
    const totalLength = arrayBuffer.byteLength;
    if (totalLength < 12) return null;

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

    if (getString(0, 4) !== 'RIFF' || getString(8, 4) !== 'sfbk') return null;

    let smplOffset = -1;
    let shdrOffset = -1;
    let shdrLength = 0;

    const scanChunks = (start: number, end: number) => {
      let pos = start;
      while (pos <= end - 8) {
        const chunkId = getString(pos, 4);
        const chunkSize = data.getUint32(pos + 4, true);
        const chunkDataStart = pos + 8;

        if (chunkId === 'LIST') {
          if (pos + 12 <= end) scanChunks(chunkDataStart + 4, Math.min(end, chunkDataStart + chunkSize));
        } else if (chunkId === 'smpl') smplOffset = chunkDataStart;
        else if (chunkId === 'shdr') { shdrOffset = chunkDataStart; shdrLength = chunkSize; }

        pos = chunkDataStart + chunkSize;
        if (pos % 2 !== 0) pos++;
      }
    };

    scanChunks(12, totalLength);
    if (smplOffset === -1 || shdrOffset === -1) return null;

    const samples: any[] = [];
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

      if (end > start + 100 && (sampleType & 0x7fff) <= 4) {
        samples.push({
          index: samples.length,
          name: name || `Sound ${samples.length + 1}`,
          start,
          end,
          sampleRate: sampleRate > 0 ? sampleRate : 44100,
          originalPitch: (originalPitch >= 12 && originalPitch <= 108) ? originalPitch : 60,
          sampleType
        });
      }
    }

    return { smplOffset, totalLength, samples };
  }

  private extractSF2SampleList(arrayBuffer: ArrayBuffer): Array<{ index: number; name: string }> {
    const res = this.extractSF2SampleHeaders(arrayBuffer);
    if (!res || res.samples.length === 0) return [];
    return res.samples.map(s => ({ index: s.index, name: s.name }));
  }

  private parseSF2Fallback(arrayBuffer: ArrayBuffer, ctx: AudioContext, sampleIndex: number = 0): AudioBuffer {
    const res = this.extractSF2SampleHeaders(arrayBuffer);
    if (!res || res.samples.length === 0) {
      throw new Error('No valid sample entries found in SF2 headers.');
    }

    const { smplOffset, totalLength, samples } = res;
    const selectedIndex = Math.max(0, Math.min(sampleIndex, samples.length - 1));
    const targetSample = samples[selectedIndex];

    const sampleCount = targetSample.end - targetSample.start;
    const startByte = smplOffset + targetSample.start * 2;

    if (startByte + sampleCount * 2 > totalLength) {
      throw new Error('Sample boundaries exceed SF2 file length.');
    }

    const pcm16 = new Int16Array(arrayBuffer, startByte, sampleCount);
    const pitchShiftRatio = Math.pow(2, (60 - targetSample.originalPitch) / 12);
    const effectiveSampleRate = Math.round(targetSample.sampleRate * pitchShiftRatio);
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
  getDecodedBuffer(name: string, sampleIndex: number = 0): AudioBuffer | undefined {
    return this.decodedCache.get(`${name}::${sampleIndex}`) || this.decodedCache.get(name);
  }

  /**
   * Preload a soundfont sample/preset from OPFS into the memory cache
   */
  async preload(name: string, ctx: AudioContext, sampleIndex: number = 0): Promise<void> {
    try {
      const cacheKey = `${name}::${sampleIndex}`;
      if (this.decodedCache.has(cacheKey)) return;
      await this.loadAndDecode(name, ctx, sampleIndex);
    } catch (e) {
      console.error(`Failed to preload soundfont ${name} (sample/preset ${sampleIndex}):`, e);
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
