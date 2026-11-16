import { loadSettings, saveSettings } from "./settings";

type MusicMode = "menu" | "stage" | "boss";

class MusicSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bassGain: GainNode | null = null;
  private arpGain: GainNode | null = null;
  private drumGain: GainNode | null = null;
  private leadGain: GainNode | null = null;

  private isRunning = false;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private bpm = 126;
  private mode: MusicMode = "menu";
  private intensity = 1; // 0..3
  private noiseBuffer: AudioBuffer | null = null;

  private volume = 0.35;
  private muted = false;

  constructor() {
    const s = loadSettings();
    this.muted = s.muted;
    this.volume = s.musicVolume ?? 0.35;
  }

  private initAudio() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(this.ctx.destination);

    // Stem buses
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0.8;
    this.bassGain.connect(this.masterGain);

    this.arpGain = this.ctx.createGain();
    this.arpGain.gain.value = 0.6;
    this.arpGain.connect(this.masterGain);

    this.drumGain = this.ctx.createGain();
    this.drumGain.gain.value = 0.75;
    this.drumGain.connect(this.masterGain);

    this.leadGain = this.ctx.createGain();
    this.leadGain.gain.value = 0.55;
    this.leadGain.connect(this.masterGain);

    // Noise buffer for drums
    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  start(mode: MusicMode = "stage") {
    this.initAudio();
    if (!this.ctx) return;
    this.mode = mode;
    this.bpm = mode === "boss" ? 146 : mode === "menu" ? 116 : 126;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    if (!this.isRunning) {
      this.isRunning = true;
      this.timerId = window.setInterval(() => this.scheduleNotes(), 40);
    }
  }

  stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
  }

  setMode(mode: MusicMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.bpm = mode === "boss" ? 146 : mode === "menu" ? 116 : 126;
  }

  setIntensity(level: number) {
    this.intensity = Math.max(0, Math.min(3, level));
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx?.currentTime ?? 0, 0.05);
    }
    const s = loadSettings();
    saveSettings({ ...s, musicVolume: this.volume });
  }

  getVolume(): number {
    return this.volume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx?.currentTime ?? 0, 0.05);
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private scheduleNotes() {
    if (!this.ctx || !this.isRunning) return;

    const secondsPerBeat = 60.0 / this.bpm;
    const stepTime = secondsPerBeat / 4; // 16th note

    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += stepTime;
      this.step = (this.step + 1) % 64; // 4-bar loop
    }
  }

  // Chords progression: Dm -> F -> C -> Bb (Root notes in Hz)
  private getChordRoot(bar: number): number {
    const roots = [73.42, 87.31, 65.41, 58.27]; // D2, F2, C2, Bb1
    return roots[bar % 4];
  }

  private playStep(step: number, time: number) {
    if (!this.ctx || this.muted) return;

    const bar = Math.floor(step / 16);
    const barStep = step % 16;
    const root = this.getChordRoot(bar);

    // 1. Drums
    if (this.drumGain && this.mode !== "menu") {
      // Kick on 0, 4, 8, 12 (4-on-the-floor)
      if (barStep % 4 === 0) {
        this.playKick(time);
      }
      // Snare on 4, 12
      if (barStep === 4 || barStep === 12) {
        this.playSnare(time);
      }
      // Hi-hat on offbeats
      if (barStep % 2 === 1 || this.mode === "boss") {
        this.playHiHat(time, barStep % 4 === 2 ? 0.35 : 0.18);
      }
    } else if (this.drumGain && this.mode === "menu") {
      // Soft chill hi-hat on menu
      if (barStep % 4 === 2) {
        this.playHiHat(time, 0.12);
      }
    }

    // 2. Rolling Bassline (16th notes synthwave pulse)
    if (this.bassGain) {
      const oct = barStep % 2 === 0 ? 1 : 2;
      const bassFreq = root * oct;
      this.playBass(bassFreq, time, (60 / this.bpm) * 0.22);
    }

    // 3. Arpeggiator (Scale: Root, minor 3rd, 5th, octave, 7th)
    if (this.arpGain && (this.intensity >= 1 || this.mode === "boss")) {
      const arpNotes = [1, 1.189, 1.498, 2.0, 1.782, 1.498, 1.189, 1.498];
      const scaleDegree = arpNotes[barStep % arpNotes.length];
      const arpFreq = root * 4 * scaleDegree;
      this.playArp(arpFreq, time, 0.1);
    }

    // 4. Lead Melody (Active during High Intensity, Combo >= 20, Overdrive or Boss)
    if (this.leadGain && (this.intensity >= 2 || this.mode === "boss")) {
      // Melodic notes synced to 8th notes
      if (barStep % 2 === 0) {
        const leadScale = [1, 1.189, 1.335, 1.498, 1.782, 2.0, 2.378];
        const noteIdx = (bar * 3 + Math.floor(barStep / 2)) % leadScale.length;
        const leadFreq = root * 6 * leadScale[noteIdx];
        this.playLead(leadFreq, time, (60 / this.bpm) * 0.45);
      }
    }
  }

  private playKick(t: number) {
    if (!this.ctx || !this.drumGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.12);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain).connect(this.drumGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private playSnare(t: number) {
    if (!this.ctx || !this.drumGain || !this.noiseBuffer) return;
    // Noise snap
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1200, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    src.connect(filter).connect(gain).connect(this.drumGain);
    src.start(t);
    src.stop(t + 0.17);

    // Body tone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(oscGain).connect(this.drumGain);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  private playHiHat(t: number, vol = 0.2) {
    if (!this.ctx || !this.drumGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7500, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    src.connect(filter).connect(gain).connect(this.drumGain);
    src.start(t);
    src.stop(t + 0.06);
  }

  private playBass(freq: number, t: number, dur: number) {
    if (!this.ctx || !this.bassGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, t);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(380, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + dur);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter).connect(gain).connect(this.bassGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private playArp(freq: number, t: number, dur: number) {
    if (!this.ctx || !this.arpGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain).connect(this.arpGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private playLead(freq: number, t: number, dur: number) {
    if (!this.ctx || !this.leadGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * 1.005, t + dur); // slight vibrato

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, t);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter).connect(gain).connect(this.leadGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }
}

export const music = new MusicSynth();
