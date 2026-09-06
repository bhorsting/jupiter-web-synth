import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings2, Sliders, Cpu, Volume2, Palette, ShieldAlert, Piano, RotateCw, Bluetooth, Cloud, RefreshCw, Trash2, Download, Gauge, Zap, CheckCircle2, AlertTriangle, Info, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { soundfontService, getGoogleDriveApiKey, DEFAULT_SOUNDFONTS } from '../services/SoundfontService';
import type { JupiterEngine } from '../engine/JupiterEngine';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine?: JupiterEngine | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, engine }) => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [midiInputs, setMidiInputs] = useState<{ id: string; name: string }[]>([]);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [isListing, setIsListing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [showDacGuide, setShowDacGuide] = useState(false);
  const [latencyMetrics, setLatencyMetrics] = useState<{
    baseLatencyMs: number;
    outputLatencyMs: number;
    totalLatencyMs: number;
    sampleRate: number;
    bufferSamples: number;
    state: AudioContextState | 'closed';
    isNativeRate: boolean;
  } | null>(null);

  // Poll latency & audio hardware metrics in real-time when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const activeEngine: JupiterEngine | undefined = engine || (window as any).jupiterEngine;
    if (!activeEngine) return;

    const poll = () => {
      const metrics = activeEngine.getLatencyMetrics();
      if (metrics) {
        setLatencyMetrics(metrics);
      }
    };

    poll();
    const interval = setInterval(poll, 400);
    return () => clearInterval(interval);
  }, [isOpen, engine]);

  const loadDownloadedList = async () => {
    try {
      const files = await soundfontService.listDownloadedFiles();
      setDownloadedFiles(files);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDownloadedList();
      if (getGoogleDriveApiKey(settings) && settings.googleDriveFolderId) {
        handleFetchDriveFiles();
      }
    }
  }, [isOpen]);

  const handleFetchDriveFiles = async () => {
    setIsListing(true);
    setSyncError(null);
    try {
      const engine = (window as any).jupiterEngine;
      const res = await soundfontService.syncFromDrive(settings, engine?.ctx);
      setDriveFiles(res.driveFiles);
      setDownloadedFiles(res.downloadedFiles);
    } catch (err: any) {
      setSyncError(err.message || 'Failed to sync files from Google Drive');
    } finally {
      setIsListing(false);
    }
  };

  const handleDownload = async (fileId: string, name: string) => {
    if (!fileId) return;
    setDownloadingFileId(fileId);
    setSyncError(null);
    try {
      await soundfontService.downloadAndSave(fileId, name, settings);
      await loadDownloadedList();
      
      const engine = (window as any).jupiterEngine;
      const ctx = engine?.ctx;
      if (ctx) {
        await soundfontService.preload(name, ctx);
      }
    } catch (err: any) {
      setSyncError(err.message || 'Failed to download file');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDeleteFile = async (name: string) => {
    try {
      await soundfontService.deleteFile(name);
      await loadDownloadedList();
    } catch (err: any) {
      setSyncError(err.message || 'Failed to delete file');
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const mergedFilesMap = new Map<string, { id?: string; name: string; size?: number }>();
  Object.values(DEFAULT_SOUNDFONTS).forEach(sf => {
    mergedFilesMap.set(sf.name, { name: sf.name, size: sf.size });
  });
  downloadedFiles.forEach(name => {
    if (!mergedFilesMap.has(name)) {
      mergedFilesMap.set(name, { name });
    }
  });
  driveFiles.forEach(df => {
    mergedFilesMap.set(df.name, { id: df.id, name: df.name, size: df.size });
  });
  const mergedFiles = Array.from(mergedFilesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (isOpen) {
      const getMappedInputs = (access: MIDIAccess | null) => {
        const list = access ? Array.from(access.inputs.values()).map(input => ({
          id: input.id,
          name: input.name || `MIDI Input ${input.id}`
        })) : [];
        return [
          { id: 'capacitor-shell', name: 'iPad Shell Bridge' },
          ...list
        ];
      };

      if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(access => {
          setMidiInputs(getMappedInputs(access));
          
          access.onstatechange = () => {
            setMidiInputs(getMappedInputs(access));
          };
        }).catch(() => {
          setMidiInputs(getMappedInputs(null));
        });
      } else {
        setMidiInputs(getMappedInputs(null));
      }
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#1a1a1a] border border-zinc-800 w-full max-w-2xl rounded-none overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <Settings2 className="w-5 h-5 text-orange-500" />
                  <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-zinc-100">System Preferences</h2>
                </div>
                <button 
                  onClick={onClose}
                  className="p-1 hover:bg-white/10 rounded-none transition-colors text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                
                {/* Hardware & App Actions */}
                <section className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={() => {
                        try {
                          window.postMessage({ type: 'openBluetoothMidiSettings' }, '*');
                        } catch (e) {}
                        try {
                          window.parent?.postMessage({ type: 'openBluetoothMidiSettings' }, '*');
                        } catch (e) {}
                      }}
                      className="flex items-center justify-center gap-3 py-3 px-4 bg-zinc-900 border border-zinc-800 text-orange-500 hover:text-orange-400 hover:border-orange-500/40 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all cursor-pointer rounded-none active:bg-orange-950/20 shadow-inner outline-none focus:outline-none"
                    >
                      <Bluetooth className="w-4 h-4 text-orange-500" />
                      Setup Bluetooth MIDI
                    </button>
                    <button 
                      onClick={() => {
                        window.location.reload();
                      }}
                      className="flex items-center justify-center gap-3 py-3 px-4 bg-zinc-900 border border-zinc-800 text-[#00e5ff] hover:text-cyan-400 hover:border-cyan-500/40 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all cursor-pointer rounded-none active:bg-cyan-950/20 shadow-inner outline-none focus:outline-none"
                    >
                      <RotateCw className="w-4 h-4 text-[#00e5ff]" />
                      Reload App
                    </button>
                  </div>
                </section>

                {/* MIDI Configuration Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-green-500/80">
                    <Piano className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">MIDI Configuration</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Input Device</label>
                      <select 
                        value={settings.midiInputId}
                        onChange={(e) => updateSettings({ midiInputId: e.target.value })}
                        className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 outline-none focus:border-orange-500/50"
                      >
                        <option value="all">All Available Devices</option>
                        {midiInputs.map(input => (
                          <option key={input.id} value={input.id}>{input.name}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">Listen to incoming message from specific hardware.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">MIDI Channel</label>
                      <select 
                        value={settings.midiChannel}
                        onChange={(e) => updateSettings({ midiChannel: parseInt(e.target.value) })}
                        className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 outline-none focus:border-orange-500/50"
                      >
                        <option value={0}>Omni (All Channels)</option>
                        {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => (
                          <option key={ch} value={ch}>Channel {ch}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">Filter messages by specific channel.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Pitch Bend Range</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="range" min="0" max="24" step="1"
                          value={settings.pitchBendRange}
                          onChange={(e) => updateSettings({ pitchBendRange: parseInt(e.target.value) })}
                          className="flex-1 accent-orange-500"
                        />
                        <span className="text-xs font-mono text-zinc-400 w-8">{settings.pitchBendRange}st</span>
                      </div>
                      <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">Range in semitones for pitch wheel.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Velocity Sensitivity</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="range" min="0" max="1" step="0.01"
                          value={settings.velocitySensitivity}
                          onChange={(e) => updateSettings({ velocitySensitivity: parseFloat(e.target.value) })}
                          className="flex-1 accent-orange-500"
                        />
                        <span className="text-xs font-mono text-zinc-400 w-8">{Math.round(settings.velocitySensitivity * 100)}%</span>
                      </div>
                      <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">How much velocity affects volume/filter.</p>
                    </div>

                    <div className="space-y-2 md:col-span-2 pt-2 border-t border-zinc-800/60">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">microKONTROL Auto-Connect</label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div 
                          onClick={() => updateSettings({ autoConnectMicroKontrol: !settings.autoConnectMicroKontrol })}
                          className={`w-10 h-5 rounded-full transition-colors relative border ${
                            settings.autoConnectMicroKontrol ? 'bg-orange-500 border-orange-400' : 'bg-zinc-800 border-zinc-700'
                          }`}
                        >
                          <div className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full transition-all ${
                            settings.autoConnectMicroKontrol ? 'left-[22px]' : 'left-[4px]'
                          }`} />
                        </div>
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
                          Auto-connect all ports containing "microKONTROL" (USB MIDI)
                        </span>
                      </label>
                      <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight">Automatically connects and listens to all microKONTROL ports in addition to the selected input device.</p>
                    </div>
                  </div>
                </section>

                {/* Performance Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-orange-500/80">
                    <Cpu className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Engine Performance</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Max Polyphony</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="range" 
                          min="1" max="16" step="1"
                          value={settings.maxVoices}
                          onChange={(e) => updateSettings({ maxVoices: parseInt(e.target.value) })}
                          className="flex-1 accent-orange-500"
                        />
                        <span className="text-xs font-mono text-zinc-300 w-8">{settings.maxVoices}</span>
                      </div>
                      <p className="text-[9px] text-zinc-600">Higher voices increase CPU load.</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Sample Rate</label>
                        {latencyMetrics && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            latencyMetrics.isNativeRate
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          }`}>
                            Active: {latencyMetrics.sampleRate.toLocaleString()} Hz {latencyMetrics.isNativeRate ? '• Native' : '• Resampled'}
                          </span>
                        )}
                      </div>
                      <select 
                        value={settings.sampleRate}
                        onChange={(e) => updateSettings({ sampleRate: parseInt(e.target.value) })}
                        className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 outline-none focus:border-orange-500/50"
                      >
                        <option value={0}>Auto / Native DAC Clock (Recommended - No Resampling)</option>
                        <option value={48000}>48000 Hz (Studio Standard / ESI U168XT)</option>
                        <option value={44100}>44100 Hz (Standard CD Quality)</option>
                        <option value={96000}>96000 Hz (Hi-Res Audio)</option>
                        <option value={192000}>192000 Hz (Ultra Hi-Res)</option>
                        <option value={32000}>32000 Hz (Legacy 32k)</option>
                        <option value={22050}>22050 Hz (Low CPU)</option>
                      </select>
                      <p className="text-[9px] text-zinc-500">
                        {settings.sampleRate === 0 
                          ? 'Locks directly to your DAC hardware clock. Bypasses Windows software resamplers to reduce latency.'
                          : 'Selecting a fixed rate when your DAC is running at a different rate adds 20-50ms of resampling buffer delay.'}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Audio Latency Section */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between text-blue-500/80">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Audio Interface & Latency</h3>
                    </div>
                    {latencyMetrics && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-zinc-500">Total Latency:</span>
                        <span className={`font-bold px-1.5 py-0.5 rounded border ${
                          latencyMetrics.totalLatencyMs <= 15
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : latencyMetrics.totalLatencyMs <= 30
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}>
                          {latencyMetrics.totalLatencyMs} ms
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Real-time Hardware Latency Readout Card */}
                  {latencyMetrics && (
                    <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded space-y-2.5">
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-bold">
                          <Gauge className="w-3.5 h-3.5 text-orange-500" />
                          <span>Hardware Buffer & Latency Diagnostic</span>
                        </div>
                        <span className="text-[9px] uppercase font-mono tracking-wider text-zinc-500">
                          Status: <span className="text-emerald-400 font-bold">{latencyMetrics.state.toUpperCase()}</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div className="p-2 bg-black/40 border border-zinc-800/60 rounded">
                          <span className="text-[9px] uppercase text-zinc-500 block">Base Buffer</span>
                          <span className="text-xs font-mono font-bold text-zinc-200">{latencyMetrics.baseLatencyMs} ms</span>
                          <span className="text-[8px] text-zinc-500 block font-mono">({latencyMetrics.bufferSamples} samples)</span>
                        </div>
                        <div className="p-2 bg-black/40 border border-zinc-800/60 rounded">
                          <span className="text-[9px] uppercase text-zinc-500 block">Device Output</span>
                          <span className="text-xs font-mono font-bold text-zinc-200">{latencyMetrics.outputLatencyMs} ms</span>
                          <span className="text-[8px] text-zinc-500 block font-mono">WASAPI Shared</span>
                        </div>
                        <div className="p-2 bg-black/40 border border-zinc-800/60 rounded">
                          <span className="text-[9px] uppercase text-zinc-500 block">System Roundtrip</span>
                          <span className={`text-xs font-mono font-bold ${
                            latencyMetrics.totalLatencyMs <= 15 ? 'text-emerald-400' : latencyMetrics.totalLatencyMs <= 30 ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {latencyMetrics.totalLatencyMs} ms
                          </span>
                          <span className="text-[8px] text-zinc-500 block font-mono">WebAudio Engine</span>
                        </div>
                        <div className="p-2 bg-black/40 border border-zinc-800/60 rounded">
                          <span className="text-[9px] uppercase text-zinc-500 block">Hardware Clock</span>
                          <span className="text-xs font-mono font-bold text-zinc-200">{(latencyMetrics.sampleRate / 1000).toFixed(1)} kHz</span>
                          <span className={`text-[8px] block font-mono font-bold ${latencyMetrics.isNativeRate ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {latencyMetrics.isNativeRate ? 'Bit-Perfect Native' : 'Resampled'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Latency Mode</label>
                      <div className="flex flex-col gap-2">
                        {(['interactive', 'balanced', 'playback', 0] as const).map(mode => (
                          <button
                            key={String(mode)}
                            onClick={() => updateSettings({ latencyHint: mode })}
                            className={`px-3 py-2 rounded text-left text-[10px] uppercase font-bold transition-all border flex items-center justify-between ${
                              settings.latencyHint === mode 
                                ? 'bg-orange-500/10 border-orange-500 text-orange-500' 
                                : 'bg-black/20 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                            }`}
                          >
                            <span>{mode === 0 ? 'Ultra-Low (0 ms / Hardware Minimum)' : mode}</span>
                            {settings.latencyHint === mode && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Surround Output</label>
                      <div className="p-3 bg-black/30 border border-zinc-800 rounded flex flex-col justify-between h-full gap-3">
                        <div>
                          <span className="text-xs font-bold text-zinc-200 block">5.1 Surround Output</span>
                          <p className="text-[10px] text-zinc-500 font-mono mt-1 leading-relaxed">
                            Sends synth audio to front speakers (Ch 1 & 2) and metronome/click track to rear speakers (Ch 5 & 6).
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSettings({ enableSurround51: !settings.enableSurround51 })}
                          className={`w-full py-2 px-3 rounded-none font-mono text-xs font-bold uppercase tracking-wider transition-all border ${
                            settings.enableSurround51
                              ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          5.1 Surround: {settings.enableSurround51 ? 'ENABLED' : 'DISABLED'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ESI U168XT & Windows Latency Guide */}
                  <div className="border border-zinc-800/80 bg-black/40 rounded overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowDacGuide(!showDacGuide)}
                      className="w-full px-3 py-2 flex items-center justify-between text-left text-xs font-bold text-zinc-300 hover:bg-zinc-900/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-orange-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span className="uppercase tracking-wider text-[11px]">ESI U168XT & DAC Zero-Latency Setup Guide</span>
                      </div>
                      {showDacGuide ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                    </button>
                    {showDacGuide && (
                      <div className="p-3 border-t border-zinc-800/80 bg-black/60 space-y-3 text-[11px] text-zinc-400 font-mono leading-relaxed">
                        <div className="space-y-1">
                          <p className="text-zinc-200 font-bold">Why is there latency if my DAC is on Ultra-Low?</p>
                          <p className="text-zinc-400">
                            Browsers cannot run ASIO directly; they use Windows WASAPI Shared Mode. If Windows or Chrome has a mismatched sample rate or large safety buffer, it introduces 20–60 ms of extra delay.
                          </p>
                        </div>
                        <div className="space-y-1.5 border-t border-zinc-800/60 pt-2">
                          <span className="text-orange-400 font-bold block">3 Key Steps to achieve &lt;10ms browser latency:</span>
                          <ol className="list-decimal pl-4 space-y-1.5 text-zinc-300">
                            <li>
                              <strong className="text-zinc-100">Set Sample Rate to Auto / Native DAC Clock</strong> in the dropdown above. This avoids the OS software resampler stage.
                            </li>
                            <li>
                              <strong className="text-zinc-100">Match Windows Sound Setting:</strong> Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-[9px]">Win+R</kbd> &rarr; run <code className="text-amber-300">mmsys.cpl</code> &rarr; double click ESI U168XT &rarr; <em>Advanced</em> tab &rarr; select <strong>24-bit, 48000 Hz</strong> (or your DAC rate) and <strong>uncheck "Enable audio enhancements"</strong>.
                            </li>
                            <li>
                              <strong className="text-zinc-100">Force Chrome Minimal Buffer Size:</strong> Launch Chrome with the command flag:
                              <div className="mt-1 p-1.5 bg-zinc-950 border border-zinc-800 text-emerald-400 font-mono text-[10px] select-all">
                                chrome.exe --audio-buffer-size=128
                              </div>
                              This forces the browser audio renderer to request 128-sample chunks from WASAPI instead of 512–1024 frames.
                            </li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Soundfont & Google Drive Section */}
                <section className="space-y-4 pt-6 border-t border-zinc-800">
                  <div className="flex items-center justify-between text-cyan-400">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Soundfont & MIDI Library (Google Drive Sync)</h3>
                    </div>
                    <label className="cursor-pointer px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 rounded-none">
                      <Download className="w-3 h-3" /> Upload Local (.sf2, .mid)
                      <input
                        type="file"
                        accept=".sf2,.mid,.midi,.sft,.wav,.mp3"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const buf = await file.arrayBuffer();
                            await soundfontService.saveFileToOPFS(file.name, buf);
                            const downloaded = await soundfontService.listDownloadedFiles();
                            setDownloadedFiles(downloaded);
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Folder ID</label>
                    <input 
                      type="text"
                      placeholder="Enter Google Drive Folder ID"
                      value={settings.googleDriveFolderId || ''}
                      onChange={(e) => updateSettings({ googleDriveFolderId: e.target.value })}
                      className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleFetchDriveFiles}
                      disabled={isListing || !getGoogleDriveApiKey(settings) || !settings.googleDriveFolderId}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-cyan-500/40 text-cyan-400 text-xs font-bold uppercase tracking-wider transition-all rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isListing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Syncing Files...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          Sync Drive Files
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={loadDownloadedList}
                      className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider transition-all rounded-none"
                    >
                      Refresh Local Files
                    </button>
                  </div>

                  {syncError && (
                    <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded-none">
                      {syncError}
                    </p>
                  )}

                  {/* Combined Files List */}
                  <div className="bg-black/20 border border-zinc-800 rounded-none overflow-hidden">
                    <div className="bg-zinc-900/40 px-3 py-2 border-b border-zinc-800 flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Active Offline Library</span>
                      <span className="text-[9px] text-zinc-500 font-mono">OPFS LOCAL CACHE ({downloadedFiles.length} FILES)</span>
                    </div>

                    <div className="divide-y divide-zinc-900 max-h-52 overflow-y-auto custom-scrollbar">
                      {driveFiles.length === 0 && downloadedFiles.length === 0 && (
                        <div className="p-4 text-center text-zinc-600 text-xs uppercase tracking-wider">
                          No files found. Configure Drive and Sync or upload a local .sf2 / .mid file.
                        </div>
                      )}

                      {mergedFiles.map(file => {
                        const isDownloaded = downloadedFiles.includes(file.name);
                        const isDownloading = downloadingFileId === file.id;
                        const isMidi = file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi');

                        return (
                          <div key={file.id || file.name} className="px-3 py-2 flex items-center justify-between hover:bg-zinc-900/20 transition-colors">
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 border ${
                                  isMidi 
                                    ? 'bg-amber-950/40 border-amber-800/40 text-amber-400' 
                                    : 'bg-cyan-950/40 border-cyan-800/40 text-cyan-400'
                                }`}>
                                  {isMidi ? 'MIDI' : 'SF2'}
                                </span>
                                <span className="text-xs text-zinc-300 font-medium truncate">{file.name}</span>
                              </div>
                              <span className="text-[9px] text-zinc-500 font-mono mt-0.5">
                                {file.size ? formatSize(file.size) : 'Local offline copy'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isDownloaded ? (
                                <>
                                  <span className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-950/30 border border-emerald-900/40 px-2 py-0.5 rounded-none">
                                    Downloaded
                                  </span>
                                  <button
                                    onClick={() => handleDeleteFile(file.name)}
                                    className="p-1 hover:bg-red-950/40 hover:border-red-900/40 border border-transparent rounded-none text-zinc-500 hover:text-red-400 transition-colors"
                                    title="Delete from cache"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleDownload(file.id!, file.name)}
                                  disabled={isDownloading || !file.id}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-900/40 hover:border-cyan-500/40 rounded-none text-cyan-400 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                                >
                                  {isDownloading ? (
                                    <>
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Syncing...
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-3 h-3" />
                                      Download
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* UI Theme */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-purple-500/80">
                    <Palette className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Visual Appearance</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {['jupiter', 'dark', 'light'].map(t => (
                      <button
                        key={t}
                        onClick={() => updateSettings({ theme: t as any })}
                        className={`px-3 py-3 rounded-none border text-[10px] uppercase font-bold transition-all ${
                          settings.theme === t 
                            ? 'bg-orange-500/10 border-orange-500 text-orange-500' 
                            : 'bg-black/20 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Warning Card */}
                <div className="bg-red-500/5 border border-red-500/20 rounded-none p-3 flex gap-3 items-start">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-red-200/60 leading-relaxed uppercase font-bold tracking-tight">
                      Changing Sample Rate or Latency will restart the audio engine and may cause temporary audio glitching.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <button 
                  onClick={resetSettings}
                  className="text-[10px] uppercase font-bold text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Restore Defaults
                </button>
                <div className="flex gap-3">
                  <button 
                    onClick={onClose}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase tracking-widest rounded-none transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
