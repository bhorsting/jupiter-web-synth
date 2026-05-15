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
  private vco1Noise: AudioBufferSourceNode | null = null;
  private vco2Noise: AudioBufferSourceNode | null = null;
  private vco1Gain: GainNode;
  private vco2Gain: GainNode;
  private vco1NoiseGain: GainNode;
  private vco2NoiseGain: GainNode;
  private filter: BiquadFilterNode;
  private vca: GainNode;
  private output: GainNode;
  private filterLfoMod: GainNode;
  private vcaLfoMod: GainNode;
  private vcoLfoMod: GainNode;
  private crossModGain: GainNode;
  private params: VoiceParams;
  private perfSettings: PerformanceSettings;
  private pitchBendOffset: number = 0; // in semitones
  private velocity: number = 1;

  // State for voice management
  public midiNote: number | null = null;
  public startTime: number = 0;
  public isReleasing: boolean = false;
  private sharedNoiseBuffer: AudioBuffer | null;

  constructor(ctx: AudioContext, destination: AudioNode, params: VoiceParams, settings: PerformanceSettings, lfoModBus: AudioNode, sharedNoiseBuffer: AudioBuffer | null) {
    this.ctx = ctx;
    this.params = params;
    this.perfSettings = settings;
    this.sharedNoiseBuffer = sharedNoiseBuffer;

    this.vco1Gain = ctx.createGain();
    this.vco2Gain = ctx.createGain();
    this.vco1NoiseGain = ctx.createGain();
    this.vco2NoiseGain = ctx.createGain();

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

    const isVco1Noise = params.vco1Waveform === 'noise';
    const isVco2Noise = params.vco2Waveform === 'noise';

    if (this.vco1 && !isVco1Noise) {
      this.vco1.type = params.vco1Waveform === 'pulse' ? 'square' : params.vco1Waveform as OscillatorType;
      
      // Update VCO1 Frequency in real-time
      if (this.midiNote !== null) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const range1 = 8 / params.vco1Range;
        const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
        const targetFreq1 = freq * range1 * Math.pow(2, params.vco1Freq / 12) * bendFactor;
        this.vco1.frequency.setTargetAtTime(Math.max(1, targetFreq1), time, 0.02);
      }
    }
    
    if (this.vco2 && !isVco2Noise) {
      this.vco2.type = params.vco2Waveform === 'pulse' ? 'square' : params.vco2Waveform as OscillatorType;

      // Update VCO2 Frequency in real-time
      if (this.midiNote !== null) {
        const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
        const range2 = 8 / params.vco2Range;
        const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
        const targetFreq2 = freq * range2 * Math.pow(2, (params.vco2Freq + (params.vco2Detune / 100)) / 12) * bendFactor;
        this.vco2.frequency.setTargetAtTime(Math.max(1, targetFreq2), time, 0.02);
      }
    }

    const vco1Level = (1.0 - params.vcoMix) * params.mixerVco1;
    const vco2Level = params.vcoMix * params.mixerVco2;

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
      this.vca.gain.setTargetAtTime(Math.max(0.0001, params.env2Sustain * velocityScale), time, 0.05);
      
      // Incorporate vcaLevel as a constant offset/initial gain
      this.output.gain.setTargetAtTime(params.vcaLevel, time, 0.05);
    }

    // LFO Modulations
    this.filterLfoMod.gain.setTargetAtTime(params.filterLfoAmount * 5000, time, 0.05);
    this.vcaLfoMod.gain.setTargetAtTime(params.vcaLfoAmount, time, 0.05);
    this.vcoLfoMod.gain.setTargetAtTime(params.vcoLfoAmount * 100, time, 0.05); 
    this.crossModGain.gain.setTargetAtTime(params.crossMod * 5000, time, 0.05);
  }

  triggerAttack(midiNote: number, lastFreq: number, time: number, isLegato: boolean = false, velocity: number = 1) {
    // Kill existing transient nodes if any
    this.killTransientNodes(time);

    this.midiNote = midiNote;
    this.startTime = time;
    this.isReleasing = false;
    this.velocity = velocity;

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    
    this.vco1 = this.ctx.createOscillator();
    this.vco2 = this.ctx.createOscillator();
    this.vco1Noise = this.ctx.createBufferSource();
    this.vco2Noise = this.ctx.createBufferSource();
    
    if (this.sharedNoiseBuffer) {
      this.vco1Noise.buffer = this.sharedNoiseBuffer;
      this.vco2Noise.buffer = this.sharedNoiseBuffer;
    }
    this.vco1Noise.loop = true;
    this.vco2Noise.loop = true;

    this.vco1.connect(this.vco1Gain);
    this.vco2.connect(this.vco2Gain);
    this.vco1Noise.connect(this.vco1NoiseGain);
    this.vco2Noise.connect(this.vco2NoiseGain);

    // Connect LFO Mod to VCOs
    this.vcoLfoMod.connect(this.vco1.frequency);
    this.vcoLfoMod.connect(this.vco2.frequency);

    // Cross modulation: VCO2 modulates VCO1 frequency
    if (this.vco2) this.vco2.connect(this.crossModGain);
    if (this.vco2Noise) this.vco2Noise.connect(this.crossModGain);
    this.crossModGain.connect(this.vco1!.frequency);

    const { 
      env1Attack, env1Decay, env1Sustain, 
      env2Attack, env2Decay, env2Sustain, 
      filterCutoff, filterEnvAmount, filterEnvSource,
      vco1Range, vco1Freq,
      vco2Range, vco2Freq, vco2Detune,
      portamentoTime, portamentoMode,
      vco1Waveform, vco2Waveform
    } = this.params;

    this.vco1.type = vco1Waveform === 'pulse' ? 'square' : vco1Waveform as OscillatorType;
    this.vco2.type = vco2Waveform === 'pulse' ? 'square' : vco2Waveform as OscillatorType;

    const range1 = 8 / vco1Range;
    const range2 = 8 / vco2Range;

    const prevFreq1 = Math.max(1, lastFreq * range1 * Math.pow(2, vco1Freq / 12));
    const prevFreq2 = Math.max(1, lastFreq * range2 * Math.pow(2, (vco2Freq + (vco2Detune / 100)) / 12));

    const targetFreq1 = Math.max(1, freq * range1 * Math.pow(2, vco1Freq / 12));
    const targetFreq2 = Math.max(1, freq * range2 * Math.pow(2, (vco2Freq + (vco2Detune / 100)) / 12));

    const useGlide = (portamentoMode === 'off' ? false : (portamentoMode === 'on' || (portamentoMode === 'auto' && isLegato))) && lastFreq > 0;
    const glideTime = useGlide ? Math.max(0.002, portamentoTime) : 0;

    // Apply pitch bend
    const bendFactor = Math.pow(2, this.pitchBendOffset / 12);
    const finalFreq1 = targetFreq1 * bendFactor;
    const finalFreq2 = targetFreq2 * bendFactor;

    if (glideTime > 0.005) {
      this.vco1.frequency.cancelScheduledValues(time);
      this.vco2.frequency.cancelScheduledValues(time);
      
      this.vco1.frequency.setValueAtTime(prevFreq1, time);
      this.vco2.frequency.setValueAtTime(prevFreq2, time);
      
      this.vco1.frequency.setTargetAtTime(finalFreq1, time + 0.05, glideTime / 3);
      this.vco2.frequency.setTargetAtTime(finalFreq2, time + 0.05, glideTime / 3);
    } else {
      this.vco1.frequency.setValueAtTime(finalFreq1, time);
      this.vco2.frequency.setValueAtTime(finalFreq2, time);
    }

    // Velocity Scaling
    const velocityScale = 1.0 - (1.0 - velocity) * this.perfSettings.velocitySensitivity;

    // VCA Envelope (Env 2)
    this.vca.gain.cancelScheduledValues(time);
    this.vca.gain.setValueAtTime(this.vca.gain.value, time); 
    this.vca.gain.linearRampToValueAtTime(velocityScale, time + Math.max(0.005, env2Attack));
    this.vca.gain.setTargetAtTime(Math.max(0.0001, env2Sustain * velocityScale), time + Math.max(0.005, env2Attack), Math.max(0.001, env2Decay));

    // Filter Envelope
    const envAttack = filterEnvSource === 'env1' ? env1Attack : env2Attack;
    const envDecay = filterEnvSource === 'env1' ? env1Decay : env2Decay;
    const envSustain = filterEnvSource === 'env1' ? env1Sustain : env2Sustain;

    this.filter.frequency.cancelScheduledValues(time);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, time);
    
    // Keyboard tracking
    const kbdMod = (midiNote - 64) * (this.params.filterKeyboardTrack * 100);
    
    // Velocity also scales filter cutoff for more expression
    const velCutoffMod = (velocity - 1) * this.perfSettings.velocitySensitivity * 5000;
    const baseCutoff = Math.max(20, filterCutoff + velCutoffMod + kbdMod);
    const targetCutoff = Math.min(20000, baseCutoff + filterEnvAmount * 10000);
    
    this.filter.frequency.linearRampToValueAtTime(targetCutoff, time + Math.max(0.001, envAttack));
    const sustainFilterFreq = baseCutoff + (targetCutoff - baseCutoff) * envSustain;
    this.filter.frequency.setTargetAtTime(Math.max(20, sustainFilterFreq), time + Math.max(0.001, envAttack), Math.max(0.001, envDecay));

    this.vco1.start(time);
    this.vco2.start(time);
    this.vco1Noise.start(time);
    this.vco2Noise.start(time);
  }

  setPitchBend(offset: number) {
    this.pitchBendOffset = offset;
    if (this.vco1 && this.vco2 && this.midiNote !== null && !this.isReleasing) {
      const time = this.ctx.currentTime;
      const freq = 440 * Math.pow(2, (this.midiNote - 69) / 12);
      const { vco1Freq, vco1Range, vco2Freq, vco2Range, vco2Detune } = this.params;
      
      const bendFactor = Math.pow(2, offset / 12);
      
      const targetFreq1 = freq * (8/vco1Range) * Math.pow(2, vco1Freq / 12) * bendFactor;
      const targetFreq2 = freq * (8/vco2Range) * Math.pow(2, (vco2Freq + (vco2Detune / 100)) / 12) * bendFactor;

      this.vco1.frequency.setTargetAtTime(targetFreq1, time, 0.02);
      this.vco2.frequency.setTargetAtTime(targetFreq2, time, 0.02);
    }
  }

  private killTransientNodes(time: number) {
    if (this.vco1) {
      try { this.vco1.stop(time); } catch(e) {}
      this.vco1.disconnect();
      this.vco1 = null;
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
  }

  triggerRelease(time: number) {
    this.isReleasing = true;
    const { env1Release, env2Release, filterEnvSource } = this.params;
    const envRelease = filterEnvSource === 'env1' ? env1Release : env2Release;
    
    this.vca.gain.cancelScheduledValues(time);
    this.vca.gain.setValueAtTime(this.vca.gain.value, time);
    this.vca.gain.setTargetAtTime(0, time, Math.max(0.001, env2Release / 3));
    
    this.filter.frequency.cancelScheduledValues(time);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, time);
    this.filter.frequency.setTargetAtTime(this.params.filterCutoff, time, Math.max(0.001, envRelease / 3));
  }
  
  stop() {
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
  
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayGain: GainNode | null = null;
  
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  // Distortion
  private distortion: WaveShaperNode | null = null;
  private distortionGain: GainNode | null = null;
  private distortionDry: GainNode | null = null;

  // Leslie (Rotary)
  private leslieDelay: DelayNode | null = null;
  private leslieLFO: OscillatorNode | null = null;
  private leslieGain: GainNode | null = null;
  private leslieDry: GainNode | null = null;
  private leslieLfoGain: GainNode | null = null;
  private leslieVibGain: GainNode | null = null;

  // Tremolo
  private tremoloLFO: OscillatorNode | null = null;
  private tremoloGain: GainNode | null = null;
  private tremoloDry: GainNode | null = null;
  private tremoloLfoGain: GainNode | null = null;
  
  // Limiter & Compander
  private compressor: DynamicsCompressorNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private volumeGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  constructor(params: VoiceParams, perfSettings: PerformanceSettings) {
    this.params = params;
    this.perfSettings = perfSettings;
  }

  getAnalyser() {
    return this.analyser;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
    
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.volumeGain!);
    this.volumeGain!.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  private setupFX() {
    if (!this.ctx || !this.mainGain) return;

    // Chorus (Very simple single delay line with modulation)
    this.chorus = this.ctx.createDelay(0.1);
    this.chorusGain = this.ctx.createGain();
    this.chorusLFO = this.ctx.createOscillator();
    this.chorusLfoGain = this.ctx.createGain();
    
    this.chorusLFO.frequency.value = 0.5;
    this.chorusLfoGain.gain.value = 0.002;
    this.chorusLFO.connect(this.chorusLfoGain);
    this.chorusLfoGain.connect(this.chorus.delayTime);
    this.chorusLFO.start();

    // Delay
    this.delay = this.ctx.createDelay(2.0);
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
    // MainGain -> Chorus -> Output
    // MainGain -> Delay -> Output
    // MainGain -> Reverb -> Output
    this.mainGain.connect(this.chorus!);
    this.chorus!.connect(this.chorusGain);
    this.chorusGain.connect(this.masterBus!);

    this.mainGain.connect(this.delay!);
    this.delayGain.connect(this.masterBus!);

    this.mainGain.connect(this.reverb!);
    this.reverb!.connect(this.reverbGain!);
    this.reverbGain.connect(this.masterBus!);
    
    // Master Chain starts here: masterBus -> Distortion -> Tremolo -> Leslie -> Compressor

    // Initialize Distortion Nodes
    this.distortion = this.ctx.createWaveShaper();
    this.distortionGain = this.ctx.createGain();
    this.distortionDry = this.ctx.createGain();

    // Sum everything from masterBus into distortion
    const distInput = this.ctx.createGain();
    this.masterBus.connect(distInput);
    
    distInput.connect(this.distortion);
    distInput.connect(this.distortionDry);

    const afterDistortion = this.ctx.createGain();
    this.distortion.connect(this.distortionGain);
    this.distortionGain.connect(afterDistortion);
    this.distortionDry.connect(afterDistortion);

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

    // Leslie stage
    this.leslieDelay = this.ctx.createDelay(0.1);
    this.leslieGain = this.ctx.createGain();
    this.leslieDry = this.ctx.createGain();
    this.leslieLFO = this.ctx.createOscillator();
    this.leslieLfoGain = this.ctx.createGain();
    this.leslieVibGain = this.ctx.createGain();
    
    this.leslieLFO.connect(this.leslieLfoGain);
    this.leslieLFO.connect(this.leslieVibGain);
    this.leslieLfoGain.connect(this.leslieGain.gain);
    this.leslieVibGain.connect(this.leslieDelay.delayTime);
    this.leslieLFO.start();

    tremoloNext.connect(this.leslieDelay);
    this.leslieDelay.connect(this.leslieGain);
    tremoloNext.connect(this.leslieDry);

    const leslieNext = this.ctx.createGain();
    this.leslieGain.connect(leslieNext);
    this.leslieDry.connect(leslieNext);

    // Final to compressor
    leslieNext.connect(this.compressor!);
    
    this.updateFXParams();
  }

  private updateFXParams(oldParams?: VoiceParams) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    if (this.mainLFO) {
      if (this.params.lfoWaveform !== 'random') {
        this.mainLFO.type = this.params.lfoWaveform as OscillatorType;
      } else {
        this.mainLFO.type = 'sine'; // Fallback for now
      }
      this.mainLFO.frequency.setTargetAtTime(this.params.lfoRate, time, 0.05);
    }

    // Chorus
    if (this.chorusLFO && this.chorusLfoGain) {
      let rate = 0.5;
      let depth = 0.002;
      
      if (this.params.chorusMode === 2) {
        rate = 0.8;
        depth = 0.004;
      } else if (this.params.chorusMode === 3) {
        rate = 1.5;
        depth = 0.006;
      }
      
      this.chorusLFO.frequency.setTargetAtTime(rate, time, 0.05);
      this.chorusLfoGain.gain.setTargetAtTime(depth, time, 0.05);
    }

    if (this.chorusGain) this.chorusGain.gain.setTargetAtTime(this.params.chorusMix, time, 0.05);
    
    if (this.delay) this.delay.delayTime.setTargetAtTime(this.params.delayTime, time, 0.05);
    if (this.delayFeedback) this.delayFeedback.gain.setTargetAtTime(this.params.delayFeedback, time, 0.05);
    if (this.delayGain) this.delayGain.gain.setTargetAtTime(this.params.delayMix, time, 0.05);
    
    if (this.reverbGain) this.reverbGain.gain.setTargetAtTime(this.params.reverbMix, time, 0.05);
    
    // Tremolo
    if (this.tremoloLFO) this.tremoloLFO.frequency.setTargetAtTime(this.params.tremoloRate, time, 0.05);
    if (this.tremoloLfoGain && this.tremoloGain && this.tremoloDry) {
      this.tremoloLfoGain.gain.setTargetAtTime(this.params.tremoloDepth * this.params.tremoloMix, time, 0.05);
      this.tremoloGain.gain.setTargetAtTime(this.params.tremoloMix, time, 0.05);
      this.tremoloDry.gain.setTargetAtTime(1.0 - this.params.tremoloMix, time, 0.05);
    }

    // Leslie
    if (this.leslieLFO) this.leslieLFO.frequency.setTargetAtTime(this.params.leslieRate, time, 0.05);
    if (this.leslieLfoGain) this.leslieLfoGain.gain.setTargetAtTime(this.params.leslieDepth * 0.5 * this.params.leslieMix, time, 0.05);
    if (this.leslieVibGain) this.leslieVibGain.gain.setTargetAtTime(this.params.leslieDepth * 0.005 * this.params.leslieMix, time, 0.05);
    if (this.leslieGain && this.leslieDry) {
      this.leslieGain.gain.setTargetAtTime(this.params.leslieMix, time, 0.05);
      this.leslieDry.gain.setTargetAtTime(1.0 - this.params.leslieMix, time, 0.05);
    }
    if (this.leslieDelay) this.leslieDelay.delayTime.setTargetAtTime(0.015, time, 0.05); // baseline delay
    
    if (this.volumeGain) this.volumeGain.gain.setTargetAtTime(this.params.masterVolume, time, 0.05);

    // Distortion
    if (this.distortion && this.distortionGain && this.distortionDry) {
      // Much more aggressive curve
      const amount = this.params.distortionAmount;
      const k = amount * 100;
      const n_samples = 44100;
      const curve = new Float32Array(n_samples);
      for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        // Sigmoid curve with high gain
        curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
      }
      this.distortion.curve = curve;
      this.distortion.oversample = 'none';

      this.distortionGain.gain.setTargetAtTime(this.params.distortionMix, time, 0.05);
      this.distortionDry.gain.setTargetAtTime(1.0 - this.params.distortionMix, time, 0.05);
    }

    // Compander Updates
    if (this.compressor) {
      this.compressor.threshold.setTargetAtTime(this.params.compThreshold, time, 0.05);
      this.compressor.ratio.setTargetAtTime(this.params.compRatio, time, 0.05);
      this.compressor.knee.setTargetAtTime(this.params.compKnee, time, 0.05);
      this.compressor.attack.setTargetAtTime(this.params.compAttack, time, 0.05);
      this.compressor.release.setTargetAtTime(this.params.compRelease, time, 0.05);
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

    // If arpeggiator rate changed and it's running, restart it to apply new rate immediately
    if (this.arpTimer && oldParams.arpRate !== params.arpRate) {
      this.stopArpeggiator();
      this.startArpeggiator();
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
    if (!this.ctx) return;
    const oldCtx = this.ctx;
    this.ctx = null;
    this.voices = [];
    oldCtx.close().then(() => {
      this.init();
    });
  }

  noteOn(midiNote: number, velocity: number = 0.8) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    
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

    // Find if note already exists
    let voice = this.voices.find(v => v.midiNote === midiNote);
    
    if (!voice) {
      // Find a free voice
      voice = this.voices.find(v => v.midiNote === null);
      
      if (!voice) {
        // Voice stealing: find the voice that has been active the longest (including ones in release)
        const releasingVoices = this.voices.filter(v => v.isReleasing);
        if (releasingVoices.length > 0) {
            voice = releasingVoices.sort((a, b) => a.startTime - b.startTime)[0];
        } else {
            voice = this.voices.sort((a, b) => a.startTime - b.startTime)[0];
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

    const voice = this.voices.find(v => v.midiNote === midiNote && !v.isReleasing);
    if (voice && this.ctx) {
      voice.triggerRelease(this.ctx.currentTime);
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
        // @ts-ignore - access private gain for quick implementation
        v.filterLfoMod.gain.setTargetAtTime(totalLfoAmount * 5000, time, 0.05);
      }
    });
  }

  private startArpeggiator() {
    if (this.arpTimer) return;
    this.arpIndex = -1;
    this.arpDirection = 1;
    this.tickArp();
    
    const interval = 60000 / (this.params.arpRate * 4); // assume 16th notes at arpRate BPM
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

    const { arpMode, arpRate } = this.params;
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

    // Trigger specified notes
    notesToPlay.forEach(midiNote => {
      const voice = this.internalNoteOn(midiNote);
      if (voice) {
        // Auto-release for staccato feel
        const gateTime = (60000 / (arpRate * 4)) * 0.8;
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
