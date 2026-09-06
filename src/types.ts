/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DX7Operator {
  rates: number[];      // [R1, R2, R3, R4], 0-99
  levels: number[];     // [L1, L2, L3, L4], 0-99
  breakpoint: number;   // 0-99
  leftDepth: number;    // 0-99
  rightDepth: number;   // 0-99
  leftCurve: number;    // 0-3
  rightCurve: number;   // 0-3
  rateScaling: number;  // 0-7
  detune: number;       // -7 to +7
  ams: number;          // 0-3
  velocitySensitivity: number; // 0-7
  level: number;        // 0-99 (Output level)
  mode: number;         // 0: ratio, 1: fixed
  coarse: number;       // 0-31
  fine: number;         // 0-99
}

export interface DX7Voice {
  name: string;
  operators: DX7Operator[]; // Index 0 is Op1, index 5 is Op6
  pitchRates: number[];     // [R1, R2, R3, R4]
  pitchLevels: number[];    // [L1, L2, L3, L4]
  algorithm: number;        // 1-32
  feedback: number;         // 0-7
  keySync: boolean;
  lfoSpeed: number;         // 0-99
  lfoDelay: number;         // 0-99
  lfoPmd: number;           // 0-99
  lfoAmd: number;           // 0-99
  lfoSync: boolean;
  lfoWaveform: number;      // 0-5
  pitchModSensitivity: number; // 0-7
  transpose: number;        // 0-48
}

export function createDefaultDX7Voice(): DX7Voice {
  return {
    name: 'E. PIANO 1',
    algorithm: 5,
    feedback: 4,
    keySync: true,
    lfoSpeed: 35,
    lfoDelay: 0,
    lfoPmd: 0,
    lfoAmd: 0,
    lfoSync: true,
    lfoWaveform: 0,
    pitchModSensitivity: 3,
    transpose: 24,
    pitchRates: [99, 99, 99, 99],
    pitchLevels: [50, 50, 50, 50],
    operators: [
      // Op 1 (Carrier) - fundamental sine
      {
        rates: [95, 29, 20, 50],
        levels: [99, 95, 0, 0],
        breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
        rateScaling: 0, detune: 0, ams: 0, velocitySensitivity: 2, level: 99,
        mode: 0, coarse: 1, fine: 0
      },
      // Op 2 (Modulator to Op 1) - fast chime
      {
        rates: [99, 45, 12, 50],
        levels: [99, 0, 0, 0],
        breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
        rateScaling: 2, detune: 3, ams: 0, velocitySensitivity: 5, level: 78,
        mode: 0, coarse: 14, fine: 0
      },
      // Op 3 (Carrier) - mid-warmth
      {
        rates: [95, 25, 20, 50],
        levels: [99, 95, 0, 0],
        breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
        rateScaling: 0, detune: 0, ams: 0, velocitySensitivity: 2, level: 99,
        mode: 0, coarse: 1, fine: 0
      },
      // Op 4 (Modulator to Op 3) - warm body
      {
        rates: [99, 35, 12, 50],
        levels: [99, 0, 0, 0],
        breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
        rateScaling: 2, detune: -3, ams: 0, velocitySensitivity: 4, level: 68,
        mode: 0, coarse: 1, fine: 0
      },
      // Op 5 (Carrier) - high chime fundamental
      {
        rates: [95, 30, 20, 50],
        levels: [99, 95, 0, 0],
        breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
        rateScaling: 0, detune: 0, ams: 0, velocitySensitivity: 2, level: 85,
        mode: 0, coarse: 2, fine: 0
      },
      // Op 6 (Modulator to Op 5) - feedback shine
      {
        rates: [99, 50, 15, 50],
        levels: [99, 0, 0, 0],
        breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
        rateScaling: 3, detune: 0, ams: 0, velocitySensitivity: 6, level: 55,
        mode: 0, coarse: 1, fine: 0
      }
    ]
  };
}

export function getDX7Algorithm(algNum: number): { carriers: number[], modulators: { [to: number]: number[] }, feedbackSrc: number, feedbackDest: number } {
  // algNum is 1 to 32
  // We return 0-indexed operator indices (0 to 5 representing DX7 Op1 to Op6)
  let carriers: number[] = [];
  let modulators: { [to: number]: number[] } = {};
  let feedbackSrc = 5; // Op 6
  let feedbackDest = 5; // Op 6

  switch(algNum) {
    case 1:
      carriers = [0, 2];
      modulators = { 0: [1], 2: [3], 3: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 2:
      carriers = [0, 2];
      modulators = { 0: [1], 2: [3], 3: [4], 4: [5] };
      feedbackSrc = 1; feedbackDest = 1;
      break;
    case 3:
      carriers = [0, 3];
      modulators = { 0: [1], 1: [2], 3: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 4:
      carriers = [0, 3];
      modulators = { 0: [1], 1: [2], 3: [4], 4: [5] };
      feedbackSrc = 3; feedbackDest = 3;
      break;
    case 5:
      carriers = [0, 2, 4];
      modulators = { 0: [1], 2: [3], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 6:
      carriers = [0, 2, 4];
      modulators = { 0: [1], 2: [3], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 7:
      carriers = [0, 2];
      modulators = { 0: [1, 2], 2: [3], 3: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 8:
      carriers = [0, 2];
      modulators = { 0: [1, 2], 2: [3], 3: [4], 4: [5] };
      feedbackSrc = 3; feedbackDest = 3;
      break;
    case 9:
      carriers = [0, 2];
      modulators = { 0: [1], 2: [3, 4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 10:
      carriers = [0, 3];
      modulators = { 0: [1, 2], 3: [4, 5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 11:
      carriers = [0, 2];
      modulators = { 0: [1], 1: [5], 2: [3, 4] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 12:
      carriers = [0, 1, 2];
      modulators = { 0: [3], 1: [4], 2: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 13:
      carriers = [0, 1, 2];
      modulators = { 0: [3], 1: [4], 2: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 14:
      carriers = [0, 1];
      modulators = { 0: [2], 2: [3, 4], 1: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 15:
      carriers = [0, 1];
      modulators = { 0: [2], 2: [3, 4], 1: [5] };
      feedbackSrc = 1; feedbackDest = 1;
      break;
    case 16:
      carriers = [0, 1];
      modulators = { 0: [2, 3], 1: [4, 5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 17:
      carriers = [0, 1];
      modulators = { 0: [2, 3], 1: [4, 5] };
      feedbackSrc = 1; feedbackDest = 1;
      break;
    case 18:
      carriers = [0];
      modulators = { 0: [1, 2, 3], 3: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 19:
      carriers = [0, 2];
      modulators = { 0: [1], 1: [5], 2: [3], 3: [4] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 20:
      carriers = [0, 1, 2];
      modulators = { 0: [3], 3: [4], 1: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 21:
      carriers = [0, 1, 2];
      modulators = { 0: [3], 3: [4], 1: [5] };
      feedbackSrc = 2; feedbackDest = 2;
      break;
    case 22:
      carriers = [0, 1, 2];
      modulators = { 0: [3, 4, 5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 23:
      carriers = [0, 1, 2];
      modulators = { 0: [3, 4], 1: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 24:
      carriers = [0, 1, 2];
      modulators = { 0: [3], 1: [4], 2: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 25:
      carriers = [0, 1, 2];
      modulators = { 0: [3], 1: [4], 2: [5] };
      feedbackSrc = 0; feedbackDest = 0;
      break;
    case 26:
      carriers = [0, 1];
      modulators = { 0: [2], 2: [3], 1: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 27:
      carriers = [0, 1];
      modulators = { 0: [2], 2: [3], 1: [4], 4: [5] };
      feedbackSrc = 2; feedbackDest = 2;
      break;
    case 28:
      carriers = [0, 3];
      modulators = { 0: [1, 2], 3: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 29:
      carriers = [0, 1, 2];
      modulators = { 0: [3, 4], 1: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 30:
      carriers = [0];
      modulators = { 0: [1, 2, 3, 4, 5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 31:
      carriers = [0, 1, 2, 3, 4];
      modulators = { 0: [5] };
      feedbackSrc = 5; feedbackDest = 5;
      break;
    case 32:
      carriers = [0, 1, 2, 3, 4, 5];
      modulators = {};
      feedbackSrc = 5; feedbackDest = 5;
      break;
    default:
      carriers = [0, 2];
      modulators = { 0: [1], 2: [3], 3: [4], 4: [5] };
      feedbackSrc = 5; feedbackDest = 5;
  }

  return { carriers, modulators, feedbackSrc, feedbackDest };
}

export interface VoiceParams {
  lfoRate: number;
  lfoWaveform: 'sine' | 'sawtooth' | 'square' | 'random';
  lfoDelay: number;
  
  vco1Freq: number;
  vco1Range: 2 | 4 | 8 | 16;
  vco1Waveform: 'sawtooth' | 'square' | 'pulse' | 'triangle' | 'sine' | 'noise';
  vco1PulseWidth: number;
  vco1PwmMode: 'manual' | 'lfo';
  vco1VelocitySensitivity: number;
  vco1SoundfontEnabled: boolean;
  vco1SoundfontName: string;
  vco1SoundfontSampleIndex: number;
  
  vco2Freq: number;
  vco2Range: 2 | 4 | 8 | 16;
  vco2Waveform: 'sawtooth' | 'square' | 'pulse' | 'triangle' | 'sine' | 'noise';
  vco2PulseWidth: number;
  vco2PwmMode: 'manual' | 'lfo';
  vco2Detune: number;
  vco2Sync: boolean;
  vco2VelocitySensitivity: number;
  vco2SoundfontEnabled: boolean;
  vco2SoundfontName: string;
  vco2SoundfontSampleIndex: number;
  
  crossMod: number;
  vcoMix: number;
  portamentoTime: number;
  portamentoMode: 'off' | 'on' | 'auto';
  
  // Performance
  bpm: number;
  timeSignature: string;
  pitchBendRange?: number; // Per-patch override in semitones (0 to 24; -1 or undefined = use global setting)
  midiChannel?: 'default' | number; // Per-patch MIDI channel ('default' = use global config, 0 = Omni/All, 1-16 = specific channel)
  
  // Arpeggiator
  arpEnabled: boolean;
  arpMode: 'up' | 'down' | 'up-down' | 'random' | 'chord' | 'as-played' | 'up-poly' | 'down-poly';
  arpRange: 1 | 2 | 3 | 4;
  arpRate: number; 
  arpSync: boolean;
  arpSyncDivision: string;

  mixerVco1: number;
  mixerVco2: number;
  
  filterCutoff: number;
  filterResonance: number;
  filterSlope: 12 | 24;
  filterEnvAmount: number;
  filterLfoAmount: number;
  filterKeyboardTrack: number;
  filterVelocitySensitivity: number;
  lfoVelocitySensitivity: number;
  lfoSync: boolean;
  lfoSyncDivision: string;
  
  vcaLevel: number;
  vcaEnvAmount: number;
  vcaLfoAmount: number;
  vcoLfoAmount: number;
  vcoLfoSelect: 'vco1' | 'vco2' | 'both';
  vcaSource: 'env1' | 'lfo' | 'env2';
  masterVolume: number;
  
  env1Attack: number;
  env1Hold: number;
  env1Decay: number;
  env1Sustain: number;
  env1Release: number;
  
  env2Attack: number;
  env2Decay: number;
  env2Sustain: number;
  env2Release: number;

  // Effects
  chorusMix: number;
  chorusMode: 1 | 2 | 3;
  delayMix: number;
  delayTime: number;
  delayFeedback: number;
  reverbMix: number;
  reverbMode: 1 | 2 | 3;
  reverbTime: number;
  reverbDecay: number;
  reverbDamping: number;

  // Flanger (Classic analog BBD comb filter emulation)
  flangerMix: number;
  flangerRate: number;
  flangerDepth: number;
  flangerFeedback: number;
  flangerDelay: number;
  flangerPhase?: 'norm' | 'inv';

  // Distortion / Saturation
  distortionMix: number;
  distortionAmount: number;
  distortionMode?: 'default' | 'tube' | 'feedback';
  distortionFeedbackAmount?: number;
  distortionFeedbackFreq?: number;

  // Equalizer (5 bands: low, low-mid, mid, high-mid, high)
  eqBand1?: number;
  eqBand2?: number;
  eqBand3?: number;
  eqBand4?: number;
  eqBand5?: number;

  // Leslie (Rotary)
  leslieMix: number;
  leslieRate: number;
  leslieDepth: number;
  leslieSpeed: 'off' | 'lo' | 'high';

  // Tremolo
  tremoloMix: number;
  tremoloRate: number;
  tremoloDepth: number;

  // Compander
  compThreshold: number;
  compRatio: number;
  compKnee: number;
  compAttack: number;
  compRelease: number;
  compMix: number;
  filterEnvSource: 'env1' | 'env2';

  // Hammond Organ Engine Params
  synthEngine: 'jupiter' | 'hammond' | 'dx7';
  dx7Voice?: DX7Voice;
  hammondDb16: number;     // 16' (sub-octave)
  hammondDb513: number;    // 5 1/3' (quint)
  hammondDb8: number;      // 8' (fundamental)
  hammondDb4: number;      // 4' (octave)
  hammondDb223: number;    // 2 2/3' (nazard)
  hammondDb2: number;      // 2' (blockflote)
  hammondDb135: number;    // 1 3/5' (tierce)
  hammondDb113: number;    // 1 1/3' (larigot)
  hammondDb1: number;      // 1' (sifflote)
  hammondPercussionEnabled: boolean;
  hammondPercussionHarmonic: 'second' | 'third';
  hammondPercussionDecay: 'fast' | 'slow';
  hammondPercussionVolume: 'soft' | 'normal';
  hammondKeyClick: number; // key click level 0 to 1

  // Sub Oscillator
  subOscEnabled: boolean;
  subOscMix: number; // level 0 to 1
  subOscWaveform: 'sine' | 'triangle' | 'square';
  subOscOctave: -1 | -2; // octaves down

  // Metronome
  metronomeEnabled: boolean;
  metronomeVolume: number; // level 0 to 1
}

export interface MidiMapping {
  parameter: keyof VoiceParams;
  cc: number;
  channel: number;
}

export interface Patch {
  id: string;
  name: string;
  params: VoiceParams;
  midiMappings?: MidiMapping[];
  group?: string;
}

export interface MultiSlot {
  patchId: string;
  lowNote: number;       // 0-127 (MIDI note number)
  highNote: number;      // 0-127 (MIDI note number)
  lowVelocity: number;   // 0-127 (MIDI velocity)
  highVelocity: number;  // 0-127 (MIDI velocity)
  lowMapVelocity: number;// 0-127 (Mapped velocity)
  highMapVelocity: number;// 0-127 (Mapped velocity)
  transposeOctave: number;// -3 to +3
  transposeNote: number;  // -12 to +12 semitones
  midiChannel?: 'patch' | 'default' | number; // 'patch' = follow patch setting, 'default' = follow config, 0 = Omni, 1-16 = specific channel
  volume?: number;       // 0.0 to 1.0 (default 1.0)
  pan?: number;          // -1.0 to 1.0 (default 0.0)
  mute?: boolean;        // true if part is muted
  solo?: boolean;        // true if part is soloed
}

export interface Multi {
  id: string;
  name: string;
  slots: MultiSlot[];
  group?: string;
}

export interface MidiTrackOverride {
  patchId?: string;
  mute?: boolean;
  solo?: boolean;
  volume?: number;
}

export type SongTrackType = 'midi' | 'audio_click' | 'none';

export interface Song {
  id: string;
  name: string;
  type: 'patch' | 'multi';
  targetId: string;
  programChange?: number;
  midiFile?: string;
  midiTrackOverrides?: Record<number, MidiTrackOverride>;
  leadInBars?: number;
  autoGMMode?: boolean;
  trackType?: SongTrackType;
  clickAudioFile?: string; // CLICK_{Name}.wav
  soundAudioFile?: string; // SOUND_{name}.wav
  bpm?: number; // Manual BPM
  midiReceive?: boolean; // When false, synth ignores incoming MIDI notes/controllers (for click-only songs or extra synths)
}

export interface Setlist {
  id: string;
  name: string;
  songs: Song[];
}

export const DEFAULT_PARAMS: VoiceParams = {
  lfoRate: 5,
  lfoWaveform: 'sine',
  lfoDelay: 0,
  
  vco1Freq: 0,
  vco1Range: 8,
  vco1Waveform: 'sawtooth',
  vco1PulseWidth: 0.5,
  vco1PwmMode: 'manual',
  vco1VelocitySensitivity: 0,
  vco1SoundfontEnabled: false,
  vco1SoundfontName: 'GeneralUser-GS.sf2',
  vco1SoundfontSampleIndex: 0,
  
  vco2Freq: 0,
  vco2Range: 8,
  vco2Waveform: 'sawtooth',
  vco2PulseWidth: 0.5,
  vco2PwmMode: 'manual',
  vco2Detune: 0,
  vco2Sync: false,
  vco2VelocitySensitivity: 0,
  vco2SoundfontEnabled: false,
  vco2SoundfontName: 'GeneralUser-GS.sf2',
  vco2SoundfontSampleIndex: 0,
  
  crossMod: 0,
  vcoMix: 0.5,
  portamentoTime: 0.1,
  portamentoMode: 'off',
  bpm: 120,
  timeSignature: '4/4',
  pitchBendRange: -1, // -1: use global setting; 0-24: override semitones
  midiChannel: 'default', // 'default': use global setting; 0: Omni; 1-16: specific channel

  // Arpeggiator
  arpEnabled: false,
  arpMode: 'up',
  arpRange: 1,
  arpRate: 300,
  arpSync: false,
  arpSyncDivision: '1/16',

  mixerVco1: 0.8,
  mixerVco2: 0.6,
  
  filterCutoff: 1000,
  filterResonance: 0,
  filterSlope: 24,
  filterEnvAmount: 0,
  filterLfoAmount: 0,
  filterKeyboardTrack: 0.5,
  filterVelocitySensitivity: 0.5,
  lfoVelocitySensitivity: 0.0,
  lfoSync: false,
  lfoSyncDivision: '1/4',
  
  vcaLevel: 0.8,
  vcaEnvAmount: 1,
  vcaLfoAmount: 0,
  vcoLfoAmount: 0,
  vcoLfoSelect: 'both',
  vcaSource: 'env2',
  masterVolume: 0.8,
  
  env1Attack: 0.01,
  env1Hold: 0,
  env1Decay: 0.5,
  env1Sustain: 0.3,
  env1Release: 1.0,
  
  env2Attack: 0.01,
  env2Decay: 0.5,
  env2Sustain: 0.5,
  env2Release: 0.5,

  chorusMix: 0,
  chorusMode: 1,
  delayMix: 0,
  delayTime: 0.4,
  delayFeedback: 0.4,
  reverbMix: 0,
  reverbMode: 1,
  reverbTime: 2.0,
  reverbDecay: 2.0,
  reverbDamping: 0.5,

  // Flanger defaults (not enabled on any patch yet)
  flangerMix: 0,
  flangerRate: 0.3,
  flangerDepth: 0.7,
  flangerFeedback: 0.6,
  flangerDelay: 0.003,
  flangerPhase: 'norm',

  distortionMix: 0,
  distortionAmount: 0.1,
  distortionMode: 'default',
  distortionFeedbackAmount: 0.3,
  distortionFeedbackFreq: 800,
  eqBand1: 0,
  eqBand2: 0,
  eqBand3: 0,
  eqBand4: 0,
  eqBand5: 0,

  leslieMix: 0,
  leslieRate: 0.8,
  leslieDepth: 0.5,
  leslieSpeed: 'lo',

  tremoloMix: 0,
  tremoloRate: 4.0,
  tremoloDepth: 0.5,

  compThreshold: -24,
  compRatio: 4,
  compKnee: 30,
  compAttack: 0.003,
  compRelease: 0.25,
  compMix: 1.0,
  filterEnvSource: 'env1',

  // Hammond defaults
  synthEngine: 'jupiter',
  hammondDb16: 8,
  hammondDb513: 8,
  hammondDb8: 8,
  hammondDb4: 8,
  hammondDb223: 0,
  hammondDb2: 8,
  hammondDb135: 0,
  hammondDb113: 0,
  hammondDb1: 0,
  hammondPercussionEnabled: false,
  hammondPercussionHarmonic: 'third',
  hammondPercussionDecay: 'fast',
  hammondPercussionVolume: 'normal',
  hammondKeyClick: 0.5,
  
  // Sub Oscillator defaults
  subOscEnabled: false,
  subOscMix: 0,
  subOscWaveform: 'square',
  subOscOctave: -1,

  // Metronome defaults
  metronomeEnabled: false,
  metronomeVolume: 0.4,
  dx7Voice: createDefaultDX7Voice(),
};

export interface PerformanceSettings {
  maxVoices: number;
  sampleRate: number; // 0 for Native DAC Hardware Rate (Auto-lock DAC clock), or explicit Hz like 44100, 48000, 96000
  audioBufferLength: 128 | 256 | 512 | 1024 | 2048;
  latencyHint: 'balanced' | 'interactive' | 'playback' | 0;
  theme: 'jupiter' | 'dark' | 'light';
  midiInputId: string;
  midiChannel: number; // 0 for all channels, 1-16 for specific
  pitchBendRange: number;
  velocitySensitivity: number;
  googleSheetUrl: string;
  autoConnectMicroKontrol: boolean;
  googleDriveApiKey?: string;
  googleDriveFolderId?: string;
  enableSurround51: boolean;
  songPlayPauseCc?: number | null;
  songPlayPauseChannel?: number | null;
}

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  maxVoices: 8,
  sampleRate: 0, // 0 = Auto / Native DAC Hardware Rate (prevents Windows/Chrome resampling buffer latency)
  audioBufferLength: 512,
  latencyHint: 0, // Default to lowest possible latency mode
  theme: 'jupiter',
  midiInputId: 'all',
  midiChannel: 0,
  pitchBendRange: 2,
  velocitySensitivity: 0.5,
  googleSheetUrl: '',
  autoConnectMicroKontrol: true,
  googleDriveApiKey: '',
  googleDriveFolderId: '',
  enableSurround51: false,
  songPlayPauseCc: null,
  songPlayPauseChannel: null,
};

export function cleanVoiceParams(rawParams: any): VoiceParams {
  const params = { ...DEFAULT_PARAMS };
  
  if (!rawParams || typeof rawParams !== 'object') {
    return params;
  }
  
  Object.keys(DEFAULT_PARAMS).forEach(key => {
    const typedKey = key as keyof VoiceParams;
    const defaultValue = DEFAULT_PARAMS[typedKey];
    const rawValue = rawParams[typedKey];
    
    if (typedKey === 'dx7Voice') {
      if (rawParams.dx7Voice && typeof rawParams.dx7Voice === 'object') {
        params.dx7Voice = rawParams.dx7Voice;
      } else if (typeof rawParams.dx7Voice === 'string' && rawParams.dx7Voice.startsWith('{')) {
        try {
          params.dx7Voice = JSON.parse(rawParams.dx7Voice);
        } catch {
          params.dx7Voice = createDefaultDX7Voice();
        }
      }
      return;
    }

    if (typedKey === 'midiChannel') {
      if (rawValue === 'default' || rawValue === undefined || rawValue === null || rawValue === '' || rawValue === -1) {
        params.midiChannel = 'default';
      } else {
        const num = Number(rawValue);
        params.midiChannel = isNaN(num) ? 'default' : Math.max(0, Math.min(16, Math.floor(num)));
      }
      return;
    }
    
    // Check if the parameter is missing, undefined, null, or is NaN
    if (rawValue === undefined || rawValue === null || (typeof defaultValue === 'number' && typeof rawValue === 'number' && isNaN(rawValue))) {
      // Use default
      (params as any)[typedKey] = defaultValue;
    } else if (typeof defaultValue === 'number') {
      // Coerce to number if it's a string, and check validity
      const parsed = Number(rawValue);
      if (isNaN(parsed)) {
        (params as any)[typedKey] = defaultValue;
      } else {
        (params as any)[typedKey] = parsed;
      }
    } else if (typeof defaultValue === 'boolean') {
      // Coerce to boolean if it's a string or other falsy/truthy value
      if (typeof rawValue === 'string') {
        (params as any)[typedKey] = (rawValue.toLowerCase() === 'true' || rawValue === '1');
      } else {
        (params as any)[typedKey] = !!rawValue;
      }
    } else {
      // Keep string if default is string
      (params as any)[typedKey] = String(rawValue);
    }
  });
  
  return params;
}

