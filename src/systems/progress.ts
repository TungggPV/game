import { loadBest } from "../config/constants";

export type EndlessScore = {
  score: number;
  wave: number;
  hero: string;
  date: string;
};

export type Progress = {
  v: 1;
  coins: number;
  bestScore: number;
  unlocks: string[];
  upgrades: Record<string, number>;
  codex: string[];
  achievements: string[];
  endlessLeaderboard: EndlessScore[];
  dailyRecord: { date: string; score: number };
};

const KEY = "element-armor.progress.v1";

const ALL_HERO_UNLOCKS = [
  "nova_blade",
  "crimson_flare",
  "volt_sentinel",
  "emerald_phantom",
  "obsidian_warden",
  "cryo_archon",
  "void_reaper",
];

const DEFAULT_PROGRESS: Progress = {
  v: 1,
  coins: 0,
  bestScore: 0,
  unlocks: [...ALL_HERO_UNLOCKS],
  upgrades: {
    hp: 0,
    energy: 0,
    cooldown: 0,
    damage: 0,
  },
  codex: [],
  achievements: [],
  endlessLeaderboard: [],
  dailyRecord: { date: "", score: 0 },
};

let cachedProgress: Progress | null = null;

export const loadProgress = (): Progress => {
  if (cachedProgress) return { ...cachedProgress };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const mergedUnlocks = Array.from(new Set([...(Array.isArray(parsed.unlocks) ? parsed.unlocks : []), ...ALL_HERO_UNLOCKS]));
        const loaded: Progress = {
          ...DEFAULT_PROGRESS,
          ...parsed,
          v: 1,
          unlocks: mergedUnlocks,
          upgrades: { ...DEFAULT_PROGRESS.upgrades, ...(parsed.upgrades || {}) },
          codex: Array.isArray(parsed.codex) ? parsed.codex : [],
          achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
          endlessLeaderboard: Array.isArray(parsed.endlessLeaderboard) ? parsed.endlessLeaderboard : [],
          dailyRecord: parsed.dailyRecord && typeof parsed.dailyRecord === "object" ? parsed.dailyRecord : { date: "", score: 0 },
        };
        // sync with old bestScore if available
        const oldBest = loadBest();
        if (oldBest > loaded.bestScore) {
          loaded.bestScore = oldBest;
        }
        cachedProgress = loaded;
        return { ...cachedProgress };
      }
    }
  } catch {
    // fallback
  }

  // First time migration from element-armor.best
  const oldBest = loadBest();
  cachedProgress = {
    ...DEFAULT_PROGRESS,
    bestScore: oldBest,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(cachedProgress));
  } catch {}
  return { ...cachedProgress };
};

export const saveProgress = (patch: Partial<Progress>): Progress => {
  const cur = loadProgress();
  const next: Progress = {
    ...cur,
    ...patch,
    v: 1,
  };
  cachedProgress = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return { ...next };
};

export const addCoins = (amount: number): number => {
  const cur = loadProgress();
  const nextCoins = Math.max(0, cur.coins + amount);
  saveProgress({ coins: nextCoins });
  return nextCoins;
};

export const unlockEntry = (listKey: "unlocks" | "codex" | "achievements", id: string): boolean => {
  const cur = loadProgress();
  const set = new Set(cur[listKey]);
  if (!set.has(id)) {
    set.add(id);
    saveProgress({ [listKey]: Array.from(set) });
    return true; // newly unlocked
  }
  return false;
};

export const saveEndlessScore = (entry: EndlessScore): EndlessScore[] => {
  const cur = loadProgress();
  const list = [...cur.endlessLeaderboard, entry];
  list.sort((a, b) => b.score - a.score || b.wave - a.wave);
  const top10 = list.slice(0, 10);
  saveProgress({ endlessLeaderboard: top10 });
  return top10;
};

export const getEndlessLeaderboard = (): EndlessScore[] => {
  return loadProgress().endlessLeaderboard;
};

export const getDailyRecord = (dateStr: string): number => {
  const cur = loadProgress();
  if (cur.dailyRecord && cur.dailyRecord.date === dateStr) {
    return cur.dailyRecord.score;
  }
  return 0;
};

export const saveDailyRecord = (dateStr: string, score: number) => {
  const cur = loadProgress();
  const currentBest = cur.dailyRecord?.date === dateStr ? cur.dailyRecord.score : 0;
  if (score > currentBest) {
    saveProgress({ dailyRecord: { date: dateStr, score } });
  }
};
