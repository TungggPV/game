// Expressive neural character & announcer voice playback system with studio FX & priority queueing.
import { loadSettings, saveSettings } from "./settings";

export type AnnouncerKind = "fight" | "break" | "parry" | "reaction" | "boss" | "victory" | "defeat";

type VoiceCategory = "kiai" | "skill" | "select" | "ultimate" | "announcer";

const PRIORITY: Record<VoiceCategory, number> = {
  kiai: 0,
  skill: 1,
  select: 2,
  ultimate: 3,
  announcer: 3,
};

const HERO_IDS = [
  "nova_blade",
  "crimson_flare",
  "volt_sentinel",
  "emerald_phantom",
  "obsidian_warden",
  "cryo_archon",
  "void_reaper",
] as const;

const VOICE_KEYS: string[] = [
  ...HERO_IDS.map((id) => `select_${id}`),
  ...HERO_IDS.map((id) => `ult_${id}`),
  ...HERO_IDS.map((id) => `skill_${id}`),
  "kiai_1",
  "kiai_2",
  "kiai_3",
  "ann_fight",
  "ann_break",
  "ann_parry",
  "ann_reaction",
  "ann_boss",
  "ann_victory",
  "ann_defeat",
];

type VoiceDebugState = {
  playCount: number;
  lastKey: string;
  lastDurationMs: number;
  loadedCount: number;
  enabled: boolean;
  history: string[];
};

const debugState: VoiceDebugState = {
  playCount: 0,
  lastKey: "",
  lastDurationMs: 0,
  loadedCount: 0,
  enabled: true,
  history: [],
};

const publishDebug = () => {
  if (typeof window !== "undefined") {
    (window as unknown as { __voiceDebug?: VoiceDebugState }).__voiceDebug = {
      ...debugState,
      history: [...debugState.history],
    };
  }
};

const buildArenaReverbIR = (ac: AudioContext, seconds = 0.24): AudioBuffer => {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.0);
    }
  }
  return ir;
};

/** Strip MP3 encoder leading/trailing silence so combat voice lines fire with zero dead-air delay. */
const trimAudioBuffer = (ac: AudioContext, buf: AudioBuffer): AudioBuffer => {
  const sr = buf.sampleRate;
  const ch0 = buf.getChannelData(0);
  const len = ch0.length;
  let first = -1;
  let last = -1;
  for (let i = 0; i < len; i += 1) {
    if (Math.abs(ch0[i]) > 0.012) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0 || last <= first) return buf;

  const start = Math.max(0, first - Math.floor(0.012 * sr));
  const end = Math.min(len, last + Math.floor(0.025 * sr));
  const outLen = Math.max(1, end - start);
  if (outLen >= len - Math.floor(0.02 * sr)) return buf;

  const out = ac.createBuffer(buf.numberOfChannels, outLen, sr);
  const fadeSamples = Math.min(Math.floor(0.008 * sr), Math.floor(outLen / 4));
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(start, end));
    for (let i = 0; i < fadeSamples; i += 1) {
      const k = i / fadeSamples;
      dst[i] *= k;
      dst[outLen - 1 - i] *= k;
    }
  }
  return out;
};

class VoiceSystem {
  private ctx: AudioContext | null = null;
  private presenceEQ: BiquadFilterNode | null = null;
  private reverbSend: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private preloaded = false;

  private activeSources: AudioBufferSourceNode[] = [];
  private currentGain: GainNode | null = null;
  private currentPriority = -1;
  private currentEndsAt = 0;

  private lastCategoryAt: Record<VoiceCategory, number> = {
    kiai: 0,
    skill: 0,
    select: 0,
    ultimate: 0,
    announcer: 0,
  };
  private lastAnnKindAt: Partial<Record<AnnouncerKind, number>> = {};

  private enabled: boolean;
  private volume: number;

  constructor() {
    const s = loadSettings();
    this.enabled = s.voiceEnabled ?? true;
    this.volume = Math.max(0, Math.min(1, s.voiceVolume ?? 0.9));
    debugState.enabled = this.enabled;
    publishDebug();
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();

      // Presence EQ (+3.5 dB at 2.8 kHz) so voice cuts cleanly through dense combat BGM/SFX
      this.presenceEQ = this.ctx.createBiquadFilter();
      this.presenceEQ.type = "peaking";
      this.presenceEQ.frequency.setValueAtTime(2800, this.ctx.currentTime);
      this.presenceEQ.Q.setValueAtTime(1.0, this.ctx.currentTime);
      this.presenceEQ.gain.setValueAtTime(3.5, this.ctx.currentTime);

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.004, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0.24;
      const rev = this.ctx.createConvolver();
      rev.buffer = buildArenaReverbIR(this.ctx, 0.24);
      this.reverbSend.connect(rev).connect(this.compressor);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.92 * this.volume;

      this.presenceEQ.connect(this.compressor).connect(this.masterGain).connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    const ac = this.ensureContext();
    if (ac && !this.preloaded) {
      this.preloadAll();
    }
    return ac;
  }

  preloadAll() {
    if (this.preloaded) return;
    this.preloaded = true;
    for (const key of VOICE_KEYS) {
      void this.loadBuffer(key);
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    debugState.enabled = on;
    saveSettings({ voiceEnabled: on });
    if (!on) this.stopCurrent();
    publishDebug();
  }

  toggleEnabled() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    saveSettings({ voiceVolume: this.volume });
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.92 * this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private async loadBuffer(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return cached;

    const pending = this.loading.get(key);
    if (pending) return pending;

    const p = (async () => {
      try {
        const ac = this.ensureContext();
        if (!ac) return null;
        const resp = await fetch(`./assets/audio/voice/${key}.mp3`);
        if (!resp.ok) return null;
        const arr = await resp.arrayBuffer();
        const raw = await ac.decodeAudioData(arr);
        const decoded = trimAudioBuffer(ac, raw);
        this.buffers.set(key, decoded);
        debugState.loadedCount = this.buffers.size;
        publishDebug();
        return decoded;
      } catch {
        return null;
      } finally {
        this.loading.delete(key);
      }
    })();

    this.loading.set(key, p);
    return p;
  }

  private stopCurrent() {
    const ac = this.ctx;
    if (this.currentGain && ac) {
      try {
        const now = ac.currentTime;
        this.currentGain.gain.cancelScheduledValues(now);
        this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
        this.currentGain.gain.linearRampToValueAtTime(0.0001, now + 0.02);
      } catch {
        // ignore audio node state edge cases
      }
    }
    if (ac) {
      for (const s of this.activeSources) {
        try {
          s.stop(ac.currentTime + 0.025);
        } catch {
          // already stopped
        }
      }
    }
    this.activeSources = [];
    this.currentGain = null;
    this.currentEndsAt = 0;
  }

  private fallbackFormantPulse(category: VoiceCategory) {
    const ac = this.ensureContext();
    if (!ac || !this.compressor) return;
    const now = ac.currentTime;
    const baseFreq = category === "ultimate" ? 190 : category === "announcer" ? 150 : 210;
    const dur = category === "kiai" ? 0.14 : 0.24;

    const osc = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * (category === "ultimate" ? 1.4 : 0.85), now + dur);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(850, now);
    filter.Q.setValueAtTime(3.2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter).connect(gain).connect(this.compressor);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  private playKey(key: string, category: VoiceCategory, gainScale = 1, cooldownMs = 0) {
    const s = loadSettings();
    if (!this.enabled || s.muted || this.volume <= 0.01) return;

    const nowMs = performance.now();
    if (cooldownMs > 0 && nowMs - this.lastCategoryAt[category] < cooldownMs) return;

    const prio = PRIORITY[category];
    if (nowMs < this.currentEndsAt && prio < this.currentPriority) return;

    this.lastCategoryAt[category] = nowMs;
    debugState.playCount += 1;
    debugState.lastKey = key;
    debugState.history.push(key);
    if (debugState.history.length > 256) debugState.history.shift();
    publishDebug();

    const ac = this.unlock();
    if (!ac || !this.presenceEQ) return;

    const buf = this.buffers.get(key);
    if (buf) {
      this.startBuffer(key, buf, category, prio, gainScale);
    } else {
      void this.loadBuffer(key).then((loaded) => {
        if (!loaded || !this.enabled || loadSettings().muted) return;
        const t = performance.now();
        if (t < this.currentEndsAt && prio < this.currentPriority) return;
        this.startBuffer(key, loaded, category, prio, gainScale);
      });
      if (category === "kiai" || category === "ultimate") {
        this.fallbackFormantPulse(category);
      }
    }
  }

  private startBuffer(key: string, buf: AudioBuffer, category: VoiceCategory, prio: number, gainScale: number) {
    const ac = this.ensureContext();
    if (!ac || !this.presenceEQ) return;

    this.stopCurrent();

    const g = ac.createGain();
    g.gain.setValueAtTime(Math.max(0.1, Math.min(1.5, gainScale)), ac.currentTime);

    // Optional character tone shaping (warm bass chest for Obsidian Warden & Announcer)
    if (key.includes("obsidian_warden") || key.startsWith("ann_")) {
      const lowShelf = ac.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.setValueAtTime(180, ac.currentTime);
      lowShelf.gain.setValueAtTime(4.0, ac.currentTime);
      g.connect(lowShelf).connect(this.presenceEQ);
    } else {
      g.connect(this.presenceEQ);
    }

    // Epic combat arena reverb send (stronger for Ultimate & Announcer shouts)
    if (this.reverbSend) {
      const wet = ac.createGain();
      wet.gain.setValueAtTime(category === "ultimate" || category === "announcer" ? 0.34 : 0.18, ac.currentTime);
      g.connect(wet).connect(this.reverbSend);
    }

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start(ac.currentTime);

    const sources: AudioBufferSourceNode[] = [src];

    // Void Reaper ghostly lower-octave shadow whisper layer (32ms delayed)
    if (key.includes("void_reaper")) {
      const shadow = ac.createBufferSource();
      shadow.buffer = buf;
      shadow.playbackRate.setValueAtTime(0.84, ac.currentTime);
      const sg = ac.createGain();
      sg.gain.setValueAtTime(0.35, ac.currentTime);
      shadow.connect(sg).connect(g);
      shadow.start(ac.currentTime + 0.032);
      sources.push(shadow);
    }

    this.activeSources = sources;
    this.currentGain = g;
    this.currentPriority = prio;
    this.currentEndsAt = performance.now() + buf.duration * 1000;
    debugState.lastDurationMs = Math.round(buf.duration * 1000);
    publishDebug();

    src.onended = () => {
      if (this.activeSources[0] === src) {
        this.activeSources = [];
        this.currentGain = null;
        this.currentEndsAt = 0;
        this.currentPriority = -1;
      }
    };
  }

  playSelect(heroId: string) {
    this.playKey(`select_${heroId}`, "select", 0.96, 120);
  }

  playSkill(heroId: string) {
    this.playKey(`skill_${heroId}`, "skill", 0.94, 1300);
  }

  playUltimate(heroId: string) {
    this.playKey(`ult_${heroId}`, "ultimate", 1.15, 500);
  }

  playKiai(step = 1) {
    const idx = step === 3 ? 3 : ((Math.floor(Math.random() * 2) % 2) + 1);
    this.playKey(`kiai_${idx}`, "kiai", 0.82, 950);
  }

  playAnnouncer(kind: AnnouncerKind) {
    const now = performance.now();
    const kindCooldown = kind === "reaction" ? 2600 : kind === "parry" || kind === "break" ? 1200 : 300;
    const prev = this.lastAnnKindAt[kind] ?? 0;
    if (now - prev < kindCooldown) return;
    this.lastAnnKindAt[kind] = now;
    const gainScale = kind === "boss" || kind === "victory" ? 1.15 : 1.02;
    this.playKey(`ann_${kind}`, "announcer", gainScale, 120);
  }
}

export const voice = new VoiceSystem();
