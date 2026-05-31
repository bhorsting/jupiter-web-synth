/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VoiceParams {
  lfoRate: number;
  lfoWaveform: 'sine' | 'sawtooth' | 'square' | 'random';
  
  vco1Freq: number;
  vco1Range: 2 | 4 | 8 | 16;
  vco1Waveform: 'sawtooth' | 'square' | 'pulse' | 'triangle' | 'sine' | 'noise';
  vco1PulseWidth: number;
  
  vco2Freq: number;
  vco2Range: 2 | 4 | 8 | 16;
  vco2Waveform: 'sawtooth' | 'square' | 'pulse' | 'triangle' | 'sine' | 'noise';
  vco2PulseWidth: number;
  vco2Detune: number;
  vco2Sync: boolean;
  
  crossMod: number;
  vcoMix: number;
  portamentoTime: number;
  portamentoMode: 'off' | 'on' | 'auto';
  
  // Performance
  bpm: number;
  timeSignature: string;
  
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
  lfoSync: boolean;
  lfoSyncDivision: string;
  
  vcaLevel: number;
  vcaEnvAmount: number;
  vcaLfoAmount: number;
  vcoLfoAmount: number;
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
  filterEnvSource: 'env1' | 'env2';

  // Hammond Organ Engine Params
  synthEngine: 'jupiter' | 'hammond';
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
}

export const DEFAULT_PARAMS: VoiceParams = {
  lfoRate: 5,
  lfoWaveform: 'sine',
  
  vco1Freq: 0,
  vco1Range: 8,
  vco1Waveform: 'sawtooth',
  vco1PulseWidth: 0.5,
  
  vco2Freq: 0,
  vco2Range: 8,
  vco2Waveform: 'sawtooth',
  vco2PulseWidth: 0.5,
  vco2Detune: 0,
  vco2Sync: false,
  
  crossMod: 0,
  vcoMix: 0.5,
  portamentoTime: 0.1,
  portamentoMode: 'off',
  bpm: 120,
  timeSignature: '4/4',

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
  lfoSync: false,
  lfoSyncDivision: '1/4',
  
  vcaLevel: 0.8,
  vcaEnvAmount: 1,
  vcaLfoAmount: 0,
  vcoLfoAmount: 0,
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
};

export interface PerformanceSettings {
  maxVoices: number;
  sampleRate: number;
  audioBufferLength: 128 | 256 | 512 | 1024 | 2048;
  latencyHint: 'balanced' | 'interactive' | 'playback' | 0;
  enableOscilloscope: boolean;
  theme: 'jupiter' | 'dark' | 'light';
  midiInputId: string;
  midiChannel: number; // 0 for all channels, 1-16 for specific
  pitchBendRange: number;
  velocitySensitivity: number;
  googleSheetUrl: string;
}

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  maxVoices: 8,
  sampleRate: 44100,
  audioBufferLength: 512,
  latencyHint: 'interactive',
  enableOscilloscope: true,
  theme: 'jupiter',
  midiInputId: 'all',
  midiChannel: 0,
  pitchBendRange: 2,
  velocitySensitivity: 0.5,
  googleSheetUrl: '',
};
