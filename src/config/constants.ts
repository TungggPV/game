export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GROUND_Y = 618;
export const GRAVITY = 2600;
export const ARENA_WIDTH = GAME_WIDTH;
export const FONT = '"Be Vietnam Pro", "Segoe UI", Roboto, Arial, sans-serif';

export type GameMode = "campaign" | "endless" | "bossrush" | "pk" | "training";
export type Difficulty = "easy" | "normal" | "hard";
export type Team = "hero" | "enemy";
export type SkillSlot = "basic" | "skill1" | "skill2" | "ultimate";

/** Payload for `scene.start("game", data)`. Player count is `heroes.length` (PK always 2). */
export type GameData = {
  mode: GameMode;
  heroes: string[];
  difficulty: Difficulty;
  /** Campaign stage index (0-based). */
  stage?: number;
};

export const DEPTH = {
  bg: -100,
  floor: -10,
  shadow: 5,
  prop: 12,
  enemy: 20,
  hero: 30,
  projectile: 40,
  fx: 50,
  text: 60,
};

export const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
