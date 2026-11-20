import manifestJson from "../config/sprites.json";

export type SpriteEntry = { file: string; w?: number; h?: number; ax?: number };
export const MANIFEST = manifestJson as Record<string, SpriteEntry>;

export const spriteUrl = (key: string) => `/assets/game/${MANIFEST[key].file}`;

export type HeroPose =
  | "idle"
  | "idle_1"
  | "idle_2"
  | "idle_3"
  | "idle_4"
  | "walk_1"
  | "walk_2"
  | "walk_3"
  | "walk_4"
  | "walk_5"
  | "walk_6"
  | "walk_7"
  | "walk_8"
  | "walk_9"
  | "walk_10"
  | "walk_11"
  | "walk_12"
  | "jump"
  | "jump_rise"
  | "jump_apex"
  | "jump_fall"
  | "attack_slash"
  | "attack_slash_1"
  | "attack_slash_2"
  | "attack_slash_3"
  | "attack_blast"
  | "dash"
  | "dash_1"
  | "dash_2"
  | "hit_reaction";

export const heroKey = (heroId: string, pose: HeroPose) => `${heroId}_${pose}`;

/** Horizontal foot anchor (0..1) so poses of different widths stand on the same spot. */
export const anchorX = (key: string) => MANIFEST[key]?.ax ?? 0.5;

/** All gameplay pose sprites are oriented facing right (+1). */
export const artFacesLeft = (_key: string) => false;

export const textureHeight = (key: string) => MANIFEST[key]?.h ?? 100;
