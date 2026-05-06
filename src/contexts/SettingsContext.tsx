import React, { createContext, useContext, useState, useEffect } from 'react';
import { PerformanceSettings, DEFAULT_PERFORMANCE_SETTINGS } from '../types';

interface SettingsContextType {
  settings: PerformanceSettings;
  updateSettings: (newSettings: Partial<PerformanceSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PerformanceSettings>(() => {
    const saved = localStorage.getItem('synth_performance_settings');
    if (saved) {
      try {
        return { ...DEFAULT_PERFORMANCE_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Failed to load settings', e);
        return DEFAULT_PERFORMANCE_SETTINGS;
      }
    }
    return DEFAULT_PERFORMANCE_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('synth_performance_settings', JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<PerformanceSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_PERFORMANCE_SETTINGS);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
