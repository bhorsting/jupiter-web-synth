import * as lamejs from 'lamejs';

export function encodeMp3(audioBuffer: AudioBuffer, kbps = 192): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  
  // Access Mp3Encoder from lamejs safely (supports namespace-like resolution in the build output)
  const LameModule = (lamejs as any).default || lamejs;
  const Mp3EncoderClass = LameModule.Mp3Encoder;
  
  if (!Mp3EncoderClass) {
    throw new Error('Could not resolve Mp3Encoder from lamejs');
  }

  const mp3encoder = new Mp3EncoderClass(numChannels, sampleRate, kbps);
  const mp3Data: any[] = [];

  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

  // Convert Float32Array [-1.0, 1.0] to Int16Array [-32768, 32767]
  const convertFloatToInt16 = (buffer: Float32Array) => {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf;
  };

  const leftInt16 = convertFloatToInt16(left);
  const rightInt16 = right ? convertFloatToInt16(right) : null;

  const sampleBlockSize = 1152;
  
  if (numChannels === 2 && rightInt16) {
    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
  } else {
    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}
