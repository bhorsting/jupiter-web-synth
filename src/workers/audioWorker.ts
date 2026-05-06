/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AudioWorkerRequest {
  type: 'generateImpulseResponse' | 'generateNoiseBuffer';
  params: {
    sampleRate: number;
    length?: number;
    reverbDecay?: number;
    reverbDamping?: number;
    bufferSize?: number;
  };
}

export interface AudioWorkerResponse {
  type: 'impulseResponseGenerated' | 'noiseBufferGenerated';
  channels: Float32Array[];
}

self.onmessage = (e: MessageEvent<AudioWorkerRequest>) => {
  const { type, params } = e.data;

  if (type === 'generateImpulseResponse') {
    const { sampleRate, length = 1, reverbDecay = 2, reverbDamping = 0.5, reverbMode = 1 } = params as any;
    const bufferLength = Math.floor(length * sampleRate);
    const channels: Float32Array[] = [
      new Float32Array(bufferLength),
      new Float32Array(bufferLength)
    ];

    // Some simple mode-based adjustments
    const preDelay = reverbMode === 2 ? Math.floor(0.04 * sampleRate) : 0; // 40ms pre-delay for Hall
    const attackTime = reverbMode === 3 ? Math.floor(0.01 * sampleRate) : 0; // 10ms build up for Plate

    for (let channel = 0; channel < 2; channel++) {
      const data = channels[channel];
      let lastValue = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        if (i < preDelay) {
          data[i] = 0;
          continue;
        }

        const relativeIdx = i - preDelay;
        const noise = Math.random() * 2 - 1;
        
        let envelope = 0;
        if (relativeIdx < attackTime) {
          envelope = relativeIdx / attackTime;
        } else {
          envelope = Math.pow(1 - (relativeIdx - attackTime) / (bufferLength - preDelay - attackTime), reverbDecay);
        }

        const value = noise * envelope;
        // Low-pass damping
        data[i] = value * (1 - reverbDamping) + lastValue * reverbDamping;
        lastValue = data[i];
      }
    }

    self.postMessage({
      type: 'impulseResponseGenerated',
      channels
    }, { transfer: channels.map(c => c.buffer) });
  }

  if (type === 'generateNoiseBuffer') {
    const { bufferSize = 44100 } = params;
    const data = new Float32Array(bufferSize);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    self.postMessage({
      type: 'noiseBufferGenerated',
      channels: [data]
    }, { transfer: [data.buffer] });
  }
};
