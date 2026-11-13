import manifestJson from "../config/sprites.json";

export type SpriteEntry = { file: string; w?: number; h?: number; ax?: number };
export const MANIFEST = manifestJson as Record<string, SpriteEntry>;

export const spriteUrl = (key: string) => `/assets/game/${MANIFEST[key].file}`;

export type HeroPose = "idle" | "walk_1" | "walk_2" | "walk_3" | "walk_4" | "jump" | "attack_slash" | "attack_blast" | "dash" | "hit_reaction";

export const heroKey = (heroId: string, pose: HeroPose) => `${heroId}_${pose}`;

/** Horizontal foot anchor (0..1) so poses of different widths stand on the same spot. */
export const anchorX = (key: string) => MANIFEST[key]?.ax ?? 0.5;

/** The source sheets draw the slash pose swinging to the left; every other pose faces right. */
export const artFacesLeft = (key: string) => key.endsWith("_attack_slash");

export const textureHeight = (key: string) => MANIFEST[key]?.h ?? 100;
