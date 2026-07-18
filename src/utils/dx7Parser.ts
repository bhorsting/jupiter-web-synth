/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DX7Operator {
  rates: number[];      // [R1, R2, R3, R4], 0-99
  levels: number[];     // [L1, L2, L3, L4], 0-99
  breakpoint: number;   // 0-99
  leftDepth: number;    // 0-99
  rightDepth: number;   // 0-99
  leftCurve: number;    // 0-3
  rightCurve: number;   // 0-3
  rateScaling: number;  // 0-7
  detune: number;       // -7 to +7
  ams: number;          // 0-3
  velocitySensitivity: number; // 0-7
  level: number;        // 0-99 (Output level)
  mode: number;         // 0: ratio, 1: fixed
  coarse: number;       // 0-31
  fine: number;         // 0-99
}

export interface DX7Voice {
  name: string;
  operators: DX7Operator[]; // Index 0 is Op1, index 5 is Op6
  pitchRates: number[];     // [R1, R2, R3, R4]
  pitchLevels: number[];    // [L1, L2, L3, L4]
  algorithm: number;        // 1-32
  feedback: number;         // 0-7
  keySync: boolean;
  lfoSpeed: number;         // 0-99
  lfoDelay: number;         // 0-99
  lfoPmd: number;           // 0-99
  lfoAmd: number;           // 0-99
  lfoSync: boolean;
  lfoWaveform: number;      // 0-5
  pitchModSensitivity: number; // 0-7
  transpose: number;        // 0-48
}

/**
 * Unpacks a single 128-byte packed DX7 voice structure from the given data buffer and offset.
 */
export function unpackDX7Voice(data: Uint8Array, offset: number = 0): DX7Voice {
  const operators: DX7Operator[] = [];

  // DX7 stores Op 6 down to Op 1 in that sequence.
  // We unpack into 0-indexed array where index 0 is Op 1, index 5 is Op 6.
  for (let opIdx = 5; opIdx >= 0; opIdx--) {
    const opOffset = offset + (5 - opIdx) * 17;

    const rates = [
      data[opOffset + 0],
      data[opOffset + 1],
      data[opOffset + 2],
      data[opOffset + 3]
    ];

    const levels = [
      data[opOffset + 4],
      data[opOffset + 5],
      data[opOffset + 6],
      data[opOffset + 7]
    ];

    const breakpoint = data[opOffset + 8];
    const leftDepth = data[opOffset + 9];
    const rightDepth = data[opOffset + 10];

    const curveByte = data[opOffset + 11];
    const leftCurve = curveByte & 0x03;
    const rightCurve = (curveByte >> 2) & 0x03;

    const scaleDetuneByte = data[opOffset + 12];
    const rateScaling = scaleDetuneByte & 0x07;
    const detune = ((scaleDetuneByte >> 3) & 0x0F) - 7; // Convert 0-14 to -7 to +7

    const amsVelByte = data[opOffset + 13];
    const ams = amsVelByte & 0x03;
    const velocitySensitivity = (amsVelByte >> 2) & 0x07;

    const level = data[opOffset + 14];

    const modeCoarseByte = data[opOffset + 15];
    const mode = modeCoarseByte & 0x01;
    const coarse = (modeCoarseByte >> 1) & 0x1F;

    const fine = data[opOffset + 16];

    operators[opIdx] = {
      rates,
      levels,
      breakpoint,
      leftDepth,
      rightDepth,
      leftCurve,
      rightCurve,
      rateScaling,
      detune,
      ams,
      velocitySensitivity,
      level,
      mode,
      coarse,
      fine
    };
  }

  const commonOffset = offset + 102;

  const pitchRates = [
    data[commonOffset + 0],
    data[commonOffset + 1],
    data[commonOffset + 2],
    data[commonOffset + 3]
  ];

  const pitchLevels = [
    data[commonOffset + 4],
    data[commonOffset + 5],
    data[commonOffset + 6],
    data[commonOffset + 7]
  ];

  const algorithm = (data[commonOffset + 8] & 0x1F) + 1; // algorithm 1-32

  const fbKeySyncByte = data[commonOffset + 9];
  const feedback = fbKeySyncByte & 0x07;
  const keySync = ((fbKeySyncByte >> 3) & 0x01) === 1;

  const lfoSpeed = data[commonOffset + 10];
  const lfoDelay = data[commonOffset + 11];
  const lfoPmd = data[commonOffset + 12];
  const lfoAmd = data[commonOffset + 13];

  const lfoWaveSyncByte = data[commonOffset + 14];
  const lfoSync = (lfoWaveSyncByte & 0x01) === 1;
  const lfoWaveform = (lfoWaveSyncByte >> 1) & 0x07;
  const pitchModSensitivity = (lfoWaveSyncByte >> 4) & 0x07;

  const transpose = data[commonOffset + 15];

  // Voice name is 10 ASCII characters from byte 16 to 25
  let name = '';
  for (let i = 0; i < 10; i++) {
    const charCode = data[commonOffset + 16 + i];
    if (charCode >= 32 && charCode <= 126) {
      name += String.fromCharCode(charCode);
    } else {
      name += ' ';
    }
  }
  name = name.trim();
  if (!name) name = 'DX7 PATCH';

  return {
    name,
    operators,
    pitchRates,
    pitchLevels,
    algorithm,
    feedback,
    keySync,
    lfoSpeed,
    lfoDelay,
    lfoPmd,
    lfoAmd,
    lfoSync,
    lfoWaveform,
    pitchModSensitivity,
    transpose
  };
}

/**
 * Parses any standard DX7 SysEx data (.syx) file.
 * Handles:
 * - 128 byte raw single voices
 * - 156-163 byte single voices (containing SysEx wrapper header)
 * - 4096 byte raw 32-voice banks
 * - 4104+ byte 32-voice banks (containing Yamaha SysEx header wrapper)
 */
export function parseDX7SysEx(data: Uint8Array): DX7Voice[] {
  const voices: DX7Voice[] = [];

  if (data.length === 128) {
    voices.push(unpackDX7Voice(data, 0));
  } else if (data.length >= 150 && data.length <= 170) {
    let headerOffset = 0;
    for (let i = 0; i < data.length - 128; i++) {
      if (data[i] === 0xF0 && data[i + 1] === 0x43) {
        headerOffset = i + 6;
        break;
      }
    }
    if (headerOffset + 128 <= data.length) {
      voices.push(unpackDX7Voice(data, headerOffset));
    } else {
      voices.push(unpackDX7Voice(data, 0));
    }
  } else if (data.length === 4096) {
    for (let i = 0; i < 32; i++) {
      voices.push(unpackDX7Voice(data, i * 128));
    }
  } else if (data.length >= 4104) {
    let headerOffset = 6;
    if (data[0] !== 0xF0 || data[1] !== 0x43) {
      for (let i = 0; i < data.length - 4096; i++) {
        if (data[i] === 0xF0 && data[i + 1] === 0x43) {
          headerOffset = i + 6;
          break;
        }
      }
    }
    for (let i = 0; i < 32; i++) {
      const voiceOffset = headerOffset + i * 128;
      if (voiceOffset + 128 <= data.length) {
        voices.push(unpackDX7Voice(data, voiceOffset));
      }
    }
  } else {
    // If we have random bytes, scan for 128-byte segments or just parse from 0 if possible
    let voicesFound = 0;
    for (let i = 0; i <= data.length - 128; i++) {
      // Simple heuristic: if we find SysEx header for 32-voice bank, jump to it
      if (data[i] === 0xF0 && data[i + 1] === 0x43 && data[i + 3] === 0x09 && data[i + 4] === 0x20) {
        const start = i + 6;
        for (let v = 0; v < 32; v++) {
          const offset = start + v * 128;
          if (offset + 128 <= data.length) {
            voices.push(unpackDX7Voice(data, offset));
            voicesFound++;
          }
        }
        break;
      }
    }
    // If still nothing, try to unpack whatever is there in 128-byte increments
    if (voicesFound === 0 && data.length >= 128) {
      const count = Math.min(32, Math.floor(data.length / 128));
      for (let i = 0; i < count; i++) {
        voices.push(unpackDX7Voice(data, i * 128));
      }
    }
  }

  return voices;
}
