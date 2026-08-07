/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoiceParams, PerformanceSettings, Multi, Patch, createDefaultDX7Voice, getDX7Algorithm } from '../types';
import { soundfontService } from '../services/SoundfontService';

let noiseBuffer: AudioBuffer | null = null;

class Voice {
  private ctx: AudioContext;
  private vco1: OscillatorNode | null = null;
  private vco2: OscillatorNode | null = null;
  private vco1SoundfontSource: AudioBufferSourceNode | null = null;
  private vco2SoundfontSource: AudioBufferSourceNode | null = null;
  private vco1SoundfontNodes: Array<{ src: AudioBufferSourceNode; gain: GainNode; rootFreq: number; coarseTune: number; fineTune: number }> = [];
  private vco2SoundfontNodes: Array<{ src: AudioBufferSourceNode; gain: GainNode; rootFreq: number; coarseTune: number; fineTune: number }> = [];
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

  // DX7 FM synthesis engine
  private dx7Oscs: OscillatorNode[] = [];
  private dx7Gains: GainNode[] = [];
  private dx7FeedbackDelay: DelayNode | null = null;
  private dx7FeedbackGain: GainNode | null = null;

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

  // Active synth engine tracking
  private activeSynthEngine: 'jupiter' | 'hammond' | 'dx7' = 'jupiter';

  // Vintage detuning drift per voice card
  private vco1Drift: number = 0;
  private vco2Drift: number = 0;

  // State for voice management
  public midiNote: number | null = null;
  public originalMidiNote: number | null = null;
  public currentPatchId: string | null = null;
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
    this.activeSynthEngine = params.synthEngine || 'jupiter';

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

    if (this.activeSynthEngine === 'dx7') {
      const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
      const voice = params.dx7Voice || createDefaultDX7Voice();
      if (this.dx7Oscs && this.dx7Oscs.length > 0 && this.midiNote !== null) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        this.dx7Oscs.forEach((osc, i) => {
          const op = voice.operators[i];
          if (op) {
            let opFreq = freq;
            if (op.mode === 1) {
              opFreq = Math.pow(10, (op.coarse % 4) + op.fine / 100);
            } else {
              const ratio = (op.coarse === 0 ? 0.5 : op.coarse) * (1.0 + op.fine / 100);
              opFreq = freq * ratio;
            }
            osc.frequency.setTargetAtTime(opFreq * bendFactor, time, 0.02);
          }
        });
      }
      this.filter.type = 'lowpass';
      this.filter.Q.setTargetAtTime(params.filterResonance * 10, time, 0.05);
      if (!this.isReleasing) {
        this.filter.frequency.setTargetAtTime(Math.max(20, params.filterCutoff), time, 0.05);
      }
      return;
    }

    if (this.activeSynthEngine === 'hammond') {
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
      } else if (params.vcaSource === 'lfo' || params.vco1SoundfontEnabled || params.vco2SoundfontEnabled) {
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
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
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

    if (this.params.synthEngine === 'dx7') {
      this.activeSynthEngine = 'dx7';
      const voice = this.params.dx7Voice || createDefaultDX7Voice();
      const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
      const alg = getDX7Algorithm(voice.algorithm);
      
      this.dx7Oscs = [];
      this.dx7Gains = [];
      
      for (let i = 0; i < 6; i++) {
        const op = voice.operators[i] || createDefaultDX7Voice().operators[i];
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0, time);
        
        let opFreq = freq;
        if (op.mode === 1) {
          opFreq = Math.pow(10, (op.coarse % 4) + op.fine / 100);
        } else {
          const ratio = (op.coarse === 0 ? 0.5 : op.coarse) * (1.0 + op.fine / 100);
          opFreq = freq * ratio;
        }
        
        const detuneCents = op.detune * 2.5;
        osc.frequency.setValueAtTime(opFreq * bendFactor, time);
        osc.detune.setValueAtTime(detuneCents, time);
        
        this.dx7Oscs.push(osc);
        this.dx7Gains.push(gainNode);
      }
      
      // Set up feedback
      if (voice.feedback > 0) {
        const fbSrc = alg.feedbackSrc;
        const fbDest = alg.feedbackDest;
        
        const delay = this.ctx.createDelay(0.01);
        // Use a stable, non-zero delay time equal to exactly 1 render block (128 samples).
        // This is the native Web Audio block processing delay, which prevents sub-sample
        // calculation instability and denormal audio thread pops.
        delay.delayTime.setValueAtTime(128 / this.ctx.sampleRate, time);
        this.dx7FeedbackDelay = delay;
        
        const fbGain = this.ctx.createGain();
        
        // Calculate the actual frequencies of both source and destination operators
        const opSrc = voice.operators[fbSrc] || createDefaultDX7Voice().operators[fbSrc];
        let opFreqSrc = freq;
        if (opSrc.mode === 1) {
          opFreqSrc = Math.pow(10, (opSrc.coarse % 4) + opSrc.fine / 100);
        } else {
          const ratio = (opSrc.coarse === 0 ? 0.5 : opSrc.coarse) * (1.0 + opSrc.fine / 100);
          opFreqSrc = freq * ratio;
        }

        const opDest = voice.operators[fbDest] || createDefaultDX7Voice().operators[fbDest];
        let opFreqDest = freq;
        if (opDest.mode === 1) {
          opFreqDest = Math.pow(10, (opDest.coarse % 4) + opDest.fine / 100);
        } else {
          const ratio = (opDest.coarse === 0 ? 0.5 : opDest.coarse) * (1.0 + opDest.fine / 100);
          opFreqDest = freq * ratio;
        }

        // To prevent the modulated frequency from swinging below zero (which causes severe wrapping,
        // phase-reversal, and metallic crackles), limit the peak deviation to at most 70% of the destination
        // frequency or source frequency, whichever is smaller.
        const safeFreq = Math.min(opFreqSrc, opFreqDest);
        const maxSafeDeviation = safeFreq * 0.7;
        const isSrcCarrier = alg.carriers.includes(fbSrc);
        
        let fbDepth = 0;
        if (isSrcCarrier) {
          // Carrier output has amplitude scaled to 0.28.
          // fbDepth = (ratio of voice.feedback) * maxSafeDeviation / 0.28
          fbDepth = (voice.feedback / 7.0) * maxSafeDeviation / 0.28;
        } else {
          // Modulator output has amplitude scaled to opFreqSrc * 8.0.
          // fbDepth = (ratio of voice.feedback) * maxSafeDeviation / (opFreqSrc * 8.0)
          fbDepth = (voice.feedback / 7.0) * maxSafeDeviation / (opFreqSrc * 8.0);
        }
        
        fbGain.gain.setValueAtTime(fbDepth, time);
        this.dx7FeedbackGain = fbGain;
        
        this.dx7Gains[fbSrc].connect(delay);
        delay.connect(fbGain);
        fbGain.connect(this.dx7Oscs[fbDest].frequency);
      }
      
      // Modulators routing
      for (const toStr in alg.modulators) {
        const toOp = parseInt(toStr);
        const fromOps = alg.modulators[toOp];
        
        fromOps.forEach(fromOp => {
          this.dx7Gains[fromOp].connect(this.dx7Oscs[toOp].frequency);
        });
      }
      
      // Carriers connection
      alg.carriers.forEach(carrierIdx => {
        this.dx7Oscs[carrierIdx].connect(this.dx7Gains[carrierIdx]);
        this.dx7Gains[carrierIdx].connect(this.filter);
      });
      
      // Modulators connection to their own envelopes
      for (let i = 0; i < 6; i++) {
        if (!alg.carriers.includes(i)) {
          this.dx7Oscs[i].connect(this.dx7Gains[i]);
        }
      }
      
      // Schedule envelopes
      for (let i = 0; i < 6; i++) {
        const op = voice.operators[i] || createDefaultDX7Voice().operators[i];
        const gainNode = this.dx7Gains[i];
        
        const R1 = op.rates[0];
        const R2 = op.rates[1];
        const R3 = op.rates[2];
        const R4 = op.rates[3];
        
        const L1 = op.levels[0];
        const L2 = op.levels[1];
        const L3 = op.levels[2];
        const L4 = op.levels[3];
        
        const t1 = Math.pow(10, (99 - R1) / 25) * 0.01;
        const t2 = Math.pow(10, (99 - R2) / 25) * 0.01;
        const t3 = Math.pow(10, (99 - R3) / 25) * 0.01;
        
        const isCarrier = alg.carriers.includes(i);
        let opFreq = freq;
        if (op.mode === 1) {
          opFreq = Math.pow(10, (op.coarse % 4) + op.fine / 100);
        } else {
          const ratio = (op.coarse === 0 ? 0.5 : op.coarse) * (1.0 + op.fine / 100);
          opFreq = freq * ratio;
        }
        
        const maxLevelScale = isCarrier ? 0.28 : (opFreq * 8.0);
        
        const levelToValue = (lvl: number) => {
          // Combined level from envelope level (lvl) and operator output level (op.level)
          // Both are 0 to 99.
          // In real DX7, each level unit is 0.75 dB attenuation.
          const totalLevel = op.level - (99 - lvl);
          
          if (totalLevel <= 0) return 0;
          
          // Apply velocity sensitivity
          const velSense = op.velocitySensitivity || 0;
          const velAttenuationDb = (1.0 - velocity) * (velSense * 6.0); // up to 42 dB attenuation
          
          const attenuationDb = (99 - totalLevel) * 0.75 + velAttenuationDb;
          
          if (attenuationDb > 85) return 0;
          
          const linearGain = Math.pow(10, -attenuationDb / 20);
          
          return linearGain * maxLevelScale;
        };
        
        gainNode.gain.cancelScheduledValues(time);
        
        const val4 = levelToValue(L4);
        const val1 = levelToValue(L1);
        const val2 = levelToValue(L2);
        const val3 = levelToValue(L3);
        
        gainNode.gain.setValueAtTime(val4, time);
        gainNode.gain.linearRampToValueAtTime(val1, time + Math.max(0.002, t1));
        gainNode.gain.linearRampToValueAtTime(val2, time + Math.max(0.002, t1) + t2);
        gainNode.gain.linearRampToValueAtTime(val3, time + Math.max(0.002, t1) + t2 + t3);
        
        (gainNode as any).dx7ReleaseRate = R4;
        (gainNode as any).dx7L4 = L4;
        (gainNode as any).dx7LevelToValue = levelToValue;
      }
      
      for (let i = 0; i < 6; i++) {
        this.dx7Oscs[i].start(time);
      }
      
      this.vca.gain.cancelScheduledValues(time);
      const prevGain = Math.max(0.0001, this.vca.gain.value);
      this.vca.gain.setValueAtTime(prevGain, time);
      this.vca.gain.linearRampToValueAtTime(1.0, time + 0.005);
      
      return;
    }

    if (this.params.synthEngine === 'hammond') {
      this.activeSynthEngine = 'hammond';
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
      const prevGain = Math.max(0.0001, this.vca.gain.value);
      this.vca.gain.setValueAtTime(prevGain, time);
      this.vca.gain.linearRampToValueAtTime(1.0, time + 0.008);
      
      return;
    }

    // Kill any existing audio nodes on this voice before instantiating new ones
    this.killTransientNodes(time);

    this.activeSynthEngine = 'jupiter';
    this.vco1 = null;
    this.vco2 = null;
    this.vco1SoundfontSource = null;
    this.vco2SoundfontSource = null;
    this.vco1SoundfontNodes = [];
    this.vco2SoundfontNodes = [];
    this.vco1Noise = null;
    this.vco2Noise = null;
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.connect(this.subOscGain);

    const { 
      env1Attack, env1Decay, env1Sustain, 
      env2Attack, env2Decay, env2Sustain, 
      filterCutoff, filterEnvAmount, filterEnvSource,
      vco1Range, vco1Freq,
      vco2Range, vco2Freq, vco2Detune,
      portamentoTime, portamentoMode,
      vco1Waveform, vco2Waveform,
      vco1SoundfontEnabled, vco1SoundfontName, vco1SoundfontSampleIndex,
      vco2SoundfontEnabled, vco2SoundfontName, vco2SoundfontSampleIndex
    } = this.params;

    // VCO1 instantiation
    if (vco1SoundfontEnabled && vco1SoundfontName) {
      const zones = soundfontService.getMatchingZonesSync(
        vco1SoundfontName,
        vco1SoundfontSampleIndex ?? 0,
        midiNote,
        velocity
      );

      const numZones1 = Math.max(1, zones.length);
      const zoneGainScale1 = 1.0 / Math.sqrt(numZones1);

      for (const zone of zones) {
        if (!zone.audioBuffer) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = zone.audioBuffer;

        const shouldLoop = (zone.loopMode === 1 || zone.loopMode === 3);
        src.loop = shouldLoop;
        const sr = zone.sampleRate || 44100;
        const sStart = zone.startSample;
        const lStart = zone.startLoopSample;
        const lEnd = zone.endLoopSample;

        if (shouldLoop && lEnd > lStart + 16) {
          src.loopStart = Math.max(0, (lStart - sStart) / sr);
          src.loopEnd = Math.min(zone.audioBuffer.duration, (lEnd - sStart) / sr);
        }

        const zoneGain = this.ctx.createGain();
        const targetGain = Math.min(1.5, zone.attenuation * zoneGainScale1 * 1.2);
        zoneGain.gain.setValueAtTime(targetGain, time);
        src.connect(zoneGain);
        zoneGain.connect(this.vco1Gain);

        const rootFreq = 440 * Math.pow(2, (zone.rootKey - 69) / 12);
        this.vco1SoundfontNodes.push({
          src,
          gain: zoneGain,
          rootFreq,
          coarseTune: zone.coarseTune,
          fineTune: zone.fineTune
        });
      }

      if (this.vco1SoundfontNodes.length === 0) {
        const buffer = soundfontService.getDecodedBuffer(vco1SoundfontName, vco1SoundfontSampleIndex ?? 0);
        if (buffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          const zoneGain = this.ctx.createGain();
          zoneGain.gain.setValueAtTime(1.0, time);
          src.connect(zoneGain);
          zoneGain.connect(this.vco1Gain);
          this.vco1SoundfontNodes.push({
            src,
            gain: zoneGain,
            rootFreq: 261.63,
            coarseTune: 0,
            fineTune: 0
          });
        }
      }

      if (this.vco1SoundfontNodes.length > 0) {
        this.vco1SoundfontSource = this.vco1SoundfontNodes[0].src;
      }
    }

    if (!this.vco1SoundfontSource && this.vco1SoundfontNodes.length === 0) {
      this.vco1 = this.ctx.createOscillator();
      this.vco1Noise = this.ctx.createBufferSource();
      if (this.sharedNoiseBuffer) {
        this.vco1Noise.buffer = this.sharedNoiseBuffer;
      }
      this.vco1Noise.loop = true;
      this.vco1Noise.connect(this.vco1NoiseGain);
    }

    // VCO2 instantiation
    if (vco2SoundfontEnabled && vco2SoundfontName) {
      const zones = soundfontService.getMatchingZonesSync(
        vco2SoundfontName,
        vco2SoundfontSampleIndex ?? 0,
        midiNote,
        velocity
      );

      const numZones2 = Math.max(1, zones.length);
      const zoneGainScale2 = 1.0 / Math.sqrt(numZones2);

      for (const zone of zones) {
        if (!zone.audioBuffer) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = zone.audioBuffer;

        const shouldLoop = (zone.loopMode === 1 || zone.loopMode === 3);
        src.loop = shouldLoop;
        const sr = zone.sampleRate || 44100;
        const sStart = zone.startSample;
        const lStart = zone.startLoopSample;
        const lEnd = zone.endLoopSample;

        if (shouldLoop && lEnd > lStart + 16) {
          src.loopStart = Math.max(0, (lStart - sStart) / sr);
          src.loopEnd = Math.min(zone.audioBuffer.duration, (lEnd - sStart) / sr);
        }

        const zoneGain = this.ctx.createGain();
        const targetGain = Math.min(1.5, zone.attenuation * zoneGainScale2 * 1.2);
        zoneGain.gain.setValueAtTime(targetGain, time);
        src.connect(zoneGain);
        zoneGain.connect(this.vco2Gain);

        const rootFreq = 440 * Math.pow(2, (zone.rootKey - 69) / 12);
        this.vco2SoundfontNodes.push({
          src,
          gain: zoneGain,
          rootFreq,
          coarseTune: zone.coarseTune,
          fineTune: zone.fineTune
        });
      }

      if (this.vco2SoundfontNodes.length === 0) {
        const buffer = soundfontService.getDecodedBuffer(vco2SoundfontName, vco2SoundfontSampleIndex ?? 0);
        if (buffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          const zoneGain = this.ctx.createGain();
          zoneGain.gain.setValueAtTime(1.0, time);
          src.connect(zoneGain);
          zoneGain.connect(this.vco2Gain);
          this.vco2SoundfontNodes.push({
            src,
            gain: zoneGain,
            rootFreq: 261.63,
            coarseTune: 0,
            fineTune: 0
          });
        }
      }

      if (this.vco2SoundfontNodes.length > 0) {
        this.vco2SoundfontSource = this.vco2SoundfontNodes[0].src;
      }
    }

    if (!this.vco2SoundfontSource && this.vco2SoundfontNodes.length === 0) {
      this.vco2 = this.ctx.createOscillator();
      this.vco2Noise = this.ctx.createBufferSource();
      if (this.sharedNoiseBuffer) {
        this.vco2Noise.buffer = this.sharedNoiseBuffer;
      }
      this.vco2Noise.loop = true;
      this.vco2Noise.connect(this.vco2NoiseGain);
    }

    // Set up VCO 1 connection (standard vs pulse wave PWM)
    if (this.vco1) {
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
    }

    // Set up VCO 2 connection (standard vs pulse wave PWM)
    if (this.vco2) {
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
    }

    // Connect LFO Mod conditionally based on params.vcoLfoSelect
    this.vcoLfoMod.disconnect();
    if (this.params.vcoLfoSelect === 'vco1' || this.params.vcoLfoSelect === 'both') {
      if (this.vco1) {
        this.vcoLfoMod.connect(this.vco1.frequency);
      } else if (this.vco1SoundfontNodes.length > 0) {
        const vibratoGain = this.ctx.createGain();
        vibratoGain.gain.setValueAtTime(0.005, time);
        this.vcoLfoMod.connect(vibratoGain);
        this.vco1SoundfontNodes.forEach(node => vibratoGain.connect(node.src.playbackRate));
      }
    }
    if (this.params.vcoLfoSelect === 'vco2' || this.params.vcoLfoSelect === 'both') {
      if (this.vco2) {
        this.vcoLfoMod.connect(this.vco2.frequency);
      } else if (this.vco2SoundfontNodes.length > 0) {
        const vibratoGain = this.ctx.createGain();
        vibratoGain.gain.setValueAtTime(0.005, time);
        this.vcoLfoMod.connect(vibratoGain);
        this.vco2SoundfontNodes.forEach(node => vibratoGain.connect(node.src.playbackRate));
      }
    }
    if (this.params.vcoLfoSelect === 'both' && this.subOsc) {
      this.vcoLfoMod.connect(this.subOsc.frequency);
    }

    // Cross modulation: VCO2 modulates VCO1 frequency
    if (this.vco2) this.vco2.connect(this.crossModGain);
    if (this.vco2Noise) this.vco2Noise.connect(this.crossModGain);
    if (this.vco1) {
      this.crossModGain.connect(this.vco1.frequency);
    } else if (this.vco1SoundfontNodes.length > 0) {
      const crossModScale = this.ctx.createGain();
      crossModScale.gain.setValueAtTime(0.001, time);
      this.crossModGain.connect(crossModScale);
      this.vco1SoundfontNodes.forEach(node => crossModScale.connect(node.src.playbackRate));
    }

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
      if (this.vco1) {
        this.vco1.frequency.cancelScheduledValues(time);
        this.vco1.frequency.setValueAtTime(prevFreq1, time);
        this.vco1.frequency.setTargetAtTime(finalFreq1, time + 0.05, glideTime / 3);
      } else if (this.vco1SoundfontNodes.length > 0) {
        this.vco1SoundfontNodes.forEach(node => {
          const tuneFactor = Math.pow(2, (node.coarseTune + node.fineTune / 100) / 12);
          const prevRate1 = (prevFreq1 / node.rootFreq) * tuneFactor;
          const finalRate1 = (finalFreq1 / node.rootFreq) * tuneFactor;
          node.src.playbackRate.cancelScheduledValues(time);
          node.src.playbackRate.setValueAtTime(prevRate1, time);
          node.src.playbackRate.setTargetAtTime(finalRate1, time + 0.05, glideTime / 3);
        });
      }

      if (this.vco2) {
        this.vco2.frequency.cancelScheduledValues(time);
        this.vco2.frequency.setValueAtTime(prevFreq2, time);
        this.vco2.frequency.setTargetAtTime(finalFreq2, time + 0.05, glideTime / 3);
      } else if (this.vco2SoundfontNodes.length > 0) {
        this.vco2SoundfontNodes.forEach(node => {
          const tuneFactor = Math.pow(2, (node.coarseTune + node.fineTune / 100) / 12);
          const prevRate2 = (prevFreq2 / node.rootFreq) * tuneFactor;
          const finalRate2 = (finalFreq2 / node.rootFreq) * tuneFactor;
          node.src.playbackRate.cancelScheduledValues(time);
          node.src.playbackRate.setValueAtTime(prevRate2, time);
          node.src.playbackRate.setTargetAtTime(finalRate2, time + 0.05, glideTime / 3);
        });
      }

      this.subOsc.frequency.cancelScheduledValues(time);
      this.subOsc.frequency.setValueAtTime(prevSubFreq, time);
      this.subOsc.frequency.setTargetAtTime(finalSubFreq, time + 0.05, glideTime / 3);
    } else {
      if (this.vco1) {
        this.vco1.frequency.setValueAtTime(finalFreq1, time);
      } else if (this.vco1SoundfontNodes.length > 0) {
        this.vco1SoundfontNodes.forEach(node => {
          const tuneFactor = Math.pow(2, (node.coarseTune + node.fineTune / 100) / 12);
          const finalRate1 = (finalFreq1 / node.rootFreq) * tuneFactor;
          node.src.playbackRate.setValueAtTime(finalRate1, time);
        });
      }

      if (this.vco2) {
        this.vco2.frequency.setValueAtTime(finalFreq2, time);
      } else if (this.vco2SoundfontNodes.length > 0) {
        this.vco2SoundfontNodes.forEach(node => {
          const tuneFactor = Math.pow(2, (node.coarseTune + node.fineTune / 100) / 12);
          const finalRate2 = (finalFreq2 / node.rootFreq) * tuneFactor;
          node.src.playbackRate.setValueAtTime(finalRate2, time);
        });
      }

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

    // For Soundfonts, soundfont samples have natural recorded decay/sustain.
    // Ensure sustain defaults to 1.0 unless explicitly using a custom ENV1.
    if (vco1SoundfontEnabled || vco2SoundfontEnabled) {
      if (this.params.vcaSource !== 'env1') {
        vcaSustain = 1.0;
        vcaDecay = 0.005;
      }
    }

    // VCA Envelope - Reset attack start to silence for non-legato note triggers to execute full attack envelope
    this.vca.gain.cancelScheduledValues(time);
    const startGain = isLegato ? Math.max(0.0001, this.vca.gain.value) : 0.0001;
    
    this.vca.gain.setValueAtTime(startGain, time);
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
    
    // Base cutoff is never crushed below filterCutoff by velocity
    const baseCutoff = Math.max(20, filterCutoff + kbdMod);
    const velCutoffBoost = velocity * this.params.filterVelocitySensitivity * 4000 * scale;
    const targetCutoff = Math.min(20000, Math.max(baseCutoff, baseCutoff + (filterEnvAmount * 10000 + velCutoffBoost) * scale));

    // Smooth VCF attack sweep starting from baseCutoff (or current frequency if legato)
    this.filter.frequency.cancelScheduledValues(time);
    const startFreq = isLegato ? Math.max(20, this.filter.frequency.value || baseCutoff) : baseCutoff;
    this.filter.frequency.setValueAtTime(startFreq, time);
    
    // Ramps cleanly from startFreq to targetCutoff over envAttack
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

    if (this.vco1) this.vco1.start(time);
    this.vco1SoundfontNodes.forEach(node => node.src.start(time));
    if (this.vco2) this.vco2.start(time);
    this.vco2SoundfontNodes.forEach(node => node.src.start(time));
    if (this.subOsc) this.subOsc.start(time);
    if (this.vco1Noise) this.vco1Noise.start(time);
    if (this.vco2Noise) this.vco2Noise.start(time);
  }

  setPitchBend(offset: number) {
    this.pitchBendOffset = offset;
    const time = this.ctx.currentTime;
    if (this.midiNote !== null && !this.isReleasing) {
      if (this.activeSynthEngine === 'dx7') {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const bendFactor = Math.pow(2, offset / 12);
        const voice = this.params.dx7Voice || createDefaultDX7Voice();
        if (this.dx7Oscs && this.dx7Oscs.length > 0) {
          this.dx7Oscs.forEach((osc, i) => {
            const op = voice.operators[i];
            if (op) {
              let opFreq = freq;
              if (op.mode === 1) {
                opFreq = Math.pow(10, (op.coarse % 4) + op.fine / 100);
              } else {
                const ratio = (op.coarse === 0 ? 0.5 : op.coarse) * (1.0 + op.fine / 100);
                opFreq = freq * ratio;
              }
              osc.frequency.setTargetAtTime(opFreq * bendFactor, time, 0.02);
            }
          });
        }
      } else if (this.activeSynthEngine === 'hammond') {
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
      } else if (this.vco1 || this.vco2 || this.vco1SoundfontNodes.length > 0 || this.vco2SoundfontNodes.length > 0) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const { vco1Freq, vco1Range, vco2Freq, vco2Range, vco2Detune } = this.params;
        
        const bendFactor = Math.pow(2, offset / 12);
        
        const targetFreq1 = freq * (8/vco1Range) * Math.pow(2, vco1Freq / 12) * bendFactor;
        const targetFreq2 = freq * (8/vco2Range) * Math.pow(2, (vco2Freq + (vco2Detune / 100)) / 12) * bendFactor;

        if (this.vco1) {
          this.vco1.frequency.setTargetAtTime(targetFreq1, time, 0.02);
        } else if (this.vco1SoundfontNodes.length > 0) {
          this.vco1SoundfontNodes.forEach(node => {
            const tuneFactor = Math.pow(2, (node.coarseTune + node.fineTune / 100) / 12);
            const rate1 = (targetFreq1 / node.rootFreq) * tuneFactor;
            node.src.playbackRate.setTargetAtTime(rate1, time, 0.02);
          });
        }

        if (this.vco2) {
          this.vco2.frequency.setTargetAtTime(targetFreq2, time, 0.02);
        } else if (this.vco2SoundfontNodes.length > 0) {
          this.vco2SoundfontNodes.forEach(node => {
            const tuneFactor = Math.pow(2, (node.coarseTune + node.fineTune / 100) / 12);
            const rate2 = (targetFreq2 / node.rootFreq) * tuneFactor;
            node.src.playbackRate.setTargetAtTime(rate2, time, 0.02);
          });
        }

        if (this.subOsc) {
          const subFreqFactor = Math.pow(2, this.params.subOscOctave);
          const targetSubFreq = freq * subFreqFactor * bendFactor;
          this.subOsc.frequency.setTargetAtTime(targetSubFreq, time, 0.02);
        }
      }
    }
  }

  private killTransientNodes(time: number) {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const stopTime = time + 0.01;
    const nodesToDisconnect: (AudioNode | null)[] = [];

    if (this.vco1) {
      try { this.vco1.stop(stopTime); } catch(e) {}
      nodesToDisconnect.push(this.vco1);
      this.vco1 = null;
    }
    if (this.vco1SoundfontNodes.length > 0) {
      this.vco1SoundfontNodes.forEach(node => {
        try { node.src.stop(stopTime); } catch(e) {}
        nodesToDisconnect.push(node.src, node.gain);
      });
      this.vco1SoundfontNodes = [];
      this.vco1SoundfontSource = null;
    }
    if (this.subOsc) {
      try { this.subOsc.stop(stopTime); } catch(e) {}
      nodesToDisconnect.push(this.subOsc);
      this.subOsc = null;
    }
    if (this.vco2) {
      try { this.vco2.stop(stopTime); } catch(e) {}
      nodesToDisconnect.push(this.vco2);
      this.vco2 = null;
    }
    if (this.vco2SoundfontNodes.length > 0) {
      this.vco2SoundfontNodes.forEach(node => {
        try { node.src.stop(stopTime); } catch(e) {}
        nodesToDisconnect.push(node.src, node.gain);
      });
      this.vco2SoundfontNodes = [];
      this.vco2SoundfontSource = null;
    }
    if (this.vco1Noise) {
      try { this.vco1Noise.stop(stopTime); } catch(e) {}
      nodesToDisconnect.push(this.vco1Noise);
      this.vco1Noise = null;
    }
    if (this.vco2Noise) {
      try { this.vco2Noise.stop(stopTime); } catch(e) {}
      nodesToDisconnect.push(this.vco2Noise);
      this.vco2Noise = null;
    }
    if (this.hammondOscs && this.hammondOscs.length > 0) {
      this.hammondOscs.forEach(osc => {
        try { osc.stop(stopTime); } catch(e) {}
        nodesToDisconnect.push(osc);
      });
      this.hammondOscs = [];
    }
    if (this.hammondGains && this.hammondGains.length > 0) {
      this.hammondGains.forEach(g => {
        try {
          g.gain.cancelScheduledValues(time);
          g.gain.setValueAtTime(g.gain.value, time);
          g.gain.linearRampToValueAtTime(0, time + 0.005);
          nodesToDisconnect.push(g);
        } catch(e) {
          try { g.disconnect(); } catch(err) {}
        }
      });
      this.hammondGains = [];
    }
    if (this.percussionOsc) {
      try { this.percussionOsc.stop(stopTime); } catch(e) {}
      nodesToDisconnect.push(this.percussionOsc);
      this.percussionOsc = null;
    }
    if (this.percussionGain) {
      try {
        this.percussionGain.gain.cancelScheduledValues(time);
        this.percussionGain.gain.setValueAtTime(this.percussionGain.gain.value, time);
        this.percussionGain.gain.linearRampToValueAtTime(0, time + 0.005);
        nodesToDisconnect.push(this.percussionGain);
      } catch(e) {
        try { this.percussionGain.disconnect(); } catch(err) {}
      }
      this.percussionGain = null;
    }

    if (this.dx7Oscs && this.dx7Oscs.length > 0) {
      this.dx7Oscs.forEach(osc => {
        try { osc.stop(stopTime); } catch(e) {}
        nodesToDisconnect.push(osc);
      });
      this.dx7Oscs = [];
    }
    if (this.dx7Gains && this.dx7Gains.length > 0) {
      this.dx7Gains.forEach(g => {
        try {
          g.gain.cancelScheduledValues(time);
          g.gain.setValueAtTime(g.gain.value, time);
          g.gain.linearRampToValueAtTime(0, time + 0.005);
          nodesToDisconnect.push(g);
        } catch(e) {
          try { g.disconnect(); } catch(err) {}
        }
      });
      this.dx7Gains = [];
    }
    if (this.dx7FeedbackDelay) {
      nodesToDisconnect.push(this.dx7FeedbackDelay);
      this.dx7FeedbackDelay = null;
    }
    if (this.dx7FeedbackGain) {
      nodesToDisconnect.push(this.dx7FeedbackGain);
      this.dx7FeedbackGain = null;
    }

    if (nodesToDisconnect.length > 0) {
      setTimeout(() => {
        for (let i = 0; i < nodesToDisconnect.length; i++) {
          try { nodesToDisconnect[i]?.disconnect(); } catch(e) {}
        }
      }, 25);
    }

    // Clean up PWM nodes
    if (this.vco1PwmOffset) {
      try { this.vco1PwmOffset.stop(time); } catch(e) {}
      this.vco1PwmOffset.disconnect();
      this.vco1PwmOffset = null;
    }
    if (this.vco1PwmLfoGain) {
      try { this.lfoModBusNode.disconnect(this.vco1PwmLfoGain); } catch(e) {}
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
      this.vco2PwmOffset.disconnect();
      this.vco2PwmOffset = null;
    }
    if (this.vco2PwmLfoGain) {
      try { this.lfoModBusNode.disconnect(this.vco2PwmLfoGain); } catch(e) {}
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

    // Clean up temporary modulation bus connections on this voice to prevent orphaned node accumulation
    if (this.vcoLfoMod) {
      try { this.vcoLfoMod.disconnect(); } catch(e) {}
    }
    if (this.crossModGain) {
      try { this.crossModGain.disconnect(); } catch(e) {}
    }
  }

  triggerRelease(time: number) {
    this.isReleasing = true;
    let releaseDuration = 0.05;
    
    if (this.activeSynthEngine === 'dx7') {
      let maxReleaseTime = 0.05;
      
      this.dx7Gains.forEach((gainNode) => {
        const R4 = (gainNode as any).dx7ReleaseRate ?? 50;
        const L4 = (gainNode as any).dx7L4 ?? 0;
        const levelToValue = (gainNode as any).dx7LevelToValue ?? ((lvl: number) => 0);
        
        const t4 = Math.pow(10, (99 - R4) / 25) * 0.01;
        const targetVal = levelToValue(L4);
        
        gainNode.gain.cancelScheduledValues(time);
        gainNode.gain.setValueAtTime(gainNode.gain.value, time);
        gainNode.gain.setTargetAtTime(targetVal, time, Math.max(0.001, t4 / 3));
        
        if (t4 > maxReleaseTime) {
          maxReleaseTime = t4;
        }
      });
      
      releaseDuration = maxReleaseTime;

      this.vca.gain.cancelScheduledValues(time);
      this.vca.gain.setValueAtTime(this.vca.gain.value, time);
      this.vca.gain.setTargetAtTime(0, time, Math.max(0.001, releaseDuration));
      
      if (this.dx7Oscs && this.dx7Oscs.length > 0) {
        this.dx7Oscs.forEach(osc => {
          try { osc.stop(time + releaseDuration * 3.0 + 0.2); } catch (e) {}
        });
      }
    } else if (this.activeSynthEngine === 'hammond') {
      const organRelease = 0.04; // snappy organ release
      releaseDuration = organRelease;
      this.vca.gain.cancelScheduledValues(time);
      this.vca.gain.setValueAtTime(this.vca.gain.value, time);
      this.vca.gain.setTargetAtTime(0, time, organRelease / 3);

      // Schedule stop on physical Hammond oscillators at completion of envelope plus safety margin
      if (this.hammondOscs && this.hammondOscs.length > 0) {
        this.hammondOscs.forEach(osc => {
          try { osc.stop(time + organRelease + 0.1); } catch (e) {}
        });
      }
      if (this.percussionOsc) {
        try { this.percussionOsc.stop(time + organRelease + 0.1); } catch (e) {}
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

      // Schedule soundfont nodes to stop cleanly AFTER the release envelope completes
      const fontStopTime = time + releaseDuration + 0.2;
      this.vco1SoundfontNodes.forEach(node => {
        try { node.src.stop(fontStopTime); } catch (e) {}
      });
      this.vco2SoundfontNodes.forEach(node => {
        try { node.src.stop(fontStopTime); } catch (e) {}
      });
    }

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
    }
    this.stopTimer = window.setTimeout(() => {
      this.stop();
    }, Math.max(0.1, releaseDuration * 3.0) * 1000);
  }
  
  stop() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const now = this.ctx.currentTime;
    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.setValueAtTime(this.vca.gain.value, now);
    this.vca.gain.linearRampToValueAtTime(0, now + 0.005);

    this.killTransientNodes(now);
    this.midiNote = null;
    this.originalMidiNote = null;
    this.currentPatchId = null;
    this.isReleasing = false;
  }

  public reconnectOutput(destination: AudioNode) {
    this.output.disconnect();
    this.output.connect(destination);
  }
}

class SlotFXChain {
  public ctx: AudioContext;
  public subGain: GainNode;
  public outputGain: GainNode;

  // Chorus
  public chorus: DelayNode;
  public chorus2: DelayNode;
  public chorus3: DelayNode;
  public chorusGain: GainNode;
  public chorus2Gain: GainNode;
  public chorus3Gain: GainNode;
  public chorusLFO: OscillatorNode;
  public chorusLfoGain: GainNode;
  public chorus2LFO: OscillatorNode;
  public chorus2LfoGain: GainNode;
  public chorus3LFO: OscillatorNode;
  public chorus3LfoGain: GainNode;
  public chorusFastLFO: OscillatorNode;
  public chorusFastLfoGain: GainNode;
  public chorus2FastLFO: OscillatorNode;
  public chorus2FastLfoGain: GainNode;
  public chorus3FastLFO: OscillatorNode;
  public chorus3FastLfoGain: GainNode;

  // Delay
  public delay: DelayNode;
  public delayFeedback: GainNode;
  public delayGain: GainNode;

  // Reverb
  public reverb: ConvolverNode;
  public reverbGain: GainNode;

  // EQ
  public eqFilters: BiquadFilterNode[];

  // Distortion
  public distortionInput: GainNode;
  public distortion: WaveShaperNode;
  public distortionGain: GainNode;
  public distortionDry: GainNode;
  public distortionFeedbackDelay: DelayNode;
  public distortionFeedbackFilter: BiquadFilterNode;
  public distortionFeedbackGain: GainNode;

  // Tremolo
  public tremoloGain: GainNode;
  public tremoloDry: GainNode;
  public tremoloLFO: OscillatorNode;
  public tremoloLfoGain: GainNode;

  // Leslie
  public leslieLFO: OscillatorNode;
  public leslieLfoInverter: GainNode;
  public leslieDelayL: DelayNode;
  public leslieDelayR: DelayNode;
  public leslieGainL: GainNode;
  public leslieGainR: GainNode;
  public leslieDry: GainNode;
  public leslieLfoGainL: GainNode;
  public leslieLfoGainR: GainNode;
  public leslieVibGainL: GainNode;
  public leslieVibGainR: GainNode;
  public leslieMerger: ChannelMergerNode;

  private lastTargetLeslieRate: number = 0;
  private lastDistortionMode: string = '';
  private lastDistortionAmount: number = -1;

  constructor(ctx: AudioContext, destination: AudioNode, reverbBuffer: AudioBuffer | null) {
    this.ctx = ctx;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 1.0;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1.0;

    // Chorus
    this.chorus = ctx.createDelay(0.1);
    this.chorus2 = ctx.createDelay(0.1);
    this.chorus3 = ctx.createDelay(0.1);

    this.chorusGain = ctx.createGain();
    this.chorus2Gain = ctx.createGain();
    this.chorus3Gain = ctx.createGain();

    this.chorus.delayTime.setValueAtTime(0.025, ctx.currentTime);
    this.chorus2.delayTime.setValueAtTime(0.028, ctx.currentTime);
    this.chorus3.delayTime.setValueAtTime(0.022, ctx.currentTime);

    this.chorusLFO = ctx.createOscillator();
    this.chorusLfoGain = ctx.createGain();
    this.chorus2LFO = ctx.createOscillator();
    this.chorus2LfoGain = ctx.createGain();
    this.chorus3LFO = ctx.createOscillator();
    this.chorus3LfoGain = ctx.createGain();

    this.chorusFastLFO = ctx.createOscillator();
    this.chorusFastLfoGain = ctx.createGain();
    this.chorus2FastLFO = ctx.createOscillator();
    this.chorus2FastLfoGain = ctx.createGain();
    this.chorus3FastLFO = ctx.createOscillator();
    this.chorus3FastLfoGain = ctx.createGain();

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

    this.chorusLFO.start();
    this.chorus2LFO.start();
    this.chorus3LFO.start();
    this.chorusFastLFO.start();
    this.chorus2FastLFO.start();
    this.chorus3FastLFO.start();

    this.chorusLFO.connect(this.chorusLfoGain);
    this.chorusLfoGain.connect(this.chorus.delayTime);
    this.chorusFastLFO.connect(this.chorusFastLfoGain);
    this.chorusFastLfoGain.connect(this.chorus.delayTime);

    this.chorus2LFO.connect(this.chorus2LfoGain);
    this.chorus2LfoGain.connect(this.chorus2.delayTime);
    this.chorus2FastLFO.connect(this.chorus2FastLfoGain);
    this.chorus2FastLfoGain.connect(this.chorus2.delayTime);

    this.chorus3LFO.connect(this.chorus3LfoGain);
    this.chorus3LfoGain.connect(this.chorus3.delayTime);
    this.chorus3FastLFO.connect(this.chorus3FastLfoGain);
    this.chorus3FastLfoGain.connect(this.chorus3.delayTime);

    // Delay
    this.delay = ctx.createDelay(5.0);
    this.delayFeedback = ctx.createGain();
    this.delayGain = ctx.createGain();

    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayGain);

    // Reverb
    this.reverb = ctx.createConvolver();
    if (reverbBuffer) {
      this.reverb.buffer = reverbBuffer;
    }
    this.reverbGain = ctx.createGain();

    // EQ
    this.eqFilters = [];
    const eqFrequencies = [80, 250, 1000, 4000, 12000];
    const eqTypes: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
    const eqQs = [1, 1, 1, 1, 1];

    for (let i = 0; i < 5; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = eqTypes[i];
      filter.frequency.value = eqFrequencies[i];
      filter.Q.value = eqQs[i];
      filter.gain.value = 0;
      this.eqFilters.push(filter);
    }
    for (let i = 0; i < 4; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1]);
    }

    // Distortion
    this.distortion = ctx.createWaveShaper();
    this.distortionGain = ctx.createGain();
    this.distortionDry = ctx.createGain();
    this.distortionInput = ctx.createGain();

    this.distortionFeedbackDelay = ctx.createDelay(0.1);
    this.distortionFeedbackFilter = ctx.createBiquadFilter();
    this.distortionFeedbackGain = ctx.createGain();

    this.distortionFeedbackDelay.delayTime.setValueAtTime(0.015, ctx.currentTime);
    this.distortionFeedbackFilter.type = 'bandpass';
    this.distortionFeedbackFilter.frequency.setValueAtTime(800, ctx.currentTime);
    this.distortionFeedbackFilter.Q.setValueAtTime(15.0, ctx.currentTime);
    this.distortionFeedbackGain.gain.setValueAtTime(0.0, ctx.currentTime);

    this.distortionInput.connect(this.distortion);
    this.distortionInput.connect(this.distortionDry);

    const afterDistortion = ctx.createGain();
    this.distortion.connect(this.distortionGain);
    this.distortionGain.connect(afterDistortion);
    this.distortionDry.connect(afterDistortion);

    afterDistortion.connect(this.distortionFeedbackDelay);
    this.distortionFeedbackDelay.connect(this.distortionFeedbackFilter);
    this.distortionFeedbackFilter.connect(this.distortionFeedbackGain);
    this.distortionFeedbackGain.connect(this.distortionInput);

    // Tremolo
    this.tremoloGain = ctx.createGain();
    this.tremoloDry = ctx.createGain();
    this.tremoloLFO = ctx.createOscillator();
    this.tremoloLfoGain = ctx.createGain();
    this.tremoloLFO.connect(this.tremoloLfoGain);
    this.tremoloLfoGain.connect(this.tremoloGain.gain);
    this.tremoloLFO.start();

    afterDistortion.connect(this.tremoloGain);
    afterDistortion.connect(this.tremoloDry);

    const tremoloNext = ctx.createGain();
    this.tremoloGain.connect(tremoloNext);
    this.tremoloDry.connect(tremoloNext);

    // Leslie
    this.leslieLFO = ctx.createOscillator();
    this.leslieLfoInverter = ctx.createGain();
    this.leslieLfoInverter.gain.setValueAtTime(-1, ctx.currentTime);
    this.leslieLFO.connect(this.leslieLfoInverter);

    this.leslieDelayL = ctx.createDelay(0.1);
    this.leslieDelayR = ctx.createDelay(0.1);
    this.leslieGainL = ctx.createGain();
    this.leslieGainR = ctx.createGain();
    this.leslieDry = ctx.createGain();

    this.leslieLfoGainL = ctx.createGain();
    this.leslieLfoGainR = ctx.createGain();
    this.leslieVibGainL = ctx.createGain();
    this.leslieVibGainR = ctx.createGain();

    this.leslieMerger = ctx.createChannelMerger(2);

    this.leslieLFO.connect(this.leslieLfoGainL);
    this.leslieLFO.connect(this.leslieVibGainL);
    this.leslieLfoGainL.connect(this.leslieGainL.gain);
    this.leslieVibGainL.connect(this.leslieDelayL.delayTime);

    this.leslieLfoInverter.connect(this.leslieLfoGainR);
    this.leslieLfoInverter.connect(this.leslieVibGainR);
    this.leslieLfoGainR.connect(this.leslieGainR.gain);
    this.leslieVibGainR.connect(this.leslieDelayR.delayTime);

    this.leslieLFO.start();

    tremoloNext.connect(this.leslieDelayL);
    tremoloNext.connect(this.leslieDelayR);

    this.leslieDelayL.connect(this.leslieGainL);
    this.leslieDelayR.connect(this.leslieGainR);

    this.leslieGainL.connect(this.leslieMerger, 0, 0);
    this.leslieGainR.connect(this.leslieMerger, 0, 1);

    tremoloNext.connect(this.leslieDry);

    this.leslieMerger.connect(this.outputGain);
    this.leslieDry.connect(this.outputGain);

    this.subGain.connect(this.chorus);
    this.chorus.connect(this.chorusGain);
    this.chorusGain.connect(this.eqFilters[0]);

    this.subGain.connect(this.chorus2);
    this.chorus2.connect(this.chorus2Gain);
    this.chorus2Gain.connect(this.eqFilters[0]);

    this.subGain.connect(this.chorus3);
    this.chorus3.connect(this.chorus3Gain);
    this.chorus3Gain.connect(this.eqFilters[0]);

    this.subGain.connect(this.delay);
    this.delayGain.connect(this.eqFilters[0]);

    this.subGain.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.eqFilters[0]);

    this.subGain.connect(this.eqFilters[0]);
    this.eqFilters[4].connect(this.distortionInput);

    this.outputGain.connect(destination);
  }

  public destroy() {
    try { this.chorusLFO.stop(); } catch (e) {}
    try { this.chorus2LFO.stop(); } catch (e) {}
    try { this.chorus3LFO.stop(); } catch (e) {}
    try { this.chorusFastLFO.stop(); } catch (e) {}
    try { this.chorus2FastLFO.stop(); } catch (e) {}
    try { this.chorus3FastLFO.stop(); } catch (e) {}
    try { this.tremoloLFO.stop(); } catch (e) {}
    try { this.leslieLFO.stop(); } catch (e) {}

    this.subGain.disconnect();
    this.outputGain.disconnect();
  }

  public updateParams(params: VoiceParams, oldParams?: VoiceParams) {
    const time = this.ctx.currentTime;
    const setParam = (audioParam: AudioParam | undefined | null, targetVal: number, timeConstant: number = 0.05) => {
      if (!audioParam) return;
      if (!oldParams) {
        audioParam.setValueAtTime(targetVal, time);
        audioParam.value = targetVal;
      } else {
        audioParam.setTargetAtTime(targetVal, time, timeConstant);
      }
    };

    if (params.chorusMode === 1) {
      setParam(this.chorusLFO.frequency, 0.5, 0.05);
      setParam(this.chorusLfoGain.gain, 0.002, 0.05);
      setParam(this.chorusFastLfoGain.gain, 0, 0.05);
      setParam(this.chorusGain.gain, params.chorusMix, 0.05);
      setParam(this.chorus2Gain.gain, 0, 0.05);
      setParam(this.chorus3Gain.gain, 0, 0.05);
      setParam(this.chorus2LfoGain.gain, 0, 0.05);
      setParam(this.chorus2FastLfoGain.gain, 0, 0.05);
      setParam(this.chorus3LfoGain.gain, 0, 0.05);
      setParam(this.chorus3FastLfoGain.gain, 0, 0.05);
    } else if (params.chorusMode === 2) {
      setParam(this.chorusLFO.frequency, 0.8, 0.05);
      setParam(this.chorusLfoGain.gain, 0.0035, 0.05);
      setParam(this.chorusFastLfoGain.gain, 0, 0.05);
      setParam(this.chorus2LFO.frequency, 0.55, 0.05);
      setParam(this.chorus2LfoGain.gain, 0.0045, 0.05);
      setParam(this.chorus2FastLfoGain.gain, 0, 0.05);
      setParam(this.chorus3LfoGain.gain, 0, 0.05);
      setParam(this.chorus3FastLfoGain.gain, 0, 0.05);
      setParam(this.chorusGain.gain, params.chorusMix, 0.05);
      setParam(this.chorus2Gain.gain, params.chorusMix, 0.05);
      setParam(this.chorus3Gain.gain, 0, 0.05);
    } else if (params.chorusMode === 3) {
      setParam(this.chorusLFO.frequency, 0.6, 0.05);
      setParam(this.chorusLfoGain.gain, 0.003, 0.05);
      setParam(this.chorusFastLFO.frequency, 5.8, 0.05);
      setParam(this.chorusFastLfoGain.gain, 0.001, 0.05);
      setParam(this.chorus2LFO.frequency, 0.48, 0.05);
      setParam(this.chorus2LfoGain.gain, 0.0035, 0.05);
      setParam(this.chorus2FastLFO.frequency, 6.2, 0.05);
      setParam(this.chorus2FastLfoGain.gain, 0.0008, 0.05);
      setParam(this.chorus3LFO.frequency, 0.68, 0.05);
      setParam(this.chorus3LfoGain.gain, 0.0027, 0.05);
      setParam(this.chorus3FastLFO.frequency, 5.3, 0.05);
      setParam(this.chorus3FastLfoGain.gain, 0.0011, 0.05);
      setParam(this.chorusGain.gain, params.chorusMix, 0.05);
      setParam(this.chorus2Gain.gain, params.chorusMix, 0.05);
      setParam(this.chorus3Gain.gain, params.chorusMix, 0.05);
    }

    setParam(this.delay.delayTime, params.delayTime, 0.05);
    setParam(this.delayFeedback.gain, params.delayFeedback, 0.05);
    setParam(this.delayGain.gain, params.delayMix, 0.05);

    setParam(this.reverbGain.gain, params.reverbMix, 0.05);

    setParam(this.tremoloLFO.frequency, params.tremoloRate, 0.05);
    setParam(this.tremoloLfoGain.gain, params.tremoloDepth * params.tremoloMix, 0.05);
    setParam(this.tremoloGain.gain, params.tremoloMix, 0.05);
    setParam(this.tremoloDry.gain, 1.0 - params.tremoloMix, 0.05);

    let targetRate = 1.2;
    let targetDepth = params.leslieDepth;
    if (params.leslieSpeed === 'off') {
      targetRate = 0.05;
      targetDepth = 0.0;
    } else if (params.leslieSpeed === 'lo') {
      targetRate = 1.2;
      targetDepth = params.leslieDepth;
    } else if (params.leslieSpeed === 'high') {
      targetRate = 6.2;
      targetDepth = params.leslieDepth;
    }
    let rateTimeConstant = targetRate > this.lastTargetLeslieRate ? 1.2 : 2.4;
    this.lastTargetLeslieRate = targetRate;
    setParam(this.leslieLFO.frequency, targetRate, rateTimeConstant);

    const currentMix = params.leslieMix;
    const lfoGain = targetDepth * 0.4 * currentMix;
    const vibGain = targetDepth * 0.006 * currentMix;
    const depthTimeConstant = targetRate < 1.0 ? 1.8 : 0.8;

    setParam(this.leslieLfoGainL.gain, lfoGain, depthTimeConstant);
    setParam(this.leslieLfoGainR.gain, lfoGain, depthTimeConstant);
    setParam(this.leslieVibGainL.gain, vibGain, depthTimeConstant);
    setParam(this.leslieVibGainR.gain, vibGain, depthTimeConstant);
    setParam(this.leslieGainL.gain, 0.5, 0.05);
    setParam(this.leslieGainR.gain, 0.5, 0.05);
    setParam(this.leslieDry.gain, 1.0 - currentMix, 0.05);
    setParam(this.leslieDelayL.delayTime, 0.015, 0.05);
    setParam(this.leslieDelayR.delayTime, 0.015, 0.05);

    setParam(this.eqFilters[0].gain, params.eqBand1 ?? 0, 0.05);
    setParam(this.eqFilters[1].gain, params.eqBand2 ?? 0, 0.05);
    setParam(this.eqFilters[2].gain, params.eqBand3 ?? 0, 0.05);
    setParam(this.eqFilters[3].gain, params.eqBand4 ?? 0, 0.05);
    setParam(this.eqFilters[4].gain, params.eqBand5 ?? 0, 0.05);

    const mode = params.distortionMode || 'default';
    const amount = params.distortionAmount;
    if (this.lastDistortionMode !== mode || this.lastDistortionAmount !== amount) {
      this.distortion.curve = getDistortionCurve(mode, amount);
      this.lastDistortionMode = mode;
      this.lastDistortionAmount = amount;
    }

    const feedbackFreq = params.distortionFeedbackFreq ?? 800;
    setParam(this.distortionFeedbackFilter.frequency, feedbackFreq, 0.05);
    const feedbackGainVal = mode === 'feedback' ? (params.distortionFeedbackAmount ?? 0.3) * 1.5 : 0.0;
    setParam(this.distortionFeedbackGain.gain, feedbackGainVal, 0.05);

    setParam(this.distortionGain.gain, params.distortionMix, 0.05);
    setParam(this.distortionDry.gain, 1.0 - params.distortionMix, 0.05);
  }
}

const distortionCurveCache = new Map<string, Float32Array>();

function getDistortionCurve(mode: string, amount: number): Float32Array {
  const quantizedAmount = Math.round(amount * 1000) / 1000;
  const key = `${mode}_${quantizedAmount}`;
  let curve = distortionCurveCache.get(key);
  if (curve) return curve;

  const n_samples = 44100;
  curve = new Float32Array(n_samples);
  if (mode === 'tube') {
    const kFactor = quantizedAmount * 12 + 1;
    const expNegK = Math.exp(-kFactor);
    const expNegK15 = Math.exp(-kFactor * 1.5);
    const denomNeg = 1.0 - expNegK;
    const denomPos = 1.0 - expNegK15;

    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      if (x < 0) curve[i] = - (1.0 - Math.exp(x * kFactor)) / denomNeg;
      else curve[i] = (1.0 - Math.exp(-x * kFactor * 1.5)) / denomPos;
    }
  } else {
    const k = quantizedAmount * (mode === 'feedback' ? 120 : 100) + (mode === 'feedback' ? 20 : 0);
    const piPlusK = Math.PI + k;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (piPlusK * x) / (Math.PI + k * Math.abs(x));
    }
  }

  distortionCurveCache.set(key, curve);
  return curve;
}

interface ArpState {
  heldNotes: number[];
  playedNotes: number[];
  arpTimer: number | null;
  arpIndex: number;
  arpDirection: 1 | -1;
  slotIndex: number;
  patchId: string | null;
  patchParams: VoiceParams;
  cachedNotes?: number[];
  isCacheDirty?: boolean;
}

export class JupiterEngine {
  public ctx: AudioContext | null = null;
  public getCtx(): AudioContext | null { return this.ctx; }
  private voices: Voice[] = [];
  private lastFrequency: number = 0;
  private params: VoiceParams;
  private perfSettings: PerformanceSettings;
  private worker: Worker | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeMulti: Multi | null = null;
  private libraryPatches: Patch[] = [];
  private slotFXChains: SlotFXChain[] = [];
  private patchMap = new Map<string, Patch>();
  private slotIndexByPatchIdMap = new Map<string, number>();

  private updatePatchMap(patches: Patch[]) {
    this.libraryPatches = patches;
    this.patchMap.clear();
    for (let i = 0; i < patches.length; i++) {
      this.patchMap.set(patches[i].id, patches[i]);
    }
  }

  private updateMultiSlotMap(multi: Multi | null) {
    this.activeMulti = multi;
    this.slotIndexByPatchIdMap.clear();
    if (multi) {
      multi.slots.forEach((slot, index) => {
        this.slotIndexByPatchIdMap.set(slot.patchId, index);
      });
    }
  }

  setLibraryPatches(patches: Patch[]) {
    this.updatePatchMap(patches);
  }

  setActiveMulti(multi: Multi | null, patches: Patch[]) {
    const prevMulti = this.activeMulti;
    this.updateMultiSlotMap(multi);
    this.updatePatchMap(patches);

    if (!this.ctx) return;

    // Check if slots structurally changed (count or patchIds)
    const countChanged = !prevMulti || !multi || prevMulti.slots.length !== multi.slots.length;
    let structureChanged = countChanged;
    if (!structureChanged && prevMulti && multi) {
      for (let i = 0; i < multi.slots.length; i++) {
        if (prevMulti.slots[i].patchId !== multi.slots[i].patchId) {
          structureChanged = true;
          break;
        }
      }
    }

    if (structureChanged) {
      this.slotFXChains.forEach(chain => chain.destroy());
      this.slotFXChains = [];

      if (multi) {
        multi.slots.forEach(slot => {
          const patch = this.patchMap.get(slot.patchId);
          const patchParams = patch ? patch.params : this.params;
          const chain = new SlotFXChain(this.ctx!, this.compressorInput!, this.reverb ? this.reverb.buffer : null);
          chain.updateParams(patchParams);
          this.slotFXChains.push(chain);
        });
      }
    } else if (multi) {
      // Just update parameters for existing chains
      multi.slots.forEach((slot, index) => {
        const patch = this.patchMap.get(slot.patchId);
        const patchParams = patch ? patch.params : this.params;
        if (this.slotFXChains[index]) {
          this.slotFXChains[index].updateParams(patchParams);
        }
      });
    }
  }
  
  // Arpeggiator State
  private activeArps: Map<string, ArpState> = new Map();
  private lastReleaseTime: number = 0;

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
  private lastDistortionMode: string | null = null;
  private lastDistortionAmount: number | null = null;

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

  // 5.1 Surround Routing & Backing Track State
  private surroundMerger: ChannelMergerNode | null = null;
  private synthSplitter: ChannelSplitterNode | null = null;
  private isBackingTrackActive: boolean = false;

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
        this.slotFXChains.forEach(chain => {
          if (chain.reverb) chain.reverb.buffer = buffer;
        });
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
    
    // Limiter (Transparent peak protection safety)
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3.0;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.15;

    // Internal master flow: Voices/FX -> MasterBus (summing) -> Master Chain (Dist/Trem/Les) -> Comp/Limiter -> Out

    // All effects and dry signal connect to masterBus
    this.mainGain.connect(this.masterBus); 
    
    // setupFX handles the Master Chain connection from masterBus to compressor
    this.setupFX();

    // Re-create slot FX chains if they were configured before init
    if (this.activeMulti) {
      this.slotFXChains.forEach(c => c.destroy());
      this.slotFXChains = [];
      this.activeMulti.slots.forEach(slot => {
        const patch = this.libraryPatches.find(p => p.id === slot.patchId);
        const patchParams = patch ? patch.params : this.params;
        const chain = new SlotFXChain(this.ctx!, this.compressorInput!, this.reverb ? this.reverb.buffer : null);
        chain.updateParams(patchParams);
        this.slotFXChains.push(chain);
      });
    }
    
    this.compressorInput.connect(this.compressor);
    this.compressorInput.connect(this.compressorDry);
    this.compressor.connect(this.compressorWet);

    this.compressorDry.connect(this.limiter);
    this.compressorWet.connect(this.limiter);

    this.limiter.connect(this.volumeGain!);
    this.volumeGain!.connect(this.analyser);

    // Dedicated clean sound path for metronome, bypassing all FX/compressor/master volumes
    this.metronomeGain = this.ctx.createGain();
    this.metronomeGain.gain.setValueAtTime(this.params.metronomeVolume, this.ctx.currentTime);

    // Set up 5.1 vs Stereo Audio Routing
    this.updateAudioRouting();

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

      if (this.lastDistortionMode !== mode || this.lastDistortionAmount !== amount) {
        this.distortion.curve = getDistortionCurve(mode, amount);
        this.distortion.oversample = 'none';

        this.lastDistortionMode = mode;
        this.lastDistortionAmount = amount;
      }

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

  setParams(params: VoiceParams, targetPatchId?: string | null) {
    const oldParams = this.params;
    this.params = params;

    if (params.vco1SoundfontEnabled && params.vco1SoundfontName) {
      soundfontService.preload(params.vco1SoundfontName, this.ctx, params.vco1SoundfontSampleIndex ?? 0);
    }
    if (params.vco2SoundfontEnabled && params.vco2SoundfontName) {
      soundfontService.preload(params.vco2SoundfontName, this.ctx, params.vco2SoundfontSampleIndex ?? 0);
    }

    this.voices.forEach(voice => {
      if (!targetPatchId || voice.currentPatchId === targetPatchId) {
        voice.updateParams(params, this.perfSettings);
      }
    });

    if (this.activeMulti && targetPatchId) {
      this.activeMulti.slots.forEach((slot, index) => {
        if (slot.patchId === targetPatchId && this.slotFXChains[index]) {
          this.slotFXChains[index].updateParams(params, oldParams);
        }
      });
    } else {
      this.updateFXParams(oldParams);
    }

    // If arpeggiator rate or sync changed and it's running, restart it
    const rateChanged = oldParams.arpRate !== params.arpRate;
    const syncChanged = oldParams.arpSync !== params.arpSync;
    const divChanged = oldParams.arpSyncDivision !== params.arpSyncDivision;
    const bpmChanged = oldParams.bpm !== params.bpm;

    if (this.activeMulti && targetPatchId) {
      this.activeMulti.slots.forEach((slot, index) => {
        const key = `slot_${index}`;
        const arp = this.activeArps.get(key);
        if (arp && slot.patchId === targetPatchId) {
          const oldArpParams = arp.patchParams;
          arp.patchParams = params;

          const slotRateChanged = oldArpParams.arpRate !== params.arpRate;
          const slotSyncChanged = oldArpParams.arpSync !== params.arpSync;
          const slotDivChanged = oldArpParams.arpSyncDivision !== params.arpSyncDivision;
          const slotBpmChanged = oldArpParams.bpm !== params.bpm;

          if (arp.arpTimer && (slotRateChanged || slotSyncChanged || slotDivChanged || slotBpmChanged)) {
            clearInterval(arp.arpTimer);
            arp.arpTimer = null;

            const interval = params.arpSync
              ? this.getIntervalFromBPM(params.bpm, params.arpSyncDivision)
              : 60000 / (params.arpRate * 4);

            arp.arpTimer = window.setInterval(() => this.tickArpInstance(key), interval);
          }
        }
      });
    } else {
      const key = "single";
      const arp = this.activeArps.get(key);
      if (arp) {
        arp.patchParams = params;
        if (arp.arpTimer && (rateChanged || syncChanged || divChanged || bpmChanged)) {
          clearInterval(arp.arpTimer);
          arp.arpTimer = null;

          const interval = params.arpSync
            ? this.getIntervalFromBPM(params.bpm, params.arpSyncDivision)
            : 60000 / (params.arpRate * 4);

          arp.arpTimer = window.setInterval(() => this.tickArpInstance(key), interval);
        }
      }
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

  public getParams(): VoiceParams {
    return this.params;
  }

  setPerformanceSettings(settings: PerformanceSettings) {
    const needsRestart = 
      settings.sampleRate !== this.perfSettings.sampleRate || 
      settings.latencyHint !== this.perfSettings.latencyHint;

    const surroundChanged = this.perfSettings?.enableSurround51 !== settings.enableSurround51;
    this.perfSettings = settings;

    if (needsRestart && this.ctx) {
      this.restart();
    } else {
      this.updateVoiceCount();
      this.voices.forEach(v => v.updateParams(this.params, this.perfSettings));
      if (surroundChanged) {
        this.updateAudioRouting();
        if (this.isBackingTrackActive && this.perfSettings.enableSurround51) {
          if (!this.metronomeTimer) {
            this.startMetronome();
          }
        }
      }
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

    this.slotFXChains.forEach(chain => chain.destroy());
    this.slotFXChains = [];

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

  public startMetronome(bpm?: number) {
    this.stopMetronome();
    if (!this.ctx) return;
    if (bpm && bpm > 0) {
      this.params.bpm = bpm;
    }
    
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

  public stopMetronome() {
    if (this.metronomeTimer) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  public playMetronomeClick(isDownbeat: boolean) {
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

  public updateAudioRouting() {
    if (!this.ctx || !this.analyser || !this.metronomeGain) return;

    try { this.analyser.disconnect(); } catch (e) {}
    try { this.metronomeGain.disconnect(); } catch (e) {}
    if (this.synthSplitter) {
      try { this.synthSplitter.disconnect(); } catch (e) {}
      this.synthSplitter = null;
    }
    if (this.surroundMerger) {
      try { this.surroundMerger.disconnect(); } catch (e) {}
      this.surroundMerger = null;
    }

    const isSurround = !!this.perfSettings?.enableSurround51;

    if (isSurround) {
      try {
        this.ctx.destination.channelCountMode = 'explicit';
        this.ctx.destination.channelInterpretation = 'discrete';
        const maxCh = this.ctx.destination.maxChannelCount || 6;
        this.ctx.destination.channelCount = Math.max(6, maxCh);
      } catch (e) {
        console.warn("Could not set 5.1 destination channelCount:", e);
      }

      this.surroundMerger = this.ctx.createChannelMerger(6);
      this.surroundMerger.channelCountMode = 'explicit';
      this.surroundMerger.channelInterpretation = 'discrete';
      this.surroundMerger.connect(this.ctx.destination);

      // Route synth output (analyser) to Front Left (Ch 0) & Front Right (Ch 1)
      this.synthSplitter = this.ctx.createChannelSplitter(2);
      this.analyser.connect(this.synthSplitter);
      this.synthSplitter.connect(this.surroundMerger, 0, 0); // Front Left
      this.synthSplitter.connect(this.surroundMerger, 1, 1); // Front Right

      // Route metronome/click output to Rear Left (Ch 4) & Rear Right (Ch 5)
      this.metronomeGain.connect(this.surroundMerger, 0, 4); // Rear Left
      this.metronomeGain.connect(this.surroundMerger, 0, 5); // Rear Right
    } else {
      try {
        this.ctx.destination.channelCountMode = 'max';
        this.ctx.destination.channelCount = Math.min(2, this.ctx.destination.maxChannelCount);
      } catch (e) {}

      this.analyser.connect(this.ctx.destination);
      this.metronomeGain.connect(this.ctx.destination);
    }
  }

  public setBackingTrackActive(active: boolean, bpm?: number) {
    this.isBackingTrackActive = active;
    if (active) {
      if (bpm && bpm > 0) {
        this.params.bpm = bpm;
      }
      if (this.params.metronomeEnabled || this.perfSettings?.enableSurround51) {
        this.startMetronome();
      }
    } else {
      if (!this.params.metronomeEnabled) {
        this.stopMetronome();
      }
    }
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

  noteOn(
    midiNote: number, 
    velocity: number = 0.8, 
    patchId?: string | null, 
    patchParams?: VoiceParams
  ) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    
    // Ensure context is resumed
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    if (this.activeMulti && !patchId && !patchParams) {
      const incomingVel127 = Math.round(velocity * 127);
      
      this.activeMulti.slots.forEach((slot, index) => {
        if (
          midiNote >= slot.lowNote &&
          midiNote <= slot.highNote &&
          incomingVel127 >= slot.lowVelocity &&
          incomingVel127 <= slot.highVelocity
        ) {
          const patch = slot.patchId ? this.patchMap.get(slot.patchId) : undefined;
          if (!patch) return;

          if (patch.params.arpEnabled) {
            const key = `slot_${index}`;
            let arp = this.activeArps.get(key);
            if (!arp) {
              arp = {
                heldNotes: [],
                playedNotes: [],
                arpTimer: null,
                arpIndex: -1,
                arpDirection: 1,
                slotIndex: index,
                patchId: slot.patchId,
                patchParams: patch.params
              };
              this.activeArps.set(key, arp);
            }
            if (!arp.heldNotes.includes(midiNote)) {
              arp.heldNotes.push(midiNote);
              arp.heldNotes.sort((a, b) => a - b);
              arp.playedNotes.push(midiNote);
              arp.isCacheDirty = true;
            }
            this.startArpInstance(key, index, slot.patchId, patch.params);
          } else {
            // Calculate transposed note
            const playedNote = midiNote + (slot.transposeOctave || 0) * 12 + (slot.transposeNote || 0);
            if (playedNote < 0 || playedNote > 127) return;

            // Map velocity
            let mappedVelocity = velocity;
            if (slot.highVelocity !== slot.lowVelocity) {
              const t = (incomingVel127 - slot.lowVelocity) / (slot.highVelocity - slot.lowVelocity);
              const mappedVel127 = slot.lowMapVelocity + t * (slot.highMapVelocity - slot.lowMapVelocity);
              mappedVelocity = Math.max(0, Math.min(127, mappedVel127)) / 127;
            } else {
              mappedVelocity = slot.lowMapVelocity / 127;
            }

            // Trigger note internally with specific patch and transpose info
            this.internalNoteOn(playedNote, mappedVelocity, slot.patchId, patch.params, midiNote);
          }
        }
      });
      return;
    }

    let targetParams = patchParams;
    if (!targetParams && patchId) {
      const p = this.patchMap.get(patchId);
      if (p) targetParams = p.params;
    }

    const effectiveParams = targetParams || this.params;

    if (effectiveParams.arpEnabled) {
      const key = patchId ? `patch_${patchId}` : "single";
      let arp = this.activeArps.get(key);
      if (!arp) {
        arp = {
          heldNotes: [],
          playedNotes: [],
          arpTimer: null,
          arpIndex: -1,
          arpDirection: 1,
          slotIndex: -1,
          patchId: patchId || null,
          patchParams: effectiveParams
        };
        this.activeArps.set(key, arp);
      }
      if (!arp.heldNotes.includes(midiNote)) {
        arp.heldNotes.push(midiNote);
        arp.heldNotes.sort((a, b) => a - b);
        arp.playedNotes.push(midiNote);
        arp.isCacheDirty = true;
      }
      this.startArpInstance(key, -1, patchId || null, effectiveParams);
      return;
    }

    this.internalNoteOn(midiNote, velocity, patchId, effectiveParams);
  }

  private internalNoteOn(
    midiNote: number, 
    velocity: number = 0.8, 
    patchId?: string | null, 
    patchParams?: VoiceParams,
    originalMidiNote?: number
  ) {
    if (!this.ctx) return;
    
    // Single-pass O(N) voice allocation without array filters, copies, or sorting
    let isLegatoContext = false;
    let voice: Voice | null = null;
    let oldestFreeVoice: Voice | null = null;
    let releasingSameNoteVoice: Voice | null = null;
    let oldestReleasingVoice: Voice | null = null;
    let oldestActiveVoice: Voice | null = null;

    const len = this.voices.length;
    for (let i = 0; i < len; i++) {
      const v = this.voices[i];
      if (v.midiNote !== null) {
        if (!v.isReleasing) {
          isLegatoContext = true;
          if (v.midiNote === midiNote && (!patchId || v.currentPatchId === patchId)) {
            voice = v;
            break;
          }
        } else {
          if (v.midiNote === midiNote && (!patchId || v.currentPatchId === patchId)) {
            releasingSameNoteVoice = v;
          }
          if (!oldestReleasingVoice || v.startTime < oldestReleasingVoice.startTime) {
            oldestReleasingVoice = v;
          }
        }
        if (!oldestActiveVoice || v.startTime < oldestActiveVoice.startTime) {
          oldestActiveVoice = v;
        }
      } else {
        if (!oldestFreeVoice || v.startTime < oldestFreeVoice.startTime) {
          oldestFreeVoice = v;
        }
      }
    }

    if (!isLegatoContext) {
      isLegatoContext = (this.ctx.currentTime - this.lastReleaseTime < 0.7);
    }

    if (!voice) {
      if (oldestFreeVoice) {
        voice = oldestFreeVoice;
      } else if (releasingSameNoteVoice) {
        voice = releasingSameNoteVoice;
      } else if (oldestReleasingVoice) {
        voice = oldestReleasingVoice;
        voice.stop();
      } else if (oldestActiveVoice) {
        voice = oldestActiveVoice;
        voice.stop();
      } else {
        voice = this.voices[0];
      }
    }

    // Set voice tracking fields
    voice.currentPatchId = patchId || null;
    voice.originalMidiNote = originalMidiNote !== undefined ? originalMidiNote : midiNote;

    // Apply voice-specific output routing via O(1) slot Map lookup
    if (this.activeMulti && patchId) {
      const slotIndex = this.slotIndexByPatchIdMap.has(patchId) ? this.slotIndexByPatchIdMap.get(patchId)! : -1;
      if (slotIndex !== -1 && this.slotFXChains[slotIndex]) {
        voice.reconnectOutput(this.slotFXChains[slotIndex].subGain);
      } else {
        voice.reconnectOutput(this.mainGain!);
      }
    } else {
      voice.reconnectOutput(this.mainGain!);
    }

    // Apply voice-specific parameters
    if (patchParams) {
      voice.updateParams(patchParams, this.perfSettings);
    } else {
      voice.updateParams(this.params, this.perfSettings);
    }

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const effectiveLastFreq = this.lastFrequency === 0 ? freq : this.lastFrequency;
    
    const bendSemitones = (this.currentPitchBend / 8192) * this.perfSettings.pitchBendRange;
    voice.setPitchBend(bendSemitones);
    
    voice.triggerAttack(midiNote, effectiveLastFreq, this.ctx.currentTime, isLegatoContext, velocity);
    this.lastFrequency = freq;
    return voice;
  }

  noteOff(midiNote: number, patchId?: string | null) {
    if (this.activeMulti && !patchId) {
      this.activeMulti.slots.forEach((slot, index) => {
        const key = `slot_${index}`;
        const arp = this.activeArps.get(key);
        if (arp) {
          arp.heldNotes = arp.heldNotes.filter(n => n !== midiNote);
          arp.playedNotes = arp.playedNotes.filter(n => n !== midiNote);
          arp.isCacheDirty = true;
          if (arp.heldNotes.length === 0) {
            this.stopArpInstance(key);
          }
        }
      });

      // Find all voices triggered by this original key note
      // EXCEPT voices belonging to slot(s) where arpeggiator is active
      const matchingVoices = this.voices.filter(v => {
        if (v.originalMidiNote !== midiNote) return false;
        if (patchId && v.currentPatchId !== patchId) return false;
        if (v.currentPatchId && this.activeMulti) {
          const slotIndex = this.slotIndexByPatchIdMap.has(v.currentPatchId) ? this.slotIndexByPatchIdMap.get(v.currentPatchId)! : -1;
          if (slotIndex !== -1) {
            const patch = this.patchMap.get(v.currentPatchId);
            if (patch && patch.params.arpEnabled) {
              return false; // let the arp handle its note-off
            }
          }
        }
        return true;
      });

      if (matchingVoices.length > 0 && this.ctx) {
        matchingVoices.forEach(voice => {
          if (!voice.isReleasing) {
            voice.triggerRelease(this.ctx!.currentTime);
          }
        });
        this.lastReleaseTime = this.ctx.currentTime;
      }
      return;
    }

    const arpKey = patchId ? `patch_${patchId}` : "single";
    const singleArp = this.activeArps.get(arpKey);
    if (singleArp) {
      singleArp.heldNotes = singleArp.heldNotes.filter(n => n !== midiNote);
      singleArp.playedNotes = singleArp.playedNotes.filter(n => n !== midiNote);
      if (singleArp.heldNotes.length === 0) {
        this.stopArpInstance(arpKey);
      }
      return;
    }

    // Match even releasing voices to keep noteOff idempotent and prevent state desync
    const matchingVoices = this.voices.filter(v => 
      v.midiNote === midiNote && (!patchId || v.currentPatchId === patchId)
    );
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

  private startArpInstance(key: string, slotIndex: number, patchId: string | null, patchParams: VoiceParams) {
    let arp = this.activeArps.get(key);
    if (!arp) {
      arp = {
        heldNotes: [],
        playedNotes: [],
        arpTimer: null,
        arpIndex: -1,
        arpDirection: 1,
        slotIndex,
        patchId,
        patchParams
      };
      this.activeArps.set(key, arp);
    } else {
      arp.patchParams = patchParams;
    }

    if (arp.arpTimer) return;
    arp.arpIndex = -1;
    arp.arpDirection = 1;

    // Tick once immediately
    this.tickArpInstance(key);

    const interval = arp.patchParams.arpSync
      ? this.getIntervalFromBPM(arp.patchParams.bpm, arp.patchParams.arpSyncDivision)
      : 60000 / (arp.patchParams.arpRate * 4);

    arp.arpTimer = window.setInterval(() => this.tickArpInstance(key), interval);
  }

  private stopArpInstance(key: string) {
    const arp = this.activeArps.get(key);
    if (arp) {
      if (arp.arpTimer) {
        clearInterval(arp.arpTimer);
        arp.arpTimer = null;
      }
      this.allNotesOffForSlot(arp.patchId);
      this.activeArps.delete(key);
    }
  }

  private allNotesOffForSlot(patchId: string | null) {
    this.voices.forEach(voice => {
      if (voice.midiNote !== null && !voice.isReleasing) {
        if (patchId === null || voice.currentPatchId === patchId) {
          voice.triggerRelease(this.ctx!.currentTime);
        }
      }
    });
  }

  panic() {
    Array.from(this.activeArps.keys()).forEach(key => {
      this.stopArpInstance(key);
    });
    this.activeArps.clear();
    this.voices.forEach((voice) => {
      voice.stop();
    });
  }

  private tickArpInstance(key: string) {
    if (!this.ctx) return;
    const arp = this.activeArps.get(key);
    if (!arp || arp.heldNotes.length === 0) return;

    const notes = this.getArpNotesForInstance(arp);
    if (notes.length === 0) return;

    const { arpMode } = arp.patchParams;
    let notesToPlay: number[] = [];

    if (arpMode === 'chord') {
      notesToPlay = [...notes];
    } else {
      this.advanceArpIndexForInstance(arp, notes.length);
      notesToPlay = [notes[arp.arpIndex]];
    }

    if (arpMode !== 'up-poly' && arpMode !== 'down-poly' && arpMode !== 'chord') {
      this.allNotesOffForSlot(arp.patchId);
    }

    const interval = arp.patchParams.arpSync
      ? this.getIntervalFromBPM(arp.patchParams.bpm, arp.patchParams.arpSyncDivision)
      : (60000 / (arp.patchParams.arpRate * 4));

    notesToPlay.forEach(midiNote => {
      let playedNote = midiNote;
      let mappedVelocity = 0.8;
      
      if (arp.slotIndex >= 0 && this.activeMulti) {
        const slot = this.activeMulti.slots[arp.slotIndex];
        if (slot) {
          playedNote = midiNote + (slot.transposeOctave || 0) * 12 + (slot.transposeNote || 0);
          const incomingVel127 = Math.round(0.8 * 127);
          if (slot.highVelocity !== slot.lowVelocity) {
            const t = (incomingVel127 - slot.lowVelocity) / (slot.highVelocity - slot.lowVelocity);
            const mappedVel127 = slot.lowMapVelocity + t * (slot.highMapVelocity - slot.lowMapVelocity);
            mappedVelocity = Math.max(0, Math.min(127, mappedVel127)) / 127;
          } else {
            mappedVelocity = slot.lowMapVelocity / 127;
          }
        }
      }

      if (playedNote < 0 || playedNote > 127) return;

      const voice = this.internalNoteOn(playedNote, mappedVelocity, arp.patchId, arp.patchParams, midiNote);
      if (voice) {
        const gateTime = interval * 0.8;
        setTimeout(() => {
          if (voice.midiNote === playedNote && !voice.isReleasing) {
            voice.triggerRelease(this.ctx!.currentTime);
          }
        }, gateTime);
      }
    });
  }

  private advanceArpIndexForInstance(arp: ArpState, length: number) {
    const { arpMode } = arp.patchParams;
    
    if (arpMode === 'random') {
      arp.arpIndex = Math.floor(Math.random() * length);
    } else if (arpMode === 'up-down') {
      arp.arpIndex += arp.arpDirection;
      if (arp.arpIndex >= length) {
        arp.arpIndex = Math.max(0, length - 2);
        arp.arpDirection = -1;
      } else if (arp.arpIndex < 0) {
        arp.arpIndex = Math.min(length - 1, 1);
        arp.arpDirection = 1;
      }
    } else if (arpMode === 'up' || arpMode === 'up-poly' || arpMode === 'as-played') {
      arp.arpIndex = (arp.arpIndex + 1) % length;
    } else if (arpMode === 'down' || arpMode === 'down-poly') {
      arp.arpIndex = (arp.arpIndex - 1 + length) % length;
      if (arp.arpIndex < 0) arp.arpIndex = length - 1;
    }
  }

  private getArpNotesForInstance(arp: ArpState): number[] {
    if (!arp.isCacheDirty && arp.cachedNotes) {
      return arp.cachedNotes;
    }

    const isAsPlayed = arp.patchParams.arpMode === 'as-played';
    const baseNotes = isAsPlayed ? arp.playedNotes : arp.heldNotes;
    if (baseNotes.length === 0) {
      arp.cachedNotes = [];
      arp.isCacheDirty = false;
      return arp.cachedNotes;
    }

    const range = arp.patchParams.arpRange || 1;
    const allNotes: number[] = [];
    for (let i = 0; i < range; i++) {
      const octave = i * 12;
      for (let j = 0; j < baseNotes.length; j++) {
        allNotes.push(baseNotes[j] + octave);
      }
    }
    
    if (!isAsPlayed) {
      allNotes.sort((a, b) => a - b);
    }
    
    arp.cachedNotes = allNotes;
    arp.isCacheDirty = false;
    return arp.cachedNotes;
  }
}
