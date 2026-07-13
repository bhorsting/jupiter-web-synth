/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MIDICallback = (note: number, velocity: number) => void;
export type MIDICCCallback = (cc: number, value: number, channel: number) => void;
export type MIDIPitchBendCallback = (value: number, channel: number) => void;
export type MIDIPanicCallback = () => void;
export type MIDIRawCallback = (data: Uint8Array) => void;
export type MIDIProgramChangeCallback = (program: number, channel: number) => void;

export class MIDIService {
  private onNoteOn: MIDICallback;
  private onNoteOff: MIDICallback;
  private onCC?: MIDICCCallback;
  private onPitchBend?: MIDIPitchBendCallback;
  private onPanic?: MIDIPanicCallback;
  private onMessage?: MIDIRawCallback;
  private onProgramChange?: MIDIProgramChangeCallback;
  private access: MIDIAccess | null = null;
  private inputId: string = 'all';
  private channel: number = 0; // 0 for all
  private runningStatus: number = 0;
  private autoConnectMicroKontrol: boolean = false;

  constructor(
    onNoteOn: MIDICallback, 
    onNoteOff: MIDICallback, 
    onCC?: MIDICCCallback, 
    onMessage?: MIDIRawCallback,
    onPitchBend?: MIDIPitchBendCallback,
    onPanic?: MIDIPanicCallback,
    onProgramChange?: MIDIProgramChangeCallback
  ) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onCC = onCC;
    this.onMessage = onMessage;
    this.onPitchBend = onPitchBend;
    this.onPanic = onPanic;
    this.onProgramChange = onProgramChange;
  }

  async init() {
    // Add listener for external postMessage MIDI (from Capacitor shell)
    window.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (msg?.source !== 'jupiter-midi-shell' || msg?.type !== 'midi') return;
      if (!msg.data) return;
      
      const bytes = new Uint8Array(msg.data);
      this.processRawMIDI(bytes, 'capacitor-shell');
    });

    if (!navigator.requestMIDIAccess) {
      console.warn('WebMIDI not supported');
      return;
    }

    try {
      this.access = await navigator.requestMIDIAccess();
      this.setupInputs();
      
      this.access.onstatechange = (e) => {
        if (e.port.type === 'input') {
          this.setupInputs();
        }
      };
    } catch (err) {
      console.error('Failed to access MIDI', err);
    }
  }

  setFilter(inputId: string, channel: number, autoConnectMicroKontrol: boolean = false) {
    this.inputId = inputId;
    this.channel = channel;
    this.autoConnectMicroKontrol = autoConnectMicroKontrol;
    this.setupInputs();
  }

  getInputs() {
    if (!this.access) return [];
    return Array.from(this.access.inputs.values()).map(input => ({
      id: input.id,
      name: input.name || `MIDI Input ${input.id}`,
      manufacturer: input.manufacturer
    }));
  }

  private setupInputs() {
    if (!this.access) return;

    this.access.inputs.forEach(input => {
      // Clear existing listeners
      input.onmidimessage = null;

      const isMicroKontrol = !!(input.name && input.name.toLowerCase().includes('microkontrol'));

      // Attach listener if it matches filter or filter is 'all',
      // or if microKONTROL auto-connect is active and input name contains "microkontrol"
      const shouldListen = 
        this.inputId === 'all' || 
        this.inputId === input.id || 
        (this.autoConnectMicroKontrol && isMicroKontrol);

      if (shouldListen) {
        input.onmidimessage = (event) => this.handleMIDIMessage(event, input.id);
      }
    });
  }

  /**
   * Directly process raw MIDI bytes from an external source
   */
  processRawMIDI(data: Uint8Array, sourceId: string = 'external') {
    let isMicroKontrolSource = false;
    if (this.access && this.autoConnectMicroKontrol && sourceId !== 'external' && sourceId !== 'capacitor-shell') {
      const input = this.access.inputs.get(sourceId);
      if (input && input.name && input.name.toLowerCase().includes('microkontrol')) {
        isMicroKontrolSource = true;
      }
    }

    // If it's a specific device being tracked, check filter. Always allow 'capacitor-shell' to bypass the input filter.
    if (sourceId !== 'capacitor-shell' && this.inputId !== 'all' && this.inputId !== sourceId && !isMicroKontrolSource) return;

    if (this.onMessage) this.onMessage(data);
    
    let i = 0;
    while (i < data.length) {
      const byte = data[i];

      // Skip real-time messages (0xF8 - 0xFF)
      if (byte >= 0xF8) {
        i++;
        continue;
      }

      // Check if this is a status byte
      let status = 0;
      if (byte >= 0x80) {
        status = byte;
        i++;
        // If it's a channel voice message (0x80 to 0xEF), update running status
        if (status < 0xF0) {
          this.runningStatus = status;
        } else {
          // System messages clear running status
          this.runningStatus = 0;
        }
      } else {
        // Use running status
        status = this.runningStatus;
      }

      if (status === 0) {
        // No running status and no status byte, ignore this lone data byte
        i++;
        continue;
      }

      const type = status & 0xf0;
      const channel = (status & 0x0f) + 1;

      // Handle message based on status types
      if (type === 0x80 || type === 0x90 || type === 0xA0 || type === 0xB0 || type === 0xE0) {
        // These expect 2 data bytes
        if (i + 1 < data.length) {
          const byte1 = data[i];
          const byte2 = data[i + 1];
          i += 2;

          // Apply channel filter if configured (0 is "all")
          if (this.channel === 0 || this.channel === channel) {
            if (type === 0x90 && byte2 > 0) { // Note On
              this.onNoteOn(byte1, byte2);
            } else if (type === 0x80 || (type === 0x90 && byte2 === 0)) { // Note Off
              this.onNoteOff(byte1, 0);
            } else if (type === 0xB0) { // CC
              // CC 120 (All Sound Off) or 123 (All Notes Off) -> Panic!
              if (byte1 === 120 || byte1 === 123) {
                if (this.onPanic) this.onPanic();
              } else if (this.onCC) {
                this.onCC(byte1, byte2, channel - 1);
              }
            } else if (type === 0xE0) { // Pitch Bend
              const value = (byte2 << 7) | byte1;
              if (this.onPitchBend) this.onPitchBend(value, channel - 1);
            }
          }
        } else {
          // Not enough bytes, break loop
          break;
        }
      } else if (type === 0xC0 || type === 0xD0) {
        // These expect 1 data byte
        if (i < data.length) {
          const byte1 = data[i];
          i += 1;
          // Apply channel filter if configured (0 is "all")
          if (this.channel === 0 || this.channel === channel) {
            // Program Change or Channel Pressure
            if (type === 0xC0 && this.onProgramChange) {
              this.onProgramChange(byte1, channel - 1);
            }
          }
        } else {
          break;
        }
      } else if (status === 0xF0) {
        // SysEx - skip until End of SysEx (0xF7)
        while (i < data.length && data[i] !== 0xF7) {
          i++;
        }
        if (i < data.length) i++; // Skip 0xF7
      } else {
        // Other System common messages
        if (status === 0xF2) {
          i += 2; // Song Position
        } else if (status === 0xF1 || status === 0xF3) {
          i += 1; // MTC Quarter Frame or Song Select
        } else {
          // Tune request (F6) or other 0-byte system common messages
        }
      }
    }
  }

  private handleMIDIMessage(event: any, sourceId: string) {
    if (event.data) {
      this.processRawMIDI(event.data, sourceId);
    }
  }
}
