import * as React from 'react';
import { Upload, ChevronRight, FileCode, Check } from 'lucide-react';
import { VoiceParams, DX7Voice, DX7Operator, createDefaultDX7Voice, getDX7Algorithm } from '../types';
import { parseDX7SysEx } from '../utils/dx7Parser';

interface DX7PanelProps {
  params: VoiceParams;
  updateParam: (key: keyof VoiceParams, val: any) => void;
  isMidiMappingMode: boolean;
  handleMapClick: (param: keyof VoiceParams) => void;
  getMappedCC: (param: keyof VoiceParams) => string | undefined;
  selectedMapParam: string | null;
}

export const DX7Panel: React.FC<DX7PanelProps> = ({
  params,
  updateParam,
}) => {
  const [activeOp, setActiveOp] = React.useState<number>(0); // 0-5 representing Op1-Op6
  const [bankVoices, setBankVoices] = React.useState<any[]>([]); // parsed SysEx voices
  const [isBankModalOpen, setIsBankModalOpen] = React.useState<boolean>(false);

  const voice = params.dx7Voice || createDefaultDX7Voice();

  const updateDX7Voice = (updater: (prev: DX7Voice) => DX7Voice) => {
    const currentVoice = params.dx7Voice || createDefaultDX7Voice();
    const newVoice = updater(JSON.parse(JSON.stringify(currentVoice)));
    updateParam('dx7Voice', newVoice);
  };

  const updateOperator = (opIdx: number, key: keyof DX7Operator, value: any) => {
    updateDX7Voice((prev) => {
      if (prev.operators[opIdx]) {
        if (key === 'rates' || key === 'levels') {
          prev.operators[opIdx][key] = value;
        } else {
          (prev.operators[opIdx] as any)[key] = value;
        }
      }
      return prev;
    });
  };

  // Handler for SysEx File Import
  const handleSysExUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const data = new Uint8Array(arrayBuffer);
      try {
        const voices = parseDX7SysEx(data);
        if (voices.length === 1) {
          // Single voice SysEx, load it immediately
          updateParam('dx7Voice', voices[0]);
        } else if (voices.length > 1) {
          // 32-voice bank, show selector modal
          setBankVoices(voices);
          setIsBankModalOpen(true);
        }
      } catch (err) {
        console.error("Failed to parse DX7 SysEx:", err);
        alert("Invalid DX7 SysEx file. Ensure it is a valid 32-voice bank (4096 bytes) or single voice (128 bytes) file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const selectBankVoice = (selectedVoice: DX7Voice) => {
    updateParam('dx7Voice', selectedVoice);
    setIsBankModalOpen(false);
  };

  const currentAlg = getDX7Algorithm(voice.algorithm);

  return (
    <div className="flex flex-col lg:flex-row w-full gap-4 p-4 bg-zinc-950/65 border border-zinc-900 rounded-none text-zinc-200">
      
      {/* LEFT PANEL: ALGORITHM & BANK IMPORT */}
      <div className="flex flex-col gap-4 w-full lg:w-[280px] border border-zinc-800 p-3 bg-black/40">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
          <span className="text-xs font-mono font-bold uppercase text-orange-500 tracking-wider">Algorithm & Import</span>
          <span className="text-[10px] font-mono text-zinc-500 font-bold">{voice.name}</span>
        </div>

        {/* Algorithm Select */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-[10px] font-mono font-bold uppercase text-zinc-400">
            <span>Algorithm</span>
            <span className="text-orange-500 text-xs">#{voice.algorithm}</span>
          </div>
          <div className="grid grid-cols-8 gap-1 bg-black p-2 border border-zinc-900">
            {Array.from({ length: 32 }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => updateDX7Voice((v) => { v.algorithm = num; return v; })}
                className={`py-1 text-[9px] font-mono font-bold border transition-all cursor-pointer select-none ${
                  voice.algorithm === num
                    ? 'bg-orange-600 text-white border-orange-500 font-black shadow-md'
                    : 'bg-zinc-900/60 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Algoritm Flowchart Legend */}
        <div className="flex flex-col gap-1.5 p-2 bg-zinc-950 border border-zinc-900 rounded-none">
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Signal Path</span>
          <div className="text-[10px] font-mono flex flex-col gap-1 text-zinc-400">
            <div className="flex justify-between">
              <span>Carriers:</span>
              <span className="text-orange-400 font-bold">
                {currentAlg.carriers.map(c => `OP${c+1}`).join(', ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Feedback OP:</span>
              <span className="text-orange-400 font-bold">
                OP{currentAlg.feedbackSrc + 1} → OP{currentAlg.feedbackDest + 1}
              </span>
            </div>
          </div>
        </div>

        {/* SysEx File Uploader */}
        <div className="flex flex-col gap-2 border-t border-zinc-900 pt-3 mt-1">
          <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">SysEx Import (.syx)</span>
          <label className="flex flex-col items-center justify-center border border-dashed border-zinc-700 hover:border-orange-500 transition-all p-3 bg-zinc-900/30 cursor-pointer text-center group">
            <Upload size={18} className="text-zinc-500 group-hover:text-orange-500 transition-all mb-1" />
            <span className="text-[9px] font-mono text-zinc-400 group-hover:text-zinc-200">Load SysEx Bank / Voice</span>
            <input
              type="file"
              accept=".syx,.bin"
              onChange={handleSysExUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* MIDDLE PANEL: ACTIVE OPERATOR ENVELOPE & OSCILLATOR EDITORS */}
      <div className="flex-1 flex flex-col border border-zinc-800 bg-black/40 p-3">
        {/* Operator Selector Tabstrip */}
        <div className="flex border-b border-zinc-800 pb-2 mb-3 overflow-x-auto gap-1">
          {Array.from({ length: 6 }, (_, i) => 5 - i).map((opIdx) => {
            const isCarrier = currentAlg.carriers.includes(opIdx);
            return (
              <button
                key={opIdx}
                onClick={() => setActiveOp(opIdx)}
                className={`px-3 py-1 text-[10px] font-mono font-bold uppercase border-t border-x transition-all cursor-pointer select-none ${
                  activeOp === opIdx
                    ? 'bg-zinc-900 text-orange-500 border-zinc-800 border-b-zinc-900'
                    : 'bg-zinc-950/40 text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                OP{opIdx + 1} {isCarrier ? '🔊' : '🎹'}
              </button>
            );
          })}
        </div>

        {/* Selected Operator Parameters */}
        {(() => {
          const op = voice.operators[activeOp] || voice.operators[0];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Operator Envelope section */}
              <div className="flex flex-col gap-3 p-3 bg-zinc-950 border border-zinc-900 rounded-none">
                <span className="text-[10px] font-mono font-bold text-orange-500 uppercase tracking-widest">Operator Envelope</span>
                
                {/* Envelope Rates (R1 - R4) */}
                <div className="grid grid-cols-4 gap-2">
                  {op.rates.map((rate, rIdx) => (
                    <div key={rIdx} className="flex flex-col items-center bg-black p-1.5 border border-zinc-900">
                      <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase">R{rIdx+1}</span>
                      <input
                        type="range"
                        min="0"
                        max="99"
                        value={rate}
                        onChange={(e) => {
                          const newRates = [...op.rates];
                          newRates[rIdx] = parseInt(e.target.value);
                          updateOperator(activeOp, 'rates', newRates);
                        }}
                        className="h-20 accent-orange-500 w-3 my-2"
                        style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' } as any}
                      />
                      <span className="text-[9px] font-mono font-bold text-orange-400">{rate}</span>
                    </div>
                  ))}
                </div>

                {/* Envelope Levels (L1 - L4) */}
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {op.levels.map((level, lIdx) => (
                    <div key={lIdx} className="flex flex-col items-center bg-black p-1.5 border border-zinc-900">
                      <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase">L{lIdx+1}</span>
                      <input
                        type="range"
                        min="0"
                        max="99"
                        value={level}
                        onChange={(e) => {
                          const newLevels = [...op.levels];
                          newLevels[lIdx] = parseInt(e.target.value);
                          updateOperator(activeOp, 'levels', newLevels);
                        }}
                        className="h-20 accent-orange-500 w-3 my-2"
                        style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' } as any}
                      />
                      <span className="text-[9px] font-mono font-bold text-orange-400">{level}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operator Oscillator Settings section */}
              <div className="flex flex-col gap-3 p-3 bg-zinc-950 border border-zinc-900 rounded-none justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-orange-500 uppercase tracking-widest">Oscillator Settings</span>
                  
                  {/* Mode Selector (Ratio vs Fixed) */}
                  <div className="flex justify-between items-center bg-black border border-zinc-900 p-2 mt-2 mb-4">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Frequency Mode</span>
                    <div className="flex gap-1 bg-zinc-900/50 p-0.5 border border-zinc-800">
                      <button
                        onClick={() => updateOperator(activeOp, 'mode', 0)}
                        className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase ${
                          op.mode === 0 ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Ratio
                      </button>
                      <button
                        onClick={() => updateOperator(activeOp, 'mode', 1)}
                        className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase ${
                          op.mode === 1 ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Fixed
                      </button>
                    </div>
                  </div>

                  {/* Frequency tuning sliders */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] font-mono font-bold">
                        <span className="text-zinc-400">Coarse Frequency</span>
                        <span className="text-orange-400">{op.coarse}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="31"
                        step="1"
                        value={op.coarse}
                        onChange={(e) => updateOperator(activeOp, 'coarse', parseInt(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] font-mono font-bold">
                        <span className="text-zinc-400">Fine Frequency</span>
                        <span className="text-orange-400">{op.fine}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="99"
                        step="1"
                        value={op.fine}
                        onChange={(e) => updateOperator(activeOp, 'fine', parseInt(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] font-mono font-bold">
                        <span className="text-zinc-400">Detune</span>
                        <span className="text-orange-400">{op.detune > 0 ? `+${op.detune}` : op.detune}</span>
                      </div>
                      <input
                        type="range"
                        min="-7"
                        max="7"
                        step="1"
                        value={op.detune}
                        onChange={(e) => updateOperator(activeOp, 'detune', parseInt(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-zinc-900">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-500 uppercase font-bold">Output Level</span>
                      <span className="text-orange-400 font-bold">{op.level}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="99"
                      value={op.level}
                      onChange={(e) => updateOperator(activeOp, 'level', parseInt(e.target.value))}
                      className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-500 uppercase font-bold">Velocity Sense</span>
                      <span className="text-orange-400 font-bold">{op.velocitySensitivity}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="7"
                      value={op.velocitySensitivity}
                      onChange={(e) => updateOperator(activeOp, 'velocitySensitivity', parseInt(e.target.value))}
                      className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900"
                    />
                  </div>
                </div>

              </div>

            </div>
          );
        })()}
      </div>

      {/* RIGHT PANEL: GLOBAL SETTINGS & CHIPS */}
      <div className="flex flex-col gap-4 w-full lg:w-[260px] border border-zinc-800 bg-black/40 p-3">
        <span className="text-xs font-mono font-bold uppercase text-orange-500 tracking-wider border-b border-zinc-800 pb-2">Global Settings</span>

        <div className="flex flex-col gap-3">
          {/* Feedback */}
          <div className="flex flex-col gap-1 bg-zinc-950 p-2.5 border border-zinc-900">
            <div className="flex justify-between text-[10px] font-mono font-bold">
              <span className="text-zinc-400 uppercase">Feedback</span>
              <span className="text-orange-400">{voice.feedback}</span>
            </div>
            <input
              type="range"
              min="0"
              max="7"
              step="1"
              value={voice.feedback}
              onChange={(e) => updateDX7Voice((v) => { v.feedback = parseInt(e.target.value); return v; })}
              className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900 mt-1"
            />
          </div>

          {/* Transpose */}
          <div className="flex flex-col gap-1 bg-zinc-950 p-2.5 border border-zinc-900">
            <div className="flex justify-between text-[10px] font-mono font-bold">
              <span className="text-zinc-400 uppercase">Transpose</span>
              <span className="text-orange-400">{voice.transpose}</span>
            </div>
            <input
              type="range"
              min="0"
              max="48"
              step="1"
              value={voice.transpose}
              onChange={(e) => updateDX7Voice((v) => { v.transpose = parseInt(e.target.value); return v; })}
              className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900 mt-1"
            />
          </div>

          {/* LFO Speed */}
          <div className="flex flex-col gap-1 bg-zinc-950 p-2.5 border border-zinc-900">
            <div className="flex justify-between text-[10px] font-mono font-bold">
              <span className="text-zinc-400 uppercase">LFO Speed</span>
              <span className="text-orange-400">{voice.lfoSpeed}</span>
            </div>
            <input
              type="range"
              min="0"
              max="99"
              step="1"
              value={voice.lfoSpeed}
              onChange={(e) => updateDX7Voice((v) => { v.lfoSpeed = parseInt(e.target.value); return v; })}
              className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900 mt-1"
            />
          </div>

          {/* LFO Delay */}
          <div className="flex flex-col gap-1 bg-zinc-950 p-2.5 border border-zinc-900">
            <div className="flex justify-between text-[10px] font-mono font-bold">
              <span className="text-zinc-400 uppercase">LFO Delay</span>
              <span className="text-orange-400">{voice.lfoDelay}</span>
            </div>
            <input
              type="range"
              min="0"
              max="99"
              step="1"
              value={voice.lfoDelay}
              onChange={(e) => updateDX7Voice((v) => { v.lfoDelay = parseInt(e.target.value); return v; })}
              className="w-full accent-orange-500 cursor-pointer h-1 bg-zinc-900 mt-1"
            />
          </div>
        </div>
      </div>

      {/* BANK VOICES MODAL SELECTOR */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
          <div className="bg-zinc-950 border-2 border-orange-600 rounded-none w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-900">
              <div className="flex items-center gap-2">
                <FileCode size={18} className="text-orange-500" />
                <h2 className="text-sm font-mono font-bold uppercase text-orange-500">DX7 SysEx Bank Selector</h2>
              </div>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="text-zinc-400 hover:text-white text-xs font-mono font-bold cursor-pointer"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="p-4 bg-zinc-950/40 text-xs font-mono text-zinc-400 border-b border-zinc-900">
              Select a voice from the parsed 32-voice DX7 SysEx Bank file to load into the active patch.
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2 bg-black/60">
              {bankVoices.map((v, idx) => (
                <button
                  key={idx}
                  onClick={() => selectBankVoice(v)}
                  className="flex items-center justify-between p-2.5 bg-zinc-900/40 hover:bg-orange-950/20 border border-zinc-800 hover:border-orange-500/50 transition-all text-left font-mono group cursor-pointer"
                >
                  <span className="text-[10px] text-zinc-500 font-bold pr-2">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="flex-1 text-xs text-zinc-300 group-hover:text-white font-bold tracking-wide truncate">{v.name}</span>
                  <ChevronRight size={14} className="text-zinc-600 group-hover:text-orange-500 transition-all" />
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex justify-end">
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold uppercase tracking-wider text-white border border-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
