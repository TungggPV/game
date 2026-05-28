import { assetPath } from "./assets";

export type HeroSpriteName =
  | "idle"
  | "walk1"
  | "walk2"
  | "walk3"
  | "walk4"
  | "jump"
  | "attackSlash"
  | "attackBlast"
  | "dash"
  | "hitReaction";

export type HeroSprites = Record<HeroSpriteName, string>;

export type HeroConfig = {
  id: string;
  displayName: string;
  assetRoot: string;
  portrait: string;
  dynamicArt: string;
  sprites: HeroSprites;
  themeColor: number;
  themeCss: string;
  targetHeight: number;
  speed: number;
  meleeDamage: number;
  blastDamage: number;
};

const heroSprites = (root: string): HeroSprites => ({
  idle: assetPath(`${root}/sprites/idle.png`),
  walk1: assetPath(`${root}/sprites/walk_1.png`),
  walk2: assetPath(`${root}/sprites/walk_2.png`),
  walk3: assetPath(`${root}/sprites/walk_3.png`),
  walk4: assetPath(`${root}/sprites/walk_4.png`),
  jump: assetPath(`${root}/sprites/jump.png`),
  attackSlash: assetPath(`${root}/sprites/attack_slash.png`),
  attackBlast: assetPath(`${root}/sprites/attack_blast.png`),
  dash: assetPath(`${root}/sprites/dash.png`),
  hitReaction: assetPath(`${root}/sprites/hit_reaction.png`),
});

// The new hero folders are currently in public/assets/<hero_id>/.
// Processed variants remove the white matte from the supplied PNGs for in-game sprites.
export const HEROES: HeroConfig[] = [
  {
    id: "nova_blade",
    displayName: "Nova Blade",
    assetRoot: "hero",
    portrait: assetPath("hero/portrait/hero_portrait.png"),
    dynamicArt: assetPath("processed/nova_blade/dynamic/action_clean.png"),
    sprites: heroSprites("hero"),
    themeColor: 0x18e6ff,
    themeCss: "#18e6ff",
    targetHeight: 178,
    speed: 1,
    meleeDamage: 26,
    blastDamage: 30,
  },
  {
    id: "crimson_flare",
    displayName: "Crimson Flare",
    assetRoot: "processed/crimson_flare",
    portrait: assetPath("processed/crimson_flare/portrait/portrait.png"),
    dynamicArt: assetPath("processed/crimson_flare/dynamic/action.png"),
    sprites: heroSprites("processed/crimson_flare"),
    themeColor: 0xff4e5f,
    themeCss: "#ff4e5f",
    targetHeight: 176,
    speed: 1.06,
    meleeDamage: 29,
    blastDamage: 26,
  },
  {
    id: "volt_sentinel",
    displayName: "Volt Sentinel",
    assetRoot: "processed/volt_sentinel",
    portrait: assetPath("processed/volt_sentinel/portrait/portrait.png"),
    dynamicArt: assetPath("processed/volt_sentinel/dynamic/action.png"),
    sprites: heroSprites("processed/volt_sentinel"),
    themeColor: 0x35f6ff,
    themeCss: "#35f6ff",
    targetHeight: 176,
    speed: 1.16,
    meleeDamage: 23,
    blastDamage: 34,
  },
  {
    id: "emerald_phantom",
    displayName: "Emerald Phantom",
    assetRoot: "processed/emerald_phantom",
    portrait: assetPath("processed/emerald_phantom/portrait/portrait.png"),
    dynamicArt: assetPath("processed/emerald_phantom/dynamic/action.png"),
    sprites: heroSprites("processed/emerald_phantom"),
    themeColor: 0x4ef3a5,
    themeCss: "#4ef3a5",
    targetHeight: 180,
    speed: 1.22,
    meleeDamage: 24,
    blastDamage: 28,
  },
];

export const DEFAULT_HERO_ID = HEROES[0].id;

export const getHeroById = (id: string) => HEROES.find((hero) => hero.id === id) ?? HEROES[0];

export const heroTextureKey = (hero: HeroConfig, sprite: HeroSpriteName) => `hero-${hero.id}-${sprite}`;

export const heroPortraitKey = (hero: HeroConfig) => `hero-${hero.id}-portrait`;

export const heroDynamicKey = (hero: HeroConfig) => `hero-${hero.id}-dynamic`;

export const allHeroAssets = () =>
  HEROES.flatMap((hero) => [
    { key: heroPortraitKey(hero), path: hero.portrait },
    { key: heroDynamicKey(hero), path: hero.dynamicArt },
    ...Object.entries(hero.sprites).map(([sprite, path]) => ({
      key: heroTextureKey(hero, sprite as HeroSpriteName),
      path,
    })),
  ]);
