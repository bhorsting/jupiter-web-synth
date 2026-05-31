# 🎛️ Virtual Analog & Hammond Drawbar Synthesizer

Welcome to the **Virtual Analog & Hammond Drawbar Synthesizer**, a high-fidelity, dual-synthesis sound workstation built entirely using the **Web Audio API** in **TypeScript** and **React**. 

This workstation merges the raw, warm grit of a vintage **subtractive analog synthesizer** with the classic, rich harmonic layers of a **Hammond Drawbar Organ**. Framed within a striking, custom **Retro-Futuristic Dark/Industrial Synth Theme**, the application features precise mathematical knobs, live oscilloscopes, tactile sliders, an arpeggiator, stereo effects processors, and cloud-to-local patch synchronization.

---

## 🎨 Visual Identity & Industrial Design

The application's interface eschews generic contemporary designs in favor of a **tactile, physical rack-mount aesthetic** characterized by:
- **High-Contrast Slate Dark Theme**: Deep charcoal margins contrasted with sharp white boundaries and deep velvet black modules.
- **Vibrant Accent Controls**: Striking hazard-orange active states, amber indicators, and vintage LED indicators.
- **Aesthetic Pairings**: Clean display headers paired with elegant, monospace monospace indicators (`JetBrains Mono` style) mimicking physical LCD hardware screens.
- **Custom Block Scrollbars**: A zero-radius, boxy scrollbar layout featuring direct dark tracks and thick, rectangular gray/orange slider thumbs seamlessly integrated into the hardware border grid.
- **Fluid Layout Dividers**: Responsive CSS layout panels representing separate hardware modules linked together by a high-contrast synthesizer chassis border.

---

## 🔊 The Dual Engine Architecture

The synthesizer's core audio engine (`src/engine/JupiterEngine.ts`) can instantly switch between two distinct audio synthesis topologies:

### 1. Subtractive Virtual Analog Engine
A dual-oscillator polyphonic structure designed to recreate vintage monophonic and polyphonic synthesizers:
- **VCO 1 / VCO 2**: Multi-waveform oscillators capable of producing Sine, Square, Sawtooth, and Triangle waves, augmented with physical Noise generators for structural texture.
- **Cross Modulation (FM)**: Frequency Modulation feedback between VCO 1 and VCO 2 to generate rich, metallic, and complex frequency sidebands.
- **VCF (Voltage Controlled Filter)**: A resonant 24dB/oct biquad resonant filter offering Low-pass, High-pass, Band-pass, and Notch modes, with integrated envelope sweep depth and LFO frequency modulation.
- **Envelopes (EG)**: Independent 4-stage **ADSR** (Attack, Decay, Sustain, Release) envelope curves mapped individually to the **VCF (Filter)** and **VCA (Amplifier)** to craft dynamic acoustic behaviors.

### 2. Hammond Tonewheel Drawbar Engine
An authentic additive Hammond organ simulation constructed using a physical-modeling voice pipeline:
- **Sine Drawbars**: Native polyphonic routing across nine sub-harmonic, fundamental, and overtone tonewheels corresponding to footages: `16'`, `5⅓'`, `8'`, `4'`, `2⅔'`, `2'`, `1⅗'`, `1⅓'`, and `1'`.
- **Dynamic Percussion Generator**: Transient physical envelopes mimicking classic vintage click/percussion on keys, with control over percussion decay lengths, harmonic pitch, and trigger velocity.

---

## 🎚️ Modular Control Sections

### 🌀 Low Frequency Oscillator (LFO)
A global modulation source delivering low-frequency cyclical control values:
- Custom target routing directly to **Pitch (VCO)**, **Cutoff (VCF)**, or **Volume (VCA)**.
- Multiple waveform shapes including Sine, Square, Sawtooth, and Sample-and-Hold.

### 🕹️ Interactive Arpeggiator (ARP)
An advanced arpeggio sequencer that processes polyphonic keyboard note arrays:
- **Movement Patterns**: Up, Down, Up/Down, Random, and Order-played modes.
- **Step Synchronization**: Dynamic rate timing locked to BPM subdivisions (e.g., Quarter, Eighth, Sixteenth notes, or triplets).
- **Octave Range**: Up to a 4-octave transposing envelope.

---

## 🎛️ Stereo Effects Rack (FX)

To add depth, texture, and spacing, the master signal is routed sequentially through an active stereo digital signal processing chains:
1. **Distortion**: Soft/Hard solid-state clipping curves to introduce rich tube-distortion harmonics.
2. **Chorus**: A multi-voice delay-modulated stereo chorus to double and widen spatial presence.
3. **Phaser**: An all-pass filter cascade sweep generating classic swishing sweep dynamics.
4. **Stereo Delay**: Tempo-synchronized echoes with independent feedback loop filters and dampening.
5. **Concert Reverb**: A high-density algorithmic spatial model recreating lush performance spaces with adjustable decay sizes, pre-delays, and dampening controls.

---

## 💾 Cloud-to-Local Database & Integrations

The patch-management framework combines instant local speed with seamless, durable cloud collaboration options:
- **IndexedDB Sync Engine**: Stores and retrieves custom audio patch settings directly within browser-level persistent file slots, keeping your custom presets ready instantly across page refreshes.
- **Google Sheets Spreadsheet Sync**: A fully secure, direct client OAuth integration (`src/services/GoogleSheetsService.ts`) allowing users to host, save, share, and dynamically load sound banks together inside a designated sheet URL.
- **MIDI Dynamic Mapping**: Native integration with the HTML5 **Web MIDI API** enabling hardware synth-keyboards to map sliders, rotaries, pitch/mod-wheels, and keys instantly into the Virtual Analog parameter grid.

---

## 🛠️ Project File Anatomy

- `src/App.tsx`: Main user-interface state hub, managing layout distribution and Web Audio API lifecycle binding.
- `src/engine/JupiterEngine.ts`: The low-level audio heart, handling polyphonic voice allocation and parameter updates.
- `src/components/`:
  - `SynthPanel.tsx`: Core UI panels for VCO, VCF, VCA, and Hammond Organ drawbar sliders.
  - `PianoKeyboard.tsx`: Responsive on-screen velocity-sensitive chromatic keybed.
  - `Oscilloscope.tsx`: Dynamic SVG vector canvas rendering live wave shapes and frequency spectrum charts.
  - `Controls.tsx`: Reusable physical slider, rotary knob, and toggle switch component controls.
- `src/index.css`: Tailwind variables, physical visual assets, layout grids, and the custom thick block scrollbars.
