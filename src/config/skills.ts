import { assetPath } from "./assets";

export type SkillInput = "skill1" | "skill2" | "ultimate";
export type SkillType = "melee" | "ranged" | "aoe" | "control" | "ultimate";
export type StatusType = "burn" | "poison" | "stun" | "slow";

export type BasicAttackConfig = {
  id: string;
  heroId: string;
  name: string;
  damage: number;
  range: number;
  cooldown: number;
  energyGainOnHit: number;
  effectColor: number;
  themeCss: string;
  icon: string;
  effectArt: string;
  knockback?: number;
};

export type SkillConfig = {
  id: string;
  heroId: string;
  name: string;
  input: SkillInput;
  type: SkillType;
  damage: number;
  range?: number;
  radius?: number;
  projectileSpeed?: number;
  cooldown: number;
  energyCost: number;
  effectColor: number;
  themeCss: string;
  icon: string;
  effectArt: string;
  status?: StatusType;
  statusChance?: number;
  statusDuration?: number;
  knockback?: number;
  explosionRadius?: number;
  chainRadius?: number;
  chainDamageMultiplier?: number;
  strikeCount?: number;
  hitCount?: number;
  duration?: number;
  tickRate?: number;
  slowMultiplier?: number;
  pullStrength?: number;
};

const skillAsset = (heroId: string, path: string) => assetPath(`skills/${heroId}/${path}`);

export const BASIC_ATTACKS: BasicAttackConfig[] = [
  {
    id: "basic_slash",
    heroId: "nova_blade",
    name: "Basic Slash",
    damage: 16,
    range: 120,
    cooldown: 0.25,
    energyGainOnHit: 3,
    effectColor: 0x18e6ff,
    themeCss: "#18e6ff",
    icon: skillAsset("nova_blade", "icons/j_basic_attack_icon.png"),
    effectArt: skillAsset("nova_blade", "cards/j_basic_attack_effect_art.png"),
    knockback: 24,
  },
  {
    id: "flame_strike",
    heroId: "crimson_flare",
    name: "Flame Strike",
    damage: 18,
    range: 125,
    cooldown: 0.3,
    energyGainOnHit: 3,
    effectColor: 0xff7a24,
    themeCss: "#ff7a24",
    icon: skillAsset("crimson_flare", "icons/j_basic_attack_icon.png"),
    effectArt: skillAsset("crimson_flare", "cards/j_basic_attack_effect_art.png"),
    knockback: 28,
  },
  {
    id: "quick_spark",
    heroId: "volt_sentinel",
    name: "Quick Spark",
    damage: 14,
    range: 115,
    cooldown: 0.2,
    energyGainOnHit: 3,
    effectColor: 0xffef72,
    themeCss: "#ffef72",
    icon: skillAsset("volt_sentinel", "icons/j_basic_attack_icon.png"),
    effectArt: skillAsset("volt_sentinel", "cards/j_basic_attack_effect_art.png"),
    knockback: 20,
  },
  {
    id: "phantom_strike",
    heroId: "emerald_phantom",
    name: "Phantom Strike",
    damage: 13,
    range: 110,
    cooldown: 0.18,
    energyGainOnHit: 3,
    effectColor: 0x4ef3a5,
    themeCss: "#4ef3a5",
    icon: skillAsset("emerald_phantom", "icons/j_basic_attack_icon.png"),
    effectArt: skillAsset("emerald_phantom", "cards/j_basic_attack_effect_art.png"),
    knockback: 18,
  },
];

export const SKILLS: SkillConfig[] = [
  {
    id: "plasma_shot",
    heroId: "nova_blade",
    name: "Plasma Shot",
    input: "skill1",
    type: "ranged",
    damage: 22,
    projectileSpeed: 900,
    cooldown: 0.55,
    energyCost: 12,
    effectColor: 0x35f6ff,
    themeCss: "#35f6ff",
    icon: skillAsset("nova_blade", "icons/k_skill1_icon.png"),
    effectArt: skillAsset("nova_blade", "cards/k_skill1_effect_art.png"),
    knockback: 16,
  },
  {
    id: "rising_blade",
    heroId: "nova_blade",
    name: "Rising Blade",
    input: "skill2",
    type: "aoe",
    damage: 38,
    range: 165,
    cooldown: 4,
    energyCost: 28,
    effectColor: 0x8cf8ff,
    themeCss: "#8cf8ff",
    icon: skillAsset("nova_blade", "icons/l_skill2_icon.png"),
    effectArt: skillAsset("nova_blade", "cards/l_skill2_effect_art.png"),
    knockback: 68,
  },
  {
    id: "nova_overdrive",
    heroId: "nova_blade",
    name: "Nova Overdrive",
    input: "ultimate",
    type: "ultimate",
    damage: 85,
    radius: 240,
    cooldown: 16,
    energyCost: 90,
    effectColor: 0x8cf8ff,
    themeCss: "#8cf8ff",
    icon: skillAsset("nova_blade", "icons/u_ultimate_icon.png"),
    effectArt: skillAsset("nova_blade", "cards/u_ultimate_effect_art.png"),
    knockback: 78,
  },
  {
    id: "fire_burst",
    heroId: "crimson_flare",
    name: "Fire Burst",
    input: "skill1",
    type: "ranged",
    damage: 30,
    radius: 80,
    projectileSpeed: 760,
    cooldown: 0.75,
    energyCost: 16,
    effectColor: 0xff8a2a,
    themeCss: "#ff8a2a",
    icon: skillAsset("crimson_flare", "icons/k_skill1_icon.png"),
    effectArt: skillAsset("crimson_flare", "cards/k_skill1_effect_art.png"),
    explosionRadius: 80,
    knockback: 24,
  },
  {
    id: "inferno_arc",
    heroId: "crimson_flare",
    name: "Inferno Arc",
    input: "skill2",
    type: "aoe",
    damage: 48,
    range: 210,
    cooldown: 5,
    energyCost: 34,
    effectColor: 0xff6828,
    themeCss: "#ff6828",
    icon: skillAsset("crimson_flare", "icons/l_skill2_icon.png"),
    effectArt: skillAsset("crimson_flare", "cards/l_skill2_effect_art.png"),
    status: "burn",
    statusChance: 0.3,
    knockback: 76,
  },
  {
    id: "crimson_meteor",
    heroId: "crimson_flare",
    name: "Crimson Meteor",
    input: "ultimate",
    type: "ultimate",
    damage: 115,
    radius: 280,
    cooldown: 20,
    energyCost: 110,
    effectColor: 0xff4e34,
    themeCss: "#ff4e34",
    icon: skillAsset("crimson_flare", "icons/u_ultimate_icon.png"),
    effectArt: skillAsset("crimson_flare", "cards/u_ultimate_effect_art.png"),
    status: "burn",
    statusChance: 1,
    knockback: 96,
  },
  {
    id: "thunder_bolt",
    heroId: "volt_sentinel",
    name: "Thunder Bolt",
    input: "skill1",
    type: "ranged",
    damage: 20,
    projectileSpeed: 1050,
    cooldown: 0.45,
    energyCost: 13,
    effectColor: 0xfff16d,
    themeCss: "#fff16d",
    icon: skillAsset("volt_sentinel", "icons/k_skill1_icon.png"),
    effectArt: skillAsset("volt_sentinel", "cards/k_skill1_effect_art.png"),
    chainRadius: 170,
    chainDamageMultiplier: 0.5,
    knockback: 16,
  },
  {
    id: "electric_cage",
    heroId: "volt_sentinel",
    name: "Electric Cage",
    input: "skill2",
    type: "control",
    damage: 8,
    radius: 170,
    cooldown: 5,
    energyCost: 32,
    effectColor: 0xffef72,
    themeCss: "#ffef72",
    icon: skillAsset("volt_sentinel", "icons/l_skill2_icon.png"),
    effectArt: skillAsset("volt_sentinel", "cards/l_skill2_effect_art.png"),
    status: "slow",
    statusChance: 1,
    statusDuration: 2,
    duration: 2.2,
    tickRate: 0.45,
    slowMultiplier: 0.6,
    knockback: 8,
  },
  {
    id: "storm_breaker",
    heroId: "volt_sentinel",
    name: "Storm Breaker",
    input: "ultimate",
    type: "ultimate",
    damage: 36,
    radius: 280,
    cooldown: 18,
    energyCost: 100,
    effectColor: 0xffef72,
    themeCss: "#ffef72",
    icon: skillAsset("volt_sentinel", "icons/u_ultimate_icon.png"),
    effectArt: skillAsset("volt_sentinel", "cards/u_ultimate_effect_art.png"),
    status: "stun",
    statusChance: 1,
    strikeCount: 4,
  },
  {
    id: "wind_pulse",
    heroId: "emerald_phantom",
    name: "Wind Pulse",
    input: "skill1",
    type: "ranged",
    damage: 18,
    projectileSpeed: 930,
    cooldown: 0.45,
    energyCost: 11,
    effectColor: 0x4ef3a5,
    themeCss: "#4ef3a5",
    icon: skillAsset("emerald_phantom", "icons/k_skill1_icon.png"),
    effectArt: skillAsset("emerald_phantom", "cards/k_skill1_effect_art.png"),
    knockback: 100,
  },
  {
    id: "toxic_spiral",
    heroId: "emerald_phantom",
    name: "Toxic Spiral",
    input: "skill2",
    type: "aoe",
    damage: 25,
    radius: 165,
    cooldown: 5,
    energyCost: 30,
    effectColor: 0x58ff9c,
    themeCss: "#58ff9c",
    icon: skillAsset("emerald_phantom", "icons/l_skill2_icon.png"),
    effectArt: skillAsset("emerald_phantom", "cards/l_skill2_effect_art.png"),
    status: "poison",
    statusChance: 1,
    duration: 1.8,
    tickRate: 0.3,
    pullStrength: 92,
    knockback: 34,
  },
  {
    id: "emerald_mirage",
    heroId: "emerald_phantom",
    name: "Emerald Mirage",
    input: "ultimate",
    type: "ultimate",
    damage: 24,
    radius: 230,
    cooldown: 18,
    energyCost: 95,
    effectColor: 0x64ffc7,
    themeCss: "#64ffc7",
    icon: skillAsset("emerald_phantom", "icons/u_ultimate_icon.png"),
    effectArt: skillAsset("emerald_phantom", "cards/u_ultimate_effect_art.png"),
    status: "poison",
    statusChance: 0.5,
    hitCount: 6,
    knockback: 38,
  },
];

export const INPUT_LABELS: Record<SkillInput, string> = {
  skill1: "K",
  skill2: "L",
  ultimate: "U",
};

export const getBasicAttackForHero = (heroId: string) =>
  BASIC_ATTACKS.find((attack) => attack.heroId === heroId);

export const getSkillsForHero = (heroId: string) =>
  SKILLS.filter((skill) => skill.heroId === heroId).sort((a, b) => {
    const order: Record<SkillInput, number> = { skill1: 0, skill2: 1, ultimate: 2 };
    return order[a.input] - order[b.input];
  });

export const getSkillForHeroInput = (heroId: string, input: SkillInput) =>
  SKILLS.find((skill) => skill.heroId === heroId && skill.input === input);

export const basicAttackIconKey = (attack: BasicAttackConfig) => `basic-${attack.heroId}-${attack.id}-icon`;
export const basicAttackEffectKey = (attack: BasicAttackConfig) => `basic-${attack.heroId}-${attack.id}-effect`;
export const skillIconKey = (skill: SkillConfig) => `skill-${skill.heroId}-${skill.id}-icon`;
export const skillEffectKey = (skill: SkillConfig) => `skill-${skill.heroId}-${skill.id}-effect`;

export const allSkillAssets = () => [
  ...BASIC_ATTACKS.flatMap((attack) => [
    { key: basicAttackIconKey(attack), path: attack.icon },
    { key: basicAttackEffectKey(attack), path: attack.effectArt },
  ]),
  ...SKILLS.flatMap((skill) => [
    { key: skillIconKey(skill), path: skill.icon },
    { key: skillEffectKey(skill), path: skill.effectArt },
  ]),
];
