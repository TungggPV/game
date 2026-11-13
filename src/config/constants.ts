export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GROUND_Y = 618;
export const GRAVITY = 2600;
export const ARENA_WIDTH = GAME_WIDTH;
export const FONT = '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif';

export type GameMode = "solo" | "coop" | "pk";
export type Team = "hero" | "enemy";
export type SkillSlot = "basic" | "skill1" | "skill2" | "ultimate";

export const DEPTH = {
  bg: -100,
  floor: -10,
  shadow: 5,
  enemy: 20,
  hero: 30,
  projectile: 40,
  fx: 50,
  text: 60,
};

export const STORAGE_KEY = "element-armor.best";

export const loadBest = (): number => {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
};

export const saveBest = (score: number) => {
  try {
    if (score > loadBest()) localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    /* storage unavailable (private mode) */
  }
};

export const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
