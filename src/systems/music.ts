// High-tension cyber-industrial / synth-metal BGM synthesizer (menu 132, stage 148, boss 166 BPM).
import { loadSettings, saveSettings } from "./settings";

type MusicMode = "menu" | "stage" | "boss";

type MusicDebugState = {
  mode: MusicMode;
  bpm: number;
  intensity: number;
  isRunning: boolean;
  stepsPlayed: number;
  contextState: string;
};

const TEMPO: Record<MusicMode, number> = {
  menu: 132,
  stage: 148,
  boss: 166,
};

// 8-bar dark Phrygian / harmonic-minor progressions in Hz (D2 Phrygian base)
// Menu:   Dm  -> Eb  -> C   -> Bb  -> Dm  -> Eb  -> Bb  -> C#dim/A
// Stage:  D2  -> Eb2 -> C2  -> Bb1 -> D2  -> F2  -> Eb2 -> C#2
// Boss:   D2  -> Eb2 -> Ab2 -> G2  -> D2  -> F2  -> Ab2 -> A2
const PROGRESSIONS: Record<MusicMode, readonly number[]> = {
  menu: [73.42, 77.78, 65.41, 58.27, 73.42, 77.78, 58.27, 55.0],
  stage: [73.42, 77.78, 65.41, 58.27, 73.42, 87.31, 77.78, 69.3],
  boss: [73.42, 77.78, 103.83, 98.0, 73.42, 87.31, 103.83, 110.0],
};

// D Phrygian & tritone ratios: 1, b2, b3, 4, b5, 5, b6, b7, 8
const PHRYGIAN_ARP = [1, 1.0595, 1.4983, 1.1892, 1.5874, 1.4983, 1.0595, 2.0];
const COMBAT_LEAD_SCALE = [1, 1.0595, 1.1892, 1.3348, 1.4983, 1.5874, 1.8877, 2.0];
const BOSS_LEAD_SCALE = [1, 1.0595, 1.4142, 1.4983, 1.5874, 1.8877, 2.0, 2.1189];

const buildDriveCurve = (amount = 28): Float32Array<ArrayBuffer> => {
  const n = 256;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
};

const buildReverbIR = (ac: AudioContext, seconds = 0.22): AudioBuffer => {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
  }
  return ir;
};

class MusicSynth {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private guitarBus: WaveShaperNode | null = null;
  private guitarGain: GainNode | null = null;
  private bassGain: GainNode | null = null;
  private arpGain: GainNode | null = null;
  private drumGain: GainNode | null = null;
  private leadGain: GainNode | null = null;
  private padGain: GainNode | null = null;

  private isRunning = false;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private stepsPlayed = 0;
  private bpm = TEMPO.menu;
  private mode: MusicMode = "menu";
  private intensity = 1; // 0..3
  private noiseBuffer: AudioBuffer | null = null;

  private volume = 0.42;
  private muted = false;

  constructor() {
    const s = loadSettings();
    this.muted = s.muted;
    this.volume = Math.max(0, Math.min(1, s.musicVolume ?? 0.42));
    this.publishDebug();
  }

  private publishDebug() {
    if (typeof window !== "undefined") {
      (window as unknown as { __musicDebug?: MusicDebugState }).__musicDebug = {
        mode: this.mode,
        bpm: this.bpm,
        intensity: this.intensity,
        isRunning: this.isRunning,
        stepsPlayed: this.stepsPlayed,
        contextState: this.ctx?.state ?? "uninitialized",
      };
    }
  }

  private initAudio() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.publishDebug();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-13, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(5.5, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.14, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted || loadSettings().muted ? 0 : this.volume * 0.68;

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.18;
    const rev = this.ctx.createConvolver();
    rev.buffer = buildReverbIR(this.ctx, 0.22);
    this.reverbSend.connect(rev).connect(this.compressor);
    this.compressor.connect(this.masterGain).connect(this.ctx.destination);

    // Stem buses
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0.85;
    this.bassGain.connect(this.compressor);

    this.guitarGain = this.ctx.createGain();
    this.guitarGain.gain.value = 0.36;
    this.guitarBus = this.ctx.createWaveShaper();
    this.guitarBus.curve = buildDriveCurve(30);
    this.guitarBus.oversample = "2x";
    this.guitarBus.connect(this.guitarGain).connect(this.compressor);
    this.guitarGain.connect(this.reverbSend);

    this.arpGain = this.ctx.createGain();
    this.arpGain.gain.value = 0.52;
    this.arpGain.connect(this.compressor);
    this.arpGain.connect(this.reverbSend);

    this.drumGain = this.ctx.createGain();
    this.drumGain.gain.value = 0.86;
    this.drumGain.connect(this.compressor);

    this.leadGain = this.ctx.createGain();
    this.leadGain.gain.value = 0.56;
    this.leadGain.connect(this.compressor);
    this.leadGain.connect(this.reverbSend);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.32;
    this.padGain.connect(this.compressor);
    this.padGain.connect(this.reverbSend);

    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.55, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.publishDebug();
  }

  start(mode: MusicMode = "stage") {
    this.initAudio();
    if (!this.ctx) return;
    this.mode = mode;
    this.bpm = TEMPO[mode];
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.04;

    if (!this.isRunning) {
      this.isRunning = true;
      this.timerId = window.setInterval(() => this.scheduleNotes(), 35);
    }
    this.publishDebug();
  }

  stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    this.publishDebug();
  }

  setMode(mode: MusicMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.bpm = TEMPO[mode];
    this.publishDebug();
  }

  setIntensity(level: number) {
    this.intensity = Math.max(0, Math.min(3, level));
    this.publishDebug();
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && !this.muted && !loadSettings().muted) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.68, this.ctx?.currentTime ?? 0, 0.05);
    }
    saveSettings({ musicVolume: this.volume });
  }

  getVolume(): number {
    return this.volume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.68, this.ctx?.currentTime ?? 0, 0.05);
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted || loadSettings().muted;
  }

  private scheduleNotes() {
    if (!this.ctx || !this.isRunning) return;

    if (this.masterGain) {
      const globalMuted = this.muted || loadSettings().muted;
      const target = globalMuted ? 0 : this.volume * 0.68;
      if (Math.abs(this.masterGain.gain.value - target) > 0.01) {
        this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
      }
    }

    const secondsPerBeat = 60.0 / this.bpm;
    const stepTime = secondsPerBeat / 4; // 16th note

    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += stepTime;
      this.step = (this.step + 1) % 128; // 8-bar dark cyber-metal loop
      this.stepsPlayed += 1;
    }
    this.publishDebug();
  }

  private playStep(step: number, time: number) {
    if (!this.ctx || this.muted || loadSettings().muted) return;

    const bar = Math.floor(step / 16);
    const barStep = step % 16;
    const prog = PROGRESSIONS[this.mode];
    const root = prog[bar % prog.length];
    const stepDur = 60 / this.bpm / 4;

    if (this.mode === "menu") {
      // Menu: brooding pre-combat tension (heartbeat kick + ticking 16th hats + ominous pad + pulsing sub bass)
      if (barStep === 0 || barStep === 6 || barStep === 8 || barStep === 14) {
        this.playKick(time, barStep === 0 ? 0.72 : 0.42);
      }
      if (barStep % 2 === 1) {
        this.playHiHat(time, barStep % 4 === 3 ? 0.24 : 0.14);
      }
      if (barStep === 0 && bar % 2 === 0) {
        this.playTensionPad(root * 2, time, stepDur * 28, 0.22);
      }
      if (barStep % 2 === 0) {
        const oct = barStep % 4 === 0 ? 1 : 2;
        this.playBass(root * oct, time, stepDur * 1.45, 0.36);
      }
      if (barStep % 2 === 1) {
        const note = PHRYGIAN_ARP[(bar * 3 + barStep) % PHRYGIAN_ARP.length];
        this.playArp(root * 4 * note, time, stepDur * 0.9, 0.2);
      }
      return;
    }

    const isBoss = this.mode === "boss";

    // 1. Aggressive Industrial Drum Kit
    if (this.drumGain) {
      const doubleFill = bar % 2 === 1 && barStep >= 13;
      const kickHit = isBoss
        ? barStep % 2 === 0 || (bar % 2 === 1 && (barStep === 11 || barStep === 15))
        : barStep === 0 || barStep === 3 || barStep === 6 || barStep === 8 || barStep === 10 || doubleFill;
      if (kickHit) {
        this.playKick(time, barStep % 4 === 0 ? 0.88 : 0.64);
      }
      if (barStep === 4 || barStep === 12 || (isBoss && bar % 4 === 3 && (barStep === 14 || barStep === 15))) {
        this.playSnare(time, barStep === 4 || barStep === 12 ? 0.56 : 0.38);
      }
      if (barStep === 0 && (bar === 0 || bar === 4 || isBoss)) {
        this.playCrash(time, isBoss ? 0.28 : 0.22);
      }
      this.playHiHat(time, barStep % 4 === 2 ? 0.36 : barStep % 2 === 1 ? 0.22 : 0.14);
    }

    // 2. Relentless 16th Pumping Cyber-Bass
    if (this.bassGain) {
      const accent = barStep % 4 === 0;
      const freq = barStep % 4 === 3 && bar % 2 === 1 ? root * 2.1189 : accent ? root : root * 2;
      this.playBass(freq, time, stepDur * (accent ? 0.95 : 0.72), accent ? 0.48 : 0.36);
    }

    // 3. Distorted Power-Chord Synth/Metal Guitar Chugs (always active in stage/boss combat!)
    if (this.guitarBus) {
      const chug = isBoss
        ? barStep === 0 || barStep === 2 || barStep === 3 || barStep === 6 || barStep === 8 || barStep === 10 || barStep === 12 || barStep === 14
        : barStep === 0 || barStep === 3 || barStep === 6 || barStep === 8 || barStep === 12 || barStep === 14;
      if (chug) {
        const heavyHold = barStep === 0 || barStep === 8;
        this.playPowerChord(root * 2, time, stepDur * (heavyHold ? 2.1 : 1.05), heavyHold ? 0.34 : 0.24);
      }
    }

    // 4. Phrygian / Tritone Tension Arpeggiator (continuous driving pulse in combat)
    if (this.arpGain) {
      const deg = PHRYGIAN_ARP[(bar * 2 + barStep) % PHRYGIAN_ARP.length];
      this.playArp(root * 4 * deg, time, stepDur * 0.85, isBoss ? 0.28 : 0.22);
    }

    // 5. High-Octave Siren Lead Synth & Dread Swell
    if (this.leadGain && (this.intensity >= 1 || isBoss || bar >= 2)) {
      const playLeadNote = isBoss ? barStep % 2 === 0 : barStep === 0 || barStep === 3 || barStep === 6 || barStep === 8 || barStep === 11 || barStep === 14;
      if (playLeadNote) {
        const scale = isBoss ? BOSS_LEAD_SCALE : COMBAT_LEAD_SCALE;
        const idx = (bar * 5 + Math.floor(barStep / 2) + (barStep % 3)) % scale.length;
        const octave = isBoss && this.intensity >= 2 ? 8 : 6;
        this.playLead(root * octave * scale[idx], time, stepDur * (isBoss ? 1.85 : 2.1));
      }
    }

    // 6. Boss / Overdrive Tritone Alarm Brass Swell
    if (this.padGain && barStep === 0 && (isBoss || this.intensity >= 2)) {
      this.playTensionPad(root * 2 * (isBoss && bar % 2 === 1 ? 1.4142 : 1.0595), time, stepDur * 12, isBoss ? 0.26 : 0.18);
    }
  }

  private playKick(t: number, vol = 0.8) {
    if (!this.ctx || !this.drumGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.11);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain).connect(this.drumGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private playSnare(t: number, vol = 0.5) {
    if (!this.ctx || !this.drumGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1900, t);
    filter.Q.setValueAtTime(0.9, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter).connect(gain).connect(this.drumGain);
    if (this.reverbSend) gain.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.17);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.09);
    og.gain.setValueAtTime(vol * 0.72, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og).connect(this.drumGain);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  private playHiHat(t: number, vol = 0.22) {
    if (!this.ctx || !this.drumGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7800, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(filter).connect(gain).connect(this.drumGain);
    src.start(t);
    src.stop(t + 0.05);
  }

  private playCrash(t: number, vol = 0.24) {
    if (!this.ctx || !this.drumGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(4200, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    src.connect(filter).connect(gain).connect(this.drumGain);
    if (this.reverbSend) gain.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.44);
  }

  private playBass(freq: number, t: number, dur: number, vol = 0.42) {
    if (!this.ctx || !this.bassGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, t);

    filter.type = "lowpass";
    filter.Q.setValueAtTime(3.2, t);
    filter.frequency.setValueAtTime(620, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + dur);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter).connect(gain).connect(this.bassGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playPowerChord(rootFreq: number, t: number, dur: number, vol = 0.28) {
    if (!this.ctx || !this.guitarBus) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(980, t);
    filter.Q.setValueAtTime(0.8, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    filter.connect(gain).connect(this.guitarBus);
    for (const ratio of [1, 1.4983]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(rootFreq * ratio, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  private playArp(freq: number, t: number, dur: number, vol = 0.24) {
    if (!this.ctx || !this.arpGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, t);

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(650, t + dur);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp).connect(gain).connect(this.arpGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playLead(freq: number, t: number, dur: number) {
    if (!this.ctx || !this.leadGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 1.007, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.leadGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
  }

  private playTensionPad(freq: number, t: number, dur: number, vol = 0.2) {
    if (!this.ctx || !this.padGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, t);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.linearRampToValueAtTime(980, t + dur * 0.6);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.12, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter).connect(gain).connect(this.padGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
}

export const music = new MusicSynth();
