export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const WORLD_WIDTH = 3600;
export const GRAVITY = 2300;
export const PLATFORM_Y = Math.round(GAME_HEIGHT * 0.812);
export const PLAYER_START_X = 188;

export const DEPTHS = {
  background: -50,
  platformBack: 5,
  shadow: 34,
  enemy: 48,
  player: 56,
  effect: 74,
  projectile: 78,
  hud: 1000,
};

export type Direction = -1 | 1;

export type PlayerInput = {
  left: boolean;
  right: boolean;
  jump: boolean;
  slash: boolean;
  blast: boolean;
  dash: boolean;
};

export type GameOverPayload = {
  title: string;
  detail: string;
  score: number;
  heroId: string;
};
