import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Settings2, Sliders, Cpu, Volume2, Palette, ShieldAlert, Piano, RotateCw, Bluetooth, Cloud, RefreshCw, Trash2, Download } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { soundfontService, getGoogleDriveApiKey } from '../services/SoundfontService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [midiInputs, setMidiInputs] = useState<{ id: string; name: string }[]>([]);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [isListing, setIsListing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

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
  downloadedFiles.forEach(name => {
    mergedFilesMap.set(name, { name });
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
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Sample Rate</label>
                      <select 
                        value={settings.sampleRate}
                        onChange={(e) => updateSettings({ sampleRate: parseInt(e.target.value) })}
                        className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 outline-none focus:border-orange-500/50"
                      >
                        <option value={22050}>22050 Hz (Low CPU)</option>
                        <option value={32000}>32000 Hz (Standard)</option>
                        <option value={44100}>44100 Hz (High Quality)</option>
                        <option value={48000}>48000 Hz (Studio)</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Audio Latency Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-500/80">
                    <Sliders className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Audio Interface</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Latency Mode</label>
                      <div className="flex flex-col gap-2">
                        {(['interactive', 'balanced', 'playback', 0] as const).map(mode => (
                          <button
                            key={String(mode)}
                            onClick={() => updateSettings({ latencyHint: mode })}
                            className={`px-3 py-2 rounded text-left text-[10px] uppercase font-bold transition-all border ${
                              settings.latencyHint === mode 
                                ? 'bg-orange-500/10 border-orange-500 text-orange-500' 
                                : 'bg-black/20 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                            }`}
                          >
                            {mode === 0 ? 'ultra-low latency (0)' : mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Soundfont & Google Drive Section */}
                <section className="space-y-4 pt-6 border-t border-zinc-800">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <Cloud className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">Soundfont / Sample Sync (Google Drive)</h3>
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
                          Syncing Soundfonts...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          Sync Soundfonts
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
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Active Soundfont Library</span>
                      <span className="text-[9px] text-zinc-500 font-mono">OPFS OFFLINE CACHE</span>
                    </div>

                    <div className="divide-y divide-zinc-900 max-h-52 overflow-y-auto custom-scrollbar">
                      {driveFiles.length === 0 && downloadedFiles.length === 0 && (
                        <div className="p-4 text-center text-zinc-600 text-xs uppercase tracking-wider">
                          No files found. Configure Drive and Sync to download soundfonts.
                        </div>
                      )}

                      {mergedFiles.map(file => {
                        const isDownloaded = downloadedFiles.includes(file.name);
                        const isDownloading = downloadingFileId === file.id;

                        return (
                          <div key={file.id || file.name} className="px-3 py-2 flex items-center justify-between hover:bg-zinc-900/20 transition-colors">
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-zinc-300 font-medium truncate">{file.name}</span>
                              <span className="text-[9px] text-zinc-500 font-mono">
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
