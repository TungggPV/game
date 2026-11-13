// Tiny WebAudio synth so the game has punchy feedback without shipping audio files.
type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
let volume = 0.8;
let musicBus: GainNode | null = null;

const audio = () => {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.4 * volume;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.22;
    musicBus.connect(master);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

const tone = (freq: number, to: number, dur: number, wave: Wave = "square", vol = 0.4, delay = 0) => {
  const ac = audio();
  if (!ac || !master || muted) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

const noise = (dur: number, vol = 0.4, cutoff = 2000, delay = 0) => {
  const ac = audio();
  if (!ac || !master || !noiseBuffer || muted) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
};

export const sfx = {
  unlock: () => audio(),
  toggleMute: () => (muted = !muted),
  /** 0..1, persisted by the settings screen. */
  setVolume: (v: number) => {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = 0.4 * volume;
  },
  getVolume: () => volume,
  levelUp: () => [523, 784, 1046, 1568].forEach((f, i) => tone(f, f, 0.12, "triangle", 0.16, i * 0.07)),
  coin: () => tone(1568, 2093, 0.08, "square", 0.08),
  perfect: () => { tone(1200, 2400, 0.25, "sine", 0.18); tone(600, 1200, 0.25, "triangle", 0.12, 0.05); },
  powerUp: () => [440, 660, 880, 1320].forEach((f, i) => tone(f, f * 1.02, 0.1, "sawtooth", 0.1, i * 0.05)),
  achievement: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.16, "square", 0.12, i * 0.09)),
  isMuted: () => muted,
  swing: () => { noise(0.08, 0.25, 4000); tone(520, 260, 0.07, "triangle", 0.12); },
  hit: () => { noise(0.1, 0.45, 2600); tone(180, 60, 0.1, "square", 0.25); },
  crit: () => { noise(0.14, 0.5, 5000); tone(900, 200, 0.14, "sawtooth", 0.2); },
  shoot: () => tone(880, 220, 0.14, "sawtooth", 0.16),
  zap: () => { tone(1400, 300, 0.12, "square", 0.14); noise(0.1, 0.2, 6000); },
  boom: () => { noise(0.45, 0.7, 1200); tone(120, 30, 0.4, "sine", 0.5); },
  jump: () => tone(300, 620, 0.1, "triangle", 0.15),
  dash: () => noise(0.16, 0.3, 3200),
  pickup: () => { tone(880, 880, 0.06, "square", 0.12); tone(1320, 1320, 0.08, "square", 0.12, 0.06); },
  hurt: () => { tone(240, 80, 0.2, "sawtooth", 0.25); noise(0.12, 0.3, 1500); },
  enemyShot: () => tone(500, 180, 0.16, "square", 0.1),
  ultimate: () => { tone(110, 880, 0.6, "sawtooth", 0.22); noise(0.6, 0.35, 3000, 0.1); },
  select: () => tone(660, 990, 0.07, "square", 0.12),
  confirm: () => { tone(523, 523, 0.08, "square", 0.14); tone(784, 784, 0.12, "square", 0.14, 0.08); },
  warn: () => { tone(220, 220, 0.18, "square", 0.16); tone(220, 220, 0.18, "square", 0.16, 0.25); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, "square", 0.14, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.22, "triangle", 0.2, i * 0.16)),
};

// ---------- procedural background music ----------

type Track = { bpm: number; root: number; scale: number[]; bass: number[]; lead: number[] };

const TRACKS: Record<string, Track> = {
  menu: { bpm: 96, root: 110, scale: [0, 3, 5, 7, 10, 12, 15], bass: [0, -1, 0, -1, 3, -1, 2, -1], lead: [4, -1, 3, 2, -1, 4, 5, -1, 6, -1, 5, 4, 3, -1, 2, -1] },
  battle: { bpm: 138, root: 82.4, scale: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15], bass: [0, 0, 7, 0, 0, 5, 0, 3], lead: [7, -1, 9, 7, 5, -1, 4, -1, 5, 7, -1, 4, 3, -1, 2, -1] },
  boss: { bpm: 156, root: 73.4, scale: [0, 1, 3, 5, 6, 8, 10, 12, 13, 15], bass: [0, 0, 1, 0, 0, 6, 0, 5], lead: [7, 8, 7, -1, 5, -1, 4, 5, 7, -1, 9, 8, 7, -1, 6, -1] },
};

let musicTimer: number | null = null;
let currentTrack = "";

const note = (freq: number, at: number, dur: number, wave: Wave, vol: number) => {
  if (!ctx || !musicBus) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(musicBus);
  osc.start(at);
  osc.stop(at + dur + 0.02);
};

const semis = (root: number, step: number) => root * Math.pow(2, step / 12);

export const music = {
  play(name: keyof typeof TRACKS, enabled: boolean) {
    if (!enabled) {
      music.stop();
      return;
    }
    if (currentTrack === name && musicTimer !== null) return;
    music.stop();
    const ac = audio();
    if (!ac) return;
    currentTrack = name;
    const track = TRACKS[name];
    const stepDur = 60 / track.bpm / 2;
    let step = 0;
    let nextAt = ac.currentTime + 0.1;
    // Schedule a little ahead on a coarse timer; WebAudio keeps the timing tight.
    musicTimer = window.setInterval(() => {
      if (!ctx) return;
      while (nextAt < ctx.currentTime + 0.25) {
        if (!muted) {
          const b = track.bass[step % track.bass.length];
          if (b >= 0) note(semis(track.root, track.scale[b % track.scale.length]), nextAt, stepDur * 0.9, "triangle", 0.5);
          const l = track.lead[step % track.lead.length];
          if (l >= 0 && Math.floor(step / track.lead.length) % 2 === 1) note(semis(track.root * 4, track.scale[l % track.scale.length]), nextAt, stepDur * 0.8, "square", 0.08);
          if (step % 4 === 0) note(55, nextAt, 0.12, "sine", 0.6);
          if (step % 4 === 2 && name !== "menu") note(4000, nextAt, 0.03, "square", 0.03);
        }
        nextAt += stepDur;
        step += 1;
      }
    }, 60);
  },
  stop() {
    if (musicTimer !== null) window.clearInterval(musicTimer);
    musicTimer = null;
    currentTrack = "";
  },
};
