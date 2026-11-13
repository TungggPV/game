import Phaser from "phaser";
import type { Difficulty } from "../config/constants";
import { ACHIEVEMENTS, HERO_MAX_LEVEL, WORKSHOP, workshopCost, xpToNext, type AchievementDef, type StatKey, type WorkshopId } from "../config/meta";

const KEY = "element-armor.profile.v1";

export type Settings = {
  volume: number;
  music: boolean;
  shake: boolean;
  damageNumbers: boolean;
  difficulty: Difficulty;
};

export type Profile = {
  version: 1;
  credits: number;
  heroes: Record<string, { level: number; xp: number; wins: number }>;
  workshop: Record<WorkshopId, number>;
  /** Best star count per campaign stage index. */
  stages: Record<number, number>;
  achievements: Record<string, number>;
  stats: Record<StatKey, number> & { highScore: number; bossRushBestMs: number };
  settings: Settings;
  lastHeroes: string[];
};

const emptyStats = (): Profile["stats"] => ({
  kills: 0, eliteKills: 0, bossKills: 0, runs: 0, wins: 0, deaths: 0, maxCombo: 0, damageDealt: 0, creditsEarned: 0,
  perfectDodges: 0, ultimates: 0, pickups: 0, cratesBroken: 0, endlessBestWave: 0, pkWins: 0, workshopBought: 0, playSeconds: 0,
  highScore: 0, bossRushBestMs: 0,
});

const fresh = (): Profile => ({
  version: 1,
  credits: 0,
  heroes: {},
  workshop: Object.fromEntries(WORKSHOP.map((w) => [w.id, 0])) as Record<WorkshopId, number>,
  stages: {},
  achievements: {},
  stats: emptyStats(),
  settings: { volume: 0.8, music: true, shake: true, damageNumbers: true, difficulty: "normal" },
  lastHeroes: ["nova_blade", "crimson_flare"],
});

let cached: Profile | null = null;

/** Emits "achievement" (def), "credits" (amount), "levelup" (heroId, level). */
export const metaEvents = new Phaser.Events.EventEmitter();

export const profile = (): Profile => {
  if (cached) return cached;
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      cached = {
        ...base,
        ...p,
        workshop: { ...base.workshop, ...p.workshop },
        stats: { ...base.stats, ...p.stats },
        settings: { ...base.settings, ...p.settings },
        heroes: p.heroes ?? {},
        stages: p.stages ?? {},
        achievements: p.achievements ?? {},
      };
      return cached;
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  cached = base;
  return cached;
};

export const saveProfile = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile()));
  } catch {
    /* storage unavailable (private mode) */
  }
};

export const resetProfile = () => {
  cached = fresh();
  saveProfile();
};

// ---------- credits ----------

export const addCredits = (amount: number) => {
  const p = profile();
  const n = Math.max(0, Math.round(amount));
  p.credits += n;
  p.stats.creditsEarned += n;
  metaEvents.emit("credits", n);
  checkStat("creditsEarned");
  saveProfile();
};

// ---------- workshop ----------

export const workshopLevel = (id: WorkshopId) => profile().workshop[id] ?? 0;

export const nextWorkshopCost = (id: WorkshopId) => {
  const def = WORKSHOP.find((w) => w.id === id)!;
  const lvl = workshopLevel(id);
  return lvl >= def.max ? null : workshopCost(def, lvl);
};

export const buyWorkshop = (id: WorkshopId): boolean => {
  const cost = nextWorkshopCost(id);
  const p = profile();
  if (cost === null || p.credits < cost) return false;
  p.credits -= cost;
  p.workshop[id] += 1;
  bumpStat("workshopBought", 1);
  saveProfile();
  return true;
};

// ---------- heroes ----------

export const heroProgress = (id: string) => {
  const p = profile();
  p.heroes[id] ??= { level: 1, xp: 0, wins: 0 };
  return p.heroes[id];
};

/** Adds XP and returns the number of levels gained. */
export const addHeroXp = (id: string, xp: number) => {
  const h = heroProgress(id);
  let gained = 0;
  h.xp += Math.round(xp);
  while (h.level < HERO_MAX_LEVEL && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level += 1;
    gained += 1;
    metaEvents.emit("levelup", id, h.level);
  }
  if (h.level >= HERO_MAX_LEVEL) h.xp = 0;
  if (h.level >= 10) unlockAchievement("level_10");
  saveProfile();
  return gained;
};

// ---------- stages ----------

export const stageStars = (index: number) => profile().stages[index] ?? 0;

export const recordStage = (index: number, stars: number) => {
  const p = profile();
  p.stages[index] = Math.max(p.stages[index] ?? 0, stars);
  saveProfile();
};

/** Stage 0 is always open; others open once the previous stage has at least one star. */
export const stageUnlocked = (index: number) => index === 0 || stageStars(index - 1) > 0;

// ---------- stats & achievements ----------

export const achievementUnlocked = (id: string) => !!profile().achievements[id];

export const unlockAchievement = (id: string): AchievementDef | null => {
  const p = profile();
  if (p.achievements[id]) return null;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  p.achievements[id] = Date.now();
  p.credits += def.reward;
  p.stats.creditsEarned += def.reward;
  saveProfile();
  metaEvents.emit("achievement", def);
  return def;
};

const checkStat = (stat: StatKey) => {
  const value = profile().stats[stat];
  for (const a of ACHIEVEMENTS) if (a.stat === stat && a.goal !== undefined && value >= a.goal) unlockAchievement(a.id);
};

export const bumpStat = (stat: StatKey, by: number) => {
  profile().stats[stat] += by;
  checkStat(stat);
};

export const maxStat = (stat: StatKey, value: number) => {
  const s = profile().stats;
  if (value > s[stat]) {
    s[stat] = value;
    checkStat(stat);
  }
};

export const settings = () => profile().settings;
