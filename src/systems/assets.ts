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
  | "idle_5"
  | "idle_6"
  | "idle_7"
  | "idle_8"
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
  | "walk_13"
  | "walk_14"
  | "walk_15"
  | "walk_16"
  | "jump"
  | "jump_1"
  | "jump_2"
  | "jump_3"
  | "jump_4"
  | "jump_5"
  | "jump_6"
  | "jump_rise"
  | "jump_apex"
  | "jump_fall"
  | "attack_slash"
  | "attack_slash_1"
  | "attack_slash_2"
  | "attack_slash_3"
  | "attack_c1_1"
  | "attack_c1_2"
  | "attack_c1_3"
  | "attack_c1_4"
  | "attack_c2_1"
  | "attack_c2_2"
  | "attack_c2_3"
  | "attack_c2_4"
  | "attack_c3_1"
  | "attack_c3_2"
  | "attack_c3_3"
  | "attack_c3_4"
  | "attack_blast"
  | "attack_blast_1"
  | "attack_blast_2"
  | "attack_blast_3"
  | "attack_blast_4"
  | "attack_blast_5"
  | "attack_blast_6"
  | "attack_blast_7"
  | "attack_blast_8"
  | "cast_ult_1"
  | "cast_ult_2"
  | "cast_ult_3"
  | "cast_ult_4"
  | "cast_ult_5"
  | "cast_ult_6"
  | "cast_ult_7"
  | "cast_ult_8"
  | "dash"
  | "dash_1"
  | "dash_2"
  | "dash_3"
  | "dash_4"
  | "dash_5"
  | "dash_6"
  | "hit_reaction"
  | "hit_reaction_1"
  | "hit_reaction_2"
  | "hit_reaction_3"
  | "hit_reaction_4";

export const heroKey = (heroId: string, pose: HeroPose) => `${heroId}_${pose}`;

/** Horizontal foot anchor (0..1) so poses of different widths stand on the same spot. */
export const anchorX = (key: string) => MANIFEST[key]?.ax ?? 0.5;

/** All gameplay pose sprites are oriented facing right (+1). */
export const artFacesLeft = (_key: string) => false;

export const textureHeight = (key: string) => MANIFEST[key]?.h ?? 100;
