/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoiceParams, PerformanceSettings } from '../types';

let noiseBuffer: AudioBuffer | null = null;

class Voice {
  private ctx: AudioContext;
  private vco1: OscillatorNode | null = null;
  private vco2: OscillatorNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private vco1Noise: AudioBufferSourceNode | null = null;
  private vco2Noise: AudioBufferSourceNode | null = null;
  private vco1Gain: GainNode;
  private vco2Gain: GainNode;
  private subOscGain: GainNode;
  private vco1NoiseGain: GainNode;
  private vco2NoiseGain: GainNode;
  private filter: BiquadFilterNode;
  private vca: GainNode;
  private output: GainNode;
  public filterLfoMod: GainNode;
  private vcaLfoMod: GainNode;
  private vcoLfoMod: GainNode;
  private crossModGain: GainNode;

  // Hammond organ engines
  private hammondOscs: OscillatorNode[] = [];
  private hammondGains: GainNode[] = [];
  private percussionOsc: OscillatorNode | null = null;
  private percussionGain: GainNode | null = null;

  // PWM nodes
  private vco1PwmLfoGain: GainNode | null = null;
  private vco1PwmSum: GainNode | null = null;
  private vco1PwmOffset: ConstantSourceNode | null = null;
  private vco1PwmShaper: WaveShaperNode | null = null;
  private vco2PwmLfoGain: GainNode | null = null;
  private vco2PwmSum: GainNode | null = null;
  private vco2PwmOffset: ConstantSourceNode | null = null;
  private vco2PwmShaper: WaveShaperNode | null = null;

  public params: VoiceParams;
  private perfSettings: PerformanceSettings;
  private pitchBendOffset: number = 0; // in semitones
  private velocity: number = 1;

  // Vintage detuning drift per voice card
  private vco1Drift: number = 0;
  private vco2Drift: number = 0;

  // State for voice management
  public midiNote: number | null = null;
  public startTime: number = 0;
  public isReleasing: boolean = false;
  private stopTimer: number | null = null;
  private sharedNoiseBuffer: AudioBuffer | null;
  private lfoModBusNode: AudioNode;

  constructor(ctx: AudioContext, destination: AudioNode, params: VoiceParams, settings: PerformanceSettings, lfoModBus: AudioNode, sharedNoiseBuffer: AudioBuffer | null) {
    this.ctx = ctx;
    this.params = params;
    this.perfSettings = settings;
    this.sharedNoiseBuffer = sharedNoiseBuffer;
    this.lfoModBusNode = lfoModBus;

    this.vco1Gain = ctx.createGain();
    this.vco2Gain = ctx.createGain();
    this.vco1NoiseGain = ctx.createGain();
    this.vco2NoiseGain = ctx.createGain();
    this.subOscGain = ctx.createGain();

    this.filter = ctx.createBiquadFilter();
    this.vca = ctx.createGain();
    this.output = ctx.createGain();
    
    this.filterLfoMod = ctx.createGain();
    this.vcaLfoMod = ctx.createGain();
    this.vcoLfoMod = ctx.createGain();
    this.crossModGain = ctx.createGain();

    // Initialize with safe values
    this.vca.gain.value = 0;
    this.output.gain.value = 1;

    this.vco1Gain.connect(this.filter);
    this.vco2Gain.connect(this.filter);
    this.vco1NoiseGain.connect(this.filter);
    this.vco2NoiseGain.connect(this.filter);
    this.subOscGain.connect(this.filter);

    this.filter.connect(this.vca);
    this.vca.connect(this.output);
    this.output.connect(destination);

    // Modulation Routing
    lfoModBus.connect(this.filterLfoMod);
    lfoModBus.connect(this.vcaLfoMod);
    lfoModBus.connect(this.vcoLfoMod);
    
    this.filterLfoMod.connect(this.filter.frequency);
    this.vcaLfoMod.connect(this.output.gain);
    // Pitch mod is connected later during triggerAttack because oscillators are transient

    // Initial config
    this.updateParams(params);
  }

  updateParams(params: VoiceParams, settings?: PerformanceSettings) {
    this.params = params;
    if (settings) this.perfSettings = settings;
    const time = this.ctx.currentTime;

    if (params.synthEngine === 'hammond') {
      const drawbarLevels = [
        params.hammondDb16,
        params.hammondDb513,
        params.hammondDb8,
        params.hammondDb4,
        params.hammondDb223,
        params.hammondDb2,
        params.hammondDb135,
        params.hammondDb113,
        params.hammondDb1
      ];

      this.hammondGains.forEach((gainNode, idx) => {
        const dbIndex = (gainNode as any).drawbarIndex;
        if (dbIndex !== undefined) {
          const level = drawbarLevels[dbIndex];
          const fraction = level / 8;
          gainNode.gain.setTargetAtTime(fraction * 0.35, time, 0.01);
        }
      });

      this.filter.type = 'lowpass'; 
      this.filter.Q.setTargetAtTime(params.filterResonance * 10, time, 0.05);

      if (!this.isReleasing) {
        this.filter.frequency.setTargetAtTime(Math.max(20, params.filterCutoff), time, 0.05);
      }

      if (!this.isReleasing) {
        this.output.gain.setTargetAtTime(params.vcaLevel, time, 0.05);
      }
      return;
    }

    const isVco1Noise = params.vco1Waveform === 'noise';
    const isVco2Noise = params.vco2Waveform === 'noise';

    if (this.vco1 && !isVco1Noise) {
      this.vco1.type = params.vco1Waveform === 'pulse' ? 'square' : params.vco1Waveform as OscillatorType;
      
      // Update VCO1 Frequency in real-time with vintage drift
      if (this.midiNote !== null) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const range1 = 8 / params.vco1Range;
        const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
        const targetFreq1 = freq * range1 * Math.pow(2, (params.vco1Freq + this.vco1Drift) / 12) * bendFactor;
        this.vco1.frequency.setTargetAtTime(Math.max(1, targetFreq1), time, 0.02);
      }
    }
    
    if (this.vco2 && !isVco2Noise) {
      this.vco2.type = params.vco2Waveform === 'pulse' ? 'square' : params.vco2Waveform as OscillatorType;

      // Update VCO2 Frequency in real-time with vintage drift
      if (this.midiNote !== null) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const range2 = 8 / params.vco2Range;
        const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
        const targetFreq2 = freq * range2 * Math.pow(2, (params.vco2Freq + (params.vco2Detune / 100) + this.vco2Drift) / 12) * bendFactor;
        this.vco2.frequency.setTargetAtTime(Math.max(1, targetFreq2), time, 0.02);
      }
    }

    if (this.subOsc) {
      this.subOsc.type = params.subOscWaveform;
      if (this.midiNote !== null) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const subFreq = freq * Math.pow(2, params.subOscOctave);
        const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
        this.subOsc.frequency.setTargetAtTime(Math.max(1, subFreq * bendFactor), time, 0.02);
      }
    }
    const subLevel = params.subOscEnabled ? params.subOscMix : 0;
    this.subOscGain.gain.setTargetAtTime(subLevel, time, 0.005);

    // Scale VCO levels by velocity sensitivity
    const vco1VelSens = params.vco1VelocitySensitivity !== undefined ? params.vco1VelocitySensitivity : 0;
    const vco2VelSens = params.vco2VelocitySensitivity !== undefined ? params.vco2VelocitySensitivity : 0;
    const vco1VelocityScale = 1.0 - (1.0 - this.velocity) * vco1VelSens;
    const vco2VelocityScale = 1.0 - (1.0 - this.velocity) * vco2VelSens;

    const vco1Level = (1.0 - params.vcoMix) * params.mixerVco1 * vco1VelocityScale;
    const vco2Level = params.vcoMix * params.mixerVco2 * vco2VelocityScale;

    this.vco1Gain.gain.setTargetAtTime(isVco1Noise ? 0 : vco1Level, time, 0.005);
    this.vco1NoiseGain.gain.setTargetAtTime(isVco1Noise ? vco1Level : 0, time, 0.005);
    
    this.vco2Gain.gain.setTargetAtTime(isVco2Noise ? 0 : vco2Level, time, 0.005);
    this.vco2NoiseGain.gain.setTargetAtTime(isVco2Noise ? vco2Level : 0, time, 0.005);

    this.filter.type = 'lowpass'; 
    this.filter.Q.setTargetAtTime(params.filterResonance * 10, time, 0.05);

    // Update Filter Cutoff in real-time
    // Note: If an envelope is active, this will move the 'base' but might be overwritten by the next ramp.
    // However, jupiter-8 filter cutoff slider is the MOST important one to work in real-time.
    if (!this.isReleasing) {
      this.filter.frequency.setTargetAtTime(Math.max(20, params.filterCutoff), time, 0.05);
    }

    // VCA Sustain and base Level real-time update
    if (!this.isReleasing) {
      const velocityScale = 1.0 - (1.0 - this.velocity) * this.perfSettings.velocitySensitivity;
      let targetSustain = params.env2Sustain;
      if (params.vcaSource === 'env1') {
        targetSustain = params.env1Sustain;
      } else if (params.vcaSource === 'lfo') {
        targetSustain = 1.0;
      }
      this.vca.gain.setTargetAtTime(Math.max(0.0001, targetSustain * velocityScale), time, 0.05);
      
      // Incorporate vcaLevel as a constant offset/initial gain
      this.output.gain.setTargetAtTime(params.vcaLevel, time, 0.05);
    }

    // LFO Modulations with Delay protection (with velocity scaling)
    const delay = params.lfoDelay || 0;
    const isPastDelay = this.startTime === 0 || (time > this.startTime + delay);

    const lfoVelScale = 1.0 - (1.0 - this.velocity) * params.lfoVelocitySensitivity;

    const vcaLfoTarget = (params.vcaSource === 'lfo' 
      ? Math.max(0.3, params.vcaLfoAmount) 
      : params.vcaLfoAmount) * lfoVelScale;

    if (isPastDelay) {
      const safeCutoff = Math.max(20, params.filterCutoff);
      const scale = Math.max(0, Math.min(1, Math.log(safeCutoff / 20) / Math.log(20000 / 20)));
      this.filterLfoMod.gain.setTargetAtTime(params.filterLfoAmount * 5000 * lfoVelScale * scale, time, 0.05);
      this.vcaLfoMod.gain.setTargetAtTime(vcaLfoTarget, time, 0.05);
      this.vcoLfoMod.gain.setTargetAtTime(params.vcoLfoAmount * 100 * lfoVelScale, time, 0.05); 
    }
    this.crossModGain.gain.setTargetAtTime(params.crossMod * 5000, time, 0.05);

    // PWM updates
    if (this.vco1PwmOffset) {
      this.vco1PwmOffset.offset.setTargetAtTime((params.vco1PulseWidth - 0.5) * 1.8, time, 0.05);
    }
    if (this.vco1PwmLfoGain) {
      const targetGain = params.vco1PwmMode === 'lfo' ? 0.4 : 0;
      this.vco1PwmLfoGain.gain.setTargetAtTime(targetGain, time, 0.05);
    }

    if (this.vco2PwmOffset) {
      this.vco2PwmOffset.offset.setTargetAtTime((params.vco2PulseWidth - 0.5) * 1.8, time, 0.05);
    }
    if (this.vco2PwmLfoGain) {
      const targetGain = params.vco2PwmMode === 'lfo' ? 0.4 : 0;
      this.vco2PwmLfoGain.gain.setTargetAtTime(targetGain, time, 0.05);
    }
  }

  triggerAttack(midiNote: number, lastFreq: number, time: number, isLegato: boolean = false, velocity: number = 1) {
    // Kill existing transient nodes if any
    this.killTransientNodes(time);

    this.midiNote = midiNote;
    this.startTime = time;
    this.isReleasing = false;
    this.velocity = velocity;

    // Vintage voice card tolerance variance/drift (±4 cents drift)
    this.vco1Drift = (Math.random() - 0.5) * 0.04;
    this.vco2Drift = (Math.random() - 0.5) * 0.04;

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    if (this.params.synthEngine === 'hammond') {
      const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
      const footages = [0.5, 1.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0];
      const drawbarLevels = [
        this.params.hammondDb16,
        this.params.hammondDb513,
        this.params.hammondDb8,
        this.params.hammondDb4,
        this.params.hammondDb223,
        this.params.hammondDb2,
        this.params.hammondDb135,
        this.params.hammondDb113,
        this.params.hammondDb1
      ];

      this.hammondOscs = [];
      this.hammondGains = [];

      footages.forEach((footage, index) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        (osc as any).footMultiplier = footage;

        const targetFreq = freq * footage * bendFactor;
        osc.frequency.setValueAtTime(targetFreq, time);

        const gainNode = this.ctx.createGain();
        (gainNode as any).drawbarIndex = index;
        const level = drawbarLevels[index];
        const fraction = level / 8;
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(fraction * 0.35, time + 0.008);

        osc.connect(gainNode);
        gainNode.connect(this.filter);
        
        osc.start(time);

        this.hammondOscs.push(osc);
        this.hammondGains.push(gainNode);
      });

      // Vintage Key Click Simulation
      if (this.params.hammondKeyClick > 0 && this.sharedNoiseBuffer) {
        const clickSrc = this.ctx.createBufferSource();
        clickSrc.buffer = this.sharedNoiseBuffer;

        const clickFilter = this.ctx.createBiquadFilter();
        clickFilter.type = 'bandpass';
        clickFilter.frequency.setValueAtTime(3500, time);
        clickFilter.Q.setValueAtTime(3.0, time);

        const clickGainNode = this.ctx.createGain();
        clickGainNode.gain.setValueAtTime(this.params.hammondKeyClick * 0.22, time);
        clickGainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);

        clickSrc.connect(clickFilter);
        clickFilter.connect(clickGainNode);
        clickGainNode.connect(this.filter);

        clickSrc.start(time);
        clickSrc.stop(time + 0.05);
      }

      // Hammond Harmonic Percussion
      if (this.params.hammondPercussionEnabled) {
        const pertHarm = this.params.hammondPercussionHarmonic === 'second' ? 2.0 : 3.0;
        const percFreq = freq * pertHarm * bendFactor;

        this.percussionOsc = this.ctx.createOscillator();
        this.percussionOsc.type = 'sine';
        this.percussionOsc.frequency.setValueAtTime(percFreq, time);

        this.percussionGain = this.ctx.createGain();
        const maxPercGain = this.params.hammondPercussionVolume === 'soft' ? 0.08 : 0.22;
        const decayTime = this.params.hammondPercussionDecay === 'fast' ? 0.16 : 0.55;

        this.percussionGain.gain.setValueAtTime(maxPercGain, time);
        this.percussionGain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

        this.percussionOsc.connect(this.percussionGain);
        this.percussionGain.connect(this.filter);

        this.percussionOsc.start(time);
        this.percussionOsc.stop(time + decayTime + 0.1);
      }

      // Snappy but 100% click-free Organ VCA gating
      this.vca.gain.cancelScheduledValues(time);
      this.vca.gain.setValueAtTime(0, time);
      this.vca.gain.linearRampToValueAtTime(1.0, time + 0.008);

      return;
    }

    this.vco1 = this.ctx.createOscillator();
    this.vco2 = this.ctx.createOscillator();
    this.subOsc = this.ctx.createOscillator();
    this.vco1Noise = this.ctx.createBufferSource();
    this.vco2Noise = this.ctx.createBufferSource();
    
    if (this.sharedNoiseBuffer) {
      this.vco1Noise.buffer = this.sharedNoiseBuffer;
      this.vco2Noise.buffer = this.sharedNoiseBuffer;
    }
    this.vco1Noise.loop = true;
    this.vco2Noise.loop = true;

    // Connect Noises and SubOsc
    this.subOsc.connect(this.subOscGain);
    this.vco1Noise.connect(this.vco1NoiseGain);
    this.vco2Noise.connect(this.vco2NoiseGain);

    const { 
      env1Attack, env1Decay, env1Sustain, 
      env2Attack, env2Decay, env2Sustain, 
      filterCutoff, filterEnvAmount, filterEnvSource,
      vco1Range, vco1Freq,
      vco2Range, vco2Freq, vco2Detune,
      portamentoTime, portamentoMode,
      vco1Waveform, vco2Waveform
    } = this.params;

    // Set up VCO 1 connection (standard vs pulse wave PWM)
    if (vco1Waveform === 'pulse') {
      this.vco1.type = 'sawtooth';

      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(2);
      curve[0] = -1;
      curve[1] = 1;
      shaper.curve = curve;
      this.vco1PwmShaper = shaper;

      const sum = this.ctx.createGain();
      this.vco1PwmSum = sum;

      const offset = this.ctx.createConstantSource();
      offset.start(time);
      this.vco1PwmOffset = offset;

      const lfoGain = this.ctx.createGain();
      this.vco1PwmLfoGain = lfoGain;

      this.lfoModBusNode.connect(lfoGain);
      lfoGain.connect(offset.offset);

      this.vco1.connect(sum);
      offset.connect(sum);
      sum.connect(shaper);
      shaper.connect(this.vco1Gain);

      if (this.params.vco1PwmMode === 'lfo') {
        lfoGain.gain.setValueAtTime(0.4, time);
      } else {
        lfoGain.gain.setValueAtTime(0, time);
      }
      offset.offset.setValueAtTime((this.params.vco1PulseWidth - 0.5) * 1.8, time);
    } else {
      this.vco1.type = vco1Waveform as OscillatorType;
      this.vco1.connect(this.vco1Gain);
    }

    // Set up VCO 2 connection (standard vs pulse wave PWM)
    if (vco2Waveform === 'pulse') {
      this.vco2.type = 'sawtooth';

      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(2);
      curve[0] = -1;
      curve[1] = 1;
      shaper.curve = curve;
      this.vco2PwmShaper = shaper;

      const sum = this.ctx.createGain();
      this.vco2PwmSum = sum;

      const offset = this.ctx.createConstantSource();
      offset.start(time);
      this.vco2PwmOffset = offset;

      const lfoGain = this.ctx.createGain();
      this.vco2PwmLfoGain = lfoGain;

      this.lfoModBusNode.connect(lfoGain);
      lfoGain.connect(offset.offset);

      this.vco2.connect(sum);
      offset.connect(sum);
      sum.connect(shaper);
      shaper.connect(this.vco2Gain);

      if (this.params.vco2PwmMode === 'lfo') {
        lfoGain.gain.setValueAtTime(0.4, time);
      } else {
        lfoGain.gain.setValueAtTime(0, time);
      }
      offset.offset.setValueAtTime((this.params.vco2PulseWidth - 0.5) * 1.8, time);
    } else {
      this.vco2.type = vco2Waveform as OscillatorType;
      this.vco2.connect(this.vco2Gain);
    }

    // Connect LFO Mod conditionally based on params.vcoLfoSelect
    this.vcoLfoMod.disconnect();
    if (this.params.vcoLfoSelect === 'vco1' || this.params.vcoLfoSelect === 'both') {
      this.vcoLfoMod.connect(this.vco1.frequency);
    }
    if (this.params.vcoLfoSelect === 'vco2' || this.params.vcoLfoSelect === 'both') {
      this.vcoLfoMod.connect(this.vco2.frequency);
    }
    if (this.params.vcoLfoSelect === 'both' && this.subOsc) {
      this.vcoLfoMod.connect(this.subOsc.frequency);
    }

    // Cross modulation: VCO2 modulates VCO1 frequency
    if (this.vco2) this.vco2.connect(this.crossModGain);
    if (this.vco2Noise) this.vco2Noise.connect(this.crossModGain);
    this.crossModGain.connect(this.vco1!.frequency);

    this.subOsc.type = this.params.subOscWaveform;

    const range1 = 8 / vco1Range;
    const range2 = 8 / vco2Range;

    const prevFreq1 = Math.max(1, lastFreq * range1 * Math.pow(2, (vco1Freq + this.vco1Drift) / 12));
    const prevFreq2 = Math.max(1, lastFreq * range2 * Math.pow(2, (vco2Freq + (vco2Detune / 100) + this.vco2Drift) / 12));

    const targetFreq1 = Math.max(1, freq * range1 * Math.pow(2, (vco1Freq + this.vco1Drift) / 12));
    const targetFreq2 = Math.max(1, freq * range2 * Math.pow(2, (vco2Freq + (vco2Detune / 100) + this.vco2Drift) / 12));

    const subFreqFactor = Math.pow(2, this.params.subOscOctave);
    const prevSubFreq = Math.max(1, lastFreq * subFreqFactor);
    const targetSubFreq = Math.max(1, freq * subFreqFactor);

    const useGlide = (portamentoMode === 'off' ? false : (portamentoMode === 'on' || (portamentoMode === 'auto' && isLegato))) && lastFreq > 0;
    const glideTime = useGlide ? Math.max(0.002, portamentoTime) : 0;

    // Apply pitch bend
    const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
    const finalFreq1 = targetFreq1 * bendFactor;
    const finalFreq2 = targetFreq2 * bendFactor;
    const finalSubFreq = targetSubFreq * bendFactor;

    if (glideTime > 0.005) {
      this.vco1.frequency.cancelScheduledValues(time);
      this.vco2.frequency.cancelScheduledValues(time);
      this.subOsc.frequency.cancelScheduledValues(time);
      
      this.vco1.frequency.setValueAtTime(prevFreq1, time);
      this.vco2.frequency.setValueAtTime(prevFreq2, time);
      this.subOsc.frequency.setValueAtTime(prevSubFreq, time);
      
      this.vco1.frequency.setTargetAtTime(finalFreq1, time + 0.05, glideTime / 3);
      this.vco2.frequency.setTargetAtTime(finalFreq2, time + 0.05, glideTime / 3);
      this.subOsc.frequency.setTargetAtTime(finalSubFreq, time + 0.05, glideTime / 3);
    } else {
      this.vco1.frequency.setValueAtTime(finalFreq1, time);
      this.vco2.frequency.setValueAtTime(finalFreq2, time);
      this.subOsc.frequency.setValueAtTime(finalSubFreq, time);
    }

    const subLevel = this.params.subOscEnabled ? this.params.subOscMix : 0;
    this.subOscGain.gain.setValueAtTime(subLevel, time);

    // Velocity Scaling
    const velocityScale = 1.0 - (1.0 - velocity) * this.perfSettings.velocitySensitivity;

    // Determine active VCA envelope parameters based on 3-way toggle
    let vcaAttack = 0.01;
    let vcaDecay = 0.5;
    let vcaSustain = 0.5;
    if (this.params.vcaSource === 'env1') {
      vcaAttack = env1Attack;
      vcaDecay = env1Decay;
      vcaSustain = env1Sustain;
    } else if (this.params.vcaSource === 'env2') {
      vcaAttack = env2Attack;
      vcaDecay = env2Decay;
      vcaSustain = env2Sustain;
    } else if (this.params.vcaSource === 'lfo') {
      vcaAttack = 0.003;
      vcaDecay = 0.005;
      vcaSustain = 1.0;
    }

    // VCA Envelope - Smooth analog-style non-zero-resetting attack to prevent clicks and gasps
    this.vca.gain.cancelScheduledValues(time);
    const prevGain = Math.max(0.0001, this.vca.gain.value);
    
    this.vca.gain.setValueAtTime(prevGain, time);
    this.vca.gain.linearRampToValueAtTime(velocityScale, time + Math.max(0.003, vcaAttack));
    
    const sustainLevel = Math.max(0.0001, vcaSustain * velocityScale);
    this.vca.gain.setTargetAtTime(sustainLevel, time + Math.max(0.003, vcaAttack), Math.max(0.01, vcaDecay));

    const safeCutoff = Math.max(20, filterCutoff);
    const scale = Math.max(0, Math.min(1, Math.log(safeCutoff / 20) / Math.log(20000 / 20)));

    // LFO Modulation Gain Scheduling (Delay and Fade-In, scaled by LFO velocity sensitivity and VCF scale)
    const lfoVelScale = 1.0 - (1.0 - velocity) * this.params.lfoVelocitySensitivity;
    const delay = this.params.lfoDelay || 0;
    const filterLfoTarget = this.params.filterLfoAmount * 5000 * lfoVelScale * scale;
    const vcoLfoTarget = this.params.vcoLfoAmount * 100 * lfoVelScale;
    const vcaLfoTarget = (this.params.vcaSource === 'lfo' 
      ? Math.max(0.3, this.params.vcaLfoAmount) 
      : this.params.vcaLfoAmount) * lfoVelScale;

    this.filterLfoMod.gain.cancelScheduledValues(time);
    this.vcaLfoMod.gain.cancelScheduledValues(time);
    this.vcoLfoMod.gain.cancelScheduledValues(time);

    if (delay > 0) {
      this.filterLfoMod.gain.setValueAtTime(0, time);
      this.vcaLfoMod.gain.setValueAtTime(0, time);
      this.vcoLfoMod.gain.setValueAtTime(0, time);
      
      this.filterLfoMod.gain.setValueAtTime(0, time + delay);
      this.vcaLfoMod.gain.setValueAtTime(0, time + delay);
      this.vcaLfoMod.gain.setValueAtTime(0, time + delay);

      const fadeTime = 0.8;
      this.filterLfoMod.gain.linearRampToValueAtTime(filterLfoTarget, time + delay + fadeTime);
      this.vcaLfoMod.gain.linearRampToValueAtTime(vcaLfoTarget, time + delay + fadeTime);
      this.vcoLfoMod.gain.linearRampToValueAtTime(vcoLfoTarget, time + delay + fadeTime);
    } else {
      this.filterLfoMod.gain.setValueAtTime(filterLfoTarget, time);
      this.vcaLfoMod.gain.setValueAtTime(vcaLfoTarget, time);
      this.vcoLfoMod.gain.setValueAtTime(vcoLfoTarget, time);
    }

    // Filter Envelope
    const envAttack = filterEnvSource === 'env1' ? env1Attack : env2Attack;
    const envDecay = filterEnvSource === 'env1' ? env1Decay : env2Decay;
    const envSustain = filterEnvSource === 'env1' ? env1Sustain : env2Sustain;

    // Keyboard tracking scaled by VCF scale
    const kbdMod = (midiNote - 64) * (this.params.filterKeyboardTrack * 100) * scale;
    
    // Velocity also scales filter cutoff, scaled by VCF scale
    const velCutoffMod = (velocity - 1) * this.params.filterVelocitySensitivity * 5000 * scale;
    const baseCutoff = Math.max(20, filterCutoff + velCutoffMod + kbdMod);
    const targetCutoff = Math.min(20000, baseCutoff + filterEnvAmount * 10000 * scale);

    // Smooth VCF attack sweep starting from the current filter frequency to prevent jumping clicks/resets
    this.filter.frequency.cancelScheduledValues(time);
    const currentFreq = Math.max(20, this.filter.frequency.value || baseCutoff);
    this.filter.frequency.setValueAtTime(currentFreq, time);
    
    // Ramps cleanly from currentFreq to targetCutoff using highly compatible linear sweeps
    this.filter.frequency.linearRampToValueAtTime(Math.max(20, targetCutoff), time + Math.max(0.005, envAttack));
    const sustainFilterFreq = Math.max(20, baseCutoff + (targetCutoff - baseCutoff) * envSustain);
    this.filter.frequency.setTargetAtTime(sustainFilterFreq, time + Math.max(0.005, envAttack), Math.max(0.01, envDecay));

    // Set initial levels for VCOs scaled by velocity sensitivity
    const vco1VelSens = this.params.vco1VelocitySensitivity !== undefined ? this.params.vco1VelocitySensitivity : 0;
    const vco2VelSens = this.params.vco2VelocitySensitivity !== undefined ? this.params.vco2VelocitySensitivity : 0;
    const vco1VelocityScale = 1.0 - (1.0 - velocity) * vco1VelSens;
    const vco2VelocityScale = 1.0 - (1.0 - velocity) * vco2VelSens;

    const vco1Level = (1.0 - this.params.vcoMix) * this.params.mixerVco1 * vco1VelocityScale;
    const vco2Level = this.params.vcoMix * this.params.mixerVco2 * vco2VelocityScale;
    const isVco1Noise = vco1Waveform === 'noise';
    const isVco2Noise = vco2Waveform === 'noise';

    this.vco1Gain.gain.cancelScheduledValues(time);
    this.vco2Gain.gain.cancelScheduledValues(time);
    this.vco1NoiseGain.gain.cancelScheduledValues(time);
    this.vco2NoiseGain.gain.cancelScheduledValues(time);

    this.vco1Gain.gain.setValueAtTime(isVco1Noise ? 0 : vco1Level, time);
    this.vco1NoiseGain.gain.setValueAtTime(isVco1Noise ? vco1Level : 0, time);
    this.vco2Gain.gain.setValueAtTime(isVco2Noise ? 0 : vco2Level, time);
    this.vco2NoiseGain.gain.setValueAtTime(isVco2Noise ? vco2Level : 0, time);

    this.vco1.start(time);
    this.vco2.start(time);
    this.subOsc.start(time);
    this.vco1Noise.start(time);
    this.vco2Noise.start(time);
  }

  setPitchBend(offset: number) {
    this.pitchBendOffset = offset;
    const time = this.ctx.currentTime;
    if (this.midiNote !== null && !this.isReleasing) {
      if (this.params.synthEngine === 'hammond') {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const bendFactor = Math.pow(2, offset / 12);
        this.hammondOscs.forEach((osc) => {
          const mult = (osc as any).footMultiplier || 1.0;
          osc.frequency.setTargetAtTime(freq * mult * bendFactor, time, 0.02);
        });
        if (this.percussionOsc) {
          const pertHarm = this.params.hammondPercussionHarmonic === 'second' ? 2.0 : 3.0;
          this.percussionOsc.frequency.setTargetAtTime(freq * pertHarm * bendFactor, time, 0.02);
        }
      } else if (this.vco1 && this.vco2) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const { vco1Freq, vco1Range, vco2Freq, vco2Range, vco2Detune } = this.params;
        
        const bendFactor = Math.pow(2, offset / 12);
        
        const targetFreq1 = freq * (8/vco1Range) * Math.pow(2, vco1Freq / 12) * bendFactor;
        const targetFreq2 = freq * (8/vco2Range) * Math.pow(2, (vco2Freq + (vco2Detune / 100)) / 12) * bendFactor;

        this.vco1.frequency.setTargetAtTime(targetFreq1, time, 0.02);
        this.vco2.frequency.setTargetAtTime(targetFreq2, time, 0.02);

        if (this.subOsc) {
          const subFreqFactor = Math.pow(2, this.params.subOscOctave);
          const targetSubFreq = freq * subFreqFactor * bendFactor;
          this.subOsc.frequency.setTargetAtTime(targetSubFreq, time, 0.02);
        }
      }
    }
  }

  private killTransientNodes(time: number) {
    if (this.vco1) {
      try { this.vco1.stop(time); } catch(e) {}
      this.vco1.disconnect();
      this.vco1 = null;
    }
    if (this.subOsc) {
      try { this.subOsc.stop(time); } catch(e) {}
      this.subOsc.disconnect();
      this.subOsc = null;
    }
    if (this.vco2) {
      try { this.vco2.stop(time); } catch(e) {}
      this.vco2.disconnect();
      this.vco2 = null;
    }
    if (this.vco1Noise) {
      try { this.vco1Noise.stop(time); } catch(e) {}
      this.vco1Noise.disconnect();
      this.vco1Noise = null;
    }
    if (this.vco2Noise) {
      try { this.vco2Noise.stop(time); } catch(e) {}
      this.vco2Noise.disconnect();
      this.vco2Noise = null;
    }
    if (this.hammondOscs && this.hammondOscs.length > 0) {
      this.hammondOscs.forEach(osc => {
        try { osc.stop(time); } catch(e) {}
        osc.disconnect();
      });
      this.hammondOscs = [];
    }
    if (this.hammondGains && this.hammondGains.length > 0) {
      this.hammondGains.forEach(g => g.disconnect());
      this.hammondGains = [];
    }
    if (this.percussionOsc) {
      try { this.percussionOsc.stop(time); } catch(e) {}
      this.percussionOsc.disconnect();
      this.percussionOsc = null;
    }
    if (this.percussionGain) {
      this.percussionGain.disconnect();
      this.percussionGain = null;
    }

    // Clean up PWM nodes
    if (this.vco1PwmOffset) {
      try { this.vco1PwmOffset.stop(time); } catch(e) {}
      this.vco1PwmOffset.disconnect();
      this.vco1PwmOffset = null;
    }
    if (this.vco1PwmLfoGain) {
      this.vco1PwmLfoGain.disconnect();
      this.vco1PwmLfoGain = null;
    }
    if (this.vco1PwmSum) {
      this.vco1PwmSum.disconnect();
      this.vco1PwmSum = null;
    }
    if (this.vco1PwmShaper) {
      this.vco1PwmShaper.disconnect();
      this.vco1PwmShaper = null;
    }

    if (this.vco2PwmOffset) {
      try { this.vco2PwmOffset.stop(time); } catch(e) {}
      this.vco2PwmOffset = null;
    }
    if (this.vco2PwmLfoGain) {
      this.vco2PwmLfoGain.disconnect();
      this.vco2PwmLfoGain = null;
    }
    if (this.vco2PwmSum) {
      this.vco2PwmSum.disconnect();
      this.vco2PwmSum = null;
    }
    if (this.vco2PwmShaper) {
      this.vco2PwmShaper.disconnect();
      this.vco2PwmShaper = null;
    }
  }

  triggerRelease(time: number) {
    this.isReleasing = true;
    let releaseDuration = 0.05;
    
    if (this.params.synthEngine === 'hammond') {
      const organRelease = 0.04; // snappy organ release
      releaseDuration = organRelease;
      this.vca.gain.cancelScheduledValues(time);
      this.vca.gain.setValueAtTime(this.vca.gain.value, time);
      this.vca.gain.setTargetAtTime(0, time, organRelease / 3);

      // Schedule stop on physical Hammond oscillators at completion of envelope
      if (this.hammondOscs && this.hammondOscs.length > 0) {
        this.hammondOscs.forEach(osc => {
          try { osc.stop(time + organRelease); } catch (e) {}
        });
      }
      if (this.percussionOsc) {
        try { this.percussionOsc.stop(time + organRelease); } catch (e) {}
      }
    } else {
      const { env1Release, env2Release, filterEnvSource } = this.params;
      const envRelease = filterEnvSource === 'env1' ? env1Release : env2Release;
      
      let vcaRelease = env2Release;
      if (this.params.vcaSource === 'env1') {
        vcaRelease = env1Release;
      } else if (this.params.vcaSource === 'lfo') {
        vcaRelease = 0.05; // Quick snappy release on gating LFO
      }
      releaseDuration = vcaRelease;

      this.vca.gain.cancelScheduledValues(time);
      this.vca.gain.setValueAtTime(this.vca.gain.value, time);
      this.vca.gain.setTargetAtTime(0, time, Math.max(0.001, vcaRelease / 3));
      
      this.filter.frequency.cancelScheduledValues(time);
      this.filter.frequency.setValueAtTime(this.filter.frequency.value, time);
      this.filter.frequency.setTargetAtTime(this.params.filterCutoff, time, Math.max(0.001, envRelease / 3));
    }

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
    }
    this.stopTimer = window.setTimeout(() => {
      this.stop();
    }, Math.max(0.05, releaseDuration) * 1000);
  }
  
  stop() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.killTransientNodes(this.ctx.currentTime);
    this.midiNote = null;
    this.isReleasing = false;
    this.vca.gain.cancelScheduledValues(this.ctx.currentTime);
    this.vca.gain.value = 0;
  }
}

export class JupiterEngine {
  private ctx: AudioContext | null = null;
  private voices: Voice[] = [];
  private lastFrequency: number = 0;
  private params: VoiceParams;
  private perfSettings: PerformanceSettings;
  private worker: Worker | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  
  // Arpeggiator State
  private heldNotes: number[] = [];
  private playedNotes: number[] = [];
  private lastReleaseTime: number = 0;
  private arpTimer: number | null = null;
  private arpIndex: number = 0;
  private arpDirection: 1 | -1 = 1;
  private activeArpNotes: Map<number, Voice> = new Map();

  private mainGain: GainNode | null = null;
  private masterBus: GainNode | null = null;
  
  // Main LFO
  private mainLFO: OscillatorNode | null = null;
  private lfoModBus: GainNode | null = null;
  private modWheelGain: GainNode | null = null;
  private currentPitchBend: number = 0;
  private currentModWheel: number = 0;
  
  // FX Nodes
  private chorus: DelayNode | null = null;
  private chorusLFO: OscillatorNode | null = null;
  private chorusLfoGain: GainNode | null = null;
  private chorusGain: GainNode | null = null;

  // Multi-phase vintage chorus ensemble extension
  private chorus2: DelayNode | null = null;
  private chorus3: DelayNode | null = null;
  private chorus2Gain: GainNode | null = null;
  private chorus3Gain: GainNode | null = null;
  private chorus2LFO: OscillatorNode | null = null;
  private chorus2LfoGain: GainNode | null = null;
  private chorus3LFO: OscillatorNode | null = null;
  private chorus3LfoGain: GainNode | null = null;
  private chorusFastLFO: OscillatorNode | null = null;
  private chorusFastLfoGain: GainNode | null = null;
  private chorus2FastLFO: OscillatorNode | null = null;
  private chorus2FastLfoGain: GainNode | null = null;
  private chorus3FastLFO: OscillatorNode | null = null;
  private chorus3FastLfoGain: GainNode | null = null;
  
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayGain: GainNode | null = null;
  
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  // Equalizer (5 bands)
  private eqFilters: BiquadFilterNode[] = [];

  // Distortion
  private distortionInput: GainNode | null = null;
  private distortion: WaveShaperNode | null = null;
  private distortionGain: GainNode | null = null;
  private distortionDry: GainNode | null = null;
  private distortionFeedbackGain: GainNode | null = null;
  private distortionFeedbackFilter: BiquadFilterNode | null = null;
  private distortionFeedbackDelay: DelayNode | null = null;

  // Leslie (Rotary)
  private leslieLFO: OscillatorNode | null = null;
  private leslieLfoInverter: GainNode | null = null;
  private leslieDelayL: DelayNode | null = null;
  private leslieDelayR: DelayNode | null = null;
  private leslieGainL: GainNode | null = null;
  private leslieGainR: GainNode | null = null;
  private leslieDry: GainNode | null = null;
  private leslieLfoGainL: GainNode | null = null;
  private leslieLfoGainR: GainNode | null = null;
  private leslieVibGainL: GainNode | null = null;
  private leslieVibGainR: GainNode | null = null;
  private leslieMerger: ChannelMergerNode | null = null;
  private lastTargetLeslieRate: number = 1.2;

  // Tremolo
  private tremoloLFO: OscillatorNode | null = null;
  private tremoloGain: GainNode | null = null;
  private tremoloDry: GainNode | null = null;
  private tremoloLfoGain: GainNode | null = null;
  
  // Limiter & Compander
  private compressorInput: GainNode | null = null;
  private compressorDry: GainNode | null = null;
  private compressorWet: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private volumeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Metronome & Recorder State
  private metronomeGain: GainNode | null = null;
  private metronomeTimer: number | null = null;
  private metronomeBeatCount: number = 0;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: Blob[] = [];
  private isRecording: boolean = false;

  constructor(params: VoiceParams, perfSettings: PerformanceSettings) {
    this.params = params;
    this.perfSettings = perfSettings;
  }

  getAnalyser() {
    return this.analyser;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  restartAudio() {
    this.restart();
  }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext({
      sampleRate: this.perfSettings.sampleRate,
      latencyHint: this.perfSettings.latencyHint
    });

    // Initialize Worker
    this.worker = new Worker(new URL('../workers/audioWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      if (!this.ctx) return;
      if (e.data.type === 'impulseResponseGenerated') {
        const { channels } = e.data;
        const buffer = this.ctx.createBuffer(2, channels[0].length, this.ctx.sampleRate);
        buffer.getChannelData(0).set(channels[0]);
        buffer.getChannelData(1).set(channels[1]);
        if (this.reverb) this.reverb.buffer = buffer;
      } else if (e.data.type === 'noiseBufferGenerated') {
        const { channels } = e.data;
        const buffer = this.ctx.createBuffer(1, channels[0].length, this.ctx.sampleRate);
        buffer.getChannelData(0).set(channels[0]);
        this.noiseBuffer = buffer;
      }
    };

    // Request noise buffer
    this.worker.postMessage({
      type: 'generateNoiseBuffer',
      params: { bufferSize: this.ctx.sampleRate * 2 }
    });

    // Final Output Bus
    this.mainGain = this.ctx.createGain();
    this.mainGain.gain.value = 1.0; 
    
    this.masterBus = this.ctx.createGain();
    this.masterBus.gain.value = 0.5;

    // Main LFO Setup
    this.mainLFO = this.ctx.createOscillator();
    this.lfoModBus = this.ctx.createGain();
    this.mainLFO.connect(this.lfoModBus);
    this.mainLFO.start();

    // Pre-create voices
    this.updateVoiceCount();

    // Final volume control
    this.volumeGain = this.ctx.createGain();
    this.volumeGain.gain.value = this.params.masterVolume;

    // Analyser for UI
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    // Compressor (Compander section)
    this.compressorInput = this.ctx.createGain();
    this.compressorDry = this.ctx.createGain();
    this.compressorWet = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    
    // Limiter (Fixed safety)
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -0.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    // Internal master flow: Voices/FX -> MasterBus (summing) -> Master Chain (Dist/Trem/Les) -> Comp/Limiter -> Out

    // All effects and dry signal connect to masterBus
    this.mainGain.connect(this.masterBus); 
    
    // setupFX handles the Master Chain connection from masterBus to compressor
    this.setupFX();
    
    this.compressorInput.connect(this.compressor);
    this.compressorInput.connect(this.compressorDry);
    this.compressor.connect(this.compressorWet);

    this.compressorDry.connect(this.limiter);
    this.compressorWet.connect(this.limiter);

    this.limiter.connect(this.volumeGain!);
    this.volumeGain!.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Dedicated clean sound path for metronome, bypassing all FX/compressor/master volumes
    this.metronomeGain = this.ctx.createGain();
    this.metronomeGain.gain.setValueAtTime(this.params.metronomeVolume, this.ctx.currentTime);
    this.metronomeGain.connect(this.ctx.destination);

    // Audio stream capture destination for clean synth output (excluding metronome)
    this.recordingDestination = this.ctx.createMediaStreamDestination();
    this.volumeGain!.connect(this.recordingDestination);

    if (this.params.metronomeEnabled) {
      this.startMetronome();
    }
  }

  private setupFX() {
    if (!this.ctx || !this.mainGain) return;

    // Chorus Delays (3 parallel delay lines for maximum vintage thickness)
    this.chorus = this.ctx.createDelay(0.1);
    this.chorus2 = this.ctx.createDelay(0.1);
    this.chorus3 = this.ctx.createDelay(0.1);

    this.chorusGain = this.ctx.createGain();
    this.chorus2Gain = this.ctx.createGain();
    this.chorus3Gain = this.ctx.createGain();

    // Set default base delay times mimicking classic bucket brigade delays (BBDs)
    this.chorus.delayTime.setValueAtTime(0.025, this.ctx.currentTime);
    this.chorus2.delayTime.setValueAtTime(0.028, this.ctx.currentTime);
    this.chorus3.delayTime.setValueAtTime(0.022, this.ctx.currentTime);

    // Initialize slow LFOs for each line
    this.chorusLFO = this.ctx.createOscillator();
    this.chorusLfoGain = this.ctx.createGain();
    this.chorus2LFO = this.ctx.createOscillator();
    this.chorus2LfoGain = this.ctx.createGain();
    this.chorus3LFO = this.ctx.createOscillator();
    this.chorus3LfoGain = this.ctx.createGain();

    // Initialize fast LFOs for vintage multi-phase Solina Triple Ensemble modulation
    this.chorusFastLFO = this.ctx.createOscillator();
    this.chorusFastLfoGain = this.ctx.createGain();
    this.chorus2FastLFO = this.ctx.createOscillator();
    this.chorus2FastLfoGain = this.ctx.createGain();
    this.chorus3FastLFO = this.ctx.createOscillator();
    this.chorus3FastLfoGain = this.ctx.createGain();

    // Set default values helper
    this.chorusLFO.frequency.value = 0.5;
    this.chorusLfoGain.gain.value = 0.002;
    this.chorus2LFO.frequency.value = 0.55;
    this.chorus2LfoGain.gain.value = 0.0;
    this.chorus3LFO.frequency.value = 0.61;
    this.chorus3LfoGain.gain.value = 0.0;

    this.chorusFastLFO.frequency.value = 5.8;
    this.chorusFastLfoGain.gain.value = 0.0;
    this.chorus2FastLFO.frequency.value = 6.2;
    this.chorus2FastLfoGain.gain.value = 0.0;
    this.chorus3FastLFO.frequency.value = 5.3;
    this.chorus3FastLfoGain.gain.value = 0.0;

    // Start all chorus LFOs
    this.chorusLFO.start();
    this.chorus2LFO.start();
    this.chorus3LFO.start();
    this.chorusFastLFO.start();
    this.chorus2FastLFO.start();
    this.chorus3FastLFO.start();

    // Connect Slow + Fast LFO Modulations to Delay Line 1
    this.chorusLFO.connect(this.chorusLfoGain);
    this.chorusLfoGain.connect(this.chorus.delayTime);
    this.chorusFastLFO.connect(this.chorusFastLfoGain);
    this.chorusFastLfoGain.connect(this.chorus.delayTime);

    // Connect Slow + Fast LFO Modulations to Delay Line 2
    this.chorus2LFO.connect(this.chorus2LfoGain);
    this.chorus2LfoGain.connect(this.chorus2.delayTime);
    this.chorus2FastLFO.connect(this.chorus2FastLfoGain);
    this.chorus2FastLfoGain.connect(this.chorus2.delayTime);

    // Connect Slow + Fast LFO Modulations to Delay Line 3
    this.chorus3LFO.connect(this.chorus3LfoGain);
    this.chorus3LfoGain.connect(this.chorus3.delayTime);
    this.chorus3FastLFO.connect(this.chorus3FastLfoGain);
    this.chorus3FastLfoGain.connect(this.chorus3.delayTime);

    // Delay
    this.delay = this.ctx.createDelay(5.0);
    this.delayFeedback = this.ctx.createGain();
    this.delayGain = this.ctx.createGain();
    
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayGain);

    // Reverb
    this.reverb = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();
    this.createImpulseResponse();

    // Routing
    // Voices -> MainGain
    // MainGain -> 3 Parallel Chorus Delays -> masterBus
    // MainGain -> Delay -> Output
    // MainGain -> Reverb -> Output
    this.mainGain.connect(this.chorus!);
    this.chorus!.connect(this.chorusGain);
    this.chorusGain.connect(this.masterBus!);

    if (this.chorus2 && this.chorus2Gain) {
      this.mainGain.connect(this.chorus2);
      this.chorus2.connect(this.chorus2Gain);
      this.chorus2Gain.connect(this.masterBus!);
    }

    if (this.chorus3 && this.chorus3Gain) {
      this.mainGain.connect(this.chorus3);
      this.chorus3.connect(this.chorus3Gain);
      this.chorus3Gain.connect(this.masterBus!);
    }

    this.mainGain.connect(this.delay!);
    this.delayGain.connect(this.masterBus!);

    this.mainGain.connect(this.reverb!);
    this.reverb!.connect(this.reverbGain!);
    this.reverbGain.connect(this.masterBus!);
    
    // Master Chain starts here: masterBus -> Equalizer -> Distortion (with optional feedback) -> Tremolo -> Leslie -> Compressor

    // Initialize EQ Filters
    this.eqFilters = [];
    const eqFrequencies = [80, 250, 1000, 4000, 12000];
    const eqTypes: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
    const eqQs = [1, 1, 1, 1, 1];

    for (let i = 0; i < 5; i++) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = eqTypes[i];
      filter.frequency.value = eqFrequencies[i];
      filter.Q.value = eqQs[i];
      filter.gain.value = 0; // Starts flat
      this.eqFilters.push(filter);
    }

    // Connect the 5-band EQ filters in series
    for (let i = 0; i < 4; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1]);
    }

    // Initialize Distortion Nodes
    this.distortion = this.ctx.createWaveShaper();
    this.distortionGain = this.ctx.createGain();
    this.distortionDry = this.ctx.createGain();
    this.distortionInput = this.ctx.createGain();

    // Initialize feedback chain nodes
    this.distortionFeedbackDelay = this.ctx.createDelay(0.1);
    this.distortionFeedbackFilter = this.ctx.createBiquadFilter();
    this.distortionFeedbackGain = this.ctx.createGain();

    // Route: masterBus -> EQ chain -> distortionInput
    this.masterBus.connect(this.eqFilters[0]);
    this.eqFilters[4].connect(this.distortionInput);
    
    // distortionInput routes to the Waveshaper and dry path
    this.distortionInput.connect(this.distortion);
    this.distortionInput.connect(this.distortionDry);

    const afterDistortion = this.ctx.createGain();
    this.distortion.connect(this.distortionGain);
    this.distortionGain.connect(afterDistortion);
    this.distortionDry.connect(afterDistortion);

    // Setup Feedback overdrive path: afterDistortion -> delay -> filter -> feedback gain -> distortionInput
    this.distortionFeedbackDelay.delayTime.setValueAtTime(0.015, this.ctx.currentTime);
    this.distortionFeedbackFilter.type = 'bandpass';
    this.distortionFeedbackFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
    this.distortionFeedbackFilter.Q.setValueAtTime(15.0, this.ctx.currentTime);
    this.distortionFeedbackGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    afterDistortion.connect(this.distortionFeedbackDelay);
    this.distortionFeedbackDelay.connect(this.distortionFeedbackFilter);
    this.distortionFeedbackFilter.connect(this.distortionFeedbackGain);
    this.distortionFeedbackGain.connect(this.distortionInput);

    // Tremolo Stage
    this.tremoloGain = this.ctx.createGain();
    this.tremoloDry = this.ctx.createGain();
    this.tremoloLFO = this.ctx.createOscillator();
    this.tremoloLfoGain = this.ctx.createGain();
    this.tremoloLFO.connect(this.tremoloLfoGain);
    this.tremoloLfoGain.connect(this.tremoloGain.gain);
    this.tremoloLFO.start();

    // Connect distortion to tremolo
    afterDistortion.connect(this.tremoloGain);
    afterDistortion.connect(this.tremoloDry);
    
    const tremoloNext = this.ctx.createGain();
    this.tremoloGain.connect(tremoloNext);
    this.tremoloDry.connect(tremoloNext);

    // Leslie stage (Stereo Rotary Effect)
    this.leslieLFO = this.ctx.createOscillator();
    this.leslieLfoInverter = this.ctx.createGain();
    this.leslieLfoInverter.gain.setValueAtTime(-1, this.ctx.currentTime);
    this.leslieLFO.connect(this.leslieLfoInverter);

    this.leslieDelayL = this.ctx.createDelay(0.1);
    this.leslieDelayR = this.ctx.createDelay(0.1);
    this.leslieGainL = this.ctx.createGain();
    this.leslieGainR = this.ctx.createGain();
    this.leslieDry = this.ctx.createGain();

    this.leslieLfoGainL = this.ctx.createGain();
    this.leslieLfoGainR = this.ctx.createGain();
    this.leslieVibGainL = this.ctx.createGain();
    this.leslieVibGainR = this.ctx.createGain();

    this.leslieMerger = this.ctx.createChannelMerger(2);

    // Left channel connections (Direct LFO)
    this.leslieLFO.connect(this.leslieLfoGainL);
    this.leslieLFO.connect(this.leslieVibGainL);
    this.leslieLfoGainL.connect(this.leslieGainL.gain);
    this.leslieVibGainL.connect(this.leslieDelayL.delayTime);

    // Right channel connections (Inverted LFO for Stereo phase difference)
    this.leslieLfoInverter.connect(this.leslieLfoGainR);
    this.leslieLfoInverter.connect(this.leslieVibGainR);
    this.leslieLfoGainR.connect(this.leslieGainR.gain);
    this.leslieVibGainR.connect(this.leslieDelayR.delayTime);

    this.leslieLFO.start();

    // Route signal into Leslie Delay Lines
    tremoloNext.connect(this.leslieDelayL);
    tremoloNext.connect(this.leslieDelayR);

    // Route Delays into Gains
    this.leslieDelayL.connect(this.leslieGainL);
    this.leslieDelayR.connect(this.leslieGainR);

    // Merge Left and Right paths into Stereo
    this.leslieGainL.connect(this.leslieMerger, 0, 0);
    this.leslieGainR.connect(this.leslieMerger, 0, 1);

    // Dry path (for Wet/Dry mix mapping)
    tremoloNext.connect(this.leslieDry);

    // Connect both wet (merged) and dry paths to compressor input
    this.leslieMerger.connect(this.compressorInput!);
    this.leslieDry.connect(this.compressorInput!);
    
    this.updateFXParams();
  }

  private getRateFromBPM(bpm: number, division: string): number {
    let beatDuration = 60 / bpm; // duration of one designated "beat" in seconds
    
    // In compound time like 6/8, the beat is often a dotted quarter.
    // We want our multipliers (1/4, 1/8) to be relative to a standard quarter note.
    const isCompound = this.params.timeSignature === '6/8' || 
                      this.params.timeSignature === '9/8' || 
                      this.params.timeSignature === '12/8';
    
    const quarterDuration = isCompound ? beatDuration * (2/3) : beatDuration;
    let multiplier = 1;

    // Base divisions (relative to a quarter note)
    if (division.startsWith('1/16')) multiplier = 0.25;
    else if (division.startsWith('1/32')) multiplier = 0.125;
    else if (division.startsWith('1/1')) multiplier = 4;
    else if (division.startsWith('1/2')) multiplier = 2;
    else if (division.startsWith('1/4')) multiplier = 1;
    else if (division.startsWith('1/8')) multiplier = 0.5;

    // Modifiers
    if (division.endsWith('t')) {
      multiplier *= 2/3; // Triplets are 2/3 of the base
    } else if (division.endsWith('d')) {
      multiplier *= 1.5; // Dotted are 1.5 of the base
    }

    const duration = quarterDuration * multiplier;
    return 1 / duration; // Frequency in Hz
  }

  private getIntervalFromBPM(bpm: number, division: string): number {
    return (1 / this.getRateFromBPM(bpm, division)) * 1000; // Interval in ms
  }

  private updateFXParams(oldParams?: VoiceParams) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    // Safely and instantly snap value on initialization to prevent settling glides/transient feedback
    const setParam = (audioParam: AudioParam | undefined | null, targetVal: number, timeConstant: number = 0.05) => {
      if (!audioParam) return;
      if (!oldParams) {
        audioParam.setValueAtTime(targetVal, time);
        audioParam.value = targetVal;
      } else {
        audioParam.setTargetAtTime(targetVal, time, timeConstant);
      }
    };

    if (this.mainLFO) {
      if (this.params.lfoWaveform !== 'random') {
        this.mainLFO.type = this.params.lfoWaveform as OscillatorType;
      } else {
        this.mainLFO.type = 'sine'; // Fallback for now
      }
      
      const rate = this.params.lfoSync 
        ? this.getRateFromBPM(this.params.bpm, this.params.lfoSyncDivision)
        : this.params.lfoRate;
        
      setParam(this.mainLFO.frequency, rate, 0.05);
    }

    // Chorus & Vintage Ensemble (Dynamic multi-tap routing)
    if (this.chorusLFO && this.chorusLfoGain && this.chorusGain) {
      if (this.params.chorusMode === 1) {
        // Mode 1: Standard single-voice chorus
        setParam(this.chorusLFO.frequency, 0.5, 0.05);
        setParam(this.chorusLfoGain.gain, 0.002, 0.05);
        
        // Disable fast LFO on line 1
        if (this.chorusFastLfoGain) setParam(this.chorusFastLfoGain.gain, 0, 0.05);
        
        // Connect and activate Tap 1 wet, mute Tap 2 & Tap 3 wet
        setParam(this.chorusGain.gain, this.params.chorusMix, 0.05);
        if (this.chorus2Gain) setParam(this.chorus2Gain.gain, 0, 0.05);
        if (this.chorus3Gain) setParam(this.chorus3Gain.gain, 0, 0.05);
        
        // Zero outer LFO gains
        if (this.chorus2LfoGain) setParam(this.chorus2LfoGain.gain, 0, 0.05);
        if (this.chorus2FastLfoGain) setParam(this.chorus2FastLfoGain.gain, 0, 0.05);
        if (this.chorus3LfoGain) setParam(this.chorus3LfoGain.gain, 0, 0.05);
        if (this.chorus3FastLfoGain) setParam(this.chorus3FastLfoGain.gain, 0, 0.05);
      } else if (this.params.chorusMode === 2) {
        // Mode 2: Thick Dual Analog Chorus
        setParam(this.chorusLFO.frequency, 0.8, 0.05);
        setParam(this.chorusLfoGain.gain, 0.0035, 0.05);
        if (this.chorusFastLfoGain) setParam(this.chorusFastLfoGain.gain, 0, 0.05);
        
        if (this.chorus2LFO && this.chorus2LfoGain) {
          setParam(this.chorus2LFO.frequency, 0.55, 0.05);
          setParam(this.chorus2LfoGain.gain, 0.0045, 0.05);
        }
        if (this.chorus2FastLfoGain) setParam(this.chorus2FastLfoGain.gain, 0, 0.05);
        
        // Mute Tap 3 modulations & output
        if (this.chorus3LfoGain) setParam(this.chorus3LfoGain.gain, 0, 0.05);
        if (this.chorus3FastLfoGain) setParam(this.chorus3FastLfoGain.gain, 0, 0.05);
        
        // Activate Tap 1 & Tap 2 wet, mute Tap 3 wet
        setParam(this.chorusGain.gain, this.params.chorusMix, 0.05);
        if (this.chorus2Gain) setParam(this.chorus2Gain.gain, this.params.chorusMix, 0.05);
        if (this.chorus3Gain) setParam(this.chorus3Gain.gain, 0, 0.05);
      } else if (this.params.chorusMode === 3) {
        // Mode 3: Vintage Solina Ensemble (Triple asynchronous BBD delay lines, 6 LFO modulators)
        // Delay Line 1 (Slow A: 0.6 Hz, depth 0.003s & Fast A: 5.8 Hz, depth 0.001s)
        setParam(this.chorusLFO.frequency, 0.6, 0.05);
        setParam(this.chorusLfoGain.gain, 0.003, 0.05);
        if (this.chorusFastLFO && this.chorusFastLfoGain) {
          setParam(this.chorusFastLFO.frequency, 5.8, 0.05);
          setParam(this.chorusFastLfoGain.gain, 0.001, 0.05);
        }
        
        // Delay Line 2 (Slow B: 0.48 Hz, depth 0.0035s & Fast B: 6.2 Hz, depth 0.0008s)
        if (this.chorus2LFO && this.chorus2LfoGain) {
          setParam(this.chorus2LFO.frequency, 0.48, 0.05);
          setParam(this.chorus2LfoGain.gain, 0.0035, 0.05);
        }
        if (this.chorus2FastLFO && this.chorus2FastLfoGain) {
          setParam(this.chorus2FastLFO.frequency, 6.2, 0.05);
          setParam(this.chorus2FastLfoGain.gain, 0.0008, 0.05);
        }
        
        // Delay Line 3 (Slow C: 0.68 Hz, depth 0.0027s & Fast C: 5.3 Hz, depth 0.0011s)
        if (this.chorus3LFO && this.chorus3LfoGain) {
          setParam(this.chorus3LFO.frequency, 0.68, 0.05);
          setParam(this.chorus3LfoGain.gain, 0.0027, 0.05);
        }
        if (this.chorus3FastLFO && this.chorus3FastLfoGain) {
          setParam(this.chorus3FastLFO.frequency, 5.3, 0.05);
          setParam(this.chorus3FastLfoGain.gain, 0.0011, 0.05);
        }
        
        // Activate all three taps at full mix volume for a massive stereo-widening choir
        setParam(this.chorusGain.gain, this.params.chorusMix, 0.05);
        if (this.chorus2Gain) setParam(this.chorus2Gain.gain, this.params.chorusMix, 0.05);
        if (this.chorus3Gain) setParam(this.chorus3Gain.gain, this.params.chorusMix, 0.05);
      }
    }
    
    if (this.delay) setParam(this.delay.delayTime, this.params.delayTime, 0.05);
    if (this.delayFeedback) setParam(this.delayFeedback.gain, this.params.delayFeedback, 0.05);
    if (this.delayGain) setParam(this.delayGain.gain, this.params.delayMix, 0.05);
    
    if (this.reverbGain) setParam(this.reverbGain.gain, this.params.reverbMix, 0.05);
    
    // Tremolo
    if (this.tremoloLFO) setParam(this.tremoloLFO.frequency, this.params.tremoloRate, 0.05);
    if (this.tremoloLfoGain && this.tremoloGain && this.tremoloDry) {
      setParam(this.tremoloLfoGain.gain, this.params.tremoloDepth * this.params.tremoloMix, 0.05);
      setParam(this.tremoloGain.gain, this.params.tremoloMix, 0.05);
      setParam(this.tremoloDry.gain, 1.0 - this.params.tremoloMix, 0.05);
    }

    // Leslie (Rotary Effect)
    let targetRate = 1.2;
    let targetDepth = this.params.leslieDepth;

    if (this.params.leslieSpeed === 'off') {
      targetRate = 0.05; // Slow down to near static position
      targetDepth = 0.0; // Fade out modulation depth
    } else if (this.params.leslieSpeed === 'lo') {
      targetRate = 1.2; // Slow chorale speed
      targetDepth = this.params.leslieDepth;
    } else if (this.params.leslieSpeed === 'high') {
      targetRate = 6.2; // Fast tremolo speed
      targetDepth = this.params.leslieDepth;
    }

    // Determine physics-based motor inertia time constant
    let rateTimeConstant = 1.0;
    if (targetRate > this.lastTargetLeslieRate) {
      // Speeding up: motor accelerates in a couple seconds
      rateTimeConstant = 1.2;
    } else if (targetRate < this.lastTargetLeslieRate) {
      // Slowing down: mechanical friction takes longer to bring heavy rotor to rest
      rateTimeConstant = 2.4;
    }
    this.lastTargetLeslieRate = targetRate;

    // Apply the inertia-based speed ramp to the LFO
    if (this.leslieLFO) {
      setParam(this.leslieLFO.frequency, targetRate, rateTimeConstant);
    }

    // Calculate modulation depths scaled by mix and speed-state
    const currentMix = this.params.leslieMix;
    const lfoGain = targetDepth * 0.4 * currentMix; // Amplitude modulation swing
    const vibGain = targetDepth * 0.006 * currentMix; // Doppler vibrato shift swing (±6ms)

    // Time constant for depth changes (spins down/up slightly faster than speed)
    const depthTimeConstant = targetRate < 1.0 ? 1.8 : 0.8;

    if (this.leslieLfoGainL) setParam(this.leslieLfoGainL.gain, lfoGain, depthTimeConstant);
    if (this.leslieLfoGainR) setParam(this.leslieLfoGainR.gain, lfoGain, depthTimeConstant);
    if (this.leslieVibGainL) setParam(this.leslieVibGainL.gain, vibGain, depthTimeConstant);
    if (this.leslieVibGainR) setParam(this.leslieVibGainR.gain, vibGain, depthTimeConstant);

    // Apply Leslie gains and dry mix
    if (this.leslieGainL) setParam(this.leslieGainL.gain, 0.5, 0.05);
    if (this.leslieGainR) setParam(this.leslieGainR.gain, 0.5, 0.05);
    if (this.leslieDry) {
      setParam(this.leslieDry.gain, 1.0 - currentMix, 0.05);
    }

    // Baseline delay times
    if (this.leslieDelayL) setParam(this.leslieDelayL.delayTime, 0.015, 0.05);
    if (this.leslieDelayR) setParam(this.leslieDelayR.delayTime, 0.015, 0.05);
    
    if (this.volumeGain) setParam(this.volumeGain.gain, this.params.masterVolume, 0.05);

    // Master 5-Band Equalizer Update
    if (this.eqFilters && this.eqFilters.length === 5) {
      setParam(this.eqFilters[0].gain, this.params.eqBand1 ?? 0, 0.05);
      setParam(this.eqFilters[1].gain, this.params.eqBand2 ?? 0, 0.05);
      setParam(this.eqFilters[2].gain, this.params.eqBand3 ?? 0, 0.05);
      setParam(this.eqFilters[3].gain, this.params.eqBand4 ?? 0, 0.05);
      setParam(this.eqFilters[4].gain, this.params.eqBand5 ?? 0, 0.05);
    }

    // Distortion / Saturation Modes
    if (this.distortion && this.distortionGain && this.distortionDry) {
      const mode = this.params.distortionMode || 'default';
      const amount = this.params.distortionAmount;
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);

      if (mode === 'tube') {
        const kFactor = amount * 12 + 1;
        for (let i = 0; i < n_samples; ++i) {
          const x = (i * 2) / n_samples - 1;
          if (x < 0) {
            // Negative input: soft, smooth exponential saturation
            curve[i] = - (1.0 - Math.exp(x * kFactor)) / (1.0 - Math.exp(-kFactor));
          } else {
            // Positive input: asymmetric, harder, richer exponential drive
            curve[i] = (1.0 - Math.exp(-x * kFactor * 1.5)) / (1.0 - Math.exp(-kFactor * 1.5));
          }
        }
      } else if (mode === 'feedback') {
        // High gain to stimulate feedback loop oscillation
        const k = amount * 120 + 20;
        for (let i = 0; i < n_samples; ++i) {
          const x = (i * 2) / n_samples - 1;
          curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
      } else {
        // Default standard soft/hard sigmoid clipping
        const k = amount * 100;
        for (let i = 0; i < n_samples; ++i) {
          const x = (i * 2) / n_samples - 1;
          curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
      }

      this.distortion.curve = curve;
      this.distortion.oversample = 'none';

      // Updates for the Feedback Overdrive loop nodes
      if (this.distortionFeedbackFilter) {
        const feedbackFreq = this.params.distortionFeedbackFreq ?? 800;
        setParam(this.distortionFeedbackFilter.frequency, feedbackFreq, 0.05);
      }
      if (this.distortionFeedbackGain) {
        const isFeedbackMode = mode === 'feedback';
        // feedback gain is scaled to self-oscillate nicely above 0.5
        const feedbackGainVal = isFeedbackMode ? (this.params.distortionFeedbackAmount ?? 0.3) * 1.5 : 0.0;
        setParam(this.distortionFeedbackGain.gain, feedbackGainVal, 0.05);
      }

      setParam(this.distortionGain.gain, this.params.distortionMix, 0.05);
      setParam(this.distortionDry.gain, 1.0 - this.params.distortionMix, 0.05);
    }

    // Compander Updates
    if (this.compressor) {
      setParam(this.compressor.threshold, this.params.compThreshold, 0.05);
      setParam(this.compressor.ratio, this.params.compRatio, 0.05);
      setParam(this.compressor.knee, this.params.compKnee, 0.05);
      setParam(this.compressor.attack, this.params.compAttack, 0.05);
      setParam(this.compressor.release, this.params.compRelease, 0.05);
    }

    if (this.compressorDry && this.compressorWet) {
      setParam(this.compressorDry.gain, 1.0 - this.params.compMix, 0.05);
      setParam(this.compressorWet.gain, this.params.compMix, 0.05);
    }

    // Regenerate impulse response if relevant params changed
    if (!oldParams || 
        oldParams.reverbTime !== this.params.reverbTime || 
        oldParams.reverbDecay !== this.params.reverbDecay ||
        oldParams.reverbDamping !== this.params.reverbDamping ||
        oldParams.reverbMode !== this.params.reverbMode) {
      this.createImpulseResponse();
    }
  }

  private createImpulseResponse() {
    if (!this.ctx || !this.worker || !this.reverb) return;
    this.worker.postMessage({
      type: 'generateImpulseResponse',
      params: {
        sampleRate: this.ctx.sampleRate,
        length: this.params.reverbTime,
        reverbDecay: this.params.reverbDecay,
        reverbDamping: this.params.reverbDamping,
        reverbMode: this.params.reverbMode
      }
    });
  }

  setParams(params: VoiceParams) {
    const oldParams = this.params;
    this.params = params;
    this.voices.forEach(voice => voice.updateParams(params, this.perfSettings));
    this.updateFXParams(oldParams);

    // If arpeggiator rate or sync changed and it's running, restart it
    const rateChanged = oldParams.arpRate !== params.arpRate;
    const syncChanged = oldParams.arpSync !== params.arpSync;
    const divChanged = oldParams.arpSyncDivision !== params.arpSyncDivision;
    const bpmChanged = oldParams.bpm !== params.bpm;

    if (this.arpTimer && (rateChanged || syncChanged || divChanged || bpmChanged)) {
      this.stopArpeggiator();
      this.startArpeggiator();
    }

    // Reactive Metronome state propagation
    const timeSigChanged = oldParams.timeSignature !== params.timeSignature;
    const metronomeEnabledChanged = oldParams.metronomeEnabled !== params.metronomeEnabled;

    if (params.metronomeEnabled) {
      if (metronomeEnabledChanged || bpmChanged || timeSigChanged) {
        this.startMetronome();
      }
    } else if (metronomeEnabledChanged) {
      this.stopMetronome();
    }

    if (this.metronomeGain) {
      this.metronomeGain.gain.setValueAtTime(params.metronomeVolume, this.ctx ? this.ctx.currentTime : 0);
    }
  }

  setPerformanceSettings(settings: PerformanceSettings) {
    const needsRestart = 
      settings.sampleRate !== this.perfSettings.sampleRate || 
      settings.latencyHint !== this.perfSettings.latencyHint;

    this.perfSettings = settings;

    if (needsRestart && this.ctx) {
      this.restart();
    } else {
      this.updateVoiceCount();
      this.voices.forEach(v => v.updateParams(this.params, this.perfSettings));
    }
  }

  private updateVoiceCount() {
    if (!this.ctx || !this.mainGain || !this.lfoModBus) return;

    if (this.voices.length < this.perfSettings.maxVoices) {
      const needed = this.perfSettings.maxVoices - this.voices.length;
      for (let i = 0; i < needed; i++) {
        this.voices.push(new Voice(this.ctx, this.mainGain, this.params, this.perfSettings, this.lfoModBus, this.noiseBuffer));
      }
    } else if (this.voices.length > this.perfSettings.maxVoices) {
      // Remove excess voices, preferably inactive ones
      while (this.voices.length > this.perfSettings.maxVoices) {
        const index = this.voices.findIndex(v => v.midiNote === null);
        if (index !== -1) {
          this.voices[index].stop();
          this.voices.splice(index, 1);
        } else {
          // If all active, just pop the oldest
          this.voices[0].stop();
          this.voices.shift();
        }
      }
    }
  }

  private restart() {
    this.stopMetronome();
    if (this.isRecording && this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    this.isRecording = false;
    this.recordingChunks = [];
    this.mediaRecorder = null;

    if (!this.ctx) return;
    const oldCtx = this.ctx;
    this.ctx = null;
    this.voices = [];
    oldCtx.close().then(() => {
      this.init();
    });
  }

  private getBeatsPerBar(): number {
    const parts = this.params.timeSignature.split('/');
    if (parts.length > 0) {
      const beats = parseInt(parts[0], 10);
      if (!isNaN(beats)) return beats;
    }
    return 4;
  }

  private getBeatInterval(): number {
    const bpm = this.params.bpm || 120;
    return 60000 / bpm;
  }

  private startMetronome() {
    this.stopMetronome();
    if (!this.ctx) return;
    
    this.metronomeBeatCount = 0;
    
    // Play first beat immediately
    const firstBeatDown = (this.metronomeBeatCount % this.getBeatsPerBar()) === 0;
    this.playMetronomeClick(firstBeatDown);
    this.metronomeBeatCount++;
    
    const interval = this.getBeatInterval();
    this.metronomeTimer = window.setInterval(() => {
      const beatsPerBar = this.getBeatsPerBar();
      const isDownbeat = (this.metronomeBeatCount % beatsPerBar) === 0;
      this.playMetronomeClick(isDownbeat);
      this.metronomeBeatCount++;
    }, interval);
  }

  private stopMetronome() {
    if (this.metronomeTimer) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  private playMetronomeClick(isDownbeat: boolean) {
    if (!this.ctx || !this.metronomeGain) return;
    
    const time = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.metronomeGain);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1.0, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    
    osc.start(time);
    osc.stop(time + 0.08);
  }

  // --- Recording Interface ---
  public getRecordingState(): boolean {
    return this.isRecording;
  }

  public startRecording() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.recordingChunks = [];

    if (!this.ctx) this.init();
    if (!this.ctx) return;

    if (!this.recordingDestination) {
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      this.volumeGain!.connect(this.recordingDestination);
    }

    try {
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      const options = mimeType ? { mimeType } : undefined;
      this.mediaRecorder = new MediaRecorder(this.recordingDestination.stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordingChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      this.isRecording = false;
    }
  }

  public stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        this.isRecording = false;
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        this.isRecording = false;
        try {
          const recordedBlob = new Blob(this.recordingChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const arrayBuffer = await recordedBlob.arrayBuffer();
          
          if (!this.ctx) {
            resolve(recordedBlob);
            return;
          }
          
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          const { encodeMp3 } = await import('../utils/mp3Encoder');
          const mp3Blob = encodeMp3(audioBuffer, 192);
          resolve(mp3Blob);
        } catch (err) {
          console.error('Error finalising MP3 recording:', err);
          const fallbackBlob = new Blob(this.recordingChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          resolve(fallbackBlob);
        } finally {
          this.mediaRecorder = null;
          this.recordingChunks = [];
        }
      };

      this.mediaRecorder.stop();
    });
  }

  noteOn(midiNote: number, velocity: number = 0.8) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    
    // Ensure context is resumed
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    if (this.params.arpEnabled) {
      if (!this.heldNotes.includes(midiNote)) {
        this.heldNotes.push(midiNote);
        this.heldNotes.sort((a, b) => a - b);
        this.playedNotes.push(midiNote);
      }
      this.startArpeggiator();
      return;
    }

    this.internalNoteOn(midiNote, velocity);
  }

  private internalNoteOn(midiNote: number, velocity: number = 0.8) {
    if (!this.ctx) return;
    
    // Check if any notes are currently active for legato portamento
    // Add a larger grace period (0.7s) to ensure touch sequences trigger legato portamento
    const activeVoices = this.voices.filter(v => v.midiNote !== null && !v.isReleasing);
    const isLegatoContext = activeVoices.length > 0 || (this.ctx.currentTime - this.lastReleaseTime < 0.7);

    // Find if note already exists and is NOT releasing (to sustain/legato it)
    let voice = this.voices.find(v => v.midiNote === midiNote && !v.isReleasing);
    
    if (!voice) {
      // Find a completely free voice
      voice = this.voices.find(v => v.midiNote === null);
      
      if (!voice) {
        // If no completely free voice, find a voice that is currently releasing the same midiNote
        voice = this.voices.find(v => v.midiNote === midiNote && v.isReleasing);
        
        if (!voice) {
          // Voice stealing: find the voice that has been active the longest (including ones in release)
          const releasingVoices = this.voices.filter(v => v.isReleasing);
          if (releasingVoices.length > 0) {
              voice = releasingVoices.sort((a, b) => a.startTime - b.startTime)[0];
          } else {
              voice = this.voices.sort((a, b) => a.startTime - b.startTime)[0];
          }
          // Hard-stop voice to prevent stuck tail or duplicate state
          voice.stop();
        }
      }
    }

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    // If it's the very first note, lastFrequency might be 0. 
    // In that case, we set it to the current freq to prevent a glide from 0Hz.
    const effectiveLastFreq = this.lastFrequency === 0 ? freq : this.lastFrequency;
    
    // Set current pitch bend on the voice before triggering
    const bendSemitones = (this.currentPitchBend / 8192) * this.perfSettings.pitchBendRange;
    voice.setPitchBend(bendSemitones);
    
    voice.triggerAttack(midiNote, effectiveLastFreq, this.ctx.currentTime, isLegatoContext, velocity);
    this.lastFrequency = freq;
    return voice;
  }

  noteOff(midiNote: number) {
    if (this.params.arpEnabled) {
      this.heldNotes = this.heldNotes.filter(n => n !== midiNote);
      this.playedNotes = this.playedNotes.filter(n => n !== midiNote);
      if (this.heldNotes.length === 0) {
        this.stopArpeggiator();
      }
      return;
    }

    // Match even releasing voices to keep noteOff idempotent and prevent state desync
    const matchingVoices = this.voices.filter(v => v.midiNote === midiNote);
    if (matchingVoices.length > 0 && this.ctx) {
      matchingVoices.forEach(voice => {
        if (!voice.isReleasing) {
          voice.triggerRelease(this.ctx!.currentTime);
        }
      });
      this.lastReleaseTime = this.ctx.currentTime;
    }
  }

  setPitchBend(value: number) {
    // value is 0 to 16383, center is 8192
    this.currentPitchBend = value - 8192;
    const bendSemitones = (this.currentPitchBend / 8192) * this.perfSettings.pitchBendRange;
    this.voices.forEach(v => v.setPitchBend(bendSemitones));
  }

  setModWheel(value: number) {
    // value is 0 to 127
    this.currentModWheel = value / 127;
    // Map to VCF LFO modulation by adding to the base amount
    this.voices.forEach(v => {
      if (v.midiNote !== null && this.ctx) {
        const time = this.ctx.currentTime;
        // The mod wheel adds to the filterLfoAmount
        const totalLfoAmount = this.params.filterLfoAmount + (this.currentModWheel * 0.5); 
        const safeCutoff = Math.max(20, v.params.filterCutoff);
        const scale = Math.max(0, Math.min(1, Math.log(safeCutoff / 20) / Math.log(20000 / 20)));
        v.filterLfoMod.gain.setTargetAtTime(totalLfoAmount * 5000 * scale, time, 0.05);
      }
    });
  }

  private startArpeggiator() {
    if (this.arpTimer) return;
    this.arpIndex = -1;
    this.arpDirection = 1;
    this.tickArp();
    
    const interval = this.params.arpSync
      ? this.getIntervalFromBPM(this.params.bpm, this.params.arpSyncDivision)
      : 60000 / (this.params.arpRate * 4); // legacy fallback
      
    this.arpTimer = window.setInterval(() => this.tickArp(), interval);
  }

  private stopArpeggiator() {
    if (this.arpTimer) {
      clearInterval(this.arpTimer);
      this.arpTimer = null;
    }
    this.allNotesOff();
  }

  private allNotesOff() {
    this.voices.forEach(voice => {
      if (voice.midiNote !== null && !voice.isReleasing) {
        voice.triggerRelease(this.ctx!.currentTime);
      }
    });
  }

  panic() {
    this.stopArpeggiator();
    this.heldNotes = [];
    this.voices.forEach((voice) => {
      voice.stop();
    });
  }

  private tickArp() {
    if (!this.ctx || this.heldNotes.length === 0) return;

    const notes = this.getArpNotes();
    if (notes.length === 0) return;

    const { arpMode } = this.params;
    let notesToPlay: number[] = [];

    if (arpMode === 'chord') {
      notesToPlay = [...notes];
    } else {
      // Step-based movement
      this.advanceArpIndex(notes.length);
      notesToPlay = [notes[this.arpIndex]];
    }

    // Stop notes that are not being played in this tick (for non-poly modes, staccato feel)
    if (arpMode !== 'up-poly' && arpMode !== 'down-poly' && arpMode !== 'chord') {
      this.allNotesOff();
    }

    const interval = this.params.arpSync
      ? this.getIntervalFromBPM(this.params.bpm, this.params.arpSyncDivision)
      : (60000 / (this.params.arpRate * 4));

    // Trigger specified notes
    notesToPlay.forEach(midiNote => {
      const voice = this.internalNoteOn(midiNote);
      if (voice) {
        // Auto-release for staccato feel
        const gateTime = interval * 0.8;
        setTimeout(() => {
          if (voice.midiNote === midiNote) {
            voice.triggerRelease(this.ctx!.currentTime);
          }
        }, gateTime);
      }
    });
  }

  private advanceArpIndex(length: number) {
    const { arpMode } = this.params;
    
    if (arpMode === 'random') {
      this.arpIndex = Math.floor(Math.random() * length);
    } else if (arpMode === 'up-down') {
      this.arpIndex += this.arpDirection;
      if (this.arpIndex >= length) {
        this.arpIndex = Math.max(0, length - 2);
        this.arpDirection = -1;
      } else if (this.arpIndex < 0) {
        this.arpIndex = Math.min(length - 1, 1);
        this.arpDirection = 1;
      }
    } else if (arpMode === 'up' || arpMode === 'up-poly' || arpMode === 'as-played') {
      this.arpIndex = (this.arpIndex + 1) % length;
    } else if (arpMode === 'down' || arpMode === 'down-poly') {
      this.arpIndex = (this.arpIndex - 1 + length) % length;
      if (this.arpIndex < 0) this.arpIndex = length - 1;
    }
  }

  private getArpNotes(): number[] {
    const isAsPlayed = this.params.arpMode === 'as-played';
    const baseNotes = isAsPlayed ? [...this.playedNotes] : [...this.heldNotes];
    if (baseNotes.length === 0) return [];

    let allNotes: number[] = [];
    for (let i = 0; i < this.params.arpRange; i++) {
      allNotes = allNotes.concat(baseNotes.map(n => n + i * 12));
    }
    
    if (!isAsPlayed) {
      allNotes.sort((a, b) => a - b);
    }
    
    return allNotes;
  }
}
