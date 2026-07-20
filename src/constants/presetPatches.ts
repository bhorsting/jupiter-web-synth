/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_PARAMS, Patch } from "../types";

export const PRESET_PATCHES: Patch[] = [
  // BASSES
  {
    id: "bass-1",
    name: "Classic 80s Bass",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Range: 16,
      vco2Detune: 0.12,
      vcoMix: 0.5,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 180,
      filterResonance: 0.2,
      filterEnvAmount: 0.65,
      env1Attack: 0.001,
      env1Decay: 0.25,
      env1Sustain: 0.15,
      env1Release: 0.15,
      env2Attack: 0.001,
      env2Decay: 0.3,
      env2Sustain: 0.8,
      env2Release: 0.2,
      chorusMix: 0.35,
      compMix: 0.75,
      compThreshold: -18,
      compRatio: 4,
    }
  },
  {
    id: "bass-2",
    name: "Dark Acid Bass",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vcoMix: 0.0,
      mixerVco1: 1.0,
      filterCutoff: 150,
      filterResonance: 0.75,
      filterEnvAmount: 0.85,
      env1Attack: 0.001,
      env1Decay: 0.18,
      env1Sustain: 0.0,
      env1Release: 0.12,
      env2Attack: 0.001,
      env2Decay: 0.22,
      env2Sustain: 0.6,
      env2Release: 0.15,
      distortionMix: 0.5,
      distortionAmount: 0.65,
      distortionMode: "tube",
      compMix: 0.8,
      compThreshold: -15,
    }
  },
  {
    id: "bass-3",
    name: "Moog-ish Punch",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "square",
      vco2Waveform: "triangle",
      vco2Range: 16,
      vcoMix: 0.4,
      mixerVco1: 0.9,
      mixerVco2: 0.9,
      filterCutoff: 220,
      filterResonance: 0.3,
      filterEnvAmount: 0.5,
      env1Attack: 0.002,
      env1Decay: 0.2,
      env1Sustain: 0.2,
      env1Release: 0.25,
      env2Attack: 0.002,
      env2Decay: 0.4,
      env2Sustain: 0.9,
      env2Release: 0.3,
    }
  },
  {
    id: "bass-4",
    name: "Fat Vintage Sub",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "triangle",
      vco1Range: 16,
      vco2Range: 16,
      vcoMix: 0.5,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      vco2Detune: 0.08,
      filterCutoff: 120,
      filterResonance: 0.0,
      filterEnvAmount: 0.3,
      env1Attack: 0.002,
      env1Decay: 0.3,
      env1Sustain: 0.1,
      env1Release: 0.2,
      env2Attack: 0.002,
      env2Decay: 0.5,
      env2Sustain: 1.0,
      env2Release: 0.2,
      chorusMix: 0.15,
      compMix: 0.9,
      compThreshold: -18,
      compRatio: 6,
    }
  },

  // LEADS
  {
    id: "lead-1",
    name: "Blade Runner",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.18,
      vcoMix: 0.5,
      mixerVco1: 0.9,
      mixerVco2: 0.9,
      filterCutoff: 750,
      filterResonance: 0.15,
      filterEnvAmount: 0.55,
      env1Attack: 0.6,
      env1Decay: 2.0,
      env1Sustain: 0.7,
      env1Release: 2.2,
      env2Attack: 0.45,
      env2Decay: 1.5,
      env2Sustain: 0.8,
      env2Release: 2.2,
      vcoLfoAmount: 0.03,
      lfoRate: 4.8,
      chorusMix: 0.6,
      reverbMix: 0.7,
      reverbTime: 5.0,
      delayMix: 0.45,
      delayTime: 0.48,
      delayFeedback: 0.5,
    }
  },
  {
    id: "lead-2",
    name: "Sync Lead 80s",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Sync: true,
      vco2Freq: 4.0,
      vcoMix: 0.3,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 2200,
      filterResonance: 0.3,
      filterEnvAmount: 0.75,
      env1Attack: 0.02,
      env1Decay: 0.4,
      env1Sustain: 0.3,
      env1Release: 0.3,
      env2Attack: 0.005,
      env2Decay: 0.5,
      env2Sustain: 1.0,
      env2Release: 0.3,
      distortionMix: 0.4,
      distortionAmount: 0.6,
      distortionMode: "default",
      delayMix: 0.3,
      delayTime: 0.33,
      delayFeedback: 0.4,
    }
  },
  {
    id: "lead-3",
    name: "Funk Tri-Lead",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "triangle",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.04,
      vcoMix: 0.35,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      portamentoMode: "on",
      portamentoTime: 0.22,
      filterCutoff: 3000,
      filterResonance: 0.0,
      env2Attack: 0.015,
      env2Decay: 1.0,
      env2Sustain: 0.95,
      env2Release: 0.4,
      vcoLfoAmount: 0.07,
      lfoRate: 5.5,
      reverbMix: 0.4,
      delayMix: 0.25,
      delayTime: 0.375,
    }
  },
  {
    id: "lead-4",
    name: "Neon Laser Shredder",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Range: 4,
      vco2Detune: 0.15,
      vcoMix: 0.5,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 3200,
      filterResonance: 0.4,
      filterEnvAmount: 0.5,
      env1Attack: 0.01,
      env1Decay: 0.6,
      env1Sustain: 0.2,
      env1Release: 0.4,
      env2Attack: 0.005,
      env2Decay: 0.8,
      env2Sustain: 0.7,
      env2Release: 0.4,
      distortionMix: 0.6,
      distortionAmount: 0.75,
      distortionMode: "feedback",
      distortionFeedbackAmount: 0.45,
      distortionFeedbackFreq: 1200,
      chorusMix: 0.5,
      delayMix: 0.4,
      delayTime: 0.33,
      reverbMix: 0.45,
      reverbTime: 3.5,
    }
  },

  // PADS
  {
    id: "pad-1",
    name: "Dreamy Clouds",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "triangle",
      vco2Waveform: "sine",
      vco2Detune: 0.12,
      vcoMix: 0.5,
      mixerVco1: 0.9,
      mixerVco2: 0.9,
      filterCutoff: 450,
      filterResonance: 0.3,
      filterEnvAmount: 0.4,
      env1Attack: 3.5,
      env1Decay: 3.0,
      env1Sustain: 0.85,
      env1Release: 4.5,
      env2Attack: 2.2,
      env2Decay: 2.5,
      env2Sustain: 0.9,
      env2Release: 4.5,
      filterLfoAmount: 0.45,
      lfoRate: 0.15,
      vcoLfoAmount: 0.01,
      chorusMix: 0.85,
      reverbMix: 0.9,
      reverbTime: 7.5,
      delayMix: 0.35,
      delayTime: 0.6,
      delayFeedback: 0.6,
    }
  },
  {
    id: "pad-2",
    name: "Jupiter Strings",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.18,
      vcoMix: 0.5,
      mixerVco1: 0.9,
      mixerVco2: 0.9,
      filterCutoff: 1100,
      filterResonance: 0.12,
      filterEnvAmount: 0.45,
      filterKeyboardTrack: 0.8,
      env1Attack: 0.8,
      env1Decay: 2.5,
      env1Sustain: 0.85,
      env1Release: 2.5,
      env2Attack: 0.6,
      env2Decay: 1.8,
      env2Sustain: 0.95,
      env2Release: 2.5,
      filterLfoAmount: 0.22,
      lfoRate: 0.45,
      chorusMix: 0.9,
      chorusMode: 3,
      reverbMix: 0.6,
      reverbTime: 4.5,
    }
  },
  {
    id: "pad-3",
    name: "Vangelis Brass",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.12,
      vcoMix: 0.5,
      mixerVco1: 0.9,
      mixerVco2: 0.9,
      filterCutoff: 650,
      filterResonance: 0.0,
      filterEnvAmount: 0.65,
      filterKeyboardTrack: 1.0,
      env1Attack: 1.2,
      env1Decay: 2.5,
      env1Sustain: 0.2,
      env1Release: 2.5,
      env2Attack: 0.8,
      env2Decay: 2.0,
      env2Sustain: 0.75,
      env2Release: 2.5,
      chorusMix: 0.5,
      reverbMix: 0.85,
      reverbTime: 5.5,
      delayMix: 0.25,
      delayTime: 0.5,
    }
  },
  {
    id: "pad-4",
    name: "Dark Space",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "noise",
      vco2Waveform: "sawtooth",
      vco2Range: 8,
      vcoMix: 0.45,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 380,
      filterResonance: 0.5,
      filterEnvAmount: 0.35,
      filterLfoAmount: 0.55,
      lfoRate: 0.08,
      env1Attack: 3.5,
      env1Decay: 3.0,
      env1Sustain: 0.9,
      env1Release: 5.0,
      env2Attack: 2.8,
      env2Decay: 3.0,
      env2Sustain: 0.9,
      env2Release: 5.0,
      chorusMix: 0.75,
      reverbMix: 0.95,
      reverbTime: 9.0,
      tremoloMix: 0.25,
      tremoloRate: 0.4,
    }
  },

  // KEYS
  {
    id: "keys-1",
    name: "Classic DX E-Piano",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sine",
      vco2Waveform: "triangle",
      vco2Range: 4,
      vco2Detune: 0.04,
      vcoMix: 0.25,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 3200,
      filterResonance: 0.0,
      filterKeyboardTrack: 1.0,
      env1Attack: 0.001,
      env1Decay: 0.6,
      env1Sustain: 0.0,
      env1Release: 0.8,
      env2Attack: 0.001,
      env2Decay: 1.8,
      env2Sustain: 0.0,
      env2Release: 1.2,
      chorusMix: 0.65,
      delayMix: 0.3,
      delayTime: 0.45,
      reverbMix: 0.4,
      tremoloMix: 0.35,
      tremoloRate: 4.8,
    }
  },
  {
    id: "keys-2",
    name: "Wurlitzerish",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "pulse",
      vco1PulseWidth: 0.15,
      vco2Waveform: "sine",
      vcoMix: 0.15,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 1800,
      filterResonance: 0.2,
      filterKeyboardTrack: 0.8,
      filterEnvAmount: 0.4,
      env1Attack: 0.005,
      env1Decay: 0.8,
      env1Sustain: 0.0,
      env1Release: 0.4,
      env2Attack: 0.005,
      env2Decay: 1.6,
      env2Sustain: 0.05,
      env2Release: 0.4,
      distortionMix: 0.3,
      distortionAmount: 0.25,
      distortionMode: "tube",
      tremoloMix: 0.5,
      tremoloRate: 6.2,
    }
  },
  {
    id: "keys-3",
    name: "Pluck Bell",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sine",
      vco2Waveform: "sine",
      vco2Range: 2,
      vco2Detune: 0.08,
      vcoMix: 0.3,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 4500,
      filterResonance: 0.15,
      env1Attack: 0.001,
      env1Decay: 0.4,
      env1Sustain: 0.0,
      env1Release: 1.2,
      env2Attack: 0.001,
      env2Decay: 1.2,
      env2Sustain: 0.0,
      env2Release: 1.5,
      delayMix: 0.55,
      delayTime: 0.375,
      delayFeedback: 0.65,
      reverbMix: 0.65,
      reverbTime: 5.0,
    }
  },
  {
    id: "keys-4",
    name: "Retro Poly",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Range: 8,
      vco2Detune: 0.08,
      vcoMix: 0.45,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 1100,
      filterResonance: 0.25,
      filterEnvAmount: 0.6,
      filterKeyboardTrack: 0.7,
      env1Attack: 0.01,
      env1Decay: 0.5,
      env1Sustain: 0.1,
      env1Release: 0.4,
      env2Attack: 0.008,
      env2Decay: 0.8,
      env2Sustain: 0.3,
      env2Release: 0.4,
      chorusMix: 0.5,
      reverbMix: 0.3,
      reverbTime: 2.5,
    }
  },

  // STRINGS/BRASS
  {
    id: "brass-1",
    name: "Mega Brass 80s",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Range: 8,
      vco2Detune: 0.18,
      vcoMix: 0.5,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 900,
      filterResonance: 0.15,
      filterEnvAmount: 0.75,
      filterKeyboardTrack: 0.8,
      env1Attack: 0.12,
      env1Decay: 0.8,
      env1Sustain: 0.25,
      env1Release: 0.6,
      env2Attack: 0.08,
      env2Decay: 1.0,
      env2Sustain: 0.55,
      env2Release: 0.6,
      chorusMix: 0.55,
      reverbMix: 0.55,
      reverbTime: 3.5,
    }
  },
  {
    id: "brass-2",
    name: "Synth Horns",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "triangle",
      vcoMix: 0.35,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 750,
      filterResonance: 0.0,
      filterEnvAmount: 0.55,
      env1Attack: 0.18,
      env1Decay: 0.9,
      env1Sustain: 0.4,
      env1Release: 0.5,
      env2Attack: 0.15,
      env2Decay: 1.2,
      env2Sustain: 0.85,
      env2Release: 0.5,
      reverbMix: 0.45,
      reverbTime: 3.5,
    }
  },
  {
    id: "brass-dancing",
    name: "Dancing In The Dark",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Range: 8,
      vco2Detune: 0.15,
      vcoMix: 0.5,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 1050,
      filterResonance: 0.1,
      filterEnvAmount: 0.65,
      filterKeyboardTrack: 0.75,
      env1Attack: 0.04,
      env1Decay: 0.8,
      env1Sustain: 0.35,
      env1Release: 0.4,
      env2Attack: 0.02,
      env2Decay: 0.9,
      env2Sustain: 0.7,
      env2Release: 0.45,
      chorusMix: 0.65,
      reverbMix: 0.3,
      reverbTime: 3.0,
    }
  },
  {
    id: "strings-1",
    name: "Solina Strings",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Range: 4,
      vco2Detune: 0.22,
      vcoMix: 0.45,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 2100,
      filterResonance: 0.05,
      filterKeyboardTrack: 1.0,
      env1Attack: 0.35,
      env1Decay: 2.0,
      env1Sustain: 0.85,
      env1Release: 1.8,
      env2Attack: 0.25,
      env2Decay: 2.2,
      env2Sustain: 0.95,
      env2Release: 1.8,
      chorusMix: 0.95,
      chorusMode: 3, // Solina Double-Triad Ensemble
      leslieMix: 0.25,
      leslieRate: 1.1,
      leslieDepth: 0.4,
    }
  },
  {
    id: "strings-2",
    name: "80s Orchestral",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "pulse",
      vco1PulseWidth: 0.5,
      vco2PulseWidth: 0.35,
      vco2Range: 8,
      vco2Detune: 0.18,
      vcoMix: 0.5,
      mixerVco1: 1.0,
      mixerVco2: 1.0,
      filterCutoff: 1600,
      filterResonance: 0.15,
      filterKeyboardTrack: 0.9,
      filterEnvAmount: 0.42,
      env1Attack: 0.3,
      env1Decay: 1.8,
      env1Sustain: 0.8,
      env1Release: 1.5,
      env2Attack: 0.2,
      env2Decay: 2.0,
      env2Sustain: 0.9,
      env2Release: 1.5,
      chorusMix: 0.85,
      chorusMode: 3, // Solina Double-Triad Ensemble
      reverbMix: 0.65,
      reverbTime: 4.5,
    }
  },

  // FX/EXP
  {
    id: "fx-1",
    name: "Windy Night",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "noise",
      vcoMix: 0.0,
      mixerVco1: 1.0,
      filterCutoff: 180,
      filterResonance: 0.92,
      filterLfoAmount: 0.88,
      lfoRate: 0.05,
      env2Attack: 2.5,
      env2Decay: 4.0,
      env2Sustain: 0.95,
      env2Release: 4.0,
      reverbMix: 0.85,
      reverbTime: 12.0,
    }
  },
  {
    id: "fx-2",
    name: "Retro Computer",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "random",
      arpRate: 350,
      arpRange: 3,
      vco1Waveform: "square",
      vcoMix: 1.0,
      mixerVco1: 1.0,
      filterCutoff: 5000,
      env2Attack: 0.001,
      env2Decay: 0.08,
      env2Sustain: 0,
      delayMix: 0.5,
      delayTime: 0.25,
      delayFeedback: 0.6,
    }
  },
  {
    id: "fx-3",
    name: "Sci-Fi Laser",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vcoMix: 1.0,
      mixerVco1: 1.0,
      filterCutoff: 8000,
      filterEnvAmount: -0.95,
      env1Attack: 0.005,
      env1Decay: 0.35,
      env1Sustain: 0,
      env2Attack: 0.005,
      env2Decay: 0.4,
      env2Sustain: 0,
      portamentoMode: "on",
      portamentoTime: 0.45,
    }
  },
  {
    id: "fx-4",
    name: "Industrial Drone",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Sync: true,
      vco2Freq: 5.0,
      vcoMix: 0.4,
      mixerVco1: 0.8,
      mixerVco2: 1.0,
      crossMod: 0.85,
      distortionMix: 0.75,
      distortionAmount: 0.95,
      reverbMix: 0.7,
      reverbTime: 5.0,
    }
  },
  // ARPEGGIOS
  {
    id: "arp-1",
    name: "Neon Pulse",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "up-down",
      arpRate: 140,
      arpRange: 2,
      vco1Waveform: "pulse",
      vco1PulseWidth: 0.2,
      vcoMix: 1.0,
      mixerVco1: 1.0,
      filterCutoff: 1200,
      filterResonance: 0.3,
      filterEnvAmount: 0.4,
      env1Attack: 0.001,
      env1Decay: 0.2,
      env2Attack: 0.001,
      env2Decay: 0.1,
      env2Sustain: 0,
      chorusMix: 0.3,
      delayMix: 0.4,
      delayTime: 0.375, // Dotted 8th-ish
      delayFeedback: 0.4,
      reverbMix: 0.3,
    }
  },
  {
    id: "arp-2",
    name: "Chasing Shadows",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "down",
      arpRate: 200,
      arpRange: 3,
      vco1Waveform: "sawtooth",
      vco2Waveform: "pulse",
      vco2Detune: 0.05,
      vcoMix: 0.5,
      mixerVco1: 0.8,
      mixerVco2: 0.8,
      filterCutoff: 600,
      filterResonance: 0.4,
      env2Attack: 0.005,
      env2Decay: 0.15,
      env2Sustain: 0,
      chorusMix: 0.5,
      delayMix: 0.6,
      delayTime: 0.5,
      delayFeedback: 0.7,
      reverbMix: 0.5,
      reverbTime: 4.0,
    }
  },
  {
    id: "arp-3",
    name: "Stellar Journey",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "random",
      arpRate: 400,
      arpRange: 4,
      vco1Waveform: "sine",
      vco2Waveform: "sine",
      vco2Range: 4,
      vcoMix: 0.5,
      mixerVco1: 0.8,
      mixerVco2: 0.8,
      filterCutoff: 4000,
      filterResonance: 0.1,
      env2Attack: 0.01,
      env2Decay: 0.4,
      env2Sustain: 0,
      chorusMix: 0.7,
      reverbMix: 0.9,
      reverbTime: 8.0,
      lfoRate: 0.2,
      filterLfoAmount: 0.3,
    }
  },
  {
    id: "arp-4",
    name: "Glitchy Circuits",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "up",
      arpRate: 800,
      arpRange: 1,
      vco1Waveform: "square",
      vco2Waveform: "noise",
      vcoMix: 0.7,
      mixerVco1: 1.0,
      mixerVco2: 0.3,
      filterCutoff: 2500,
      filterResonance: 0.6,
      distortionMix: 0.4,
      distortionAmount: 0.7,
      delayMix: 0.5,
      delayTime: 0.1,
      delayFeedback: 0.3,
      env2Attack: 0.001,
      env2Decay: 0.05,
      reverbMix: 0.2,
    }
  },
  {
    id: "arp-5",
    name: "Digital Sunrise",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "up-down",
      arpRate: 300,
      arpRange: 3,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Freq: 0.05,
      vcoMix: 0.5,
      mixerVco1: 0.7,
      mixerVco2: 0.7,
      filterCutoff: 1500,
      filterResonance: 0.5,
      filterEnvAmount: 0.6,
      env1Attack: 0.01,
      env1Decay: 0.2,
      env2Attack: 0.001,
      env2Decay: 0.1,
      chorusMix: 0.4,
      reverbMix: 0.6,
      delayMix: 0.3,
      delayTime: 0.25,
    }
  },
  {
    id: "arp-6",
    name: "Techno Hammer",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "down",
      arpRate: 120,
      arpRange: 2,
      vco1Waveform: "pulse",
      vco1PulseWidth: 0.5,
      vcoMix: 1.0,
      mixerVco1: 1.0,
      filterCutoff: 250,
      filterResonance: 0.2,
      filterEnvAmount: 0.8,
      env1Attack: 0.001,
      env1Decay: 0.4,
      env2Attack: 0.001,
      env2Decay: 0.1,
      distortionMix: 0.5,
      distortionAmount: 0.8,
      delayMix: 0.2,
      delayTime: 0.375,
    }
  },
  {
    id: "arp-7",
    name: "Ethereal Arps",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "up",
      arpRate: 500,
      arpRange: 4,
      vco1Waveform: "triangle",
      vco2Waveform: "sine",
      vcoMix: 0.5,
      mixerVco1: 0.9,
      mixerVco2: 0.9,
      filterCutoff: 5000,
      filterResonance: 0.0,
      env2Attack: 0.02,
      env2Decay: 0.6,
      chorusMix: 0.8,
      reverbMix: 1.0,
      reverbTime: 9.0,
      delayMix: 0.7,
      delayTime: 0.75,
      delayFeedback: 0.8,
    }
  },
  {
    id: "arp-8",
    name: "Retro Arp 1984",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "up-down",
      arpRate: 250,
      arpRange: 2,
      vco1Waveform: "square",
      vcoMix: 1.0,
      mixerVco1: 1.0,
      filterCutoff: 1800,
      filterResonance: 0.1,
      env2Attack: 0.001,
      env2Decay: 0.2,
      chorusMix: 0.9,
      chorusMode: 2,
      reverbMix: 0.3,
    }
  },

  // DX7 CLASSICS
  {
    id: "dx7-ep1",
    name: "DX7 E. Piano 1",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      dx7Voice: {
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
      }
    }
  },
  {
    id: "dx7-tubebells",
    name: "DX7 Tubular Bells",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      dx7Voice: {
        name: 'TUBULAR BELLS',
        algorithm: 2,
        feedback: 6,
        keySync: true,
        lfoSpeed: 20,
        lfoDelay: 5,
        lfoPmd: 0,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 3,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - bell fundamental
          {
            rates: [90, 40, 15, 50],
            levels: [99, 85, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 3, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - high chime sideband
          {
            rates: [99, 35, 12, 50],
            levels: [95, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 4, ams: 0, velocitySensitivity: 4, level: 75,
            mode: 0, coarse: 9, fine: 0
          },
          // Op 3 (Carrier) - sub bell tone
          {
            rates: [90, 30, 10, 50],
            levels: [99, 70, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 0, detune: 1, ams: 0, velocitySensitivity: 2, level: 90,
            mode: 0, coarse: 2, fine: 50
          },
          // Op 4 (Modulator to Op 3) - inharmonic chime
          {
            rates: [99, 45, 15, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: -2, ams: 0, velocitySensitivity: 5, level: 80,
            mode: 0, coarse: 11, fine: 14
          },
          // Op 5 (Carrier) - metallic strike transient
          {
            rates: [99, 70, 40, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 3, detune: 0, ams: 0, velocitySensitivity: 4, level: 82,
            mode: 1, coarse: 3, fine: 50
          },
          // Op 6 (Modulator to Op 5 with feedback) - noise/clang strike
          {
            rates: [99, 85, 50, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 4, detune: 2, ams: 0, velocitySensitivity: 5, level: 88,
            mode: 0, coarse: 17, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-solidbass",
    name: "DX7 Solid Bass",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      dx7Voice: {
        name: 'SOLID BASS',
        algorithm: 16,
        feedback: 6,
        keySync: true,
        lfoSpeed: 15,
        lfoDelay: 0,
        lfoPmd: 0,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 2,
        transpose: 12,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - main bass pluck
          {
            rates: [99, 75, 40, 60],
            levels: [99, 90, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 3, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1 with feedback) - pluck transient / grit
          {
            rates: [99, 65, 30, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 2, ams: 0, velocitySensitivity: 4, level: 86,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 3 (Carrier) - secondary sub/warmth
          {
            rates: [99, 80, 50, 55],
            levels: [99, 99, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 0, detune: -1, ams: 0, velocitySensitivity: 2, level: 95,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 4 (Modulator to Op 3) - mid woodiness
          {
            rates: [99, 70, 25, 50],
            levels: [95, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 1, ams: 0, velocitySensitivity: 4, level: 78,
            mode: 0, coarse: 2, fine: 0
          },
          // Op 5 (Modulator to Op 3) - odd harmonics
          {
            rates: [99, 60, 20, 50],
            levels: [90, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 3, ams: 0, velocitySensitivity: 5, level: 65,
            mode: 0, coarse: 3, fine: 0
          },
          // Op 6 (Unused / helper)
          {
            rates: [99, 50, 10, 50],
            levels: [0, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 0, detune: 0, ams: 0, velocitySensitivity: 0, level: 0,
            mode: 0, coarse: 1, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-synthbrass",
    name: "DX7 Synth Brass",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      dx7Voice: {
        name: 'SYN BRASS',
        algorithm: 22,
        feedback: 5,
        keySync: true,
        lfoSpeed: 38,
        lfoDelay: 10,
        lfoPmd: 10,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 2,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - Left Brass Body
          {
            rates: [75, 45, 30, 65],
            levels: [99, 95, 90, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: -1, ams: 0, velocitySensitivity: 2, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - Filter-like swell
          {
            rates: [68, 50, 25, 55],
            levels: [95, 80, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 2, ams: 0, velocitySensitivity: 4, level: 75,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 3 (Carrier) - Right Brass Body detuned
          {
            rates: [75, 45, 30, 65],
            levels: [99, 95, 90, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 2, ams: 0, velocitySensitivity: 2, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 4 (Modulator to Op 3) - Filter swell detuned
          {
            rates: [68, 50, 25, 55],
            levels: [95, 80, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: -2, ams: 0, velocitySensitivity: 4, level: 75,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 5 (Carrier) - High bite
          {
            rates: [80, 55, 35, 70],
            levels: [90, 85, 75, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 1, ams: 0, velocitySensitivity: 3, level: 80,
            mode: 0, coarse: 2, fine: 0
          },
          // Op 6 (Modulator to Op 5 with feedback) - High bite swell
          {
            rates: [72, 60, 20, 60],
            levels: [85, 75, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 3, detune: -1, ams: 0, velocitySensitivity: 4, level: 72,
            mode: 0, coarse: 2, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-marimba",
    name: "DX7 Marimba",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      dx7Voice: {
        name: 'MARIMBA',
        algorithm: 8,
        feedback: 5,
        keySync: true,
        lfoSpeed: 30,
        lfoDelay: 0,
        lfoPmd: 0,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 2,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - fundamental strike
          {
            rates: [99, 60, 10, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 3, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - strike tone
          {
            rates: [99, 75, 15, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 1, ams: 0, velocitySensitivity: 5, level: 82,
            mode: 0, coarse: 4, fine: 0
          },
          // Op 3 (Carrier) - secondary strike
          {
            rates: [99, 55, 8, 50],
            levels: [95, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: -1, ams: 0, velocitySensitivity: 3, level: 90,
            mode: 0, coarse: 2, fine: 0
          },
          // Op 4 (Modulator to Op 3 with feedback) - wooden transient
          {
            rates: [99, 85, 20, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 3, detune: 0, ams: 0, velocitySensitivity: 6, level: 85,
            mode: 0, coarse: 12, fine: 0
          },
          // Op 5 (Unused / sub carrier)
          {
            rates: [99, 40, 5, 50],
            levels: [0, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 0, detune: 0, ams: 0, velocitySensitivity: 0, level: 0,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 6 (Unused / helper)
          {
            rates: [99, 40, 5, 50],
            levels: [0, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 0, detune: 0, ams: 0, velocitySensitivity: 0, level: 0,
            mode: 0, coarse: 1, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-tinaflute",
    name: "DX7 Breathy Flute",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      chorusMix: 0.25,
      delayMix: 0.2,
      delayTime: 0.35,
      delayFeedback: 0.3,
      reverbMix: 0.45,
      reverbTime: 4.0,
      dx7Voice: {
        name: 'BREATH FLUTE',
        algorithm: 11,
        feedback: 6,
        keySync: true,
        lfoSpeed: 32,
        lfoDelay: 4,
        lfoPmd: 3,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 2,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - fundamental flute body
          {
            rates: [99, 40, 15, 60],
            levels: [99, 99, 99, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 2, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - warm woodwind body
          {
            rates: [99, 30, 20, 50],
            levels: [90, 85, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 1, ams: 0, velocitySensitivity: 3, level: 65,
            mode: 0, coarse: 2, fine: 0
          },
          // Op 3 (Carrier) - breath/noise carrier
          {
            rates: [99, 50, 20, 60],
            levels: [99, 95, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: -1, ams: 0, velocitySensitivity: 2, level: 90,
            mode: 0, coarse: 3, fine: 0
          },
          // Op 4 (Modulator to Op 3) - fast blow chiff
          {
            rates: [99, 95, 50, 70],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 2, ams: 0, velocitySensitivity: 4, level: 78,
            mode: 0, coarse: 8, fine: 0
          },
          // Op 5 (Modulator to Op 3) - high air sizzle
          {
            rates: [99, 70, 40, 60],
            levels: [95, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: -2, ams: 0, velocitySensitivity: 3, level: 62,
            mode: 0, coarse: 12, fine: 0
          },
          // Op 6 (Feedback Modulator to Op 2) - noisy puff of breath
          {
            rates: [99, 99, 50, 70],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 3, detune: 0, ams: 0, velocitySensitivity: 5, level: 85,
            mode: 0, coarse: 1, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-stevieharmonica",
    name: "DX7 Stevie Harmonica",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      vcoLfoAmount: 0.08,
      lfoRate: 6.2,
      chorusMix: 0.15,
      reverbMix: 0.35,
      reverbTime: 3.2,
      delayMix: 0.15,
      delayTime: 0.28,
      delayFeedback: 0.3,
      dx7Voice: {
        name: 'HARMONICA',
        algorithm: 5,
        feedback: 5,
        keySync: true,
        lfoSpeed: 42,
        lfoDelay: 5,
        lfoPmd: 5,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 3,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - main reed fundamental
          {
            rates: [99, 45, 30, 60],
            levels: [99, 95, 90, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 2, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - nasal harmonica buzz
          {
            rates: [99, 55, 35, 55],
            levels: [95, 90, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 2, ams: 0, velocitySensitivity: 3, level: 78,
            mode: 0, coarse: 3, fine: 0
          },
          // Op 3 (Carrier) - high reed detuned
          {
            rates: [99, 45, 25, 60],
            levels: [99, 92, 85, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 2, ams: 0, velocitySensitivity: 2, level: 92,
            mode: 0, coarse: 2, fine: 0
          },
          // Op 4 (Modulator to Op 3) - high buzzy harmonica resonance
          {
            rates: [99, 50, 30, 55],
            levels: [95, 85, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: -2, ams: 0, velocitySensitivity: 4, level: 74,
            mode: 0, coarse: 5, fine: 0
          },
          // Op 5 (Carrier) - sub/warmth
          {
            rates: [99, 35, 20, 60],
            levels: [99, 99, 90, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: -1, ams: 0, velocitySensitivity: 2, level: 85,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 6 (Feedback Modulator to Op 5) - raspy metal-reed rattle
          {
            rates: [99, 65, 40, 50],
            levels: [92, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 3, ams: 0, velocitySensitivity: 4, level: 68,
            mode: 0, coarse: 4, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-axelf",
    name: "DX7 Axel F Marimba",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      delayMix: 0.3,
      delayTime: 0.18,
      delayFeedback: 0.25,
      reverbMix: 0.25,
      reverbTime: 2.0,
      dx7Voice: {
        name: 'AXEL MARIMBA',
        algorithm: 1,
        feedback: 5,
        keySync: true,
        lfoSpeed: 28,
        lfoDelay: 0,
        lfoPmd: 0,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 2,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - round wood body
          {
            rates: [99, 85, 10, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 3, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - fast wood snap
          {
            rates: [99, 90, 15, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 1, ams: 0, velocitySensitivity: 4, level: 78,
            mode: 0, coarse: 2, fine: 0
          },
          // Op 3 (Carrier) - metallic mallet strike
          {
            rates: [99, 75, 12, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 3, level: 95,
            mode: 0, coarse: 4, fine: 0
          },
          // Op 4 (Modulator to Op 3) - metallic ring chime
          {
            rates: [99, 80, 15, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 2, ams: 0, velocitySensitivity: 5, level: 84,
            mode: 0, coarse: 8, fine: 0
          },
          // Op 5 (Modulator to Op 4) - ultra-high harmonic strike
          {
            rates: [99, 85, 20, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: -2, ams: 0, velocitySensitivity: 5, level: 72,
            mode: 0, coarse: 12, fine: 0
          },
          // Op 6 (Feedback Modulator to Op 5) - wooden hammer transient
          {
            rates: [99, 95, 30, 50],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 3, detune: 0, ams: 0, velocitySensitivity: 6, level: 65,
            mode: 0, coarse: 1, fine: 0
          }
        ]
      }
    }
  },
  {
    id: "dx7-tearsinrain",
    name: "DX7 Tears In Rain",
    params: {
      ...DEFAULT_PARAMS,
      synthEngine: 'dx7',
      reverbMix: 0.75,
      reverbTime: 6.0,
      delayMix: 0.45,
      delayTime: 0.65,
      delayFeedback: 0.55,
      chorusMix: 0.55,
      dx7Voice: {
        name: 'RAIN CHIMES',
        algorithm: 5,
        feedback: 6,
        keySync: true,
        lfoSpeed: 25,
        lfoDelay: 0,
        lfoPmd: 0,
        lfoAmd: 0,
        lfoSync: true,
        lfoWaveform: 0,
        pitchModSensitivity: 2,
        transpose: 24,
        pitchRates: [99, 99, 99, 99],
        pitchLevels: [50, 50, 50, 50],
        operators: [
          // Op 1 (Carrier) - low glass bell body
          {
            rates: [99, 30, 10, 45],
            levels: [99, 80, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 0, ams: 0, velocitySensitivity: 3, level: 99,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 2 (Modulator to Op 1) - low glass bell modulator
          {
            rates: [99, 25, 8, 45],
            levels: [95, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: -2, ams: 0, velocitySensitivity: 3, level: 75,
            mode: 0, coarse: 1, fine: 0
          },
          // Op 3 (Carrier) - mid sparkling glass carrier
          {
            rates: [99, 28, 12, 45],
            levels: [99, 75, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: 1, ams: 0, velocitySensitivity: 3, level: 95,
            mode: 0, coarse: 3, fine: 0
          },
          // Op 4 (Modulator to Op 3) - high crystalline chime modulator
          {
            rates: [99, 35, 10, 45],
            levels: [99, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 3, ams: 0, velocitySensitivity: 4, level: 78,
            mode: 0, coarse: 7, fine: 0
          },
          // Op 5 (Carrier) - high glistening glass carrier
          {
            rates: [99, 32, 15, 45],
            levels: [99, 70, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 1, detune: -1, ams: 0, velocitySensitivity: 3, level: 90,
            mode: 0, coarse: 5, fine: 0
          },
          // Op 6 (Feedback Modulator to Op 5) - shimmering feedback sparkle
          {
            rates: [99, 40, 12, 45],
            levels: [95, 0, 0, 0],
            breakpoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0,
            rateScaling: 2, detune: 4, ams: 0, velocitySensitivity: 5, level: 68,
            mode: 0, coarse: 11, fine: 0
          }
        ]
      }
    }
  }
];
