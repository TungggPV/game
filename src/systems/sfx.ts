// Multi-layer WebAudio elemental SFX synthesizer with compressor, saturation & spatial reverb.
import type { HeroElement } from "./Fx";
import { loadSettings, saveSettings } from "./settings";

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let compressor: DynamicsCompressorNode | null = null;
let master: GainNode | null = null;
let reverbSend: GainNode | null = null;
let shaperCurve: Float32Array<ArrayBuffer> | null = null;
let noiseBuffer: AudioBuffer | null = null;

const initialSettings = loadSettings();
let muted = initialSettings.muted;
let currentVolume = Math.max(0, Math.min(1, initialSettings.volume));
const BASE_GAIN = 0.42;

type SfxDebugState = {
  playCount: number;
  lastEvent: string;
  contextState: string;
  history: string[];
};

const debugState: SfxDebugState = {
  playCount: 0,
  lastEvent: "",
  contextState: "uninitialized",
  history: [],
};

const track = (event: string) => {
  debugState.playCount += 1;
  debugState.lastEvent = event;
  debugState.contextState = ctx?.state ?? "uninitialized";
  debugState.history.push(event);
  if (debugState.history.length > 256) debugState.history.shift();
  if (typeof window !== "undefined") {
    (window as unknown as { __sfxDebug?: SfxDebugState }).__sfxDebug = {
      ...debugState,
      history: [...debugState.history],
    };
  }
};

const buildDistortionCurve = (amount = 24): Float32Array<ArrayBuffer> => {
  const n = 256;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
};

const buildImpulseResponse = (ac: AudioContext, seconds = 0.28, decay = 3.4) => {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return ir;
};

const audio = () => {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    compressor.knee.setValueAtTime(12, ctx.currentTime);
    compressor.ratio.setValueAtTime(6, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.14, ctx.currentTime);

    master = ctx.createGain();
    master.gain.value = BASE_GAIN * currentVolume;

    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.24;

    const convolver = ctx.createConvolver();
    convolver.buffer = buildImpulseResponse(ctx, 0.28, 3.2);

    reverbSend.connect(convolver).connect(compressor);
    compressor.connect(master).connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    shaperCurve = buildDistortionCurve(22);
  }
  if (ctx.state === "suspended") void ctx.resume();
  debugState.contextState = ctx.state;
  return ctx;
};

type ToneOpts = {
  wave?: Wave;
  vol?: number;
  delay?: number;
  wet?: boolean;
  drive?: boolean;
  detuneCents?: number;
  attack?: number;
};

const tone = (freq: number, to: number, dur: number, optsOrWave: Wave | ToneOpts = "square", legacyVol = 0.4, legacyDelay = 0) => {
  const ac = audio();
  if (!ac || !compressor || muted) return;

  const opts: ToneOpts =
    typeof optsOrWave === "string"
      ? { wave: optsOrWave, vol: legacyVol, delay: legacyDelay }
      : optsOrWave;

  const wave = opts.wave ?? "square";
  const vol = opts.vol ?? 0.4;
  const delay = opts.delay ?? 0;
  const attack = Math.min(dur * 0.45, opts.attack ?? 0.006);

  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(Math.max(20, freq), t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  if (opts.detuneCents) osc.detune.setValueAtTime(opts.detuneCents, t);

  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  let tail: AudioNode = gain;
  if (opts.drive && shaperCurve) {
    const shaper = ac.createWaveShaper();
    shaper.curve = shaperCurve;
    shaper.oversample = "2x";
    osc.connect(shaper).connect(gain);
  } else {
    osc.connect(gain);
  }

  tail.connect(compressor);
  if (opts.wet && reverbSend) tail.connect(reverbSend);

  osc.start(t);
  osc.stop(t + dur + 0.03);
};

const fmTone = (carrier: number, carrierTo: number, modFreq: number, modDepth: number, dur: number, vol = 0.28, delay = 0, wet = true) => {
  const ac = audio();
  if (!ac || !compressor || muted) return;
  const t = ac.currentTime + delay;
  const car = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const outGain = ac.createGain();

  car.type = "sine";
  mod.type = "triangle";
  car.frequency.setValueAtTime(Math.max(30, carrier), t);
  car.frequency.exponentialRampToValueAtTime(Math.max(30, carrierTo), t + dur);
  mod.frequency.setValueAtTime(modFreq, t);
  modGain.gain.setValueAtTime(modDepth, t);
  modGain.gain.exponentialRampToValueAtTime(1, t + dur);

  outGain.gain.setValueAtTime(0.001, t);
  outGain.gain.linearRampToValueAtTime(vol, t + 0.008);
  outGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  mod.connect(modGain).connect(car.frequency);
  car.connect(outGain).connect(compressor);
  if (wet && reverbSend) outGain.connect(reverbSend);

  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.03);
  mod.stop(t + dur + 0.03);
};

const noise = (
  dur: number,
  vol = 0.4,
  cutoffFrom = 2000,
  delay = 0,
  filterType: BiquadFilterType = "lowpass",
  cutoffTo = 90,
  q = 1.0,
  wet = false,
) => {
  const ac = audio();
  if (!ac || !compressor || !noiseBuffer || muted) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ac.createBiquadFilter();
  filter.type = filterType;
  filter.Q.setValueAtTime(q, t);
  filter.frequency.setValueAtTime(Math.max(30, cutoffFrom), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, cutoffTo), t + dur);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(vol, t + Math.min(0.015, dur * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  src.connect(filter).connect(gain).connect(compressor);
  if (wet && reverbSend) gain.connect(reverbSend);
  src.start(t);
  src.stop(t + dur + 0.03);
};

const subDrop = (from = 140, to = 34, dur = 0.36, vol = 0.52, delay = 0) => {
  tone(from, to, dur, { wave: "sine", vol, delay, wet: true, drive: true, attack: 0.004 });
};

const ELEMENT_ROOT: Record<HeroElement, number> = {
  plasma: 523.25,
  fire: 349.23,
  volt: 659.25,
  wind: 587.33,
  earth: 196.0,
  cryo: 783.99,
  void: 277.18,
};

export const sfx = {
  unlock: () => audio(),
  setVolume: (v: number) => {
    currentVolume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = BASE_GAIN * currentVolume;
    saveSettings({ volume: currentVolume });
  },
  toggleMute: () => {
    muted = !muted;
    saveSettings({ muted });
    return muted;
  },
  isMuted: () => muted,

  swing: () => {
    track("swing");
    noise(0.09, 0.28, 4600, 0, "bandpass", 1200, 1.4, true);
    tone(620, 240, 0.08, { wave: "triangle", vol: 0.16 });
  },

  comboSwing: (step: number, element: HeroElement) => {
    track(`comboSwing:${element}:${step}`);
    const root = ELEMENT_ROOT[element];
    const pitchMul = step === 1 ? 1.0 : step === 2 ? 1.18 : 1.42;
    const dur = step === 3 ? 0.17 : 0.09;
    noise(dur, step === 3 ? 0.38 : 0.24, 3400 * pitchMul, 0, "bandpass", 900, 1.6, true);
    tone(root * pitchMul, root * pitchMul * 0.48, dur, {
      wave: element === "earth" ? "sawtooth" : "triangle",
      vol: step === 3 ? 0.26 : 0.16,
      wet: true,
      drive: step === 3,
    });
    if (step === 3) {
      subDrop(130, 48, 0.16, 0.35);
      fmTone(root * 1.5, root * 2.0, root * 0.5, 180, 0.14, 0.16);
    }
  },

  hit: () => {
    track("hit");
    noise(0.11, 0.46, 2800, 0, "lowpass", 180, 1.0, false);
    tone(210, 58, 0.11, { wave: "triangle", vol: 0.32, drive: true });
  },

  crit: () => {
    track("crit");
    noise(0.15, 0.54, 5800, 0, "bandpass", 1400, 1.5, true);
    tone(1040, 260, 0.15, { wave: "sawtooth", vol: 0.26, drive: true, wet: true });
    fmTone(1560, 2080, 420, 260, 0.12, 0.22);
    subDrop(160, 52, 0.16, 0.42);
  },

  shoot: () => {
    track("shoot");
    tone(920, 230, 0.15, { wave: "sawtooth", vol: 0.2, wet: true });
    noise(0.1, 0.22, 4200, 0, "highpass", 1800, 1.0, true);
  },

  zap: () => {
    track("zap");
    fmTone(1450, 420, 190, 900, 0.14, 0.24, 0, true);
    noise(0.11, 0.26, 6500, 0, "bandpass", 2400, 2.0, true);
  },

  boom: () => {
    track("boom");
    subDrop(145, 28, 0.44, 0.58);
    noise(0.48, 0.65, 1600, 0, "lowpass", 65, 1.2, true);
    tone(180, 42, 0.28, { wave: "sawtooth", vol: 0.28, drive: true, wet: true });
  },

  jump: () => {
    track("jump");
    tone(280, 680, 0.11, { wave: "triangle", vol: 0.18, wet: true });
    noise(0.08, 0.14, 2400, 0, "bandpass", 3600, 1.2, false);
  },

  dash: () => {
    track("dash");
    noise(0.16, 0.32, 3600, 0, "bandpass", 900, 1.6, true);
    tone(440, 190, 0.12, { wave: "sine", vol: 0.18, wet: true });
  },

  dodge: () => {
    track("dodge");
    fmTone(1320, 660, 310, 450, 0.18, 0.34);
    tone(1760, 2200, 0.12, { wave: "sine", vol: 0.2, wet: true, delay: 0.03 });
    noise(0.09, 0.24, 4800, 0, "highpass", 2200, 1.2, true);
  },

  parry: () => {
    track("parry");
    fmTone(1760, 2640, 520, 600, 0.26, 0.42);
    tone(1320, 1980, 0.22, { wave: "triangle", vol: 0.32, wet: true });
    tone(2640, 2630, 0.24, { wave: "sine", vol: 0.24, wet: true, delay: 0.02 });
    noise(0.12, 0.42, 7400, 0, "highpass", 3000, 1.4, true);
  },

  break: () => {
    track("break");
    subDrop(180, 32, 0.45, 0.56);
    tone(240, 64, 0.36, { wave: "sawtooth", vol: 0.45, drive: true, wet: true });
    fmTone(1920, 540, 380, 820, 0.28, 0.3, 0.03);
    noise(0.42, 0.6, 3200, 0, "bandpass", 350, 1.1, true);
  },

  reaction: () => {
    track("reaction");
    [587, 880, 1174, 1760].forEach((f, i) => {
      tone(f, f * 1.15, 0.2, { wave: i % 2 ? "triangle" : "sine", vol: 0.26, wet: true, delay: i * 0.035 });
    });
    fmTone(1174, 1760, 290, 340, 0.24, 0.26, 0.04);
  },

  pickup: () => {
    track("pickup");
    tone(880, 1320, 0.07, { wave: "triangle", vol: 0.16, wet: true });
    tone(1320, 1760, 0.1, { wave: "sine", vol: 0.18, wet: true, delay: 0.05 });
  },

  hurt: () => {
    track("hurt");
    tone(250, 75, 0.22, { wave: "sawtooth", vol: 0.3, drive: true });
    noise(0.14, 0.34, 1600, 0, "lowpass", 180, 1.0, false);
  },

  enemyShot: () => {
    track("enemyShot");
    tone(520, 170, 0.16, { wave: "square", vol: 0.12, wet: false });
  },

  ultimate: () => {
    track("ultimate");
    subDrop(150, 36, 0.55, 0.55);
    tone(140, 960, 0.55, { wave: "sawtooth", vol: 0.28, wet: true, drive: true });
    noise(0.55, 0.36, 3400, 0.08, "bandpass", 700, 1.4, true);
  },

  select: () => {
    track("select");
    tone(660, 990, 0.08, { wave: "triangle", vol: 0.16, wet: true });
    tone(1320, 1480, 0.06, { wave: "sine", vol: 0.1, delay: 0.03, wet: true });
  },

  confirm: () => {
    track("confirm");
    tone(523.25, 659.25, 0.09, { wave: "triangle", vol: 0.18, wet: true });
    tone(783.99, 1046.5, 0.16, { wave: "sine", vol: 0.2, delay: 0.06, wet: true });
  },

  warn: () => {
    track("warn");
    for (let i = 0; i < 2; i += 1) {
      tone(220, 195, 0.2, { wave: "sawtooth", vol: 0.22, delay: i * 0.24, wet: true, drive: true });
      tone(440, 390, 0.18, { wave: "square", vol: 0.14, delay: i * 0.24, wet: true });
    }
  },

  win: () => {
    track("win");
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, f * 1.01, 0.24, { wave: "triangle", vol: 0.22, delay: i * 0.11, wet: true });
    });
  },

  lose: () => {
    track("lose");
    [392, 349.23, 293.66, 196].forEach((f, i) => {
      tone(f, f * 0.94, 0.28, { wave: "sawtooth", vol: 0.18, delay: i * 0.16, wet: true });
    });
  },

  // ---------- AAA Elemental Skill Signatures ----------

  skillCast: (element: HeroElement, slot: "skill1" | "skill2" | "ultimate") => {
    track(`skillCast:${element}:${slot}`);
    const heavy = slot !== "skill1";
    switch (element) {
      case "plasma":
        tone(340, 1480, 0.14, { wave: "sawtooth", vol: 0.24, wet: true });
        tone(680, 220, 0.24, { wave: "square", vol: 0.2, delay: 0.04, detuneCents: 14, wet: true });
        noise(0.18, 0.3, 5200, 0.02, "bandpass", 1400, 2.2, true);
        if (heavy) subDrop(135, 45, 0.22, 0.4, 0.03);
        break;
      case "fire":
        noise(0.32, heavy ? 0.56 : 0.42, 360, 0, "bandpass", 2200, 1.3, true);
        noise(0.28, 0.4, 1800, 0.05, "lowpass", 140, 1.0, true);
        tone(220, 74, 0.26, { wave: "sawtooth", vol: 0.28, drive: true, wet: true });
        subDrop(150, 38, 0.28, 0.48);
        break;
      case "volt":
        fmTone(1680, 520, 240, 1200, 0.18, 0.28, 0, true);
        noise(0.16, 0.38, 7200, 0, "highpass", 2200, 2.0, true);
        tone(960, 320, 0.14, { wave: "square", vol: 0.18, delay: 0.04, detuneCents: -18, wet: true });
        if (heavy) {
          fmTone(2100, 680, 320, 950, 0.24, 0.22, 0.06, true);
          subDrop(130, 42, 0.2, 0.36);
        }
        break;
      case "wind":
        noise(0.26, 0.44, 1100, 0, "bandpass", 3800, 2.6, true);
        noise(0.2, 0.26, 3200, 0.06, "bandpass", 900, 2.2, true);
        tone(760, 1280, 0.16, { wave: "sine", vol: 0.22, wet: true });
        tone(1140, 540, 0.18, { wave: "triangle", vol: 0.16, delay: 0.05, wet: true });
        break;
      case "earth":
        subDrop(125, 26, 0.42, 0.62);
        tone(140, 38, 0.34, { wave: "sawtooth", vol: 0.42, drive: true, wet: true });
        noise(0.32, 0.54, 1200, 0, "lowpass", 75, 1.1, true);
        noise(0.22, 0.36, 2600, 0.06, "bandpass", 520, 1.6, true);
        break;
      case "cryo":
        fmTone(1760, 2349, 640, 480, 0.22, 0.24, 0, true);
        fmTone(2637, 3520, 920, 360, 0.24, 0.2, 0.04, true);
        noise(0.28, 0.32, 5400, 0, "highpass", 1800, 1.6, true);
        if (heavy) subDrop(110, 44, 0.22, 0.3);
        break;
      case "void":
        tone(75, 290, 0.24, { wave: "sawtooth", vol: 0.3, attack: 0.12, drive: true, wet: true });
        fmTone(540, 130, 112, 680, 0.28, 0.26, 0.03, true);
        noise(0.26, 0.34, 2400, 0.02, "bandpass", 320, 2.8, true);
        subDrop(95, 28, 0.34, 0.44, 0.06);
        break;
    }
  },

  elementImpact: (element: HeroElement, heavy = false) => {
    track(`elementImpact:${element}:${heavy ? "heavy" : "light"}`);
    const v = heavy ? 1.15 : 0.82;
    switch (element) {
      case "plasma":
        tone(840, 180, heavy ? 0.22 : 0.13, { wave: "sawtooth", vol: 0.26 * v, wet: true, drive: true });
        noise(0.16, 0.38 * v, 4200, 0, "bandpass", 900, 1.6, true);
        if (heavy) subDrop(130, 38, 0.25, 0.45);
        break;
      case "fire":
        subDrop(140, 32, heavy ? 0.36 : 0.2, 0.5 * v);
        noise(heavy ? 0.34 : 0.2, 0.5 * v, 1400, 0, "lowpass", 85, 1.1, true);
        break;
      case "volt":
        fmTone(1860, 380, 290, 980, heavy ? 0.22 : 0.13, 0.28 * v, 0, true);
        noise(0.14, 0.34 * v, 6800, 0, "highpass", 2000, 1.8, true);
        if (heavy) subDrop(125, 40, 0.22, 0.42);
        break;
      case "wind":
        noise(0.18, 0.38 * v, 2800, 0, "bandpass", 950, 2.4, true);
        tone(920, 340, 0.14, { wave: "triangle", vol: 0.22 * v, wet: true });
        break;
      case "earth":
        subDrop(115, 24, heavy ? 0.42 : 0.24, 0.62 * v);
        noise(0.28, 0.52 * v, 900, 0, "lowpass", 65, 1.0, true);
        break;
      case "cryo":
        fmTone(2480, 920, 740, 560, 0.18, 0.24 * v, 0, true);
        noise(0.16, 0.36 * v, 5600, 0, "highpass", 2400, 2.0, true);
        if (heavy) subDrop(115, 42, 0.2, 0.36);
        break;
      case "void":
        fmTone(460, 92, 130, 740, 0.26, 0.28 * v, 0, true);
        subDrop(105, 25, heavy ? 0.34 : 0.2, 0.48 * v);
        noise(0.22, 0.32 * v, 1900, 0, "bandpass", 240, 2.5, true);
        break;
    }
  },

  ultimateCharge: (element: HeroElement) => {
    track(`ultimateCharge:${element}`);
    const root = ELEMENT_ROOT[element];
    subDrop(160, 30, 0.48, 0.58);
    tone(root * 0.5, root * 1.5, 0.44, { wave: "sawtooth", vol: 0.26, attack: 0.08, drive: true, wet: true });
    tone(root, root * 2.0, 0.42, { wave: "triangle", vol: 0.2, attack: 0.1, detuneCents: 12, wet: true });
    fmTone(root * 2, root * 3, root * 0.75, 420, 0.38, 0.18, 0.06, true);
    noise(0.45, 0.38, 600, 0.02, "bandpass", 4200, 1.5, true);
  },

  ultimateFinisher: (element: HeroElement) => {
    track(`ultimateFinisher:${element}`);
    const root = ELEMENT_ROOT[element];
    subDrop(175, 24, 0.58, 0.68);
    noise(0.55, 0.62, 3200, 0, "lowpass", 90, 1.0, true);
    tone(root, root * 0.5, 0.42, { wave: "sawtooth", vol: 0.3, drive: true, wet: true });
    tone(root * 1.5, root * 2.0, 0.36, { wave: "triangle", vol: 0.22, wet: true, delay: 0.03 });
    fmTone(root * 2, root * 0.75, root * 0.5, 860, 0.38, 0.26, 0.02, true);
  },

  meteorWhoosh: () => {
    track("meteorWhoosh");
    noise(0.32, 0.32, 2400, 0, "bandpass", 360, 2.0, true);
    tone(780, 190, 0.3, { wave: "sine", vol: 0.16, wet: true });
  },
};
