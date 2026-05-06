/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import React from 'react';

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
        className="relative w-full flex-1 flex items-center justify-center cursor-pointer group touch-none min-h-[200px]"
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
          style={{ bottom: `calc(${percentage}% - 28px)` }}
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
