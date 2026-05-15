/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MIDICallback = (note: number, velocity: number) => void;
export type MIDICCCallback = (cc: number, value: number, channel: number) => void;
export type MIDIPitchBendCallback = (value: number, channel: number) => void;
export type MIDIPanicCallback = () => void;
export type MIDIRawCallback = (data: Uint8Array) => void;

export class MIDIService {
  private onNoteOn: MIDICallback;
  private onNoteOff: MIDICallback;
  private onCC?: MIDICCCallback;
  private onPitchBend?: MIDIPitchBendCallback;
  private onPanic?: MIDIPanicCallback;
  private onMessage?: MIDIRawCallback;
  private access: MIDIAccess | null = null;
  private inputId: string = 'all';
  private channel: number = 0; // 0 for all

  constructor(
    onNoteOn: MIDICallback, 
    onNoteOff: MIDICallback, 
    onCC?: MIDICCCallback, 
    onMessage?: MIDIRawCallback,
    onPitchBend?: MIDIPitchBendCallback,
    onPanic?: MIDIPanicCallback
  ) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onCC = onCC;
    this.onMessage = onMessage;
    this.onPitchBend = onPitchBend;
    this.onPanic = onPanic;
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

  setFilter(inputId: string, channel: number) {
    this.inputId = inputId;
    this.channel = channel;
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

      // Attach listener if it matches filter or filter is 'all'
      if (this.inputId === 'all' || this.inputId === input.id) {
        input.onmidimessage = (event) => this.handleMIDIMessage(event, input.id);
      }
    });
  }

  /**
   * Directly process raw MIDI bytes from an external source
   */
  processRawMIDI(data: Uint8Array, sourceId: string = 'external') {
    // If it's a specific device being tracked, check filter
    if (this.inputId !== 'all' && this.inputId !== sourceId) return;

    if (this.onMessage) this.onMessage(data);
    
    const [command, note, velocity] = data;
    const type = command & 0xf0;
    const channel = (command & 0x0f) + 1; // 1-indexed for filtering

    // Channel filter (0 means all)
    if (this.channel !== 0 && this.channel !== channel) return;

    if (type === 144 && velocity > 0) { // Note On
      this.onNoteOn(note, velocity);
    } else if (type === 128 || (type === 144 && velocity === 0)) { // Note Off
      this.onNoteOff(note, 0);
    } else if (type === 176) { // CC
      if (this.onCC) this.onCC(note, velocity, channel - 1);
    } else if (type === 224) { // Pitch Bend
      // Combine 7-bit LSB and MSB to 14-bit value
      const value = (velocity << 7) | note; 
      if (this.onPitchBend) this.onPitchBend(value, channel - 1);
    }
  }

  private handleMIDIMessage(event: any, sourceId: string) {
    if (event.data) {
      this.processRawMIDI(event.data, sourceId);
    }
  }
}
