// Tiny WebAudio synth so the game has punchy feedback without shipping audio files.
type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;

const audio = () => {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
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
