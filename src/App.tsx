/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { JupiterSlider, JupiterToggle, JupiterSelector } from './components/Controls';
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
import { DX7Panel } from './components/DX7Panel';
import { DEFAULT_PARAMS, VoiceParams, Patch, MidiMapping, cleanVoiceParams, Multi, MultiSlot, Song, Setlist } from './types';
import { Power, Save, FolderOpen, Sliders, Waves, Activity, Trash2, X, Keyboard as PianoIcon, Cloud, UploadCloud, DownloadCloud, Link, Maximize, Minimize, Settings2, Plus, Layers, Edit2, Play, Pause, Square, Radio } from 'lucide-react';
import React from 'react';
import Keyboard from 'react-simple-keyboard';
import { PianoKeyboard } from './components/PianoKeyboard';
import { SettingsModal } from './components/SettingsModal';
import { LivePerformanceView } from './components/LivePerformanceView';
import { SetlistMidiBacking } from './components/SetlistMidiBacking';
import { GroupedPresetsView } from './components/GroupedPresetsView';
import { MidiDebugger, MidiDebugEvent } from './components/MidiDebugger';
import { MidiEditorModal } from './components/MidiEditorModal';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { googleSheetsService } from './services/GoogleSheetsService';
import { indexedDBService } from './services/IndexedDBService';
import { soundfontService, getGoogleDriveApiKey } from './services/SoundfontService';
import { midiTrackService } from './services/MidiTrackService';
import { PRESET_PATCHES } from './constants/presetPatches';
import { DURAN_PATCHES, DURAN_MULTIS, DURAN_SETLIST } from './constants/duranPresets';
import { autoCategorizePatches, autoCategorizeMultis } from './utils/categorizer';
import 'react-simple-keyboard/build/css/index.css';

type Screen = 'SYNTH' | 'ARP' | 'FX' | 'PATCHES';

export default function AppWrapper() {
  return (
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}

const getNoteName = (midiNote: number): string => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = notes[midiNote % 12];
  return `${noteName}${octave}`;
};

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
  
  // Patch and Multi naming state
  const [isNaming, setIsNaming] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [namingMode, setNamingMode] = useState<'SAVE' | 'SAVE_AS' | 'RENAME_PATCH' | 'RENAME_MULTI' | 'CREATE_MULTI'>('SAVE');
  const [namingTargetId, setNamingTargetId] = useState<string | null>(null);
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
  const [selectedMapParam, setSelectedMapParam] = useState<keyof VoiceParams | 'songPlayPause' | null>(null);
  const [appMode, setAppMode] = useState<'LIVE' | 'SONG' | 'EDIT'>('LIVE');
  const [midiMappings, setMidiMappings] = useState<MidiMapping[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMidiLogVisible, setIsMidiLogVisible] = useState(false);
  const [midiDebugEvents, setMidiDebugEvents] = useState<MidiDebugEvent[]>([]);
  const [isMidiDebuggerOpen, setIsMidiDebuggerOpen] = useState(false);
  const [isMidiEditorOpen, setIsMidiEditorOpen] = useState(false);

  const [patches, setPatches] = useState<Patch[]>([]);
  const [multis, setMultis] = useState<Multi[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [isMidiPlaying, setIsMidiPlaying] = useState<boolean>(false);
  const [midiProgress, setMidiProgress] = useState<{ current: number; duration: number }>({ current: 0, duration: 0 });
  const [newSongName, setNewSongName] = useState('');
  const [newSongType, setNewSongType] = useState<'patch' | 'multi'>('patch');
  const [newSongTargetId, setNewSongTargetId] = useState('');
  const [activeMultiId, setActiveMultiId] = useState<string | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [libraryTab, setLibraryTab] = useState<'PATCHES' | 'MULTIS' | 'SETLISTS'>('PATCHES');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRestored, setIsRestored] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);

  const [customDialog, setCustomDialog] = useState<{
    type: 'alert' | 'confirm' | 'prompt';
    title: string;
    message: string;
    defaultValue?: string;
    onConfirm: (value?: string) => void;
    onCancel?: () => void;
  } | null>(null);
  const [dialogInput, setDialogInput] = useState('');

  const showCustomAlert = (title: string, message: string, onConfirm?: () => void) => {
    setCustomDialog({
      type: 'alert',
      title,
      message,
      onConfirm: () => {
        if (onConfirm) onConfirm();
        setCustomDialog(null);
      }
    });
  };

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setCustomDialog({
      type: 'confirm',
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setCustomDialog(null);
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setCustomDialog(null);
      }
    });
  };

  const showCustomPrompt = (title: string, message: string, defaultValue: string, onConfirm: (val: string) => void) => {
    setDialogInput(defaultValue);
    setCustomDialog({
      type: 'prompt',
      title,
      message,
      defaultValue,
      onConfirm: (val) => {
        onConfirm(val || '');
        setCustomDialog(null);
      },
      onCancel: () => {
        setCustomDialog(null);
      }
    });
  };

  const [midiLedActive, setMidiLedActive] = useState(false);
  const midiLedTimeoutRef = useRef<number | null>(null);

  const triggerMidiLedFlash = React.useCallback(() => {
    setMidiLedActive(true);
    if (midiLedTimeoutRef.current !== null) {
      window.clearTimeout(midiLedTimeoutRef.current);
    }
    midiLedTimeoutRef.current = window.setTimeout(() => {
      setMidiLedActive(false);
      midiLedTimeoutRef.current = null;
    }, 100);
  }, []);

  const isMidiPlayingRef = useRef<boolean>(false);
  const lastMidiProgressUpdateRef = useRef<number>(0);

  useEffect(() => {
    const unsub = midiTrackService.addProgressListener((cur, dur, playing) => {
      if (playing !== isMidiPlayingRef.current) {
        isMidiPlayingRef.current = playing;
        setIsMidiPlaying(playing);
      }
      const now = Date.now();
      if (now - lastMidiProgressUpdateRef.current >= 250 || playing !== isMidiPlayingRef.current) {
        lastMidiProgressUpdateRef.current = now;
        setMidiProgress({ current: cur, duration: dur });
      }
    });
    return unsub;
  }, []);

  const triggerMidiLedFlashRef = useRef<(() => void) | null>(null);

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
      
      // Always merge PRESET_PATCHES and DURAN_PATCHES to ensure user has the latest ones if they haven't deleted them
      const allPresetPatches = [...PRESET_PATCHES, ...DURAN_PATCHES];
      const factoryPatchMap = new Map(allPresetPatches.map(p => [p.id, p]));
      
      // Update any stored factory patches with the latest code definitions so parameter fixes take effect immediately
      const updatedStoredPatches = storedPatches.map(p => {
        const factoryPatch = factoryPatchMap.get(p.id);
        if (factoryPatch) {
          return {
            ...factoryPatch,
            midiMappings: (p.midiMappings && p.midiMappings.length > 0) ? p.midiMappings : factoryPatch.midiMappings
          };
        }
        return p;
      });

      const existingIds = new Set(updatedStoredPatches.map(p => p.id));
      const newPresets = allPresetPatches.filter(p => !existingIds.has(p.id));
      
      let finalPatches = [...updatedStoredPatches, ...newPresets];

      if (storedPatches.length === 0 && finalPatches.length === 0) {
        console.log('Seeding IndexedDB with preset patches...');
        finalPatches = allPresetPatches;
      }

      // Migration: ensure all fields exist and patches have auto-assigned groups
      const categorized = autoCategorizePatches(finalPatches);
      const migrated = categorized.map((p: any) => ({
        ...p,
        params: cleanVoiceParams(p.params),
        midiMappings: (p.midiMappings || []).map((m: any) => ({
          parameter: m.parameter,
          cc: m.cc,
          channel: m.channel ?? 0
        }))
      }));
      
      await indexedDBService.savePatches(migrated);
      setPatches(migrated);

      // Load multis
      const storedMultis = await indexedDBService.getAllMultis();
      let finalMultis = [...storedMultis];
      
      if (finalMultis.length === 0) {
        const defaultMulti: Multi = {
          id: 'default-multi-split',
          name: 'Default Synth Split',
          slots: [
            {
              patchId: migrated[0]?.id || '1',
              lowNote: 0,
              highNote: 59,
              lowVelocity: 0,
              highVelocity: 127,
              lowMapVelocity: 0,
              highMapVelocity: 127,
              transposeOctave: 0,
              transposeNote: 0
            },
            {
              patchId: migrated[1]?.id || migrated[0]?.id || '1',
              lowNote: 60,
              highNote: 127,
              lowVelocity: 0,
              highVelocity: 127,
              lowMapVelocity: 0,
              highMapVelocity: 127,
              transposeOctave: 0,
              transposeNote: 0
            }
          ]
        };
        finalMultis = [defaultMulti];
      }

      // Ensure DURAN_MULTIS are seeded if not present
      const existingMultiIds = new Set(finalMultis.map(m => m.id));
      const newDuranMultis = DURAN_MULTIS.filter(m => !existingMultiIds.has(m.id));
      if (newDuranMultis.length > 0) {
        finalMultis = [...finalMultis, ...newDuranMultis];
      }
      
      const categorizedMultis = autoCategorizeMultis(finalMultis);
      await indexedDBService.saveMultis(categorizedMultis);
      setMultis(categorizedMultis);
      
      // Restore last selected patch and params if exists in appState
      const appState = await indexedDBService.getAppState();
      let finalSetlists: Setlist[] = [];
      let activeSetId: string | null = null;
      
      if (appState) {
        if (appState.activePatchId) setActivePatchId(appState.activePatchId);
        if (appState.activeMultiId) setActiveMultiId(appState.activeMultiId);
        if (appState.params) setParams(cleanVoiceParams(appState.params));
        if (appState.midiMappings) setMidiMappings(appState.midiMappings);
        if (appState.currentScreen) setCurrentScreen(appState.currentScreen);
        if (appState.showKeyboard !== undefined) setShowKeyboard(appState.showKeyboard);
        if (appState.isMidiLogVisible !== undefined) setIsMidiLogVisible(appState.isMidiLogVisible);
        if (appState.appMode) {
          setAppMode(appState.appMode);
        } else if (appState.isSongMode !== undefined) {
          setAppMode(appState.isSongMode ? 'SONG' : 'EDIT');
        }
        finalSetlists = appState.setlists || [];
        activeSetId = appState.activeSetlistId || null;
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

      // Check if DURAN_SETLIST is missing from setlists list, if so add it
      if (!finalSetlists.some(s => s.id === DURAN_SETLIST.id)) {
        finalSetlists = [...finalSetlists, DURAN_SETLIST];
        // Make the Duran Duran setlist active if none is currently active
        if (!activeSetId) {
          activeSetId = DURAN_SETLIST.id;
        }
      }
      
      setSetlists(finalSetlists);
      if (activeSetId) {
        setActiveSetlistId(activeSetId);
      }
      
      setIsRestored(true);
    };
    initDB();
  }, []);

  const persistAppState = React.useCallback(async () => {
    if (!isRestored) return;
    await indexedDBService.saveAppState({
      activePatchId,
      activeMultiId,
      params,
      midiMappings,
      currentScreen,
      showKeyboard,
      isMidiLogVisible,
      appMode,
      setlists,
      activeSetlistId
    });

    // Also keep localStorage as minimal fallback
    if (activePatchId) {
      localStorage.setItem('jupiter_last_patch_id', activePatchId);
    } else {
      localStorage.removeItem('jupiter_last_patch_id');
    }
  }, [activePatchId, activeMultiId, params, midiMappings, currentScreen, showKeyboard, isMidiLogVisible, appMode, isRestored, setlists, activeSetlistId]);

  // Save multis whenever they change
  useEffect(() => {
    if (multis.length > 0) {
      indexedDBService.saveMultis(multis);
    }
  }, [multis]);

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
    setParams(prev => {
      const nextParams = { ...prev, [key]: val };
      if (activeMultiId) {
        const activeMulti = multis.find(m => m.id === activeMultiId);
        if (activeMulti && activeMulti.slots && activeMulti.slots[selectedSlotIndex]) {
          const slot = activeMulti.slots[selectedSlotIndex];
          setPatches(prevPatches => {
            const updated = prevPatches.map(p => p.id === slot.patchId ? { ...p, params: nextParams } : p);
            return updated;
          });
        }
      } else if (activePatchId) {
        setPatches(prevPatches => {
          const updated = prevPatches.map(p => p.id === activePatchId ? { ...p, params: nextParams } : p);
          return updated;
        });
      }
      return nextParams;
    });
  }, [activeMultiId, activePatchId, multis, selectedSlotIndex]);

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

  const handleToggleMainSongPlayRef = useRef<() => void>(() => {});

  const handleMidiCC = React.useCallback((cc: number, value: number, channel: number) => {
    console.log(`[MIDI EVENT] CC message received: cc=${cc}, value=${value}, channel=${channel}. isMidiMappingMode=${isMidiMappingMode}, selectedMapParam=${selectedMapParam}`);
    
    if (isMidiMappingMode) {
      if ((selectedMapParam as string) === 'songPlayPause') {
        console.log(`[MIDI LEARN] Assigning CC ${cc} (Ch ${channel + 1}) to global Song Play/Pause`);
        updateSettings({ songPlayPauseCc: cc, songPlayPauseChannel: channel });
        
        // Remove this CC from patch mappings so it is unavailable for overrides
        setMidiMappings(prev => prev.filter(m => m.cc !== cc));
        if (activePatchId) {
          setPatches(currentPatches => 
            currentPatches.map(p => p.id === activePatchId ? { 
              ...p, 
              midiMappings: (p.midiMappings || []).filter(m => m.cc !== cc)
            } : p)
          );
        }

        // Save to sheet if connected
        if (settings.googleSheetUrl && googleSheetsService.isConnected()) {
          googleSheetsService.saveToSheet(patches, multis, setlists, settings.googleSheetUrl, {
            ...settings,
            songPlayPauseCc: cc,
            songPlayPauseChannel: channel
          }).catch(e => console.warn('Failed to auto-save global MIDI mapping to sheet', e));
        }

        setSelectedMapParam(null);
        return;
      }

      if (selectedMapParam) {
        // Block patch mapping if CC is reserved for Song Play/Pause
        if (settings.songPlayPauseCc !== null && settings.songPlayPauseCc !== undefined && cc === settings.songPlayPauseCc) {
          showCustomAlert('RESERVED MIDI CC', `CC ${cc} is reserved globally for Song Play/Pause and cannot be mapped to patch parameters.`);
          return;
        }

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

    // Normal operation: Check global Song Play/Pause MIDI CC FIRST
    if (
      settings.songPlayPauseCc !== null &&
      settings.songPlayPauseCc !== undefined &&
      cc === settings.songPlayPauseCc
    ) {
      if (
        settings.songPlayPauseChannel === null ||
        settings.songPlayPauseChannel === undefined ||
        settings.songPlayPauseChannel === 0 ||
        settings.songPlayPauseChannel === channel
      ) {
        if (value >= 64 || value > 0) {
          handleToggleMainSongPlayRef.current();
        }
        // MUST RETURN TO MAKE UNAVAILABLE FOR OVERRIDES
        return;
      }
    }

    // Route to slider / toggle / selector
    const mapping = midiMappings.find(m => m.cc === cc && m.channel === channel);
    if (mapping) {
      const paramKey = mapping.parameter;
      updateParamFromCC(paramKey, value);
    }

    // Default Mod Wheel modifier
    if (cc === 1) {
      engineRef.current?.setModWheel(value);
    }
  }, [isMidiMappingMode, selectedMapParam, activePatchId, midiMappings, settings, updateSettings, patches, multis, setlists, showCustomAlert]);

  const isMidiDebuggerOpenRef = useRef(isMidiDebuggerOpen);
  isMidiDebuggerOpenRef.current = isMidiDebuggerOpen;

  const addMidiLog = React.useCallback((data: Uint8Array) => {
    if (!isMidiLogVisibleRef.current) return;
    if (data[0] === 0xF8) return; // Filter out MIDI Timing Clock
    const bytes = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const id = Date.now() + Math.random();
    setMidiLogs(prev => [{ id, text: bytes }, ...prev].slice(0, 10));
  }, []);

  const addMidiDebugEvent = React.useCallback((
    type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Panic' | 'PC',
    channel: number | string,
    noteOrCC: string,
    numValue: number,
    velocityOrVal: string | number
  ) => {
    if (!isMidiDebuggerOpenRef.current) return;
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

  const handleProgramChange = React.useCallback((program: number, channel: number) => {
    addMidiDebugEvent('PC', settings.midiChannel || 'Omni', `Program Change ${program}`, program, program);
    
    const activeSetlist = setlists.find(s => s.id === activeSetlistId);
    if (!activeSetlist) return;

    const song = activeSetlist.songs[program];
    if (song) {
      handleLoadSong(song);
    }
  }, [setlists, activeSetlistId, patches, multis, settings.midiChannel, addMidiDebugEvent]);

  // Use refs for MIDI callbacks. Assign them directly in render to prevent stale closure lag
  const midiCCRef = useRef<(cc: number, value: number, channel: number) => void>(() => {});
  const midiNoteOnRef = useRef<(note: number, velocity: number) => void>(() => {});
  const midiNoteOffRef = useRef<(note: number) => void>(() => {});
  const midiPitchBendRef = useRef<(value: number) => void>(() => {});
  const handlePanicRef = useRef<() => void>(() => {});
  const isMidiLogVisibleRef = useRef<boolean>(false);
  const addMidiLogRef = useRef<(data: Uint8Array) => void>(() => {});
  const addMidiDebugRef = useRef<(type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend' | 'Panic' | 'PC', channel: number | string, noteOrCC: string, numValue: number, velocityOrVal: string | number) => void>(() => {});
  const midiProgramChangeRef = useRef<(program: number, channel: number) => void>(() => {});

  // Synchronously update Callback Refs on render
  midiCCRef.current = handleMidiCC;
  midiNoteOnRef.current = handleNoteOn;
  midiNoteOffRef.current = handleNoteOff;
  midiPitchBendRef.current = handlePitchBend;
  handlePanicRef.current = handlePanic;
  addMidiLogRef.current = addMidiLog;
  isMidiLogVisibleRef.current = isMidiLogVisible;
  addMidiDebugRef.current = addMidiDebugEvent;
  triggerMidiLedFlashRef.current = triggerMidiLedFlash;
  midiProgramChangeRef.current = handleProgramChange;

  useEffect(() => {
    const configUrl = settings.googleSheetUrl;
    if (configUrl && googleSheetsService.isConnected()) {
      // Try to pull on load if config exists and already connected
      googleSheetsService.loadFromSheet(configUrl).then(result => {
        const allPresetPatches = [...PRESET_PATCHES, ...DURAN_PATCHES];
        const factoryPatchMap = new Map(allPresetPatches.map(p => [p.id, p]));

        let finalSheetPatches = result.patches;
        if (result.patches && result.patches.length > 0) {
          finalSheetPatches = result.patches.map(p => {
            const factoryPatch = factoryPatchMap.get(p.id);
            if (factoryPatch) {
              return {
                ...factoryPatch,
                midiMappings: (p.midiMappings && p.midiMappings.length > 0) ? p.midiMappings : factoryPatch.midiMappings
              };
            }
            return p;
          });
          setPatches(finalSheetPatches);
          indexedDBService.savePatches(finalSheetPatches);
        }
        if (result.multis.length > 0) {
          setMultis(result.multis);
        }

        // Sync updated factory patches back to Google Sheet
        if (configUrl && finalSheetPatches.length > 0) {
          googleSheetsService.saveToSheet(finalSheetPatches, result.multis.length > 0 ? result.multis : multis, setlists, configUrl, settings).catch(err => {
            console.warn('App: Auto-push updated patches to Google Sheets failed', err);
          });
        }
        console.log('App: Auto-pulled and synced patches & multis with Google Sheets');
      }).catch(e => {
        console.warn('App: Initial sync pull failed', e);
      });
    }
  }, []);

  useEffect(() => {
    if (getGoogleDriveApiKey(settings) && settings.googleDriveFolderId) {
      soundfontService.syncFromDrive(settings, engineRef.current?.ctx).then(res => {
        if (res.syncedCount > 0) {
          console.log(`App: Auto-downloaded and installed ${res.syncedCount} new soundfont(s) from Google Drive`);
        }
      }).catch(e => {
        console.warn('App: Initial Google Drive Soundfont sync failed', e);
      });
    }
  }, []);

  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new JupiterEngine(params, settings);
      (window as any).jupiterEngine = engineRef.current;
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
    if (newSongType === 'patch') {
      setNewSongTargetId(patches[0]?.id || '');
    } else {
      setNewSongTargetId(multis[0]?.id || '');
    }
  }, [newSongType, patches, multis]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPerformanceSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (engineRef.current) {
      if (activeMultiId) {
        const activeMulti = multis.find(m => m.id === activeMultiId);
        if (activeMulti && activeMulti.slots && activeMulti.slots[selectedSlotIndex]) {
          const patchId = activeMulti.slots[selectedSlotIndex].patchId;
          engineRef.current.setParams(params, patchId);
        }
      } else {
        engineRef.current.setParams(params);
      }
    }
  }, [params, activeMultiId, multis, selectedSlotIndex]);

  // Load selected slot's patch params into state when slot selection changes
  useEffect(() => {
    if (activeMultiId) {
      const activeMulti = multis.find(m => m.id === activeMultiId);
      if (activeMulti && activeMulti.slots && activeMulti.slots[selectedSlotIndex]) {
        const slot = activeMulti.slots[selectedSlotIndex];
        const patch = patches.find(p => p.id === slot.patchId);
        if (patch) {
          setParams(cleanVoiceParams(patch.params));
          setMidiMappings(patch.midiMappings || []);
        }
      }
    }
  }, [activeMultiId, selectedSlotIndex]);

  // Sync active multi to engine
  useEffect(() => {
    if (engineRef.current) {
      if (activeMultiId) {
        const activeMulti = multis.find(m => m.id === activeMultiId);
        engineRef.current.setActiveMulti(activeMulti || null, patches);
      } else {
        engineRef.current.setActiveMulti(null, patches);
      }
    }
  }, [activeMultiId, multis, patches]);

  useEffect(() => {
    if (midiRef.current) {
      midiRef.current.setFilter(settings.midiInputId, settings.midiChannel, settings.autoConnectMicroKontrol);
    }
  }, [settings.midiInputId, settings.midiChannel, settings.autoConnectMicroKontrol]);

  useEffect(() => {
    if (patches.length > 0) {
      indexedDBService.savePatches(patches);
    }
  }, [patches]);

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
      await googleSheetsService.saveToSheet(patches, multis, setlists, settings.googleSheetUrl);
      showCustomAlert('SYNC COMPLETE', 'Library (Patches, Multis & Setlists) synced to Google Sheets successfully!');
    } catch (error: any) {
      console.error(error);
      setSyncError(error.message || 'Failed to sync');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromSheet = async () => {
    if (!settings.googleSheetUrl) return;
    showCustomConfirm(
      'OVERWRITE LOCAL LIBRARY',
      'This will overwrite local library with patches, multis, and setlists from Google Sheets. Continue?',
      async () => {
        setIsSyncing(true);
        setSyncError(null);
        try {
          const result = await googleSheetsService.loadFromSheet(settings.googleSheetUrl);
          const allPresetPatches = [...PRESET_PATCHES, ...DURAN_PATCHES];
          const factoryPatchMap = new Map(allPresetPatches.map(p => [p.id, p]));

          let finalSheetPatches = result.patches;
          if (result.patches && result.patches.length > 0) {
            finalSheetPatches = result.patches.map(p => {
              const factoryPatch = factoryPatchMap.get(p.id);
              if (factoryPatch) {
                return {
                  ...factoryPatch,
                  midiMappings: (p.midiMappings && p.midiMappings.length > 0) ? p.midiMappings : factoryPatch.midiMappings
                };
              }
              return p;
            });
            setPatches(finalSheetPatches);
            await indexedDBService.savePatches(finalSheetPatches);
          }
          if (result.multis && result.multis.length > 0) setMultis(result.multis);
          if (result.setlists && result.setlists.length > 0) setSetlists(result.setlists);

          if (settings.googleSheetUrl && finalSheetPatches.length > 0) {
            await googleSheetsService.saveToSheet(finalSheetPatches, result.multis && result.multis.length > 0 ? result.multis : multis, result.setlists || setlists, settings.googleSheetUrl);
          }
          showCustomAlert('SYNC COMPLETE', 'Library (Patches, Multis & Setlists) updated from Google Sheets!');
        } catch (error: any) {
          console.error(error);
          setSyncError(error.message || 'Failed to load');
        } finally {
          setIsSyncing(false);
        }
      }
    );
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
          (data) => {
            addMidiLogRef.current(data);
            // Check if this packet contains any non-realtime message
            // Realtime messages are 0xF8 to 0xFF (Clock, Active Sensing, etc.)
            const hasNonRealtime = Array.from(data).some(b => b < 0xF8);
            if (hasNonRealtime) {
              triggerMidiLedFlashRef.current?.();
            }
          },
          (value) => {
            addMidiDebugRef.current('Pitch Bend', 'Any', 'Bend', value, value - 8192);
            midiPitchBendRef.current(value);
          },
          () => {
            addMidiDebugRef.current('Panic', 'All', 'Panic', 0, 0);
            handlePanicRef.current();
          },
          (program, channel) => {
            midiProgramChangeRef.current(program, channel);
          }
        );
        midiRef.current.init().then(() => {
          midiRef.current?.setFilter(settings.midiInputId, settings.midiChannel, settings.autoConnectMicroKontrol);
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

  const startCreatePatch = () => {
    setNamingTargetId(null);
    setNamingMode('SAVE_AS');
    setPendingName(`NEW PATCH ${patches.length + 1}`);
    setIsNaming(true);
  };

  const startRenamePatch = (id: string, currentName: string) => {
    setNamingTargetId(id);
    setNamingMode('RENAME_PATCH');
    setPendingName(currentName);
    setIsNaming(true);
  };

  const startCreateMulti = () => {
    setNamingTargetId(null);
    setNamingMode('CREATE_MULTI');
    setPendingName(`NEW MULTI ${multis.length + 1}`);
    setIsNaming(true);
  };

  const startRenameMulti = (id: string, currentName: string) => {
    setNamingTargetId(id);
    setNamingMode('RENAME_MULTI');
    setPendingName(currentName);
    setIsNaming(true);
  };

  const handleNameSubmit = async () => {
    if (!pendingName.trim()) return;

    let updatedPatches = [...patches];
    let updatedMultis = [...multis];

    if (namingMode === 'SAVE' && activePatchId) {
      updatedPatches = patches.map(p => p.id === activePatchId ? { ...p, name: pendingName.trim(), params, midiMappings } : p);
      setPatches(updatedPatches);
    } else if (namingMode === 'SAVE_AS') {
      const newPatch: Patch = { id: Date.now().toString(), name: pendingName.trim(), params, midiMappings };
      updatedPatches = [...patches, newPatch];
      setPatches(updatedPatches);
      setActivePatchId(newPatch.id);
      setActiveMultiId(null); // Switch to patch mode
    } else if (namingMode === 'RENAME_PATCH' && namingTargetId) {
      updatedPatches = patches.map(p => p.id === namingTargetId ? { ...p, name: pendingName.trim() } : p);
      setPatches(updatedPatches);
    } else if (namingMode === 'RENAME_MULTI' && namingTargetId) {
      updatedMultis = multis.map(m => m.id === namingTargetId ? { ...m, name: pendingName.trim() } : m);
      setMultis(updatedMultis);
    } else if (namingMode === 'CREATE_MULTI') {
      const p0 = patches[0]?.id || '1';
      const p1 = patches[1]?.id || p0;
      const p2 = patches[2]?.id || p0;
      const p3 = patches[3]?.id || p0;
      const newMulti: Multi = {
        id: `multi-${Date.now()}`,
        name: pendingName.trim(),
        slots: [
          {
            patchId: p0,
            lowNote: 0,
            highNote: 127,
            lowVelocity: 0,
            highVelocity: 127,
            lowMapVelocity: 0,
            highMapVelocity: 127,
            transposeOctave: 0,
            transposeNote: 0
          },
          {
            patchId: p1,
            lowNote: 0,
            highNote: 127,
            lowVelocity: 0,
            highVelocity: 127,
            lowMapVelocity: 0,
            highMapVelocity: 127,
            transposeOctave: 0,
            transposeNote: 0
          },
          {
            patchId: p2,
            lowNote: 0,
            highNote: 127,
            lowVelocity: 0,
            highVelocity: 127,
            lowMapVelocity: 0,
            highMapVelocity: 127,
            transposeOctave: 0,
            transposeNote: 0
          },
          {
            patchId: p3,
            lowNote: 0,
            highNote: 127,
            lowVelocity: 0,
            highVelocity: 127,
            lowMapVelocity: 0,
            highMapVelocity: 127,
            transposeOctave: 0,
            transposeNote: 0
          }
        ]
      };
      updatedMultis = [...multis, newMulti];
      setMultis(updatedMultis);
      setActiveMultiId(newMulti.id);
      setActivePatchId(null);
      setSelectedSlotIndex(0);
    }
    
    setIsNaming(false);

    // Auto-sync to sheets if URL exists
    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.saveToSheet(updatedPatches, updatedMultis, settings.googleSheetUrl);
        console.log('App: Auto-synced patches and multis to Google Sheets after save');
      } catch (error) {
        console.error('App: Auto-sync failed:', error);
      }
    }
  };

  const loadPatch = (patch: Patch, switchScreen: boolean = true) => {
    handlePanic();
    engineRef.current?.setModWheel(0);
    engineRef.current?.setPitchBend(0);
    // Ensure all params exist by merging with defaults
    setParams(cleanVoiceParams(patch.params));
    setActivePatchId(patch.id);
    setActiveMultiId(null); // Deactivate multi mode
    setMidiMappings(patch.midiMappings || []);
    if (switchScreen) {
      setCurrentScreen('SYNTH');
    }
  };

  const deletePatch = async (id: string) => {
    showCustomConfirm('DELETE PATCH', 'Delete patch?', async () => {
      const updatedPatches = patches.filter(p => p.id !== id);
      setPatches(updatedPatches);
      if (activePatchId === id) setActivePatchId(null);

      // Auto-sync to sheets if URL exists
      if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        try {
          await googleSheetsService.saveToSheet(updatedPatches, multis, settings.googleSheetUrl);
          console.log('App: Auto-synced patches and multis to Google Sheets after delete');
        } catch (error) {
          console.error('App: Auto-sync failed:', error);
        }
      }
    });
  };

  const loadMulti = (multi: Multi, switchScreen: boolean = true) => {
    handlePanic();
    engineRef.current?.setModWheel(0);
    engineRef.current?.setPitchBend(0);
    setActiveMultiId(multi.id);
    setActivePatchId(null); // Deactivate single patch mode
    setSelectedSlotIndex(0);
    // Load the first slot's patch into parameters so visual controls are aligned
    if (multi.slots.length > 0) {
      const firstSlot = multi.slots[0];
      const patch = patches.find(p => p.id === firstSlot.patchId);
      if (patch) {
        setParams(cleanVoiceParams(patch.params));
        setMidiMappings(patch.midiMappings || []);
      }
    }
    if (switchScreen) {
      setCurrentScreen('SYNTH');
    }
  };

  const handleCreateSetlist = () => {
    showCustomPrompt('CREATE SETLIST', 'ENTER NAME FOR THE NEW SETLIST:', `SETLIST ${setlists.length + 1}`, (name) => {
      if (!name) return;
      const newSetlist: Setlist = {
        id: `setlist-${Date.now()}`,
        name: name.toUpperCase(),
        songs: []
      };
      const updatedSetlists = [...setlists, newSetlist];
      setSetlists(updatedSetlists);
      setSelectedSetlistId(newSetlist.id);
      if (!activeSetlistId) {
        setActiveSetlistId(newSetlist.id);
      }
    });
  };

  const handleDeleteSetlist = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    showCustomConfirm('DELETE SETLIST', 'ARE YOU SURE YOU WANT TO DELETE THIS SETLIST?', () => {
      const updated = setlists.filter(s => s.id !== id);
      setSetlists(updated);
      if (activeSetlistId === id) {
        setActiveSetlistId(updated[0]?.id || null);
      }
      if (selectedSetlistId === id) {
        setSelectedSetlistId(updated[0]?.id || null);
      }
    });
  };

  const handleRenameSetlist = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const setlist = setlists.find(s => s.id === id);
    if (!setlist) return;
    showCustomPrompt('RENAME SETLIST', 'RENAME SETLIST TO:', setlist.name, (name) => {
      if (!name) return;
      const updated = setlists.map(s => s.id === id ? { ...s, name: name.toUpperCase() } : s);
      setSetlists(updated);
    });
  };

  const handleAddSongToSetlist = (setlistId: string, songName: string, type: 'patch' | 'multi', targetId: string) => {
    if (!songName.trim() || !targetId) return;
    const newSong: Song = {
      id: `song-${Date.now()}`,
      name: songName.trim().toUpperCase(),
      type,
      targetId
    };
    const updated = setlists.map(s => {
      if (s.id === setlistId) {
        return {
          ...s,
          songs: [...s.songs, newSong]
        };
      }
      return s;
    });
    setSetlists(updated);
  };

  const handleDeleteSongFromSetlist = (setlistId: string, songId: string) => {
    const updated = setlists.map(s => {
      if (s.id === setlistId) {
        return {
          ...s,
          songs: s.songs.filter(sg => sg.id !== songId)
        };
      }
      return s;
    });
    setSetlists(updated);
  };

  const handleMoveSong = (setlistId: string, songId: string, direction: 'up' | 'down') => {
    const updated = setlists.map(s => {
      if (s.id === setlistId) {
        const index = s.songs.findIndex(sg => sg.id === songId);
        if (index === -1) return s;
        if (direction === 'up' && index === 0) return s;
        if (direction === 'down' && index === s.songs.length - 1) return s;
        
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const newSongs = [...s.songs];
        const temp = newSongs[index];
        newSongs[index] = newSongs[targetIndex];
        newSongs[targetIndex] = temp;
        
        return {
          ...s,
          songs: newSongs
        };
      }
      return s;
    });
    setSetlists(updated);
  };

  const handleUpdatePatchGroup = (patchId: string, groupName: string | undefined) => {
    const updated = patches.map(p => p.id === patchId ? { ...p, group: groupName } : p);
    setPatches(updated);
    indexedDBService.savePatches(updated);
  };

  const handleUpdateMultiGroup = (multiId: string, groupName: string | undefined) => {
    const updated = multis.map(m => m.id === multiId ? { ...m, group: groupName } : m);
    setMultis(updated);
    indexedDBService.saveAppState({ patches, activePatchId, activeMultiId, currentScreen, showKeyboard, isMidiLogVisible, setlists, activeSetlistId, multis: updated });
  };

  const handleAutoCategorizeAll = async () => {
    if (libraryTab === 'PATCHES') {
      const categorized = autoCategorizePatches(patches, true);
      setPatches(categorized);
      await indexedDBService.savePatches(categorized);
      if (settings.googleSheetUrl && googleSheetsService.isConnected()) {
        googleSheetsService.saveToSheet(categorized, multis, setlists, settings.googleSheetUrl, settings).catch(err => {
          console.warn('App: Push categorized patches to Google Sheets failed', err);
        });
      }
      showCustomAlert('AUTO-CATEGORIZATION COMPLETE', `Successfully organized all ${categorized.length} patches into sound categories!`);
    } else if (libraryTab === 'MULTIS') {
      const categorized = autoCategorizeMultis(multis, true);
      setMultis(categorized);
      await indexedDBService.saveMultis(categorized);
      if (settings.googleSheetUrl && googleSheetsService.isConnected()) {
        googleSheetsService.saveToSheet(patches, categorized, setlists, settings.googleSheetUrl, settings).catch(err => {
          console.warn('App: Push categorized multis to Google Sheets failed', err);
        });
      }
      showCustomAlert('AUTO-CATEGORIZATION COMPLETE', `Successfully organized all ${categorized.length} multis into categories!`);
    }
  };

  const handleUpdateSongInSetlist = (setlistId: string, updatedSong: Song) => {
    const updated = setlists.map(s => {
      if (s.id === setlistId) {
        return {
          ...s,
          songs: s.songs.map(sg => sg.id === updatedSong.id ? updatedSong : sg)
        };
      }
      return s;
    });
    setSetlists(updated);
    indexedDBService.saveAppState({ patches, activePatchId, activeMultiId, currentScreen, showKeyboard, isMidiLogVisible, setlists: updated, activeSetlistId, multis });
  };

  const handleAddPatchesAndMultiFromMidi = (newPatches: Patch[], newMulti: Multi) => {
    const updatedPatches = [...patches, ...newPatches];
    const updatedMultis = [...multis, newMulti];
    setPatches(updatedPatches);
    setMultis(updatedMultis);
    indexedDBService.savePatches(updatedPatches);
    indexedDBService.saveAppState({ patches: updatedPatches, activePatchId, activeMultiId: newMulti.id, currentScreen, showKeyboard, isMidiLogVisible, setlists, activeSetlistId, multis: updatedMultis });
    loadMulti(newMulti);
  };

  const handleLoadSong = (song: Song, switchScreen: boolean = false) => {
    setActiveSong(song);
    if (song.type === 'multi') {
      const multi = multis.find(m => m.id === song.targetId);
      if (multi) {
        loadMulti(multi, switchScreen);
      } else {
        showCustomAlert('NOTICE', 'Associated Multi not found!');
      }
    } else if (song.type === 'patch') {
      const patch = patches.find(p => p.id === song.targetId);
      if (patch) {
        loadPatch(patch, switchScreen);
      } else {
        const patchByName = patches.find(p => p.name.toLowerCase() === song.name.toLowerCase());
        if (patchByName) {
          loadPatch(patchByName, switchScreen);
        } else {
          showCustomAlert('NOTICE', 'Associated Patch not found!');
        }
      }
    }
  };

  const handleToggleMainSongPlay = async (targetSong?: Song) => {
    try {
      if (engineRef.current) {
        await engineRef.current.resume();
      }

      let songToPlay = targetSong || activeSong;
      if (!songToPlay) {
        const activeSetlist = setlists.find(s => s.id === activeSetlistId) || setlists[0];
        if (activeSetlist && activeSetlist.songs && activeSetlist.songs.length > 0) {
          songToPlay = activeSetlist.songs[0];
        }
      }

      if (!engineRef.current || !songToPlay) {
        showCustomAlert('NOTICE', 'No song is currently loaded in the setlist.');
        return;
      }

      if (activeSong?.id !== songToPlay.id) {
        handleLoadSong(songToPlay);
      }

      if (!songToPlay.midiFile) {
        // Trigger brief audio test note on synth engine so user gets instant sound feedback on mobile
        engineRef.current.noteOn(60, 0.7);
        setTimeout(() => engineRef.current?.noteOff(60), 300);

        showCustomAlert(
          'NOTICE',
          `No MIDI backing track attached to "${songToPlay.name}". The synth sound preset is loaded and playable! You can attach a MIDI file in Library > Setlists.`
        );
        return;
      }

      if (isMidiPlaying && midiTrackService.getPlayingFileName() === songToPlay.midiFile) {
        midiTrackService.pausePlayback(engineRef.current);
        setIsMidiPlaying(false);
      } else {
        const success = await midiTrackService.startPlayback(
          songToPlay.midiFile,
          engineRef.current,
          songToPlay.midiTrackOverrides,
          midiProgress.current,
          songToPlay.leadInBars || 0,
          patches
        );
        if (success) {
          setIsMidiPlaying(true);
        } else {
          showCustomAlert(
            'NOTICE',
            `Backing track "${songToPlay.midiFile}" is not cached locally on this device. Upload or select a MIDI file in Library > Setlists.`
          );
          setIsMidiPlaying(false);
        }
      }
    } catch (err: any) {
      console.error('Error toggling song play:', err);
      showCustomAlert('ERROR', `Playback error: ${err?.message || err}`);
    }
  };

  useEffect(() => {
    handleToggleMainSongPlayRef.current = handleToggleMainSongPlay;
  }, [handleToggleMainSongPlay]);

  const handleStopMainSongPlay = async () => {
    if (engineRef.current) {
      await engineRef.current.resume();
      midiTrackService.stopPlayback(engineRef.current);
    }
    setIsMidiPlaying(false);
    setMidiProgress({ current: 0, duration: 0 });
  };

  const handleCreateMulti = async () => {
    const p0 = patches[0]?.id || '1';
    const p1 = patches[1]?.id || p0;
    const p2 = patches[2]?.id || p0;
    const p3 = patches[3]?.id || p0;
    const newMulti: Multi = {
      id: `multi-${Date.now()}`,
      name: `NEW MULTI ${multis.length + 1}`,
      slots: [
        {
          patchId: p0,
          lowNote: 0,
          highNote: 127,
          lowVelocity: 0,
          highVelocity: 127,
          lowMapVelocity: 0,
          highMapVelocity: 127,
          transposeOctave: 0,
          transposeNote: 0
        },
        {
          patchId: p1,
          lowNote: 0,
          highNote: 127,
          lowVelocity: 0,
          highVelocity: 127,
          lowMapVelocity: 0,
          highMapVelocity: 127,
          transposeOctave: 0,
          transposeNote: 0
        },
        {
          patchId: p2,
          lowNote: 0,
          highNote: 127,
          lowVelocity: 0,
          highVelocity: 127,
          lowMapVelocity: 0,
          highMapVelocity: 127,
          transposeOctave: 0,
          transposeNote: 0
        },
        {
          patchId: p3,
          lowNote: 0,
          highNote: 127,
          lowVelocity: 0,
          highVelocity: 127,
          lowMapVelocity: 0,
          highMapVelocity: 127,
          transposeOctave: 0,
          transposeNote: 0
        }
      ]
    };
    const updatedMultis = [...multis, newMulti];
    setMultis(updatedMultis);
    setActiveMultiId(newMulti.id);
    setActivePatchId(null);
    setSelectedSlotIndex(0);

    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.saveToSheet(patches, updatedMultis, settings.googleSheetUrl);
      } catch (e) {
        console.error('Auto-sync multi creation failed:', e);
      }
    }
  };

  const handleRenameMulti = async (id: string, newName: string) => {
    const updatedMultis = multis.map(m => m.id === id ? { ...m, name: newName } : m);
    setMultis(updatedMultis);

    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.saveToSheet(patches, updatedMultis, settings.googleSheetUrl);
      } catch (e) {
        console.error('Failed to sync rename to sheet:', e);
      }
    }
  };

  const handleUpdateSlot = async (slotIndex: number, fields: Partial<MultiSlot>) => {
    if (!activeMultiId) return;
    const updatedMultis = multis.map(m => {
      if (m.id !== activeMultiId) return m;
      const updatedSlots = m.slots.map((slot, idx) => {
        if (idx !== slotIndex) return slot;
        return { ...slot, ...fields };
      });
      return { ...m, slots: updatedSlots };
    });
    setMultis(updatedMultis);

    // If patch ID changed, we also want to load that patch's parameters so the knobs are in sync!
    if (fields.patchId) {
      const patch = patches.find(p => p.id === fields.patchId);
      if (patch) {
        setParams(cleanVoiceParams(patch.params));
        setMidiMappings(patch.midiMappings || []);
      }
    }

    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.saveToSheet(patches, updatedMultis, settings.googleSheetUrl);
      } catch (e) {
        console.error('Failed to sync slot update to sheet:', e);
      }
    }
  };

  const handleAddSlot = async () => {
    if (!activeMultiId) return;
    const firstPatchId = patches[0]?.id || '1';
    const updatedMultis = multis.map(m => {
      if (m.id !== activeMultiId) return m;
      const newSlot: MultiSlot = {
        patchId: firstPatchId,
        lowNote: 0,
        highNote: 127,
        lowVelocity: 0,
        highVelocity: 127,
        lowMapVelocity: 0,
        highMapVelocity: 127,
        transposeOctave: 0,
        transposeNote: 0
      };
      return { ...m, slots: [...m.slots, newSlot] };
    });
    setMultis(updatedMultis);
    const activeMulti = multis.find(m => m.id === activeMultiId);
    if (activeMulti) {
      setSelectedSlotIndex(activeMulti.slots.length);
    }

    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.saveToSheet(patches, updatedMultis, settings.googleSheetUrl);
      } catch (e) {
        console.error('Failed to sync slot addition to sheet:', e);
      }
    }
  };

  const handleDeleteSlot = async (slotIndex: number) => {
    if (!activeMultiId) return;
    const updatedMultis = multis.map(m => {
      if (m.id !== activeMultiId) return m;
      const nextSlots = m.slots.filter((_, idx) => idx !== slotIndex);
      return { ...m, slots: nextSlots };
    });
    setMultis(updatedMultis);
    setSelectedSlotIndex(0);

    if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      try {
        await googleSheetsService.saveToSheet(patches, updatedMultis, settings.googleSheetUrl);
      } catch (e) {
        console.error('Failed to sync slot deletion to sheet:', e);
      }
    }
  };

  const handleDeleteMulti = async (id: string) => {
    showCustomConfirm('DELETE MULTI PRESET', 'Delete this multi preset?', async () => {
      const updatedMultis = multis.filter(m => m.id !== id);
      setMultis(updatedMultis);
      if (activeMultiId === id) setActiveMultiId(null);
      await indexedDBService.deleteMulti(id);

      if (settings.googleSheetUrl && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        try {
          await googleSheetsService.saveToSheet(patches, updatedMultis, settings.googleSheetUrl);
        } catch (e) {
          console.error('Failed to sync deletion to sheet:', e);
        }
      }
    });
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
      ) : params.synthEngine === 'dx7' ? (
        <DX7Panel 
          params={params}
          updateParam={updateParam}
          isMidiMappingMode={isMidiMappingMode}
          handleMapClick={handleMapClick}
          getMappedCC={getMappedCC}
          selectedMapParam={selectedMapParam}
        />
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
            vco1SoundfontEnabled={params.vco1SoundfontEnabled}
            vco1SoundfontName={params.vco1SoundfontName}
            vco1SoundfontSampleIndex={params.vco1SoundfontSampleIndex ?? 0}
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
            vco2SoundfontEnabled={params.vco2SoundfontEnabled}
            vco2SoundfontName={params.vco2SoundfontName}
            vco2SoundfontSampleIndex={params.vco2SoundfontSampleIndex ?? 0}
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
      <div className="flex flex-wrap items-center justify-between px-2 py-1.5 sm:px-3 w-full min-w-0 gap-1.5 sm:gap-2 bg-synth-panel border-b border-synth-border shrink-0 z-20">
        {/* Mobile Patch Title & Status */}
        <div className="flex sm:hidden items-center gap-2 border-r border-synth-border/40 pr-2">
          <div className={`w-1.5 h-1.5 rounded-full ${engineReady ? 'bg-red-600 shadow-[0_0_8px_red]' : 'bg-zinc-800'}`} />
          <h1 className="text-[10px] font-bold tracking-wider text-white uppercase truncate max-w-[110px]">
            {activeMultiId 
              ? `MULTI: ${multis.find(m => m.id === activeMultiId)?.name || 'UNKNOWN'}`
              : activePatchId 
                ? patches.find(p => p.id === activePatchId)?.name 
                : 'UNSAVED'}
          </h1>
          <span className="text-[7px] text-zinc-600 font-mono">v{APP_VERSION}</span>
        </div>

        {/* Desktop Title Block */}
        <div className="hidden sm:flex items-center gap-2 shrink-0 pr-2 border-r border-white/5">
          <div className={`w-2 h-2 ${engineReady ? 'bg-red-600 shadow-[0_0_8px_red]' : 'bg-zinc-800'}`} />
          <div className="flex flex-col gap-0.5 justify-center">
            <h1 className="text-[11px] sm:text-xs font-bold tracking-tighter text-white uppercase truncate max-w-[140px] leading-none">
              {activeMultiId 
                ? `MULTI: ${multis.find(m => m.id === activeMultiId)?.name || 'UNKNOWN'}`
                : activePatchId 
                  ? patches.find(p => p.id === activePatchId)?.name 
                  : 'UNSAVED'}
            </h1>
            <span className="text-[7px] text-zinc-600 font-mono tracking-widest leading-none">v{APP_VERSION}</span>
          </div>
        </div>

        {/* Live Mode vs Song Mode vs Edit Mode Toggle */}
        <div className="flex items-center bg-black/50 p-0.5 rounded-none border border-zinc-800 shrink-0">
          <button
            onClick={() => {
              setAppMode('LIVE');
              if (!activeSetlistId && setlists.length > 0) {
                setActiveSetlistId(setlists[0].id);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all rounded-none ${
              appMode === 'LIVE'
                ? 'bg-red-600 text-white font-black shadow-[0_0_12px_rgba(220,38,38,0.5)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio size={10} className="animate-pulse" />
            <span>LIVE MODE</span>
          </button>
          <button
            onClick={() => {
              setAppMode('SONG');
              if (!activeMultiId && multis.length > 0) {
                loadMulti(multis[0]);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all rounded-none ${
              appMode === 'SONG'
                ? 'bg-amber-500 text-black font-black shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Play size={10} className="fill-current" />
            <span>SONG MODE</span>
          </button>
          <button
            onClick={() => setAppMode('EDIT')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all rounded-none ${
              appMode === 'EDIT'
                ? 'bg-orange-500 text-black font-black shadow-[0_0_10px_rgba(249,115,22,0.4)]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders size={10} />
            <span>EDIT MODE</span>
          </button>
        </div>

        {/* Primary Navigation Buttons */}
        <nav className="flex items-center gap-0.5 shrink-0 flex-wrap">
          <NavButton target="SYNTH" label="Synthesizer" icon={Sliders} />
          <NavButton target="ARP" label="Arpeggio" icon={Activity} />
          <NavButton target="FX" label="Master FX" icon={Waves} />
          <NavButton target="PATCHES" label="Library" icon={FolderOpen} />
        </nav>

        {/* Desktop MIDI Monitor log */}
        <div 
          className="hidden lg:flex items-center border-l border-white/5 pl-3 overflow-hidden cursor-pointer group relative hover:bg-white/5 transition-colors min-w-[100px]"
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
              midiLogs.slice(0, 2).map(log => (
                <span key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-300 first:text-orange-500">
                  [{log.text.substring(0, 14)}]
                </span>
              ))
            ) : (
              <span>MIDI OFF</span>
            )}
          </div>
        </div>

        {/* Action Controls Group - Automatically wraps onto second row on small screens */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="flex items-center px-2 border-l border-white/5 gap-1.5 select-none" title="MIDI Input Status Indicator">
            <span className="text-[8px] sm:text-[9px] uppercase tracking-widest text-zinc-500 font-bold">MIDI IN</span>
            <div 
              className={`w-2 h-2 rounded-full transition-all duration-100 ${
                midiLedActive 
                  ? 'bg-orange-500 shadow-[0_0_8px_#f97316] scale-110' 
                  : 'bg-zinc-800 shadow-none scale-100'
              }`}
            />
          </div>

          <button 
            onClick={savePatch}
            className="p-1.5 sm:px-2 py-1 text-[9px] font-bold hover:bg-white/5 text-zinc-400 hover:text-white transition-colors border-l border-white/5 flex items-center gap-1"
            title="Save Patch"
          >
            <Save size={12} />
            <span className="hidden sm:inline">SAVE</span>
          </button>

          <div className="flex items-center gap-1 font-mono text-[8px] text-zinc-500 border-l border-synth-border px-1.5">
            <Activity size={10} className={activeNotes.length > 0 ? 'text-green-500' : ''} />
            <span>{activeNotes.length}</span>
          </div>

          {engineReady && (
            <button 
              onClick={() => {
                setIsMidiMappingMode(!isMidiMappingMode);
                setSelectedMapParam(null);
              }}
              className={`flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
                isMidiMappingMode ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-white/5'
              }`}
              title="Toggle MIDI Learn Mode"
            >
              <Link size={10} />
              <span>MAP</span>
            </button>
          )}

          <button 
            onClick={() => setShowKeyboard(!showKeyboard)}
            className={`flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
              showKeyboard ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:bg-white/5'
            }`}
          >
            <PianoIcon size={10} />
            <span>KEYS</span>
          </button>

          <button 
            onClick={() => setIsMidiDebuggerOpen(!isMidiDebuggerOpen)}
            className={`flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
              isMidiDebuggerOpen ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:bg-white/5'
            }`}
          >
            <Activity size={10} />
            <span className="hidden md:inline">DEBUG</span>
          </button>

          <button 
            onClick={() => setIsMidiEditorOpen(!isMidiEditorOpen)}
            className={`flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest ${
              isMidiEditorOpen ? 'bg-amber-500 text-black font-extrabold' : 'text-amber-400 hover:bg-amber-500/10'
            }`}
            title="Open Signal MIDI Piano Roll Editor"
          >
            <Radio size={10} />
            <span>MIDI EDITOR</span>
          </button>

          <button 
            onClick={handlePanic}
            className="flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest text-red-500 hover:bg-red-500/10"
            title="Silence All Notes"
          >
            <X size={10} />
            <span>PANIC</span>
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest text-zinc-500 hover:bg-white/5"
            title="Audio & MIDI Configuration"
          >
            <Settings2 size={10} />
            <span>CONFIG</span>
          </button>

          <button 
            onClick={toggleFullscreen}
            className="flex items-center gap-1 px-2 py-1 border-l border-synth-border transition-all uppercase text-[9px] font-bold tracking-widest text-zinc-500 hover:bg-white/5"
          >
            {isFullscreen ? <Minimize size={10} /> : <Maximize size={10} />}
            <span>FS</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        {appMode === 'LIVE' ? (
          <LivePerformanceView
            setlists={setlists}
            activeSetlistId={activeSetlistId}
            setActiveSetlistId={setActiveSetlistId}
            activeSong={activeSong}
            isMidiPlaying={isMidiPlaying}
            midiProgress={midiProgress}
            handleLoadSong={handleLoadSong}
            handleToggleMainSongPlay={handleToggleMainSongPlay}
            handleStopMainSongPlay={handleStopMainSongPlay}
            patches={patches}
            multis={multis}
            activePatchId={activePatchId}
            activeMultiId={activeMultiId}
            isMidiMappingMode={isMidiMappingMode}
            selectedMapParam={selectedMapParam}
            setSelectedMapParam={setSelectedMapParam}
            songPlayPauseCc={settings.songPlayPauseCc}
          />
        ) : (
          <>
            {['SYNTH', 'ARP', 'FX'].includes(currentScreen) && (
              <div className="bg-[#0b0b0c] border-b border-synth-border px-3 sm:px-4 py-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shrink-0 select-none">
                {appMode === 'SONG' ? (
                  /* SONG MODE PERFORMANCE SUB-HEADER */
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-none">
                        SONG MODE
                      </span>
                      
                      {/* Styled Combo Selector for Multi Patches */}
                      <div className="flex items-center gap-2 bg-black/40 border border-amber-500/40 px-2.5 py-1 rounded-none">
                        <span className="text-[9px] font-mono text-amber-400 font-bold uppercase tracking-wider shrink-0">
                          EDIT MULTI PATCH:
                        </span>
                        <select
                          value={selectedSlotIndex}
                          onChange={(e) => {
                            const newIdx = Number(e.target.value);
                            setSelectedSlotIndex(newIdx);
                            const curMulti = multis.find(m => m.id === activeMultiId) || multis[0];
                            if (curMulti && curMulti.slots[newIdx]) {
                              const p = patches.find(pt => pt.id === curMulti.slots[newIdx].patchId);
                              if (p) setParams(cleanVoiceParams(p.params));
                            }
                          }}
                          className="bg-zinc-900 border border-amber-500/60 text-amber-300 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-none focus:outline-none focus:border-amber-400 cursor-pointer max-w-[220px] sm:max-w-[300px] truncate"
                        >
                          {((multis.find(m => m.id === activeMultiId) || multis[0])?.slots || []).map((slot, index) => {
                            const slPatch = patches.find(p => p.id === slot.patchId);
                            return (
                              <option key={index} value={index} className="bg-zinc-900 text-amber-200">
                                Part {index + 1}: {slPatch?.name || 'Empty'} (Ch {slot.channel || index + 1})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Big Song Play / Pause / Stop Buttons - ONLY IN SONG MODE */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center">
                        <button
                          onClick={() => {
                            if (isMidiMappingMode) {
                              setSelectedMapParam('songPlayPause');
                            } else {
                              handleToggleMainSongPlay();
                            }
                          }}
                          className={`h-11 sm:h-12 px-5 sm:px-6 flex items-center gap-2 font-mono text-xs sm:text-sm font-black uppercase tracking-widest transition-all rounded-none border shadow-lg ${
                            isMidiMappingMode && selectedMapParam === 'songPlayPause'
                              ? 'bg-blue-600 text-white border-blue-400 animate-pulse ring-2 ring-blue-300 shadow-[0_0_15px_rgba(37,99,235,0.7)]'
                              : isMidiPlaying
                                ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                          }`}
                          title={isMidiMappingMode ? "Click to assign MIDI CC to Play/Pause button" : "Play / Pause Song"}
                        >
                          {isMidiPlaying ? (
                            <>
                              <Pause size={18} className="fill-current" />
                              <span>PAUSE SONG</span>
                            </>
                          ) : (
                            <>
                              <Play size={18} className="fill-current" />
                              <span>PLAY SONG</span>
                            </>
                          )}
                        </button>

                        {isMidiMappingMode ? (
                          <button
                            onClick={() => setSelectedMapParam('songPlayPause')}
                            className={`ml-2 px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-wider rounded-none border transition-all ${
                              selectedMapParam === 'songPlayPause'
                                ? 'bg-blue-500 text-white border-white animate-pulse'
                                : 'bg-zinc-800 text-blue-400 border-blue-500/50 hover:bg-blue-600 hover:text-white'
                            }`}
                          >
                            {selectedMapParam === 'songPlayPause' ? 'LEARNING CC...' : settings.songPlayPauseCc !== null && settings.songPlayPauseCc !== undefined ? `MIDI CC ${settings.songPlayPauseCc}` : 'MAP MIDI'}
                          </button>
                        ) : (
                          settings.songPlayPauseCc !== null && settings.songPlayPauseCc !== undefined && (
                            <span className="ml-2 px-2 py-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-950/80 border border-amber-500/40 rounded-none shadow-sm">
                              CC {settings.songPlayPauseCc}
                            </span>
                          )
                        )}
                      </div>

                      <button
                        onClick={handleStopMainSongPlay}
                        className="h-11 sm:h-12 px-3 sm:px-4 flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-red-400 font-mono text-xs font-bold uppercase tracking-widest border border-zinc-800 hover:border-red-500/50 rounded-none transition-all shadow-md"
                        title="Stop Song"
                      >
                        <Square size={16} className="fill-current text-red-500" />
                        <span className="hidden sm:inline">STOP</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* EDIT MODE SUB-HEADER */
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-500">Mode:</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setActiveMultiId(null);
                            if (patches.length > 0 && !activePatchId) {
                              loadPatch(patches[0]);
                            }
                          }}
                          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all rounded-none ${
                            !activeMultiId
                              ? 'bg-orange-500/15 border-orange-500 text-orange-500 font-black shadow-[0_0_8px_rgba(249,115,22,0.15)]'
                              : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          ● Single Patch Mode
                        </button>
                        <button
                          onClick={() => {
                            if (multis.length > 0) {
                              loadMulti(multis[0]);
                            } else {
                              handleCreateMulti();
                            }
                          }}
                          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-all rounded-none ${
                            activeMultiId
                              ? 'bg-orange-500/15 border-orange-500 text-orange-500 font-black shadow-[0_0_8px_rgba(249,115,22,0.15)]'
                              : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          ● Multi-Layer Mode
                        </button>
                      </div>
                    </div>
                    
                    {activeMultiId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                          Active Multi: <span className="text-white font-bold font-sans">{multis.find(m => m.id === activeMultiId)?.name}</span>
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {(multis.find(m => m.id === activeMultiId)?.slots || []).map((slot, index) => {
                            const slPatch = patches.find(p => p.id === slot.patchId);
                            return (
                              <button
                                key={index}
                                onClick={() => setSelectedSlotIndex(index)}
                                className={`px-2 py-0.5 text-[9px] font-mono border transition-all rounded-none ${
                                  selectedSlotIndex === index
                                    ? 'bg-orange-500 text-black border-orange-500 font-bold'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                }`}
                              >
                                Part {index + 1}: {slPatch?.name || 'None'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                        Active Patch: <span className="text-white font-bold font-sans">{patches.find(p => p.id === activePatchId)?.name || 'UNSAVED'}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

        <div className={`flex-1 relative overflow-y-auto lg:overflow-hidden transition-all duration-300`}>
          {currentScreen === 'SYNTH' && (
            <div className="relative lg:absolute lg:inset-0 flex flex-col lg:h-full w-full lg:overflow-hidden">
              {/* Main synth panel grid/flex list */}
              <div className="flex-1 relative flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-row bg-synth-border/40 gap-[1px] min-h-fit lg:min-h-0 lg:h-full overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
                {synthSections}
              </div>
            </div>
          )}
          
          {currentScreen === 'ARP' && (
            <div className="relative lg:absolute lg:inset-0 flex flex-col lg:h-full w-full lg:overflow-hidden">
              <div className="flex-1 relative flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-row bg-synth-border/40 gap-[1px] min-h-fit lg:min-h-0 lg:h-full overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
                {arpSections}
              </div>
            </div>
          )}
          
          {currentScreen === 'FX' && (
            <div className="relative lg:absolute lg:inset-0 flex flex-col lg:h-full w-full lg:overflow-hidden">
              <div className="flex-1 relative flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-row bg-synth-border/40 gap-[1px] min-h-fit lg:min-h-0 lg:h-full overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
                {fxSections}
              </div>
            </div>
          )}

          {currentScreen === 'PATCHES' && (
            <div className="absolute inset-0 bg-synth-bg p-4 sm:p-8 overflow-y-auto">
              <div className="w-full">
                <div className="flex justify-between items-center mb-8 sm:mb-12 border-b border-synth-border pb-6">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl sm:text-3xl font-bold tracking-tight uppercase">Synth Library</h2>
                      {libraryTab === 'PATCHES' && (
                        <div className="flex items-center gap-2">
                          {activePatchId && (
                            <button 
                              onClick={savePatch}
                              className="p-2 hover:bg-white/5 rounded-none text-blue-400 hover:text-white transition-colors border border-transparent hover:border-zinc-800"
                              title="Update Current Patch"
                            >
                              <Save size={24} />
                            </button>
                          )}
                          <button 
                            onClick={saveAsNewPatch}
                            className="p-2 hover:bg-white/5 rounded-none text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-800"
                            title="Save Current as New"
                          >
                            <Plus size={24} />
                          </button>
                        </div>
                      )}
                      {libraryTab === 'MULTIS' && (
                        <button 
                          onClick={handleCreateMulti}
                          className="p-2 hover:bg-white/5 rounded-none text-orange-500 hover:text-white transition-colors border border-transparent hover:border-zinc-800"
                          title="Create New Multi"
                        >
                          <Plus size={24} />
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={() => { 
                        setParams(DEFAULT_PARAMS); 
                        setActivePatchId(null); 
                        setActiveMultiId(null);
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
                      <div className="flex items-center gap-1 text-[8px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded-none border border-green-500/20">
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

                <div className="flex gap-4 mb-6 border-b border-zinc-800">
                  <button
                    onClick={() => setLibraryTab('PATCHES')}
                    className={`pb-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${
                      libraryTab === 'PATCHES'
                        ? 'text-orange-500 border-orange-500'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    Patches
                  </button>
                  <button
                    onClick={() => setLibraryTab('MULTIS')}
                    className={`pb-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${
                      libraryTab === 'MULTIS'
                        ? 'text-orange-500 border-orange-500'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    Multis
                  </button>
                  <button
                    onClick={() => setLibraryTab('SETLISTS')}
                    className={`pb-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${
                      libraryTab === 'SETLISTS'
                        ? 'text-orange-500 border-orange-500'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    Setlists
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Activity size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        libraryTab === 'PATCHES' 
                          ? "Search patches..." 
                          : libraryTab === 'MULTIS' 
                            ? "Search multis..." 
                            : "Search setlists..."
                      }
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
                  <button
                    onClick={
                      libraryTab === 'PATCHES' 
                        ? startCreatePatch 
                        : libraryTab === 'MULTIS' 
                          ? startCreateMulti 
                          : handleCreateSetlist
                    }
                    className="px-6 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shrink-0 shadow-[0_0_12px_rgba(249,115,22,0.2)]"
                  >
                    <Plus size={16} />
                    {
                      libraryTab === 'PATCHES' 
                        ? 'Create New Patch' 
                        : libraryTab === 'MULTIS' 
                          ? 'Create New Multi' 
                          : 'Create New Setlist'
                    }
                  </button>
                </div>

                {(libraryTab === 'PATCHES' || libraryTab === 'MULTIS') && (
                  <GroupedPresetsView
                    type={libraryTab}
                    patches={patches}
                    multis={multis}
                    activePatchId={activePatchId}
                    activeMultiId={activeMultiId}
                    searchQuery={searchQuery}
                    onSelectPatch={loadPatch}
                    onSelectMulti={loadMulti}
                    onRenamePatch={(id, name) => startRenamePatch(id, name)}
                    onDeletePatch={deletePatch}
                    onRenameMulti={(id, name) => startRenameMulti(id, name)}
                    onDeleteMulti={handleDeleteMulti}
                    onUpdatePatchGroup={handleUpdatePatchGroup}
                    onUpdateMultiGroup={handleUpdateMultiGroup}
                    onAutoCategorizeAll={handleAutoCategorizeAll}
                    showCustomPrompt={showCustomPrompt}
                  />
                )}

                {libraryTab === 'SETLISTS' && (
                  <div className="flex flex-col gap-6 items-start mt-4 w-full">
                    {/* Top Pane: Setlists List */}
                    <div className="w-full flex flex-col gap-4 bg-zinc-900/40 p-4 border border-zinc-800">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Available Setlists</span>
                        <button
                          onClick={handleCreateSetlist}
                          className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest text-[9px] flex items-center gap-1 transition-all"
                        >
                          <Plus size={10} />
                          New
                        </button>
                      </div>

                      <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                        {setlists.length === 0 ? (
                          <div className="text-center py-8 text-zinc-500 uppercase tracking-widest text-[9px] font-bold border border-dashed border-zinc-800">
                            No setlists created
                          </div>
                        ) : (
                          setlists.map(s => {
                            const isActive = s.id === activeSetlistId;
                            const isSelected = s.id === selectedSetlistId;
                            return (
                              <div
                                key={s.id}
                                onClick={() => setSelectedSetlistId(s.id)}
                                className={`p-3 border cursor-pointer transition-all flex items-center justify-between group ${
                                  isSelected
                                    ? 'bg-orange-600/10 border-orange-500'
                                    : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm uppercase tracking-wider truncate">{s.name}</span>
                                    {isActive && (
                                      <span className="px-1.5 py-0.5 text-[7px] font-bold tracking-widest uppercase bg-green-500/10 text-green-500 border border-green-500/20 shrink-0">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
                                    {s.songs.length} Song{s.songs.length !== 1 ? 's' : ''}
                                  </span>
                                </div>

                                <div className="flex gap-1 items-center">
                                  {!isActive && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setActiveSetlistId(s.id); }}
                                      className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[8px] font-bold uppercase tracking-widest transition-all shrink-0"
                                    >
                                      Use
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRenameSetlist(s.id); }}
                                    className="p-1 hover:bg-white/10 text-zinc-400 hover:text-white transition-all shrink-0"
                                    title="Rename Setlist"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSetlist(s.id); }}
                                    className="p-1 hover:bg-red-500/20 text-red-500 hover:text-red-400 transition-all shrink-0"
                                    title="Delete Setlist"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Bottom Pane: Selected Setlist Songs */}
                    <div className="w-full bg-zinc-900/20 p-5 border border-zinc-800 flex flex-col gap-5">
                      {selectedSetlistId ? (() => {
                        const currentSetlist = setlists.find(s => s.id === selectedSetlistId);
                        if (!currentSetlist) return null;
                        return (
                          <>
                            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-bold tracking-widest text-orange-500 uppercase">Setlist Editor</span>
                                <h3 className="text-xl font-bold uppercase tracking-wide text-zinc-100">{currentSetlist.name}</h3>
                              </div>
                              {activeSetlistId !== currentSetlist.id && (
                                <button
                                  onClick={() => setActiveSetlistId(currentSetlist.id)}
                                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold uppercase tracking-widest text-[10px] transition-all font-bold"
                                >
                                  Activate for MIDI PC
                                </button>
                              )}
                            </div>

                            {/* Add Song Form */}
                            <div className="bg-zinc-950/40 p-4 border border-zinc-800/80 flex flex-col gap-4">
                              <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">Add Song to Setlist</span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Song Title</label>
                                  <input
                                    type="text"
                                    value={newSongName}
                                    onChange={(e) => setNewSongName(e.target.value)}
                                    placeholder="E.G. INTRO JAM"
                                    className="bg-black border border-zinc-800 p-2.5 text-xs font-bold uppercase tracking-widest text-white focus:border-orange-500 outline-none"
                                  />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Load Type</label>
                                  <select
                                    value={newSongType}
                                    onChange={(e) => setNewSongType(e.target.value as 'patch' | 'multi')}
                                    className="bg-black border border-zinc-800 p-2.5 text-xs font-bold uppercase tracking-widest text-white focus:border-orange-500 outline-none"
                                  >
                                    <option value="patch">Patch</option>
                                    <option value="multi">Multi</option>
                                  </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Select Target</label>
                                  <select
                                    value={newSongTargetId}
                                    onChange={(e) => setNewSongTargetId(e.target.value)}
                                    className="bg-black border border-zinc-800 p-2.5 text-xs font-bold uppercase tracking-widest text-white focus:border-orange-500 outline-none"
                                  >
                                    {newSongType === 'patch' ? (
                                      patches.map(p => (
                                        <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                                      ))
                                    ) : (
                                      multis.map(m => (
                                        <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>
                                      ))
                                    )}
                                  </select>
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  if (!newSongName.trim()) {
                                    alert('Please enter a Song Title!');
                                    return;
                                  }
                                  handleAddSongToSetlist(currentSetlist.id, newSongName, newSongType, newSongTargetId);
                                  setNewSongName('');
                                }}
                                className="w-full sm:w-auto self-end px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-1.5"
                              >
                                <Plus size={12} />
                                Add Song
                              </button>
                            </div>

                            {/* Songs List */}
                            <div className="flex flex-col gap-2.5">
                              <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">Setlist Songs (Indexed for MIDI Program Change)</span>
                              {currentSetlist.songs.length === 0 ? (
                                <div className="text-center py-12 text-zinc-500 uppercase tracking-widest text-[10px] font-bold border border-dashed border-zinc-800 bg-zinc-950/20">
                                  No songs in this setlist. Add some above!
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
                                  {currentSetlist.songs.map((song, index) => {
                                    const targetName = song.type === 'patch' 
                                      ? patches.find(p => p.id === song.targetId)?.name 
                                      : multis.find(m => m.id === song.targetId)?.name;
                                    
                                    const isActiveSong = activeSetlistId === currentSetlist.id && (
                                      song.type === 'patch' ? activePatchId === song.targetId : activeMultiId === song.targetId
                                    );

                                    return (
                                      <div
                                        key={song.id}
                                        className={`p-3 bg-zinc-950/60 border flex flex-col gap-2 transition-all ${
                                          isActiveSong
                                            ? 'border-orange-500 bg-orange-500/5'
                                            : 'border-zinc-800 hover:border-zinc-700'
                                        }`}
                                      >
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-zinc-900/60">
                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {/* Program Change indicator */}
                                            <div className="flex flex-col items-center justify-center bg-zinc-900 border border-zinc-800 px-2 py-1 shrink-0 font-mono text-center">
                                              <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">MIDI PC</span>
                                              <span className="text-xs font-bold text-orange-500">{index}</span>
                                            </div>

                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                              <span className="font-bold text-sm uppercase truncate text-zinc-100" title={song.name}>{song.name}</span>
                                              <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-bold uppercase tracking-widest min-w-0">
                                                <span className={`px-1 text-[8px] tracking-widest ${
                                                  song.type === 'patch' 
                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                }`}>
                                                  {song.type}
                                                </span>
                                                <span className="truncate">{targetName || 'UNKNOWN'}</span>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-zinc-900/50">
                                            <button
                                              onClick={() => handleLoadSong(song)}
                                              className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all ${
                                                isActiveSong
                                                  ? 'bg-orange-600 text-white font-extrabold shadow-sm'
                                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                              }`}
                                            >
                                              {isActiveSong ? 'LOADED' : 'LOAD'}
                                            </button>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                              onClick={() => handleMoveSong(currentSetlist.id, song.id, 'up')}
                                              disabled={index === 0}
                                              className="p-1.5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all"
                                              title="Move Up"
                                            >
                                              ▲
                                            </button>
                                            <button
                                              onClick={() => handleMoveSong(currentSetlist.id, song.id, 'down')}
                                              disabled={index === currentSetlist.songs.length - 1}
                                              className="p-1.5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all"
                                              title="Move Down"
                                            >
                                              ▼
                                            </button>
                                            <button
                                              onClick={() => handleDeleteSongFromSetlist(currentSetlist.id, song.id)}
                                              className="p-1.5 hover:bg-red-500/20 text-red-500 hover:text-red-400 transition-all"
                                              title="Remove Song"
                                            >
                                            <Trash2 size={13} />
                                          </button>
                                          </div>
                                        </div>
                                      </div>

                                        <SetlistMidiBacking
                                          song={song}
                                          setlistId={currentSetlist.id}
                                          patches={patches}
                                          multis={multis}
                                          engine={engineRef.current}
                                          onUpdateSong={(updated) => handleUpdateSongInSetlist(currentSetlist.id, updated)}
                                          onAddPatchesAndMulti={handleAddPatchesAndMultiFromMidi}
                                          onLoadSong={handleLoadSong}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })() : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border border-dashed border-zinc-800 bg-zinc-950/20 min-h-[300px]">
                          <span className="text-zinc-500 uppercase tracking-widest text-[11px] font-bold">Select or Create a Setlist to Begin</span>
                          <p className="text-zinc-600 text-xs mt-1 max-w-sm">Create multiple setlists for different gigs or projects, filled with your favorite single patches or multi setups.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeMultiId && (
                  <div className="mt-8 bg-zinc-950 border border-zinc-800 p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-zinc-800 pb-4">
                      <div>
                        <span className="text-xs font-mono uppercase text-orange-500 tracking-wider font-bold">Currently Active Multi Settings</span>
                        <div className="flex items-center gap-3 mt-1">
                          <input
                            type="text"
                            value={multis.find(m => m.id === activeMultiId)?.name || ''}
                            readOnly
                            onClick={() => startRenameMulti(activeMultiId, multis.find(m => m.id === activeMultiId)?.name || '')}
                            className="bg-transparent border-b border-zinc-800 text-xl font-bold uppercase tracking-wider text-white focus:border-orange-500 outline-none pb-1 cursor-pointer"
                          />
                          <button
                            onClick={() => startRenameMulti(activeMultiId, multis.find(m => m.id === activeMultiId)?.name || '')}
                            className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all flex items-center justify-center rounded-none"
                            title="Rename Multi via Onscreen Keyboard"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddSlot}
                          className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-white font-bold uppercase tracking-widest text-[9px] flex items-center gap-1.5"
                        >
                          <Plus size={12} /> Add Layer/Part
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4">
                      {(multis.find(m => m.id === activeMultiId)?.slots || []).map((slot, index) => (
                        <div 
                          key={index} 
                          className={`p-4 border transition-all cursor-pointer ${
                            selectedSlotIndex === index 
                              ? 'bg-orange-500/5 border-orange-500/50' 
                              : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                          }`}
                          onClick={() => setSelectedSlotIndex(index)}
                        >
                          <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between">
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-none border border-zinc-800 flex items-center justify-center font-bold text-xs ${
                                  selectedSlotIndex === index ? 'bg-orange-500 text-black border-orange-500' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                  {index + 1}
                                </span>
                                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest">Part Patch</span>
                              </div>
                              <select
                                value={slot.patchId}
                                onChange={(e) => handleUpdateSlot(index, { patchId: e.target.value })}
                                className="bg-black border border-zinc-800 text-white font-bold uppercase tracking-wider text-xs p-2 focus:border-orange-500 outline-none min-w-[180px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {patches.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              
                              {selectedSlotIndex === index && (
                                <span className="text-[9px] font-bold uppercase text-orange-500 bg-orange-500/10 px-2 py-0.5 border border-orange-500/20 rounded-none">
                                  Editing Parameters Active
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:flex gap-3 xl:gap-4 items-center">
                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">Low Note</label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="127"
                                    value={slot.lowNote}
                                    onChange={(e) => handleUpdateSlot(index, { lowNote: parseInt(e.target.value) || 0 })}
                                    className="w-12 bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="text-[10px] font-mono text-zinc-400 w-8 text-center">{getNoteName(slot.lowNote)}</span>
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">High Note</label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="127"
                                    value={slot.highNote}
                                    onChange={(e) => handleUpdateSlot(index, { highNote: parseInt(e.target.value) || 0 })}
                                    className="w-12 bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="text-[10px] font-mono text-zinc-400 w-8 text-center">{getNoteName(slot.highNote)}</span>
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">Low Vel</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="127"
                                  value={slot.lowVelocity}
                                  onChange={(e) => handleUpdateSlot(index, { lowVelocity: parseInt(e.target.value) || 0 })}
                                  className="w-14 bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">High Vel</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="127"
                                  value={slot.highVelocity}
                                  onChange={(e) => handleUpdateSlot(index, { highVelocity: parseInt(e.target.value) || 0 })}
                                  className="w-14 bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">Map Low Vel</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="127"
                                  value={slot.lowMapVelocity}
                                  onChange={(e) => handleUpdateSlot(index, { lowMapVelocity: parseInt(e.target.value) || 0 })}
                                  className="w-14 bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">Map High Vel</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="127"
                                  value={slot.highMapVelocity}
                                  onChange={(e) => handleUpdateSlot(index, { highMapVelocity: parseInt(e.target.value) || 0 })}
                                  className="w-14 bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">Octave</label>
                                <select
                                  value={slot.transposeOctave}
                                  onChange={(e) => handleUpdateSlot(index, { transposeOctave: parseInt(e.target.value) || 0 })}
                                  className="bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <option value="-3">-3</option>
                                  <option value="-2">-2</option>
                                  <option value="-1">-1</option>
                                  <option value="0">0</option>
                                  <option value="1">+1</option>
                                  <option value="2">+2</option>
                                  <option value="3">+3</option>
                                </select>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">Semitone</label>
                                <select
                                  value={slot.transposeNote}
                                  onChange={(e) => handleUpdateSlot(index, { transposeNote: parseInt(e.target.value) || 0 })}
                                  className="bg-black border border-zinc-800 p-1 text-[11px] font-mono text-white text-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {Array.from({ length: 25 }, (_, i) => i - 12).map(val => (
                                    <option key={val} value={val}>{val > 0 ? `+${val}` : val}</option>
                                  ))}
                                </select>
                              </div>

                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteSlot(index); }}
                                className="p-2 hover:bg-red-500/10 text-red-500 hover:text-red-400 rounded-none transition-colors self-end md:self-auto xl:mt-3"
                                title="Delete Part"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </>
    )}

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

        <MidiEditorModal
          isOpen={isMidiEditorOpen}
          onClose={() => setIsMidiEditorOpen(false)}
          engine={engineRef.current}
        />

        <MidiDebugger 
          isOpen={isMidiDebuggerOpen}
          onClose={() => setIsMidiDebuggerOpen(false)}
          events={midiDebugEvents}
          onClear={() => setMidiDebugEvents([])}
          onSimulateNoteOn={handleNoteOn}
          onSimulateNoteOff={handleNoteOff}
          onSimulateCC={handleMidiCC}
        />

        {/* Custom Dialog Overlay to bypass sandbox restrictions */}
        {customDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-950 border-2 border-zinc-800 p-6 sm:p-8 w-full max-w-md shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-mono tracking-[0.2em] text-orange-500 uppercase font-semibold">
                  {customDialog.type === 'alert' ? 'Notification' : customDialog.type === 'confirm' ? 'Confirm Action' : 'Input Required'}
                </span>
                <h2 className="text-lg font-bold uppercase tracking-wider text-white">
                  {customDialog.title}
                </h2>
              </div>
              
              <p className="text-sm text-zinc-400 font-medium leading-relaxed">
                {customDialog.message}
              </p>

              {customDialog.type === 'prompt' && (
                <input
                  type="text"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      customDialog.onConfirm(dialogInput);
                    }
                  }}
                  className="w-full bg-black border border-zinc-800 focus:border-orange-500 p-3 text-sm font-bold uppercase tracking-wider text-white outline-none"
                />
              )}

              <div className="flex justify-end gap-3 mt-2">
                {customDialog.type !== 'alert' && (
                  <button
                    onClick={() => {
                      if (customDialog.onCancel) customDialog.onCancel();
                      setCustomDialog(null);
                    }}
                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-bold uppercase tracking-wider text-[11px] transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    customDialog.onConfirm(dialogInput);
                  }}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-wider text-[11px] shadow-[0_0_15px_rgba(249,115,22,0.3)] transition-all"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
