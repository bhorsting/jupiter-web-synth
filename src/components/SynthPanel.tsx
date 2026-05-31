import React from 'react';
import { JupiterSlider, JupiterToggle, JupiterSelector, NumericKeypad } from './Controls';
import { VoiceParams } from '../types';
import { AnimatePresence } from 'motion/react';
import { Activity } from 'lucide-react';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

const Section = React.memo<SectionProps>(({ title, children, className = "" }) => (
  <div className={`flex flex-col w-full md:w-auto h-auto lg:h-full bg-black/20 border-r border-synth-border group [contain:content] lg:shrink-0 ${className}`}>
    <div className="h-6 flex items-center px-3 border-b border-synth-border bg-white/5">
      <h3 className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">{title}</h3>
    </div>
    <div className="flex-1 flex gap-2 p-3 bg-gradient-to-b from-transparent to-black/10">
      {children}
    </div>
  </div>
));

interface GlobalSectionProps {
  bpm: number;
  timeSignature: string;
  synthEngine: 'jupiter' | 'hammond';
  updateParam: (key: keyof VoiceParams, val: any) => void;
}

export const GlobalSection = React.memo<GlobalSectionProps>(({ bpm, timeSignature, synthEngine, updateParam }) => {
  const [isKeypadOpen, setIsKeypadOpen] = React.useState(false);

  return (
    <div className="flex border-b border-synth-border p-4 gap-8 items-start bg-zinc-950/50 backdrop-blur-sm">
      <div className="flex flex-col gap-3">
        {/* Master Tempo */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Master Tempo</span>
          <div 
            onClick={() => setIsKeypadOpen(true)}
            className="bg-black border border-zinc-800 px-4 py-2 text-2xl font-mono text-orange-500 cursor-pointer hover:border-orange-500 transition-all flex items-center gap-3 group min-w-[120px]"
          >
            <Activity size={18} className="text-orange-600 animate-pulse" />
            {bpm} 
            <span className="text-[10px] text-zinc-700 group-hover:text-zinc-500 uppercase font-bold">bpm</span>
          </div>
        </div>

        {/* Engine Selection Toggle Switch */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Synthesis Engine</span>
          <div className="flex bg-black/50 p-0.5 shadow-inner">
            <button
              onClick={() => updateParam('synthEngine', 'jupiter')}
              className={`px-3 py-1.5 text-[9px] uppercase font-mono font-bold tracking-widest transition-all cursor-pointer outline-none focus:outline-none ${
                synthEngine === 'jupiter' 
                  ? 'bg-orange-600 text-white shadow shadow-orange-600/20' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              JP-8 Synth
            </button>
            <button
              onClick={() => updateParam('synthEngine', 'hammond')}
              className={`px-3 py-1.5 text-[9px] uppercase font-mono font-bold tracking-widest transition-all cursor-pointer outline-none focus:outline-none ${
                synthEngine === 'hammond' 
                  ? 'bg-orange-600 text-white shadow shadow-orange-600/20' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              B3 Organ
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 self-start pt-1">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Signature</span>
        <JupiterSelector 
          label="" 
          options={['4/4', '3/4', '6/8', '2/4', '5/4', '7/8']} 
          value={timeSignature} 
          onChange={(v) => updateParam('timeSignature', v)} 
        />
      </div>

      <AnimatePresence>
        {isKeypadOpen && (
          <NumericKeypad 
            label="Set Master Tempo"
            value={bpm}
            min={40}
            max={300}
            onSave={(v) => {
              updateParam('bpm', v);
              setIsKeypadOpen(false);
            }}
            onCancel={() => setIsKeypadOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

interface LFOSectionProps {
  lfoWaveform: string;
  lfoRate: number;
  lfoSync: boolean;
  lfoSyncDivision: string;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

const DIVISIONS = ['1/1', '1/2', '1/2t', '1/4', '1/4t', '1/8', '1/8t', '1/16', '1/16t', '1/32'];

export const LFOSection = React.memo<LFOSectionProps>(({
  lfoWaveform, lfoRate, lfoSync, lfoSyncDivision, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => (
  <Section title="LFO">
    <JupiterSelector 
      label="Waveform" 
      options={['sine', 'sawtooth', 'square', 'random']} 
      value={lfoWaveform} 
      onChange={(v) => updateParam('lfoWaveform', v)} 
    />
    <JupiterSlider 
      label="Rate" 
      value={lfoRate} 
      min={0.1} 
      max={50} 
      onChange={(v) => updateParam('lfoRate', v)} 
      color="bg-synth-lfo"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('lfoRate')}
      mappedCC={getMappedCC('lfoRate')}
      isSelected={selectedMapParam === 'lfoRate'}
      disabled={lfoSync}
    />
    <div className="flex flex-col gap-2 items-center justify-center p-1">
      <JupiterToggle 
        label="Sync" 
        active={lfoSync} 
        onChange={(v) => updateParam('lfoSync', v)} 
        color="bg-synth-lfo"
      />
      {lfoSync && (
        <JupiterSelector 
          label="Div" 
          options={DIVISIONS} 
          value={lfoSyncDivision} 
          onChange={(v) => updateParam('lfoSyncDivision', v)} 
        />
      )}
    </div>
  </Section>
));

interface VCO1SectionProps {
  vco1Range: number;
  crossMod: number;
  vco1PulseWidth: number;
  vco1Waveform: string;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const VCO1Section = React.memo<VCO1SectionProps>(({
  vco1Range, crossMod, vco1PulseWidth, vco1Waveform, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => (
  <Section title="VCO-1">
    <JupiterSelector 
      label="Range" 
      options={['16', '8', '4', '2']} 
      value={vco1Range.toString()} 
      onChange={(v) => updateParam('vco1Range', parseInt(v))} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco1Range')}
      mappedCC={getMappedCC('vco1Range')}
      isSelected={selectedMapParam === 'vco1Range'}
    />
    <JupiterSlider 
      label="X-Mod" 
      value={crossMod} 
      min={0} max={1} 
      onChange={(v) => updateParam('crossMod', v)} 
      color="bg-synth-vco"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('crossMod')}
      mappedCC={getMappedCC('crossMod')}
      isSelected={selectedMapParam === 'crossMod'}
    />
    <JupiterSlider 
      label="PW" 
      value={vco1PulseWidth} 
      min={0} max={1} 
      onChange={(v) => updateParam('vco1PulseWidth', v)} 
      color="bg-synth-vco"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco1PulseWidth')}
      mappedCC={getMappedCC('vco1PulseWidth')}
      isSelected={selectedMapParam === 'vco1PulseWidth'}
    />
    <JupiterSelector 
      label="Waveform" 
      options={['sawtooth', 'square', 'pulse', 'triangle', 'sine', 'noise']} 
      value={vco1Waveform} 
      onChange={(v) => updateParam('vco1Waveform', v)} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco1Waveform')}
      mappedCC={getMappedCC('vco1Waveform')}
      isSelected={selectedMapParam === 'vco1Waveform'}
    />
  </Section>
));

interface VCO2SectionProps {
  vco2Range: number;
  vco2Freq: number;
  vco2Detune: number;
  vco2Waveform: string;
  vco2Sync: boolean;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const VCO2Section = React.memo<VCO2SectionProps>(({
  vco2Range, vco2Freq, vco2Detune, vco2Waveform, vco2Sync, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => (
  <Section title="VCO-2">
    <JupiterSelector 
      label="Range" 
      options={['16', '8', '4', '2']} 
      value={vco2Range.toString()} 
      onChange={(v) => updateParam('vco2Range', parseInt(v))} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco2Range')}
      mappedCC={getMappedCC('vco2Range')}
      isSelected={selectedMapParam === 'vco2Range'}
    />
    <JupiterSlider 
      label="Tune" 
      value={vco2Freq} 
      min={-12} max={12} 
      onChange={(v) => updateParam('vco2Freq', v)} 
      color="bg-synth-vco"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco2Freq')}
      mappedCC={getMappedCC('vco2Freq')}
      isSelected={selectedMapParam === 'vco2Freq'}
    />
    <JupiterSlider 
      label="Fine" 
      value={vco2Detune} 
      min={-100} max={100} 
      onChange={(v) => updateParam('vco2Detune', v)} 
      color="bg-synth-vco"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco2Detune')}
      mappedCC={getMappedCC('vco2Detune')}
      isSelected={selectedMapParam === 'vco2Detune'}
    />
    <JupiterSelector 
      label="Waveform" 
      options={['sawtooth', 'square', 'pulse', 'triangle', 'sine', 'noise']} 
      value={vco2Waveform} 
      onChange={(v) => updateParam('vco2Waveform', v)} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vco2Waveform')}
      mappedCC={getMappedCC('vco2Waveform')}
      isSelected={selectedMapParam === 'vco2Waveform'}
    />
    <div className="flex flex-col gap-2 text-center pb-2">
      <JupiterToggle 
        label="Sync" 
        active={vco2Sync} 
        onChange={(v) => updateParam('vco2Sync', v)} 
        color="bg-synth-vco"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick('vco2Sync')}
        mappedCC={getMappedCC('vco2Sync')}
        isSelected={selectedMapParam === 'vco2Sync'}
      />
    </div>
  </Section>
));

interface VCFSectionProps {
  filterCutoff: number;
  filterResonance: number;
  filterEnvAmount: number;
  filterEnvSource: 'env1' | 'env2';
  filterSlope: number;
  filterLfoAmount: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const VCFSection = React.memo<VCFSectionProps>(({
  filterCutoff, filterResonance, filterEnvAmount, filterEnvSource, filterSlope, filterLfoAmount, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => (
  <Section title="VCF">
    <JupiterSlider 
      label="Freq" 
      value={filterCutoff} 
      min={20} max={15000} 
      onChange={(v) => updateParam('filterCutoff', v)} 
      color="bg-synth-vcf"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('filterCutoff')}
      mappedCC={getMappedCC('filterCutoff')}
      isSelected={selectedMapParam === 'filterCutoff'}
    />
    <JupiterSlider 
      label="Res" 
      value={filterResonance} 
      min={0} max={1} 
      onChange={(v) => updateParam('filterResonance', v)} 
      color="bg-synth-vcf"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('filterResonance')}
      mappedCC={getMappedCC('filterResonance')}
      isSelected={selectedMapParam === 'filterResonance'}
    />
    <JupiterSlider 
      label="ENV MOD" 
      value={filterEnvAmount} 
      min={0} max={1} 
      onChange={(v) => updateParam('filterEnvAmount', v)} 
      color="bg-synth-vcf"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('filterEnvAmount')}
      mappedCC={getMappedCC('filterEnvAmount')}
      isSelected={selectedMapParam === 'filterEnvAmount'}
    />
    <div className="flex flex-col gap-6 items-center justify-center px-1">
      <div className="flex flex-col items-center gap-1.5 h-full py-2">
        <span className={`text-[6px] font-bold tracking-tighter uppercase ${filterEnvSource === 'env1' ? 'text-orange-500' : 'text-zinc-600'}`}>ENV-1</span>
        <div 
          onClick={() => updateParam('filterEnvSource', filterEnvSource === 'env1' ? 'env2' : 'env1')}
          className="w-3.5 h-10 bg-black rounded-lg border border-synth-border relative cursor-pointer shadow-inner active:scale-95 transition-transform"
        >
          <div 
            className={`absolute left-0.5 w-2.5 h-4 bg-zinc-600 rounded-md shadow-lg transition-all duration-200 border border-zinc-400 ${
              filterEnvSource === 'env1' ? 'top-0.5' : 'top-[calc(100%-18px)]'
            }`}
          />
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-zinc-800" />
        </div>
        <span className={`text-[6px] font-bold tracking-tighter uppercase ${filterEnvSource === 'env2' ? 'text-orange-500' : 'text-zinc-600'}`}>ENV-2</span>
      </div>
      
      <JupiterToggle 
        label="24dB" 
        active={filterSlope === 24} 
        onChange={() => updateParam('filterSlope', filterSlope === 24 ? 12 : 24)} 
        color="bg-synth-vcf"
        isMidiMappingMode={isMidiMappingMode}
        onMapClick={() => handleMapClick('filterSlope')}
        mappedCC={getMappedCC('filterSlope')}
        isSelected={selectedMapParam === 'filterSlope'}
      />
    </div>
    <JupiterSlider 
      label="LFO" 
      value={filterLfoAmount} 
      min={0} max={1} 
      onChange={(v) => updateParam('filterLfoAmount', v)} 
      color="bg-synth-vcf"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('filterLfoAmount')}
      mappedCC={getMappedCC('filterLfoAmount')}
      isSelected={selectedMapParam === 'filterLfoAmount'}
    />
  </Section>
));

interface EnvelopeSectionProps {
  title: string;
  prefix: 'env1' | 'env2';
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const MixerSection = React.memo<{
  vcoMix: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ vcoMix, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => (
  <Section title="MIXER">
    <JupiterSlider 
      label="Source Mix" 
      value={vcoMix} 
      min={0} max={1} 
      onChange={(v) => updateParam('vcoMix', v)} 
      color="bg-zinc-600"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vcoMix')}
      mappedCC={getMappedCC('vcoMix')}
      isSelected={selectedMapParam === 'vcoMix'}
    />
  </Section>
));

export const VCASection = React.memo<{
  vcaLevel: number;
  vcaLfoAmount: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ vcaLevel, vcaLfoAmount, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => (
  <Section title="VCA">
    <JupiterSlider 
      label="Level" 
      value={vcaLevel} 
      min={0} max={1} 
      onChange={(v) => updateParam('vcaLevel', v)}
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vcaLevel')}
      mappedCC={getMappedCC('vcaLevel')}
      isSelected={selectedMapParam === 'vcaLevel'}
    />
    <JupiterSlider 
      label="LFO" 
      value={vcaLfoAmount} 
      min={0} max={1} 
      onChange={(v) => updateParam('vcaLfoAmount', v)}
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vcaLfoAmount')}
      mappedCC={getMappedCC('vcaLfoAmount')}
      isSelected={selectedMapParam === 'vcaLfoAmount'}
    />
  </Section>
));

export const VolumeSection = React.memo<{
  masterVolume: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ masterVolume, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => (
  <Section title="VOLUME">
    <JupiterSlider 
      label="Master" 
      value={masterVolume} 
      min={0} max={1} 
      onChange={(v) => updateParam('masterVolume', v)} 
      color="bg-white"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('masterVolume')}
      mappedCC={getMappedCC('masterVolume')}
      isSelected={selectedMapParam === 'masterVolume'}
    />
  </Section>
));

export const VCOModSection = React.memo<{
  portamentoTime: number;
  portamentoMode: string;
  vcoLfoAmount: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ portamentoTime, portamentoMode, vcoLfoAmount, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => (
  <Section title="VCO-MOD">
    <JupiterSlider 
      label="LFO" 
      value={vcoLfoAmount} 
      min={0} max={1} 
      onChange={(v) => updateParam('vcoLfoAmount', v)} 
      color="bg-synth-vco"
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('vcoLfoAmount')}
      mappedCC={getMappedCC('vcoLfoAmount')}
      isSelected={selectedMapParam === 'vcoLfoAmount'}
    />
    <JupiterSlider 
      label="Porta Time" 
      value={portamentoTime} 
      min={0} max={2} 
      onChange={(v) => updateParam('portamentoTime', v)} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('portamentoTime')}
      mappedCC={getMappedCC('portamentoTime')}
      isSelected={selectedMapParam === 'portamentoTime'}
    />
    <JupiterSelector 
      label="Porta Mode" 
      options={['off', 'on', 'auto']} 
      value={portamentoMode} 
      onChange={(v) => updateParam('portamentoMode', v)} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('portamentoMode')}
      mappedCC={getMappedCC('portamentoMode')}
      isSelected={selectedMapParam === 'portamentoMode'}
    />
  </Section>
));

export const ArpSection = React.memo<{
  enabled: boolean;
  rate: number;
  mode: string;
  range: number;
  bpm: number;
  sync: boolean;
  syncDivision: string;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ enabled, rate, mode, range, bpm, sync, syncDivision, timeSignature, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => (
  <Section title="ARPEGGIO">
    <div className="flex flex-col gap-2 text-center pb-2">
      <JupiterToggle 
        label="On" 
        active={enabled} 
        onChange={() => updateParam('arpEnabled', !enabled)} 
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick('arpEnabled')}
        mappedCC={getMappedCC('arpEnabled')}
        isSelected={selectedMapParam === 'arpEnabled'}
      />
      <JupiterToggle 
        label="Sync" 
        active={sync} 
        onChange={(v) => updateParam('arpSync', v)} 
        color="bg-orange-500"
      />
    </div>

    {!sync ? (
      <JupiterSlider 
        label="Rate" 
        value={rate} 
        min={40} max={300} 
        onChange={(v) => updateParam('arpRate', v)} 
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick('arpRate')}
        mappedCC={getMappedCC('arpRate')}
        isSelected={selectedMapParam === 'arpRate'}
      />
    ) : (
      <JupiterSelector 
        label="Div" 
        options={DIVISIONS} 
        value={syncDivision} 
        onChange={(v) => updateParam('arpSyncDivision', v)} 
      />
    )}
    
    <JupiterSelector 
      label="Mode" 
      options={['up', 'down', 'up-down', 'random', 'chord', 'as-played', 'up-poly', 'down-poly']} 
      value={mode} 
      onChange={(v) => updateParam('arpMode', v)} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('arpMode')}
      mappedCC={getMappedCC('arpMode')}
      isSelected={selectedMapParam === 'arpMode'}
    />
    <JupiterSelector 
      label="Range" 
      options={['1', '2', '3', '4']} 
      value={range.toString()} 
      onChange={(v) => updateParam('arpRange', parseInt(v))} 
      isMapMode={isMidiMappingMode}
      onMapClick={() => handleMapClick('arpRange')}
      mappedCC={getMappedCC('arpRange')}
      isSelected={selectedMapParam === 'arpRange'}
    />
  </Section>
));

export const FXSection = React.memo<{
  label: string;
  mix: number;
  enabled?: boolean;
  params: { label: string; key: keyof VoiceParams; value: number; min: number; max: number }[];
  selectors?: { label: string; key: keyof VoiceParams; options: string[]; value: any }[];
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ label, mix, enabled, params, selectors, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => {
  const mixKey = (label === 'Overdrive' ? 'distortion' : label.toLowerCase()) + 'Mix' as keyof VoiceParams;
  
  return (
    <Section title={label}>
      <JupiterSlider 
        label="Mix" 
        value={mix} 
        min={0} max={1} 
        onChange={(v) => updateParam(mixKey, v)} 
        color="bg-purple-600"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick(mixKey)}
        mappedCC={getMappedCC(mixKey)}
        isSelected={selectedMapParam === mixKey}
      />
      {selectors?.map(s => (
        <JupiterSelector 
          key={s.key}
          label={s.label}
          options={s.options}
          value={s.value.toString()}
          onChange={(v) => {
            const val = isNaN(parseInt(v)) ? v : parseInt(v);
            updateParam(s.key, val);
          }}
          isMapMode={isMidiMappingMode}
          onMapClick={() => handleMapClick(s.key)}
          mappedCC={getMappedCC(s.key)}
          isSelected={selectedMapParam === s.key}
        />
      ))}
      {params.map(p => (
        <JupiterSlider 
          key={p.key}
          label={p.label} 
          value={p.value} 
          min={p.min} max={p.max} 
          onChange={(v) => updateParam(p.key, v)} 
          isMapMode={isMidiMappingMode}
          onMapClick={() => handleMapClick(p.key)}
          mappedCC={getMappedCC(p.key)}
          isSelected={selectedMapParam === p.key}
        />
      ))}
    </Section>
  );
});

export const EnvelopeSection = React.memo<EnvelopeSectionProps>(({
  title, prefix, attack, decay, sustain, release, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => {
  const aKey = `${prefix}Attack` as keyof VoiceParams;
  const dKey = `${prefix}Decay` as keyof VoiceParams;
  const sKey = `${prefix}Sustain` as keyof VoiceParams;
  const rKey = `${prefix}Release` as keyof VoiceParams;

  return (
    <Section title={title}>
      <JupiterSlider 
        label="A" 
        value={attack} 
        min={0.001} max={10} 
        onChange={(v) => updateParam(aKey, v)} 
        color="bg-synth-env"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick(aKey)}
        mappedCC={getMappedCC(aKey)}
        isSelected={selectedMapParam === aKey}
      />
      <JupiterSlider 
        label="D" 
        value={decay} 
        min={0.001} max={10} 
        onChange={(v) => updateParam(dKey, v)} 
        color="bg-synth-env"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick(dKey)}
        mappedCC={getMappedCC(dKey)}
        isSelected={selectedMapParam === dKey}
      />
      <JupiterSlider 
        label="S" 
        value={sustain} 
        min={0} max={1} 
        onChange={(v) => updateParam(sKey, v)} 
        color="bg-synth-env"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick(sKey)}
        mappedCC={getMappedCC(sKey)}
        isSelected={selectedMapParam === sKey}
      />
      <JupiterSlider 
        label="R" 
        value={release} 
        min={0.001} max={10} 
        onChange={(v) => updateParam(rKey, v)} 
        color="bg-synth-env"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick(rKey)}
        mappedCC={getMappedCC(rKey)}
        isSelected={selectedMapParam === rKey}
      />
    </Section>
  );
});

interface HammondDrawbarsSectionProps {
  db16: number;
  db513: number;
  db8: number;
  db4: number;
  db223: number;
  db2: number;
  db135: number;
  db113: number;
  db1: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const HammondDrawbarsSection = React.memo<HammondDrawbarsSectionProps>(({
  db16, db513, db8, db4, db223, db2, db135, db113, db1,
  updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => {
  const drawbars = [
    { key: 'hammondDb16' as const, label: "16'", color: 'bg-amber-800 text-amber-100 hover:bg-amber-700' },
    { key: 'hammondDb513' as const, label: "5 ⅓'", color: 'bg-amber-800 text-amber-100 hover:bg-amber-700' },
    { key: 'hammondDb8' as const, label: "8'", color: 'bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-300' },
    { key: 'hammondDb4' as const, label: "4'", color: 'bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-300' },
    { key: 'hammondDb223' as const, label: "2 ⅔'", color: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-600' },
    { key: 'hammondDb2' as const, label: "2'", color: 'bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-300' },
    { key: 'hammondDb135' as const, label: "1 ⅗'", color: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-600' },
    { key: 'hammondDb113' as const, label: "1 ⅓'", color: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-600' },
    { key: 'hammondDb1' as const, label: "1'", color: 'bg-white text-zinc-900 hover:bg-zinc-100 border border-zinc-300' }
  ];

  const values = [db16, db513, db8, db4, db223, db2, db135, db113, db1];

  return (
    <Section title="Drawbars" className="md:col-span-2">
      <div className="flex gap-2 w-full justify-between sm:justify-around max-w-4xl mx-auto px-4">
        {drawbars.map((db, idx) => (
          <div key={db.key} className="flex flex-col items-center">
            <JupiterSlider 
              label={db.label}
              value={values[idx]}
              min={0}
              max={8}
              step={1}
              color={db.color}
              isSmall={true}
              onChange={(val) => updateParam(db.key, Math.round(val))}
              isMapMode={isMidiMappingMode}
              onMapClick={() => handleMapClick(db.key)}
              mappedCC={getMappedCC(db.key)}
              isSelected={selectedMapParam === db.key}
            />
            <div className="text-[10px] font-mono text-zinc-500 font-bold -mt-8">
              {Math.round(values[idx])}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
});

interface HammondPercussionSectionProps {
  percussionEnabled: boolean;
  percussionHarmonic: 'second' | 'third';
  percussionDecay: 'fast' | 'slow';
  percussionVolume: 'soft' | 'normal';
  keyClick: number;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const HammondPercussionSection = React.memo<HammondPercussionSectionProps>(({
  percussionEnabled, percussionHarmonic, percussionDecay, percussionVolume, keyClick,
  updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam
}) => {
  return (
    <Section title="Percussion & Click">
      <div className="flex flex-col gap-4 justify-center items-center px-2 min-w-[80px]">
        <JupiterToggle 
          label="Perc On"
          active={percussionEnabled}
          onChange={(v) => updateParam('hammondPercussionEnabled', v)}
          color="bg-orange-500"
        />
        {percussionEnabled && (
          <div className="flex flex-col gap-1.5 mt-2 bg-black/45 p-2 rounded border border-zinc-800">
            <JupiterSelector 
              label="Harmonic"
              options={['second', 'third']}
              value={percussionHarmonic}
              onChange={(v) => updateParam('hammondPercussionHarmonic', v)}
            />
            <JupiterSelector 
              label="Decay"
              options={['fast', 'slow']}
              value={percussionDecay}
              onChange={(v) => updateParam('hammondPercussionDecay', v)}
            />
            <JupiterSelector 
              label="Volume"
              options={['soft', 'normal']}
              value={percussionVolume}
              onChange={(v) => updateParam('hammondPercussionVolume', v)}
            />
          </div>
        )}
      </div>

      <JupiterSlider 
        label="Key Click"
        value={keyClick}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => updateParam('hammondKeyClick', v)}
        color="bg-amber-600"
        isMapMode={isMidiMappingMode}
        onMapClick={() => handleMapClick('hammondKeyClick')}
        mappedCC={getMappedCC('hammondKeyClick')}
        isSelected={selectedMapParam === 'hammondKeyClick'}
      />
    </Section>
  );
});

export const EQSection = React.memo<{
  params: VoiceParams;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}>(({ params, updateParam, isMidiMappingMode, handleMapClick, getMappedCC, selectedMapParam }) => {
  const eqBands: { label: string; freq: string; key: keyof VoiceParams }[] = [
    { label: 'Low', freq: '80Hz', key: 'eqBand1' },
    { label: 'L-Mid', freq: '250Hz', key: 'eqBand2' },
    { label: 'Mid', freq: '1kHz', key: 'eqBand3' },
    { label: 'H-Mid', freq: '4kHz', key: 'eqBand4' },
    { label: 'High', freq: '12kHz', key: 'eqBand5' },
  ];

  return (
    <Section title="Master EQ" className="min-w-[280px]">
      <div className="flex gap-2 h-full items-stretch justify-around w-full">
        {eqBands.map(band => (
          <div key={band.key} className="flex flex-col items-center justify-between h-full min-h-[190px]">
            <div className="flex-1 flex flex-col justify-center h-full">
              <JupiterSlider 
                label={band.label}
                value={params[band.key] as number ?? 0}
                min={-12} max={12} step={1}
                onChange={(v) => {
                  updateParam(band.key, Math.round(v));
                }}
                color="bg-amber-600"
                isMapMode={isMidiMappingMode}
                onMapClick={() => handleMapClick(band.key)}
                mappedCC={getMappedCC(band.key)}
                isSelected={selectedMapParam === band.key}
              />
            </div>
            <div className="flex flex-col items-center mt-1">
              <span className="text-[9px] font-mono text-zinc-400">{(params[band.key] as number ?? 0) > 0 ? `+${params[band.key] ?? 0}` : params[band.key] ?? 0}dB</span>
              <span className="text-[7px] text-zinc-500 font-bold uppercase">{band.freq}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
});

