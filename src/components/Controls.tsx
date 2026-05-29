/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { Delete, X, Check } from 'lucide-react';

interface NumericKeypadProps {
  value: number;
  min: number;
  max: number;
  onSave: (val: number) => void;
  onCancel: () => void;
  label: string;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({ value, min, max, onSave, onCancel, label }) => {
  const [currentValue, setCurrentValue] = React.useState(String(value));

  const handleKey = (key: string) => {
    if (currentValue.length >= 5 && key !== 'backspace') return;
    
    if (key === 'backspace') {
      setCurrentValue(prev => prev.length > 0 ? prev.slice(0, -1) : '0');
    } else {
      setCurrentValue(prev => (prev === '0' && key !== '.') ? key : prev + key);
    }
  };

  const handleConfirm = () => {
    const num = Math.max(min, Math.min(max, Number(currentValue) || 0));
    onSave(num);
  };

  const keypadContent = (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 touch-none"
      onClick={onCancel}
      style={{ overscrollBehavior: 'contain' }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-zinc-900 border border-zinc-800 w-full max-w-[340px] shadow-2xl p-6 overflow-y-auto max-h-[95vh] rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">{label}</span>
            <span className="text-[9px] text-zinc-500 font-mono mt-0.5">MIN: {min} / MAX: {max}</span>
          </div>
          <button 
            onClick={onCancel} 
            className="w-10 h-10 -mr-2 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-black border-2 border-zinc-800 p-4 mb-6 rounded-lg text-right flex items-baseline justify-end gap-2">
          <span className="text-4xl font-mono text-orange-500 tracking-tight leading-none">
            {currentValue || '0'}
          </span>
          <span className="text-xs text-zinc-600 font-bold uppercase">val</span>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(n => (
            <button
              key={n}
              onClick={() => handleKey(String(n))}
              className="bg-zinc-800 hover:bg-zinc-700 active:bg-orange-600 transition-colors py-5 rounded-lg font-mono text-2xl text-zinc-200 active:scale-95 flex items-center justify-center shadow-lg"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleKey('backspace')}
            className="bg-zinc-800 hover:bg-red-900/50 active:bg-red-600 transition-colors py-5 rounded-lg flex items-center justify-center text-zinc-200 active:scale-95 shadow-lg border border-transparent active:border-red-500"
          >
            <Delete size={22} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="py-4 bg-zinc-800 rounded-lg font-bold uppercase tracking-widest text-[10px] text-zinc-400 hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="bg-orange-600 py-4 rounded-lg font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-orange-500 transition-all shadow-[0_4px_20px_rgba(234,88,12,0.3)] active:scale-95 text-white"
          >
            <Check size={18} /> Confirm
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(keypadContent, document.body);
};

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  color?: string;
  isSmall?: boolean;
  isMapMode?: boolean;
  mappedCC?: string | number;
  isSelected?: boolean;
  onMapClick?: () => void;
}

export const JupiterSlider: React.FC<SliderProps> = React.memo(({ 
  label, 
  value, 
  min, 
  max, 
  step = 0.01, 
  onChange,
  color = 'bg-white',
  isSmall = false,
  isMapMode = false,
  mappedCC,
  isSelected = false,
  onMapClick
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const percentage = ((value - min) / (max - min)) * 100;

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMapMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.height === 0) return;
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const newVal = max - (y / rect.height) * (max - min);
    onChange(newVal);
  };

  return (
    <div className={`flex flex-col items-center select-none ${isSmall ? 'w-10' : 'w-16'} h-full min-h-[inherit] pt-2 pb-12 relative [contain:layout]`}>
      {isMapMode && (
        <div 
          onClick={onMapClick}
          className={`absolute inset-0 z-20 cursor-crosshair transition-all ${
            isSelected 
              ? 'bg-blue-500/40 ring-4 ring-blue-400 animate-pulse' 
              : mappedCC !== undefined 
                ? 'bg-blue-600/30 ring-2 ring-blue-500' 
                : 'bg-blue-400/10 hover:bg-blue-400/20'
          }`}
        >
          {(mappedCC !== undefined || isSelected) && (
            <div className="absolute top-1 left-1 bg-blue-600 text-white text-[8px] px-1 font-bold">
              {isSelected ? 'LEARN' : mappedCC}
            </div>
          )}
        </div>
      )}
      <div 
        className="relative w-full flex-1 flex items-center justify-center cursor-pointer group touch-none min-h-[150px]"
        onPointerDown={(e) => {
          if (isMapMode) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDragging(true);
          handlePointer(e);
        }}
        onPointerMove={(e) => {
          if (isDragging) {
            handlePointer(e);
          }
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
      >
        {/* Track Container */}
        <div className={`w-2.5 h-full bg-zinc-800/80 border border-white/10 pointer-events-none overflow-hidden relative shadow-inner ${isDragging ? 'border-orange-500/30' : ''}`}>
           <div 
             className="absolute bottom-0 left-0 w-full bg-white/10" 
             style={{ height: `${percentage}%` }}
           />
        </div>
        
        {/* Thumb */}
        <div 
          className={`absolute left-1/2 -translate-x-1/2 w-11 h-14 ${color} shadow-2xl flex items-center justify-center border border-black/20 pointer-events-none z-10 transition-transform ${isDragging ? 'scale-105 shadow-orange-500/20' : 'active:scale-95'} [will-change:transform,bottom]`}
          style={{ bottom: `calc(${percentage}% - ${(percentage / 100) * 56}px)` }}
        >
           <div className={`w-8 h-0.5 ${isDragging ? 'bg-orange-500/30' : 'bg-black/10'}`} />
        </div>
      </div>
      
      <span className={`text-[9px] font-mono font-bold uppercase mt-12 text-center h-4 flex items-center leading-none transition-colors ${isDragging ? 'text-orange-500' : 'text-zinc-500'}`}>
        {label}
      </span>
    </div>
  );
});

interface ToggleProps {
  label: string;
  active: boolean;
  onChange: (active: boolean) => void;
  color?: string;
  isMapMode?: boolean;
  mappedCC?: string | number;
  isSelected?: boolean;
  onMapClick?: () => void;
}

export const JupiterToggle: React.FC<ToggleProps> = React.memo(({ 
  label, 
  active, 
  onChange, 
  color = 'bg-zinc-700',
  isMapMode = false,
  mappedCC,
  isSelected = false,
  onMapClick
}) => {
  return (
    <div className="flex flex-col items-center w-12 pt-2 pb-8 relative">
      <button 
        onClick={() => {
          if (isMapMode) {
            onMapClick?.();
          } else {
            onChange(!active);
          }
        }}
        className={`w-10 aspect-square transition-all flex items-center justify-center relative ${
          active 
            ? `${color} shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/20` 
            : 'bg-[#222] border border-transparent'
        } ${
          isMapMode 
            ? isSelected 
              ? 'ring-4 ring-blue-400 bg-blue-500/40 animate-pulse' 
              : mappedCC !== undefined 
                ? 'ring-2 ring-blue-500 bg-blue-600/30' 
                : 'bg-blue-400/10 hover:bg-blue-400/20' 
            : ''
        }`}
      >
        {(isMapMode && (mappedCC !== undefined || isSelected)) && (
          <div className="absolute top-0 left-0 bg-blue-600 text-white text-[8px] px-1 font-bold z-30">
            {isSelected ? 'LEARN' : mappedCC}
          </div>
        )}
        <div className={`w-1.5 h-1.5 ${active ? 'bg-white shadow-[0_0_5px_white]' : 'bg-black/40'}`} />
      </button>
      <span className="text-[8px] font-mono font-bold uppercase text-zinc-500 mt-6 text-center">
        {label}
      </span>
    </div>
  );
});

interface SelectorProps {
  label: string;
  options: string[];
  value: string;
  onChange: (val: any) => void;
  isMapMode?: boolean;
  mappedCC?: string | number;
  isSelected?: boolean;
  onMapClick?: () => void;
}

export const JupiterSelector: React.FC<SelectorProps> = React.memo(({ 
  label, 
  options, 
  value, 
  onChange,
  isMapMode = false,
  mappedCC,
  isSelected = false,
  onMapClick
}) => {
  return (
    <div className="flex flex-col items-center w-24 pb-8 relative">
       {isMapMode && (
        <div 
          onClick={onMapClick}
          className={`absolute inset-0 z-20 cursor-crosshair transition-all ${
            isSelected 
              ? 'bg-blue-500/40 ring-4 ring-blue-400 animate-pulse' 
              : mappedCC !== undefined 
                ? 'bg-blue-600/30 ring-2 ring-blue-500' 
                : 'bg-blue-400/10 hover:bg-blue-400/20'
          }`}
        >
          {(mappedCC !== undefined || isSelected) && (
            <div className="absolute top-1 left-1 bg-blue-600 text-white text-[8px] px-1 font-bold">
              {isSelected ? 'LEARN' : mappedCC}
            </div>
          )}
        </div>
      )}
       <span className="text-[10px] font-mono font-bold uppercase text-gray-400 mb-2 truncate w-full text-center">
        {label}
      </span>
      <div className="flex flex-col gap-1 w-full relative z-10">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => !isMapMode && onChange(opt)}
            className={`px-2 py-3 text-[10px] font-mono uppercase transition-colors ${
              value === opt ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
});
