/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { JupiterSlider, JupiterToggle, JupiterSelector } from './components/Controls';
import { Oscilloscope } from './components/Oscilloscope';
import { JupiterEngine } from './engine/JupiterEngine';
import { MIDIService } from './services/MIDIService';
import { 
  LFOSection, 
  VCOModSection, 
  VCO1Section, 
  VCO2Section, 
  MixerSection, 
  SubOscSection,
  MetronomeSection,
  VCFSection, 
  VCASection, 
  EnvelopeSection, 
  VolumeSection,
  ArpSection,
  FXSection,
  GlobalSection,
  HammondDrawbarsSection,
  HammondPercussionSection,
  EQSection
} from './components/SynthPanel';
import { DEFAULT_PARAMS, VoiceParams, Patch, MidiMapping, cleanVoiceParams } from './types';
import { Power, Save, FolderOpen, Sliders, Waves, Activity, Trash2, X, Keyboard as PianoIcon, Cloud, UploadCloud, DownloadCloud, Link, Maximize, Minimize, Settings2, Plus } from 'lucide-react';
import React from 'react';
import Keyboard from 'react-simple-keyboard';
import { PianoKeyboard } from './components/PianoKeyboard';
import { SettingsModal } from './components/SettingsModal';
import { MidiDebugger, MidiDebugEvent } from './components/MidiDebugger';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { googleSheetsService } from './services/GoogleSheetsService';
import { indexedDBService } from './services/IndexedDBService';
import { PRESET_PATCHES } from './constants/presetPatches';
import 'react-simple-keyboard/build/css/index.css';

type Screen = 'SYNTH' | 'ARP' | 'FX' | 'PATCHES';

export default function AppWrapper() {
  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}

function App() {
  const [params, setParams] = useState<VoiceParams>(DEFAULT_PARAMS);
  const { settings, updateSettings } = useSettings();
  const [engineReady, setEngineReady] = useState(false);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [currentScreen, setCurrentScreen] = useState<Screen>('SYNTH');
  const [activePatchId, setActivePatchId] = useState<string | null>(null);
  const [midiLogs, setMidiLogs] = useState<{ id: number, text: string }[]>([]);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Patch naming state
  const [isNaming, setIsNaming] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [namingMode, setNamingMode] = useState<'SAVE' | 'SAVE_AS'>('SAVE');
  const keyboardRef = useRef<any>(null);
  const initializedKeyboardRef = useRef(false);

  useEffect(() => {
    if (isNaming) {
      initializedKeyboardRef.current = false;
    }
  }, [isNaming]);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isMidiMappingMode, setIsMidiMappingMode] = useState(false);
  const [selectedMapParam, setSelectedMapParam] = useState<keyof VoiceParams | null>(null);
  const [midiMappings, setMidiMappings] = useState<MidiMapping[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMidiLogVisible, setIsMidiLogVisible] = useState(false);
  const [midiDebugEvents, setMidiDebugEvents] = useState<MidiDebugEvent[]>([]);
  const [isMidiDebuggerOpen, setIsMidiDebuggerOpen] = useState(false);

  const [patches, setPatches] = useState<Patch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Initialize DB and load patches
  useEffect(() => {
    const initDB = async () => {
      await indexedDBService.init();
      const storedPatches = await indexedDBService.getAllPatches();
      
      // Always merge PRESET_PATCHES to ensure user has the latest ones if they haven't deleted them
      // We identify presets by their prefix in the ID if we had one, but here they are just objects.
      // Let's check by name or ID if it exists.
      const existingIds = new Set(storedPatches.map(p => p.id));
      const newPresets = PRESET_PATCHES.filter(p => !existingIds.has(p.id));
      
      let finalPatches = [...storedPatches];
      
      if (newPresets.length > 0) {
        console.log(`Adding ${newPresets.length} new preset patches...`);
        await indexedDBService.savePatches([...storedPatches, ...newPresets]);
        finalPatches = [...storedPatches, ...newPresets];
      }

      if (storedPatches.length === 0 && finalPatches.length === 0) {
        console.log('Seeding IndexedDB with preset patches...');
        await indexedDBService.savePatches(PRESET_PATCHES);
        finalPatches = PRESET_PATCHES;
      }

      // Migration: ensure all fields exist
      const migrated = finalPatches.map((p: any) => ({
        ...p,
        params: cleanVoiceParams(p.params),
        midiMappings: (p.midiMappings || []).map((m: any) => ({
          parameter: m.parameter,
          cc: m.cc,
          channel: m.channel ?? 0
        }))
      }));
      
      setPatches(migrated);
      
      // Restore last selected patch and params if exists in appState
      const appState = await indexedDBService.getAppState();
      if (appState) {
        if (appState.activePatchId) setActivePatchId(appState.activePatchId);
        if (appState.params) setParams(cleanVoiceParams(appState.params));
        if (appState.midiMappings) setMidiMappings(appState.midiMappings);
        if (appState.currentScreen) setCurrentScreen(appState.currentScreen);
        if (appState.showKeyboard !== undefined) setShowKeyboard(appState.showKeyboard);
        if (appState.isMidiLogVisible !== undefined) setIsMidiLogVisible(appState.isMidiLogVisible);
      } else {
        // Fallback to legacy localStorage
        const lastPatchId = localStorage.getItem('jupiter_last_patch_id');
        if (lastPatchId) {
          const patch = migrated.find(p => p.id === lastPatchId);
          if (patch) {
            setParams(cleanVoiceParams(patch.params));
            setActivePatchId(patch.id);
          }
        }
      }
      setIsRestored(true);
    };
    initDB();
  }, []);

  const persistAppState = React.useCallback(async () => {
    if (!isRestored) return;
    await indexedDBService.saveAppState({
      activePatchId,
      params,
      midiMappings,
      currentScreen,
      showKeyboard,
      isMidiLogVisible
    });

    // Also keep localStorage as minimal fallback
    if (activePatchId) {
      localStorage.setItem('jupiter_last_patch_id', activePatchId);
    } else {
      localStorage.removeItem('jupiter_last_patch_id');
    }
  }, [activePatchId, params, midiMappings, currentScreen, showKeyboard, isMidiLogVisible, isRestored]);

  // Save app state (params, active patch ID, mappings, and UI state) whenever they change
  useEffect(() => {
    persistAppState();
  }, [persistAppState]);

  // Message event listener to handle calls from the host iOS app
  useEffect(() => {
    const handlePostMessage = async (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg) return;

      const actionType = msg.type || msg.action;
      if (!actionType) return;

      switch (actionType) {
        case 'midi': {
          if (msg.data && midiRef.current) {
            let bytes: Uint8Array;
            if (msg.data instanceof Uint8Array) {
              bytes = msg.data;
            } else if (Array.isArray(msg.data)) {
              bytes = new Uint8Array(msg.data);
            } else if (msg.data.buffer) {
              bytes = new Uint8Array(msg.data.buffer);
            } else {
              bytes = new Uint8Array(Object.values(msg.data));
            }
            midiRef.current.processRawMIDI(bytes, 'capacitor-shell');
          }
          break;
        }
        case 'save-state': {
          await persistAppState();
          break;
        }
        case 'restart-audio': {
          if (engineRef.current) {
            engineRef.current.restartAudio();
          }
          break;
        }
        case 'resume': {
          if (engineRef.current) {
            await engineRef.current.resume();
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('message', handlePostMessage);
    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
  }, [persistAppState]);

  // Load current patch mappings only when activePatchId changes
  // Removed automatic effector to avoid overwriting persisted unsaved state on startup
  
  const engineRef = useRef<JupiterEngine | null>(null);
  const midiRef = useRef<MIDIService | null>(null);

  const startRecording = React.useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.startRecording();
    setIsRecording(true);
  }, []);

  const stopRecording = React.useCallback(async () => {
    if (!engineRef.current) return;
    setIsRecording(false);
    setIsEncoding(true);
    try {
      const mp3Blob = await engineRef.current.stopRecording();
      if (mp3Blob) {
        const url = URL.createObjectURL(mp3Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `synth_recording_${Date.now()}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Recording stop or encoding failed:', e);
    } finally {
      setIsEncoding(false);
    }
  }, []);

  const updateParam = React.useCallback((key: keyof VoiceParams, val: any) => {
    setParams(prev => ({ ...prev, [key]: val }));
  }, []);

  const updateParamFromCC = React.useCallback((key: keyof VoiceParams, ccValue: number) => {
    // 1. Support boolean toggles
    const toggles: Set<string> = new Set([
      'vco2Sync', 'arpEnabled', 'arpSync', 'lfoSync', 'hammondPercussionEnabled', 'subOscEnabled', 'metronomeEnabled'
    ]);
    if (toggles.has(key)) {
      updateParam(key, ccValue >= 64);
      return;
    }

    // 2. Support selector / discrete list options
    const discreteLists: Record<string, any[]> = {
      vco1Range: [16, 8, 4, 2],
      vco2Range: [16, 8, 4, 2],
      arpRange: [1, 2, 3, 4],
      synthEngine: ['jupiter', 'hammond'],
      lfoWaveform: ['sine', 'sawtooth', 'square', 'random'],
      vco1Waveform: ['sawtooth', 'square', 'pulse', 'triangle', 'sine', 'noise'],
      vco2Waveform: ['sawtooth', 'square', 'pulse', 'triangle', 'sine', 'noise'],
      arpMode: ['up', 'down', 'up-down', 'random', 'chord', 'as-played', 'up-poly', 'down-poly'],
      portamentoMode: ['off', 'on', 'auto'],
      filterSlope: [12, 24],
      filterEnvSource: ['env1', 'env2'],
      chorusMode: [1, 2, 3],
      reverbMode: [1, 2, 3],
      leslieSpeed: ['off', 'lo', 'high'],
      hammondPercussionHarmonic: ['second', 'third'],
      hammondPercussionDecay: ['fast', 'slow'],
      hammondPercussionVolume: ['soft', 'normal'],
      subOscWaveform: ['sine', 'triangle', 'square'],
      subOscOctave: [-1, -2],
    };

    if (discreteLists[key]) {
      const options = discreteLists[key];
      const index = Math.floor((ccValue / 127) * 0.99 * options.length);
      updateParam(key, options[index]);
      return;
    }

    // 3. Slider key value scaling ranges
    const ranges: Record<string, [number, number]> = {
      lfoRate: [0.1, 50],
      filterCutoff: [20, 20000],
      vco2Freq: [-12, 12],
      vco2Detune: [-100, 100],
      vcaLevel: [0, 1],
      vcoMix: [0, 1],
      subOscMix: [0, 1],
      portamentoTime: [0, 2],
      arpRate: [40, 300],
      // Envelope params
      env1Attack: [0.001, 10], env1Hold: [0, 10], env1Decay: [0.001, 10], env1Sustain: [0, 1], env1Release: [0.001, 10],
      env2Attack: [0.001, 10], env2Decay: [0.001, 10], env2Sustain: [0, 1], env2Release: [0.001, 10],
      // Filter params
      filterResonance: [0, 1], filterEnvAmount: [0, 1], filterLfoAmount: [0, 1],
      // VCO/VCA modulation params
      vcoLfoAmount: [0, 1], vcaLfoAmount: [0, 1],
      // VCO params
      vco1Freq: [-12, 12], vco1PulseWidth: [0, 1],
      vco2PulseWidth: [0, 1], crossMod: [0, 1],
      mixerVco1: [0, 1], mixerVco2: [0, 1],
      // FX
      chorusMix: [0, 1], delayMix: [0, 1], delayTime: [0, 4], delayFeedback: [0, 0.9],
      reverbMix: [0, 1], reverbTime: [0.1, 10], reverbDecay: [0.1, 10], reverbDamping: [0, 0.99],
      compThreshold: [-60, 0], compRatio: [1, 20], compAttack: [0.001, 0.5], compRelease: [0.01, 1], compMix: [0, 1],
      leslieMix: [0, 1], leslieRate: [0.1, 15], leslieDepth: [0, 1],
      tremoloMix: [0, 1], tremoloRate: [0.5, 20], tremoloDepth: [0, 1],
      distortionMix: [0, 1], distortionAmount: [0, 1],
      distortionFeedbackAmount: [0, 1], distortionFeedbackFreq: [100, 5000],
      eqBand1: [-12, 12], eqBand2: [-12, 12], eqBand3: [-12, 12], eqBand4: [-12, 12], eqBand5: [-12, 12],
      masterVolume: [0, 1],
      metronomeVolume: [0, 1],
      // Hammond Drawbars
      hammondDb16: [0, 8],
      hammondDb513: [0, 8],
      hammondDb8: [0, 8],
      hammondDb4: [0, 8],
      hammondDb223: [0, 8],
      hammondDb2: [0, 8],
      hammondDb135: [0, 8],
      hammondDb113: [0, 8],
      hammondDb1: [0, 8],
      hammondKeyClick: [0, 1],
    };

    const [min, max] = ranges[key] || [0, 1];
    const normalizedValue = ccValue / 127;
    let mappedValue = min + normalizedValue * (max - min);

    if (key === 'filterCutoff') {
      mappedValue = min * Math.pow(max / min, normalizedValue);
    }

    // Apply integer rounding to Hammond DRAWBAR sliders
    if (key.startsWith('hammondDb') && key !== 'hammondKeyClick') {
      mappedValue = Math.round(mappedValue);
    }

    updateParam(key, mappedValue);
  }, [updateParam]);

  const handleMidiCC = React.useCallback((cc: number, value: number, channel: number) => {
    console.log(`[MIDI EVENT] CC message received: cc=${cc}, value=${value}, channel=${channel}. isMidiMappingMode=${isMidiMappingMode}, selectedMapParam=${selectedMapParam}`);
    
    if (isMidiMappingMode) {
      if (selectedMapParam) {
        console.log(`[MIDI LEARN] Assigning CC ${cc} (Ch ${channel + 1}) to parameter ${selectedMapParam}`);
        
        const newMapping = { parameter: selectedMapParam, cc, channel };
        
        // Update mappings state atomic selector link
        setMidiMappings(prev => {
          const filtered = prev.filter(m => m.parameter !== selectedMapParam && !(m.cc === cc && m.channel === channel));
          return [...filtered, newMapping];
        });
        
        // Safely update patches array
        if (activePatchId) {
          setPatches(currentPatches => 
            currentPatches.map(p => p.id === activePatchId ? { 
              ...p, 
              midiMappings: [
                ...(p.midiMappings || []).filter(m => m.parameter !== selectedMapParam && !(m.cc === cc && m.channel === channel)),
                newMapping
              ]
            } : p)
          );
        }
        
        setSelectedMapParam(null); // Finish learn stage
      }
      return;
    }

    // Normal operation: route to slider / toggle / selector
    const mapping = midiMappings.find(m => m.cc === cc && m.channel === channel);
    if (mapping) {
      const paramKey = mapping.parameter;
      updateParamFromCC(paramKey, value);
    }

    // Default Mod Wheel modifier
    if (cc === 1) {
      engineRef.current?.setModWheel(value);
    }
  }, [isMidiMappingMode, selectedMapParam, activePatchId, midiMappings]);

  const addMidiDebugEvent = React.useCallback((
    type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Panic',
    channel: number | string,
    noteOrCC: string,
    numValue: number,
    velocityOrVal: string | number
  ) => {
    const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    const newEvent: MidiDebugEvent = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: timeStr,
      type,
      channel: typeof channel === 'number' ? `Ch ${channel + 1}` : channel,
      noteOrCC,
      numValue,
      velocityOrVal
    };
    setMidiDebugEvents(prev => [newEvent, ...prev].slice(0, 50));
  }, []);

  const handlePanic = React.useCallback(() => {
    engineRef.current?.panic();
    setActiveNotes([]);
    addMidiDebugEvent('Panic', 'All', 'Panic/Reset', 0, 0);
  }, [addMidiDebugEvent]);

  const handleNoteOn = React.useCallback((note: number, velocity: number = 0.8) => {
    engineRef.current?.noteOn(note, velocity);
    setActiveNotes(prev => [...prev.filter(n => n !== note), note]);
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = noteNames[note % 12] + (Math.floor(note / 12) - 1);
    addMidiDebugEvent('Note On', 'V-Keys', `${name} (${note})`, note, Math.round(velocity * 127));
  }, [addMidiDebugEvent]);

  const handleNoteOff = React.useCallback((note: number) => {
    engineRef.current?.noteOff(note);
    setActiveNotes(prev => prev.filter(n => n !== note));

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = noteNames[note % 12] + (Math.floor(note / 12) - 1);
    addMidiDebugEvent('Note Off', 'V-Keys', `${name} (${note})`, note, 0);
  }, [addMidiDebugEvent]);

  const handlePitchBend = React.useCallback((value: number) => {
    engineRef.current?.setPitchBend(value);
  }, []);

  // Use refs for MIDI callbacks. Assign them directly in render to prevent stale closure lag from asynchronous useEffect runs
  const midiCCRef = useRef<(cc: number, value: number, channel: number) => void>(() => {});
  const midiNoteOnRef = useRef<(note: number, velocity: number) => void>(() => {});
  const midiNoteOffRef = useRef<(note: number) => void>(() => {});
  const midiPitchBendRef = useRef<(value: number) => void>(() => {});
  const handlePanicRef = useRef<() => void>(() => {});
  const isMidiLogVisibleRef = useRef<boolean>(false);
  const addMidiLogRef = useRef<(data: Uint8Array) => void>(() => {});
  const addMidiDebugRef = useRef<(type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Panic', channel: number | string, noteOrCC: string, numValue: number, velocityOrVal: string | number) => void>(() => {});

  // Synchronously update Callback Refs on every render cycle to prevent any lag or stale closures
  useEffect(() => {
    midiCCRef.current = handleMidiCC;
    midiNoteOnRef.current = handleNoteOn;
    midiNoteOffRef.current = handleNoteOff;
    midiPitchBendRef.current = handlePitchBend;
    handlePanicRef.current = handlePanic;
    addMidiLogRef.current = addMidiLog;
    isMidiLogVisibleRef.current = isMidiLogVisible;
    addMidiDebugRef.current = addMidiDebugEvent;
  });

  useEffect(() => {
    const configUrl = settings.googleSheetUrl;
    if (configUrl && googleSheetsService.isConnected()) {
      // Try to pull on load if config exists and already connected
      googleSheetsService.loadPatchesFromSheet(configUrl).then(remotePatches => {
        if (remotePatches && remotePatches.length > 0) {
          setPatches(remotePatches);
          console.log('App: Auto-pulled patches from Google Sheets');
        }
      }).catch(e => {
        console.warn('App: Initial sync pull failed', e);
      });
    }
  }, []);

  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new JupiterEngine(params, settings);
      startEngine();
    }
  }, []);

  // Resume engine on first interaction to satisfy browser policies
  useEffect(() => {
    const handleFirstInteraction = () => {
      engineRef.current?.resume();
      window.removeEventListener('mousedown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('mousedown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    return () => {
      window.removeEventListener('mousedown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPerformanceSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setParams(params);
    }
  }, [params]);

  useEffect(() => {
    if (midiRef.current) {
      midiRef.current.setFilter(settings.midiInputId, settings.midiChannel);
    }
  }, [settings.midiInputId, settings.midiChannel]);

  useEffect(() => {
    if (patches.length > 0) {
      indexedDBService.savePatches(patches);
    }
  }, [patches]);

  const addMidiLog = (data: Uint8Array) => {
    if (!isMidiLogVisibleRef.current) return;
    if (data[0] === 0xF8) return; // Filter out MIDI Timing Clock
    const bytes = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const id = Date.now() + Math.random();
    setMidiLogs(prev => [{ id, text: bytes }, ...prev].slice(0, 10));
  };

  const handleConnectGoogle = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await googleSheetsService.signIn();
      alert('Connected to Google Account successfully!');
    } catch (error: any) {
      console.error(error);
      setSyncError(error.message || 'Failed to connect');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePushToSheet = async () => {
    if (!settings.googleSheetUrl) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await googleSheetsService.savePatchesToSheet(patches, settings.googleSheetUrl);
      alert('Patches synced to Google Sheets successfully!');
    } catch (error: any) {
      console.error(error);
      setSyncError(error.message || 'Failed to sync');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromSheet = async () => {
    if (!settings.googleSheetUrl) return;
    if (!confirm('This will overwrite local library with patches from Google Sheets. Continue?')) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const remotePatches = await googleSheetsService.loadPatchesFromSheet(settings.googleSheetUrl);
      if (remotePatches.length > 0) {
        setPatches(remotePatches);
        alert('Library updated from Google Sheets!');
      } else {
        alert('No patches found in Google Sheets.');
      }
    } catch (error: any) {
      console.error(error);
      setSyncError(error.message || 'Failed to load');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSheetUrl = async () => {
    // Already updating via onChange in input calling updateSettings
    alert('Google Sheets URL preferred and saved to local settings!');
  };


  function startEngine() {
    if (engineRef.current) {
      engineRef.current.init();
      setEngineReady(true);
      
      if (!midiRef.current) {
        midiRef.current = new MIDIService(
          (note, velocity) => {
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const name = noteNames[note % 12] + (Math.floor(note / 12) - 1);
            addMidiDebugRef.current('Note On', settings.midiChannel || 'Omni', `${name} (${note})`, note, velocity);
            midiNoteOnRef.current(note, velocity / 127);
          },
          (note) => {
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const name = noteNames[note % 12] + (Math.floor(note / 12) - 1);
            addMidiDebugRef.current('Note Off', settings.midiChannel || 'Omni', `${name} (${note})`, note, 0);
            midiNoteOffRef.current(note);
          },
          (cc, value, channel) => {
            addMidiDebugRef.current('CC', channel, `CC ${cc}`, cc, value);
            midiCCRef.current(cc, value, channel);
          },
          (data) => addMidiLogRef.current(data),
          (value) => {
            addMidiDebugRef.current('Pitch Bend', 'Any', 'Bend', value, value - 8192);
            midiPitchBendRef.current(value);
          },
          () => {
            addMidiDebugRef.current('Panic', 'All', 'Panic', 0, 0);
            handlePanicRef.current();
          }
        );
        midiRef.current.init().then(() => {
          midiRef.current?.setFilter(settings.midiInputId, settings.midiChannel);
        });
      }
    }
  };

  const handleMapClick = React.useCallback((param: keyof VoiceParams) => {
    if (isMidiMappingMode) {
      setSelectedMapParam(prev => prev === param ? null : param);
    }
  }, [isMidiMappingMode]);

  const getMappedCC = React.useCallback((param: keyof VoiceParams) => {
    const m = midiMappings.find(m => m.parameter === param);
    if (!m) return undefined;
    return `${m.channel + 1}:${m.cc}`;
  }, [midiMappings]);

  const savePatch = () => {
    if (activePatchId) {
      setNamingMode('SAVE');
      setPendingName(patches.find(p => p.id === activePatchId)?.name || '');
    } else {
      setNamingMode('SAVE_AS');
      setPendingName('NEW PATCH');
    }
    setIsNaming(true);
  };

  const saveAsNewPatch = () => {
    setNamingMode('SAVE_AS');
    setPendingName('NEW PATCH');
    setIsNaming(true);
  };

  const handleNameSubmit = async () => {
    if (!pendingName.trim()) return;

    let updatedPatches: Patch[];
    if (namingMode === 'SAVE' && activePatchId) {
      updatedPatches = patches.map(p => p.id === activePatchId ? { ...p, name: pendingName.trim(), params, midiMappings } : p);
    } else {
      const newPatch: Patch = { id: Date.now().toString(), name: pendingName.trim(), params, midiMappings };
      updatedPatches = [...patches, newPatch];
      setActivePatchId(newPatch.id);
    }
    
    setPatches(updatedPatches);
    setIsNaming(false);

    // Auto-sync to sheets if URL exists
    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.savePatchesToSheet(updatedPatches, settings.googleSheetUrl);
        console.log('App: Auto-synced to Google Sheets after save');
      } catch (error) {
        console.error('App: Auto-sync failed:', error);
      }
    }
  };

  const loadPatch = (patch: Patch) => {
    // Ensure all params exist by merging with defaults
    setParams(cleanVoiceParams(patch.params));
    setActivePatchId(patch.id);
    setMidiMappings(patch.midiMappings || []);
    setCurrentScreen('SYNTH');
  };

  const deletePatch = async (id: string) => {
    if (confirm('Delete patch?')) {
      const updatedPatches = patches.filter(p => p.id !== id);
      setPatches(updatedPatches);
      if (activePatchId === id) setActivePatchId(null);

      // Auto-sync to sheets if URL exists
      if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        try {
          await googleSheetsService.savePatchesToSheet(updatedPatches, settings.googleSheetUrl);
          console.log('App: Auto-synced to Google Sheets after delete');
        } catch (error) {
          console.error('App: Auto-sync failed:', error);
        }
      }
    }
  };

  const synthSections = (
    <>
      <GlobalSection 
        bpm={params.bpm}
        timeSignature={params.timeSignature}
        synthEngine={params.synthEngine}
        updateParam={updateParam}
        isRecording={isRecording}
        isEncoding={isEncoding}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        metronomeEnabled={params.metronomeEnabled}
      />

      {params.synthEngine === 'hammond' ? (
        <>
          <HammondDrawbarsSection 
            db16={params.hammondDb16}
            db513={params.hammondDb513}
            db8={params.hammondDb8}
            db4={params.hammondDb4}
            db223={params.hammondDb223}
            db2={params.hammondDb2}
            db135={params.hammondDb135}
            db113={params.hammondDb113}
            db1={params.hammondDb1}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <HammondPercussionSection 
            percussionEnabled={params.hammondPercussionEnabled}
            percussionHarmonic={params.hammondPercussionHarmonic}
            percussionDecay={params.hammondPercussionDecay}
            percussionVolume={params.hammondPercussionVolume}
            keyClick={params.hammondKeyClick}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />
        </>
      ) : (
        <>
          <LFOSection 
            lfoWaveform={params.lfoWaveform}
            lfoRate={params.lfoRate}
            lfoSync={params.lfoSync}
            lfoSyncDivision={params.lfoSyncDivision}
            lfoDelay={params.lfoDelay}
            lfoVelocitySensitivity={params.lfoVelocitySensitivity}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <VCOModSection 
            portamentoTime={params.portamentoTime}
            portamentoMode={params.portamentoMode}
            vcoLfoAmount={params.vcoLfoAmount}
            vcoLfoSelect={params.vcoLfoSelect}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <VCO1Section 
            vco1Range={params.vco1Range}
            crossMod={params.crossMod}
            vco1PulseWidth={params.vco1PulseWidth}
            vco1Waveform={params.vco1Waveform}
            vco1PwmMode={params.vco1PwmMode}
            vco1VelocitySensitivity={params.vco1VelocitySensitivity}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <VCO2Section 
            vco2Range={params.vco2Range}
            vco2Freq={params.vco2Freq}
            vco2Detune={params.vco2Detune}
            vco2Waveform={params.vco2Waveform}
            vco2Sync={params.vco2Sync}
            vco2PwmMode={params.vco2PwmMode}
            vco2VelocitySensitivity={params.vco2VelocitySensitivity}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <MixerSection 
            vcoMix={params.vcoMix}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <SubOscSection
            subOscEnabled={params.subOscEnabled}
            subOscMix={params.subOscMix}
            subOscWaveform={params.subOscWaveform}
            subOscOctave={params.subOscOctave}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <MetronomeSection
            metronomeEnabled={params.metronomeEnabled}
            metronomeVolume={params.metronomeVolume}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <VCFSection 
            filterCutoff={params.filterCutoff}
            filterResonance={params.filterResonance}
            filterEnvAmount={params.filterEnvAmount}
            filterEnvSource={params.filterEnvSource}
            filterSlope={params.filterSlope}
            filterLfoAmount={params.filterLfoAmount}
            filterKeyboardTrack={params.filterKeyboardTrack}
            filterVelocitySensitivity={params.filterVelocitySensitivity}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <VCASection 
            vcaLevel={params.vcaLevel}
            vcaLfoAmount={params.vcaLfoAmount}
            vcaSource={params.vcaSource}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <EnvelopeSection 
            title="ENV-1"
            prefix="env1"
            attack={params.env1Attack}
            decay={params.env1Decay}
            sustain={params.env1Sustain}
            release={params.env1Release}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />

          <EnvelopeSection 
            title="ENV-2"
            prefix="env2"
            attack={params.env2Attack}
            decay={params.env2Decay}
            sustain={params.env2Sustain}
            release={params.env2Release}
            updateParam={updateParam}
            isMidiMappingMode={isMidiMappingMode}
            handleMapClick={handleMapClick}
            getMappedCC={getMappedCC}
            selectedMapParam={selectedMapParam}
          />
        </>
      )}

      <VolumeSection 
        masterVolume={params.masterVolume}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />
    </>
  );

  const arpSections = (
    <>
      <GlobalSection 
        bpm={params.bpm}
        timeSignature={params.timeSignature}
        synthEngine={params.synthEngine}
        updateParam={updateParam}
        isRecording={isRecording}
        isEncoding={isEncoding}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        metronomeEnabled={params.metronomeEnabled}
      />
      <ArpSection 
        enabled={params.arpEnabled}
        rate={params.arpRate}
        mode={params.arpMode}
        range={params.arpRange}
        bpm={params.bpm}
        sync={params.arpSync}
        syncDivision={params.arpSyncDivision}
        timeSignature={params.timeSignature}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />
    </>
  );

  const fxSections = (
    <>
      <GlobalSection 
        bpm={params.bpm}
        timeSignature={params.timeSignature}
        synthEngine={params.synthEngine}
        updateParam={updateParam}
        isRecording={isRecording}
        isEncoding={isEncoding}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        metronomeEnabled={params.metronomeEnabled}
      />
      <FXSection 
        label="Chorus"
        mix={params.chorusMix}
        selectors={[
          { label: 'Type', key: 'chorusMode', options: ['1', '2', '3'], value: params.chorusMode }
        ]}
        params={[]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />
      
      <FXSection 
        label="Overdrive"
        mix={params.distortionMix}
        selectors={[
          { label: 'Type', key: 'distortionMode' as keyof VoiceParams, options: ['default', 'tube', 'feedback'], value: params.distortionMode || 'default' }
        ]}
        params={[
          { label: 'Drive', key: 'distortionAmount', value: params.distortionAmount, min: 0, max: 1 },
          ...(params.distortionMode === 'feedback' ? [
            { label: 'Fb Amt', key: 'distortionFeedbackAmount' as keyof VoiceParams, value: params.distortionFeedbackAmount ?? 0.3, min: 0, max: 1 },
            { label: 'Fb Freq', key: 'distortionFeedbackFreq' as keyof VoiceParams, value: params.distortionFeedbackFreq ?? 800, min: 100, max: 5000 }
          ] : [])
        ]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

      <EQSection 
        params={params}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

      <FXSection 
        label="Delay"
        mix={params.delayMix}
        params={[
          { label: 'Time', key: 'delayTime', value: params.delayTime, min: 0, max: 4 },
          { label: 'Feedbk', key: 'delayFeedback', value: params.delayFeedback, min: 0, max: 0.9 },
        ]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

      <FXSection 
        label="Reverb"
        mix={params.reverbMix}
        selectors={[
          { label: 'Type', key: 'reverbMode', options: ['1', '2', '3'], value: params.reverbMode }
        ]}
        params={[
          { label: 'Time', key: 'reverbTime', value: params.reverbTime, min: 0.1, max: 10 },
          { label: 'Decay', key: 'reverbDecay', value: params.reverbDecay, min: 0.1, max: 10 },
          { label: 'Damping', key: 'reverbDamping', value: params.reverbDamping, min: 0, max: 0.99 },
        ]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

      <FXSection 
        label="Leslie"
        mix={params.leslieMix}
        selectors={[
          { label: 'Speed', key: 'leslieSpeed', options: ['off', 'lo', 'high'], value: params.leslieSpeed }
        ]}
        params={[
          { label: 'Rate', key: 'leslieRate', value: params.leslieRate, min: 0.1, max: 15 },
          { label: 'Depth', key: 'leslieDepth', value: params.leslieDepth, min: 0, max: 1 },
        ]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

      <FXSection 
        label="Tremolo"
        mix={params.tremoloMix}
        params={[
          { label: 'Rate', key: 'tremoloRate', value: params.tremoloRate, min: 0.5, max: 20 },
          { label: 'Depth', key: 'tremoloDepth', value: params.tremoloDepth, min: 0, max: 1 },
        ]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

      <FXSection 
        label="Comp"
        mix={params.compMix}
        params={[
          { label: 'Thresh', key: 'compThreshold', value: params.compThreshold, min: -60, max: 0 },
          { label: 'Ratio', key: 'compRatio', value: params.compRatio, min: 1, max: 20 },
          { label: 'Attack', key: 'compAttack', value: params.compAttack, min: 0.001, max: 0.5 },
          { label: 'Releas', key: 'compRelease', value: params.compRelease, min: 0.01, max: 1.0 },
        ]}
        updateParam={updateParam}
        isMidiMappingMode={isMidiMappingMode}
        handleMapClick={handleMapClick}
        getMappedCC={getMappedCC}
        selectedMapParam={selectedMapParam}
      />

    </>
  );

  const APP_VERSION = '1.6.1';

  const NavButton = ({ target, label, icon: Icon }: { target: Screen, label: string, icon: any }) => (
    <button 
      onClick={() => setCurrentScreen(target)}
      className={`flex items-center gap-1.5 px-2 sm:px-3 h-full border-b-2 transition-all uppercase text-[9px] font-bold tracking-widest shrink-0 ${
        currentScreen === target ? 'border-orange-500 text-white bg-white/5' : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon size={12} className="shrink-0" />
      <span className="hidden lg:inline">{label === 'Synthesizer' ? 'SYNTH' : label === 'Arpeggio' ? 'ARP' : label === 'Master FX' ? 'FX' : 'LIB'}</span>
    </button>
  );

  return (
    <div className={`w-screen h-[100dvh] overflow-hidden bg-synth-bg text-white font-sans select-none flex flex-col theme-${settings.theme}`}>
      {/* Dynamic Header */}
      <div className="flex flex-col sm:flex-row bg-synth-panel border-b border-synth-border shrink-0 z-20">
        {/* Mobile-only Top Patch Title Row */}
        <div className="flex sm:hidden h-[34px] items-center justify-between px-3 border-b border-synth-border/40 bg-black/20 shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${engineReady ? 'bg-red-600 shadow-[0_0_8px_red]' : 'bg-zinc-800'}`} />
            <h1 className="text-[11px] font-bold tracking-wider text-white uppercase truncate max-w-[150px]">
              {activePatchId ? patches.find(p => p.id === activePatchId)?.name : 'UNSAVED'}
            </h1>
            <span className="text-[7px] text-zinc-600 font-mono tracking-wider">v{APP_VERSION}</span>
          </div>
          
          <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-500">
            <Activity size={10} className={activeNotes.length > 0 ? 'text-green-500 animate-pulse' : ''} />
            <span>{activeNotes.length} ACTIVE NOTES</span>
          </div>
        </div>

        {/* Header Action Row (Primary across sm and containing controls) */}
        <div className="h-[50px] flex items-center justify-between px-2 sm:px-3 w-full min-w-0">
          <div className="flex items-center h-full flex-1 min-w-0">
            {/* Desktop-only Patch Name & LED */}
            <div className="hidden sm:flex mr-4 items-center gap-2 shrink-0">
               <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 ${engineReady ? 'bg-red-600 shadow-[0_0_8px_red]' : 'bg-zinc-800'}`} />
               <div className="flex flex-col gap-0.5 justify-center">
                 <h1 className="text-[10px] sm:text-xs font-bold tracking-tighter text-white uppercase truncate max-w-[80px] sm:max-w-[150px] leading-none">
                   {activePatchId ? patches.find(p => p.id === activePatchId)?.name : 'UNSAVED'}
                 </h1>
                 <span className="text-[7px] text-zinc-600 font-mono tracking-widest leading-none">v{APP_VERSION}</span>
               </div>
            </div>
            
            <nav className="flex h-full min-w-0">
              <NavButton target="SYNTH" label="Synthesizer" icon={Sliders} />
              <NavButton target="ARP" label="Arpeggio" icon={Activity} />
              <NavButton target="FX" label="Master FX" icon={Waves} />
              <NavButton target="PATCHES" label="Library" icon={FolderOpen} />
            </nav>
 
          <div 
            className="hidden lg:flex ml-4 h-full items-center border-l border-white/5 pl-4 overflow-hidden cursor-pointer group relative hover:bg-white/5 transition-colors min-w-[120px]"
            onClick={() => setIsMidiLogVisible(!isMidiLogVisible)}
            title={isMidiLogVisible ? "Click to hide MIDI logs" : "Click to show MIDI logs"}
          >
            {!isMidiLogVisible && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <span className="text-[6px] font-bold text-white uppercase tracking-widest">SHOW MIDI</span>
              </div>
            )}
            <div className={`flex gap-2 font-mono text-[8px] uppercase tracking-widest whitespace-nowrap transition-opacity ${isMidiLogVisible ? 'text-zinc-600 opacity-100' : 'text-zinc-800 opacity-30 select-none'}`}>
              {midiLogs.length === 0 ? (
                <span>MIDI IDLE...</span>
              ) : isMidiLogVisible ? (
                midiLogs.slice(0, 3).map(log => (
                  <span key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-300 first:text-orange-500">
                    [{log.text.substring(0, 15)}]
                  </span>
                ))
              ) : (
                <span>MIDI MONITOR OFF</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 ml-2 h-full">
          <div className="flex items-center gap-1.5 h-full">
            <div 
              className="hidden sm:flex h-full items-center px-2 cursor-pointer hover:bg-white/5 transition-colors group relative"
              onClick={() => updateSettings({ enableOscilloscope: !settings.enableOscilloscope })}
              title={settings.enableOscilloscope ? "Click to disable visualizer (CPU Intensive)" : "Click to enable visualizer"}
            >
              {!settings.enableOscilloscope && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10 rounded">
                  <span className="text-[6px] font-bold text-white uppercase tracking-widest">CPU SAVER ON</span>
                </div>
              )}
              <Oscilloscope 
                analyser={settings.enableOscilloscope ? (engineRef.current?.getAnalyser() || null) : null} 
                isActive={engineReady && settings.enableOscilloscope} 
              />
            </div>
            <button 
              onClick={savePatch}
              className="p-1.5 sm:p-2 h-full hover:bg-white/5 text-zinc-400 hover:text-white transition-colors border-l border-white/5"
            >
              <Save size={14} />
            </button>
          </div>
          
          <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-500 border-l border-synth-border pl-2 sm:pl-3">
            <Activity size={10} className={activeNotes.length > 0 ? 'text-green-500' : ''} />
            <span>{activeNotes.length}</span>
          </div>

          {engineReady && (
            <button 
              onClick={() => {
                setIsMidiMappingMode(!isMidiMappingMode);
                setSelectedMapParam(null);
              }}
              className={`flex items-center gap-1.5 px-2 sm:px-3 h-full border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
                isMidiMappingMode ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-white/5'
              }`}
            >
              <Link size={10} />
              <span className="hidden lg:inline">MAP</span>
            </button>
          )}

          <button 
            onClick={() => setShowKeyboard(!showKeyboard)}
            className={`flex items-center gap-1.5 px-2 sm:px-3 h-full border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
              showKeyboard ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:bg-white/5'
            }`}
          >
            <PianoIcon size={10} />
            <span className="hidden lg:inline">KEYS</span>
          </button>

          <button 
            onClick={() => setIsMidiDebuggerOpen(!isMidiDebuggerOpen)}
            className={`flex items-center gap-1.5 px-2 sm:px-3 h-full border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
              isMidiDebuggerOpen ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:bg-white/5'
            }`}
          >
            <Activity size={10} />
            <span className="hidden lg:inline">MIDI DEBUG</span>
          </button>

          <button 
            onClick={handlePanic}
            className="flex items-center gap-1.5 px-2 sm:px-3 h-full border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest text-red-500 hover:bg-red-500/10"
          >
            <X size={10} />
            <span className="hidden lg:inline">PANIC</span>
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-2 sm:px-3 h-full border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest text-zinc-500 hover:bg-white/5"
          >
            <Settings2 size={10} />
            <span className="hidden lg:inline">CONFIG</span>
          </button>

          <button 
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-2 sm:px-3 h-full border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest text-zinc-500 hover:bg-white/5"
          >
            {isFullscreen ? <Minimize size={10} /> : <Maximize size={10} />}
            <span className="hidden lg:inline">FS</span>
          </button>
        </div>
      </div>
    </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        <div className={`flex-1 relative overflow-y-auto lg:overflow-hidden transition-all duration-300`}>
          {currentScreen === 'SYNTH' && (
            <div className="relative lg:absolute lg:inset-0 flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-row bg-synth-border/40 gap-[1px] min-h-fit lg:min-h-0 lg:h-full overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
              {synthSections}
            </div>
          )}

          {currentScreen === 'ARP' && (
            <div className="relative lg:absolute lg:inset-0 flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-row bg-synth-border/40 gap-[1px] min-h-fit lg:min-h-0 lg:h-full overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
              {arpSections}
            </div>
          )}

          {currentScreen === 'FX' && (
            <div className="relative lg:absolute lg:inset-0 flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-row bg-synth-border/40 gap-[1px] min-h-fit lg:min-h-0 lg:h-full overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
              {fxSections}
            </div>
          )}

          {currentScreen === 'PATCHES' && (
            <div className="absolute inset-0 bg-synth-bg p-4 sm:p-8 overflow-y-auto">
              <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8 sm:mb-12 border-b border-synth-border pb-6">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl sm:text-3xl font-bold tracking-tight uppercase">Patch Library</h2>
                      <div className="flex items-center gap-2">
                        {activePatchId && (
                          <button 
                            onClick={savePatch}
                            className="p-2 hover:bg-white/5 rounded-full text-blue-400 hover:text-white transition-colors"
                            title="Update Current Patch"
                          >
                            <Save size={24} />
                          </button>
                        )}
                        <button 
                          onClick={saveAsNewPatch}
                          className="p-2 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-colors"
                          title="Save Current as New"
                        >
                          <Plus size={24} />
                        </button>
                      </div>
                    </div>
                    <button 
                      onClick={() => { 
                        setParams(DEFAULT_PARAMS); 
                        setActivePatchId(null); 
                        setMidiMappings([]);
                        setCurrentScreen('SYNTH'); 
                      }}
                      className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest text-[10px]"
                    >
                      Reset to Init
                    </button>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-4 sm:p-6 mb-8 flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-zinc-400 mb-1">
                    <Cloud size={16} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Google Sheets Sync</h3>
                    {googleSheetsService.isConnected() && (
                      <div className="flex items-center gap-1 text-[8px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full border border-green-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        CONNECTED
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 relative">
                      <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input 
                        type="text" 
                        value={settings.googleSheetUrl}
                        onChange={(e) => updateSettings({ googleSheetUrl: e.target.value })}
                        placeholder="Enter Google Sheets URL..."
                        className="w-full bg-black border border-zinc-800 p-2 pl-9 text-[11px] font-mono text-zinc-300 focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleSaveSheetUrl}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest text-[9px] border border-zinc-700"
                      >
                        Save URL
                      </button>
                      <button 
                        onClick={handleConnectGoogle}
                        disabled={isSyncing || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
                        className={`px-4 py-2 font-bold uppercase tracking-widest text-[9px] border transition-all ${
                          googleSheetsService.isConnected() 
                            ? 'bg-green-600/20 border-green-500/30 text-green-500' 
                            : 'bg-blue-600/20 border-blue-500/30 text-blue-500 hover:bg-blue-600/30'
                        } disabled:opacity-30`}
                      >
                        {googleSheetsService.isConnected() ? 'Reconnect' : 'Authorize'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                      <div className="w-full text-center p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-tight mb-2">
                        Missing VITE_GOOGLE_CLIENT_ID in Secrets
                      </div>
                    )}
                    <button 
                      onClick={handlePushToSheet}
                      disabled={isSyncing || !settings.googleSheetUrl || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
                      className="w-full sm:flex-1 px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 text-orange-500 border border-orange-500/30 font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {isSyncing ? <Activity size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                      Push Library
                    </button>
                    <button 
                      onClick={handlePullFromSheet}
                      disabled={isSyncing || !settings.googleSheetUrl || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
                      className="w-full sm:flex-1 px-4 py-3 bg-[#111] hover:bg-zinc-800 text-zinc-400 border border-zinc-800 font-bold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {isSyncing ? <Activity size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                      Pull Library
                    </button>
                  </div>
                  
                  {syncError && (
                    <div className="text-[9px] text-red-500 font-mono bg-red-500/5 p-2 border border-red-500/20 break-all">
                      ERROR: {syncError}
                    </div>
                  )}
                </div>

                <div className="mb-6 relative">
                  <Activity size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patches..."
                    className="w-full bg-zinc-900 border border-zinc-800 p-4 pl-10 text-sm font-bold uppercase tracking-widest text-white focus:border-orange-500 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {patches.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                    <div className="col-span-full py-12 text-center bg-zinc-900 border border-dashed border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px] font-bold">
                      No matching patches found
                    </div>
                  ) : (
                    patches
                      .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(patch => (
                      <div 
                        key={patch.id}
                        className={`p-6 border transition-all cursor-pointer flex flex-col gap-4 group ${
                          activePatchId === patch.id 
                            ? 'bg-orange-600/10 border-orange-500' 
                            : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'
                        }`}
                        onClick={() => loadPatch(patch)}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-zinc-500 font-mono text-xs">P-{patch.id.slice(-4)}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deletePatch(patch.id); }}
                            className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 text-red-500 rounded transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <h3 className="text-xl font-bold uppercase truncate">{patch.name}</h3>
                        <div className="flex gap-2">
                           <div className={`w-1 h-4 ${patch.params.vco1Waveform === 'sawtooth' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                           <div className={`w-1 h-4 ${patch.params.filterCutoff > 5000 ? 'bg-zinc-300' : 'bg-zinc-700'}`} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inline Keyboard - Takes up space in the flex layout */}
        {showKeyboard && (
          <div className="shrink-0 animate-in slide-in-from-bottom duration-300">
            <PianoKeyboard 
              onNoteOn={handleNoteOn}
              onNoteOff={handleNoteOff}
            />
          </div>
        )}
      </div>

      {/* Keyboard Modal for naming */}
        {isNaming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-synth-panel border border-synth-border p-4 sm:p-8 w-full max-w-[800px] shadow-2xl">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold uppercase tracking-widest text-zinc-400">
                  {namingMode === 'SAVE' ? 'Overwrite' : 'Save As'}
                </h2>
                <button 
                  onClick={() => setIsNaming(false)}
                  className="p-2 hover:bg-white/10 text-zinc-500 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>
              
              <input 
                type="text" 
                value={pendingName}
                readOnly
                className="w-full bg-black border-2 border-orange-500/50 p-4 sm:p-6 text-xl sm:text-3xl font-bold uppercase tracking-wider text-white mb-6 sm:mb-8 outline-none"
              />

              <div className="keyboard-container overflow-hidden bg-zinc-900 p-2 sm:p-4">
                <Keyboard
                  keyboardRef={(r) => {
                    keyboardRef.current = r;
                    if (r && !initializedKeyboardRef.current) {
                      r.setInput(pendingName);
                      initializedKeyboardRef.current = true;
                    }
                  }}
                  onChange={(input) => setPendingName(input.toUpperCase())}
                  onKeyPress={(button) => {
                    if (button === "{enter}") handleNameSubmit();
                    if (button === "{escape}") setIsNaming(false);
                  }}
                  layout={{
                    default: [
                      "1 2 3 4 5 6 7 8 9 0",
                      "Q W E R T Y U I O P",
                      "A S D F G H J K L",
                      "Z X C V B N M - _",
                      "{bksp} {space} {enter}"
                    ]
                  }}
                  display={{
                    "{bksp}": "DEL",
                    "{enter}": "SAVE",
                    "{space}": "SPACE"
                  }}
                  theme="hg-theme-default hg-layout-default custom-keyboard scale-90 sm:scale-100 origin-top"
                />
              </div>
              
              <div className="flex justify-end gap-3 sm:gap-4 mt-6 sm:mt-8">
                 <button 
                   onClick={() => setIsNaming(false)}
                   className="flex-1 sm:flex-none px-4 sm:px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest text-[10px] sm:text-xs"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleNameSubmit}
                   className="flex-1 sm:flex-none px-4 sm:px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest text-[10px] sm:text-xs"
                 >
                   Confirm
                 </button>
              </div>
            </div>
          </div>
        )}

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

        <MidiDebugger 
          isOpen={isMidiDebuggerOpen}
          onClose={() => setIsMidiDebuggerOpen(false)}
          events={midiDebugEvents}
          onClear={() => setMidiDebugEvents([])}
          onSimulateNoteOn={handleNoteOn}
          onSimulateNoteOff={handleNoteOff}
          onSimulateCC={handleMidiCC}
        />
      </div>
    );
  }
