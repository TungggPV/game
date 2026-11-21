// Pre-rendered Vietnamese character & announcer voice playback system with priority queueing.
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
  loadedCount: number;
  enabled: boolean;
  history: string[];
};

const debugState: VoiceDebugState = {
  playCount: 0,
  lastKey: "",
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

class VoiceSystem {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private preloaded = false;

  private currentSource: AudioBufferSourceNode | null = null;
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
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.004, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85 * this.volume;

      this.compressor.connect(this.masterGain).connect(this.ctx.destination);
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
      this.masterGain.gain.setTargetAtTime(0.85 * this.volume, this.ctx.currentTime, 0.02);
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
        const resp = await fetch(`./assets/audio/voice/${key}.wav`);
        if (!resp.ok) return null;
        const arr = await resp.arrayBuffer();
        const decoded = await ac.decodeAudioData(arr);
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
    if (this.currentSource && ac) {
      try {
        this.currentSource.stop(ac.currentTime + 0.025);
      } catch {
        // already stopped
      }
    }
    this.currentSource = null;
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
    if (!ac || !this.compressor) return;

    const buf = this.buffers.get(key);
    if (buf) {
      this.startBuffer(buf, prio, gainScale);
    } else {
      // Load async for immediate playback (or next call) without dropping the initial trigger.
      void this.loadBuffer(key).then((loaded) => {
        if (!loaded || !this.enabled || loadSettings().muted) return;
        const t = performance.now();
        if (t < this.currentEndsAt && prio < this.currentPriority) return;
        this.startBuffer(loaded, prio, gainScale);
      });
      if (category === "kiai" || category === "ultimate") {
        this.fallbackFormantPulse(category);
      }
    }
  }

  private startBuffer(buf: AudioBuffer, prio: number, gainScale: number) {
    const ac = this.ensureContext();
    if (!ac || !this.compressor) return;

    this.stopCurrent();

    const src = ac.createBufferSource();
    src.buffer = buf;

    const g = ac.createGain();
    g.gain.setValueAtTime(Math.max(0.1, Math.min(1.5, gainScale)), ac.currentTime);

    src.connect(g).connect(this.compressor);
    src.start(ac.currentTime);

    this.currentSource = src;
    this.currentGain = g;
    this.currentPriority = prio;
    this.currentEndsAt = performance.now() + buf.duration * 1000;

    src.onended = () => {
      if (this.currentSource === src) {
        this.currentSource = null;
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
    this.playKey(`skill_${heroId}`, "skill", 0.92, 1300);
  }

  playUltimate(heroId: string) {
    this.playKey(`ult_${heroId}`, "ultimate", 1.12, 500);
  }

  playKiai(step = 1) {
    const idx = step === 3 ? 3 : ((Math.floor(Math.random() * 2) % 2) + 1);
    this.playKey(`kiai_${idx}`, "kiai", 0.78, 950);
  }

  playAnnouncer(kind: AnnouncerKind) {
    const now = performance.now();
    const kindCooldown = kind === "reaction" ? 2600 : kind === "parry" || kind === "break" ? 1200 : 300;
    const prev = this.lastAnnKindAt[kind] ?? 0;
    if (now - prev < kindCooldown) return;
    this.lastAnnKindAt[kind] = now;
    const gainScale = kind === "boss" || kind === "victory" ? 1.12 : 1.0;
    this.playKey(`ann_${kind}`, "announcer", gainScale, 120);
  }
}

export const voice = new VoiceSystem();
