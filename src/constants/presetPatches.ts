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
      vcoMix: 0.7,
      filterCutoff: 300,
      filterResonance: 0.2,
      filterEnvAmount: 0.6,
      env1Attack: 0.01,
      env1Decay: 0.4,
      env1Sustain: 0,
      env2Attack: 0.01,
      env2Decay: 0.2,
      env2Sustain: 1.0,
      chorusMix: 0.3,
    }
  },
  {
    id: "bass-2",
    name: "Dark Acid Bass",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vcoMix: 1.0,
      filterCutoff: 500,
      filterResonance: 0.8,
      filterEnvAmount: 0.9,
      env1Attack: 0.02,
      env1Decay: 0.3,
      env1Sustain: 0.1,
      env2Attack: 0.01,
      env2Decay: 0.5,
      env2Sustain: 0.4,
      distortionMix: 0.4,
      distortionAmount: 0.6,
    }
  },
  {
    id: "bass-3",
    name: "Moog-ish Punch",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "square",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.05,
      vcoMix: 0.5,
      filterCutoff: 200,
      filterResonance: 0.4,
      filterEnvAmount: 0.7,
      env1Attack: 0.001,
      env1Decay: 0.6,
      env1Sustain: 0.2,
      env2Attack: 0.005,
      env2Decay: 0.3,
      env2Sustain: 0.5,
    }
  },
  {
    id: "bass-4",
    name: "Slap Poly Bass",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "pulse",
      vco1PulseWidth: 0.3,
      vcoMix: 1.0,
      filterCutoff: 800,
      filterResonance: 0.1,
      filterEnvAmount: 0.4,
      env1Attack: 0.01,
      env1Decay: 0.2,
      env1Sustain: 0,
      env2Attack: 0.01,
      env2Decay: 0.1,
      env2Sustain: 0.8,
      chorusMix: 0.5,
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
      vco2Detune: 0.1,
      vcoMix: 0.5,
      filterCutoff: 1200,
      filterResonance: 0.1,
      vcaEnvAmount: 1.0,
      env2Attack: 0.8,
      env2Decay: 2.0,
      env2Sustain: 0.6,
      env2Release: 3.0,
      chorusMix: 0.6,
      reverbMix: 0.7,
      reverbTime: 5.0,
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
      vco2Freq: 0.5,
      vcoMix: 0.5,
      filterCutoff: 4000,
      filterEnvAmount: 0.8,
      env1Attack: 0.1,
      env1Decay: 0.5,
      env2Attack: 0.01,
      env2Sustain: 0.8,
      distortionMix: 0.2,
    }
  },
  {
    id: "lead-3",
    name: "Funk Tri-Lead",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "triangle",
      vco2Waveform: "sine",
      vco2Detune: 0.02,
      portamentoMode: "on",
      portamentoTime: 0.2,
      filterCutoff: 2000,
      env2Attack: 0.01,
      lfoRate: 6.0,
      vcaLfoAmount: 0.1,
    }
  },
  {
    id: "lead-4",
    name: "Screaming Solo",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Detune: 0.15,
      filterCutoff: 3500,
      filterResonance: 0.5,
      distortionMix: 0.6,
      distortionAmount: 0.8,
      delayMix: 0.4,
      delayTime: 0.3,
    }
  },

  // PADS
  {
    id: "pad-1",
    name: "Dreamy Clouds",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sine",
      vco2Waveform: "sine",
      vco2Detune: 0.08,
      vcoMix: 0.5,
      filterCutoff: 800,
      env2Attack: 2.0,
      env2Release: 4.0,
      chorusMix: 0.8,
      reverbMix: 0.6,
    }
  },
  {
    id: "pad-2",
    name: "Jupiter Strings",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.05,
      filterCutoff: 1200,
      filterSlope: 24,
      env2Attack: 0.5,
      env2Release: 2.0,
      chorusMix: 0.7,
      lfoRate: 0.5,
      filterLfoAmount: 0.2,
    }
  },
  {
    id: "pad-3",
    name: "Vangelis Brass",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.1,
      filterCutoff: 1500,
      filterEnvAmount: 0.5,
      env1Attack: 0.5,
      env1Decay: 2.0,
      env2Attack: 0.4,
      env2Release: 2.5,
      reverbMix: 0.5,
    }
  },
  {
    id: "pad-4",
    name: "Dark Space",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "noise",
      vco2Waveform: "sine",
      vcoMix: 0.8,
      filterCutoff: 400,
      filterResonance: 0.6,
      env2Attack: 3.0,
      env2Release: 5.0,
      reverbMix: 0.9,
      tremoloMix: 0.3,
    }
  },

  // KEYS
  {
    id: "keys-1",
    name: "Classic DX E-Piano",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sine",
      vco2Waveform: "sine",
      vco2Range: 4,
      vcoMix: 0.4,
      filterCutoff: 3000,
      env1Attack: 0.01,
      env1Decay: 1.0,
      env1Sustain: 0,
      env2Attack: 0.01,
      env2Decay: 3.0,
      env2Sustain: 0,
      chorusMix: 0.4,
      tremoloMix: 0.2,
    }
  },
  {
    id: "keys-2",
    name: "Wurlitzerish",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "pulse",
      vco1PulseWidth: 0.4,
      vcoMix: 1.0,
      filterCutoff: 2500,
      filterResonance: 0.2,
      env2Attack: 0.02,
      env2Decay: 1.5,
      env2Sustain: 0.1,
      distortionMix: 0.15,
      tremoloMix: 0.4,
      tremoloRate: 6.0,
    }
  },
  {
    id: "keys-3",
    name: "Pluck Bell",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sine",
      vco2Waveform: "triangle",
      vco2Range: 2,
      vcoMix: 0.3,
      filterCutoff: 4500,
      env2Attack: 0.001,
      env2Decay: 0.8,
      env2Sustain: 0,
      delayMix: 0.3,
    }
  },
  {
    id: "keys-4",
    name: "Retro Poly",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "square",
      vco2Detune: 0.04,
      filterCutoff: 2000,
      filterEnvAmount: 0.4,
      env1Attack: 0.05,
      env1Decay: 0.6,
      env2Attack: 0.05,
      env2Sustain: 0.7,
      chorusMix: 0.3,
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
      vco2Detune: 0.12,
      filterCutoff: 1000,
      filterEnvAmount: 0.7,
      env1Attack: 0.05,
      env1Decay: 0.4,
      env2Attack: 0.05,
      chorusMix: 0.4,
      reverbMix: 0.3,
    }
  },
  {
    id: "brass-2",
    name: "Synth Horns",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "sawtooth",
      vco2Detune: 0.08,
      filterCutoff: 1200,
      filterResonance: 0.1,
      env2Attack: 0.02,
      env2Decay: 0.5,
      env2Sustain: 0.7,
      chorusMix: 0.2,
    }
  },
  {
    id: "strings-1",
    name: "Solina Strings",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vcoMix: 1.0,
      filterCutoff: 2500,
      env2Attack: 0.4,
      env2Release: 1.5,
      chorusMix: 0.9,
      leslieMix: 0.4,
    }
  },
  {
    id: "strings-2",
    name: "80s Orchestral",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      vco2Waveform: "pulse",
      vco2Detune: 0.1,
      filterCutoff: 3000,
      env2Attack: 0.2,
      env2Release: 1.0,
      chorusMix: 0.6,
      reverbMix: 0.5,
    }
  },

  // FX/EXP
  {
    id: "fx-1",
    name: "Windy Night",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "noise",
      vcoMix: 1.0,
      filterCutoff: 200,
      filterResonance: 0.8,
      filterLfoAmount: 0.7,
      lfoRate: 0.1,
      env2Attack: 2.0,
      env2Release: 2.0,
      reverbMix: 0.8,
    }
  },
  {
    id: "fx-2",
    name: "Retro Computer",
    params: {
      ...DEFAULT_PARAMS,
      arpEnabled: true,
      arpMode: "random",
      arpRate: 300,
      vco1Waveform: "square",
      vcoMix: 1.0,
      filterCutoff: 4000,
      env2Attack: 0.01,
      env2Decay: 0.1,
      env2Sustain: 0,
      delayMix: 0.4,
    }
  },
  {
    id: "fx-3",
    name: "Sci-Fi Laser",
    params: {
      ...DEFAULT_PARAMS,
      vco1Waveform: "sawtooth",
      filterCutoff: 6000,
      filterEnvAmount: -0.9,
      env1Attack: 0.01,
      env1Decay: 0.2,
      env2Attack: 0.01,
      env2Decay: 0.2,
      portamentoMode: "on",
      portamentoTime: 0.4,
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
      vco2Freq: 4.0,
      crossMod: 0.8,
      distortionMix: 0.7,
      distortionAmount: 0.9,
      reverbMix: 0.6,
    }
  }
];
