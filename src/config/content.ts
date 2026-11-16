import { loadProgress } from "../systems/progress";

export type EnemyType = "crawler" | "mutant" | "hunter" | "aegis" | "boss" | "bomber" | "sniper" | "drone" | "aegis_prime" | "archon_zero";

export type EnemyDef = {
  type: EnemyType;
  name: string;
  sprite: string;
  height: number;
  hp: number;
  speed: number;
  damage: number;
  score: number;
  body: { w: number; h: number };
  flying?: boolean;
  artFacing: 1 | -1;
  tint?: number;
  scale?: number;
};

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  crawler: { type: "crawler", name: "Crawler", sprite: "crawler", height: 74, hp: 55, speed: 210, damage: 12, score: 100, body: { w: 120, h: 70 }, artFacing: 1 },
  mutant: { type: "mutant", name: "Horned Mutant", sprite: "mutant", height: 170, hp: 210, speed: 105, damage: 26, score: 300, body: { w: 120, h: 160 }, artFacing: 1 },
  hunter: { type: "hunter", name: "Sky Hunter", sprite: "hunter", height: 78, hp: 70, speed: 180, damage: 14, score: 200, body: { w: 140, h: 70 }, flying: true, artFacing: 1 },
  aegis: { type: "aegis", name: "Aegis Elite", sprite: "aegis", height: 150, hp: 160, speed: 90, damage: 18, score: 350, body: { w: 110, h: 145 }, artFacing: 1 },
  boss: { type: "boss", name: "Abyssal Colossus", sprite: "boss", height: 300, hp: 2600, speed: 70, damage: 34, score: 5000, body: { w: 260, h: 280 }, artFacing: 1 },
  bomber: { type: "bomber", name: "Volatile Bomber", sprite: "bomber", height: 74, hp: 70, speed: 260, damage: 45, score: 250, body: { w: 110, h: 70 }, artFacing: 1, tint: 0xff6622 },
  sniper: { type: "sniper", name: "Particle Sniper", sprite: "sniper", height: 80, hp: 85, speed: 120, damage: 32, score: 350, body: { w: 130, h: 75 }, flying: true, artFacing: 1, tint: 0x9955ff },
  drone: { type: "drone", name: "Support Drone", sprite: "drone", height: 70, hp: 95, speed: 160, damage: 0, score: 300, body: { w: 120, h: 65 }, flying: true, artFacing: 1, tint: 0x33ffaa },
  aegis_prime: { type: "aegis_prime", name: "Aegis Prime", sprite: "aegis", height: 210, hp: 650, speed: 85, damage: 28, score: 1500, body: { w: 154, h: 200 }, artFacing: 1, scale: 1.4, tint: 0x55ccff },
  archon_zero: {
    type: "archon_zero",
    name: "Archon Zero — Cổ Thần Hư Không",
    sprite: "boss",
    height: 320,
    hp: 6800,
    speed: 130,
    damage: 48,
    score: 15000,
    body: { w: 260, h: 290 },
    artFacing: 1,
    tint: 0xd946ef,
    scale: 1.35,
  },
};

export const STAGE_POWER = [1, 1.35, 1.75, 2.1, 2.65];

export type StageDef = {
  name: string;
  subtitle: string;
  background: string;
  accent: number;
  floor: number;
  waves: EnemyType[][];
};

export const STAGES: StageDef[] = [
  {
    name: "Thành Phố Neon",
    subtitle: "Màn 1",
    background: "bg_city_neon",
    accent: 0x18e6ff,
    floor: 0x0b1a2e,
    waves: [
      ["crawler", "crawler", "crawler"],
      ["crawler", "crawler", "mutant", "crawler"],
      ["hunter", "crawler", "hunter", "crawler", "crawler"],
    ],
  },
  {
    name: "Phòng Thí Nghiệm Ngầm",
    subtitle: "Màn 2",
    background: "bg_lab_sewer",
    accent: 0x37ffb0,
    floor: 0x08201c,
    waves: [
      ["aegis", "crawler", "crawler", "crawler"],
      ["mutant", "hunter", "mutant", "crawler", "crawler"],
      ["aegis_prime", "hunter", "crawler", "crawler"],
    ],
  },
  {
    name: "Pháo Đài Dung Nham",
    subtitle: "Màn 3",
    background: "bg_lava_fortress",
    accent: 0xff6a2a,
    floor: 0x24100a,
    waves: [
      ["mutant", "aegis", "hunter", "hunter", "crawler", "crawler"],
      ["crawler", "bomber", "crawler", "mutant", "aegis", "hunter"],
      ["boss"],
    ],
  },
  {
    name: "Quỹ Đạo Tan Vỡ",
    subtitle: "Màn 4",
    background: "bg_orbit",
    accent: 0xa855f7,
    floor: 0x150b2e,
    waves: [
      ["sniper", "drone", "crawler", "crawler"],
      ["bomber", "bomber", "sniper", "drone", "mutant"],
      ["aegis_prime", "sniper", "drone", "bomber", "crawler"],
    ],
  },
  {
    name: "Lõi Hư Không",
    subtitle: "Màn 5 — Điểm Kỳ Dị",
    background: "bg_void_singularity",
    accent: 0xd946ef,
    floor: 0x120324,
    waves: [
      ["aegis_prime", "sniper", "drone", "mutant"],
      ["bomber", "bomber", "hunter", "hunter", "aegis_prime"],
      ["archon_zero"],
    ],
  },
];

export type Upgrade = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  apply: (mods: HeroMods) => void;
};

export type HeroMods = {
  damage: number;
  maxHp: number;
  energyGain: number;
  cooldown: number;
  speed: number;
  dashCooldown: number;
  healOnKill: number;
  crit: number;
  healFull: boolean;
};

export const baseMods = (): HeroMods => {
  const p = loadProgress();
  const up = p.upgrades || {};
  const hpBonus = (up.hp ?? 0) * 15;
  const energyGainBonus = (up.energy ?? 0) * 0.08;
  const cdReduction = Math.pow(0.96, up.cooldown ?? 0);

  return {
    damage: 1,
    maxHp: hpBonus,
    energyGain: 1 + energyGainBonus,
    cooldown: cdReduction,
    speed: 1,
    dashCooldown: 1,
    healOnKill: 0,
    crit: 0.05,
    healFull: false,
  };
};

export const UPGRADES: Upgrade[] = [
  { id: "core", name: "Lõi Công Phá", desc: "+20% sát thương mọi đòn", icon: "item_chip", apply: (m) => (m.damage *= 1.2) },
  { id: "armor", name: "Giáp Gia Cố", desc: "+60 HP tối đa và hồi đầy máu", icon: "item_health", apply: (m) => { m.maxHp += 60; m.healFull = true; } },
  { id: "battery", name: "Tụ Năng Lượng", desc: "+50% năng lượng nhận được", icon: "item_energy", apply: (m) => (m.energyGain *= 1.5) },
  { id: "cooler", name: "Mạch Làm Lạnh", desc: "-25% thời gian hồi kỹ năng", icon: "item_energy", apply: (m) => (m.cooldown *= 0.75) },
  { id: "leech", name: "Hút Sinh Lực", desc: "Hạ gục kẻ địch hồi 8 HP", icon: "item_health", apply: (m) => (m.healOnKill += 8) },
  { id: "thruster", name: "Động Cơ Phản Lực", desc: "+12% tốc chạy, lướt hồi nhanh gấp đôi", icon: "item_chip", apply: (m) => { m.speed *= 1.12; m.dashCooldown *= 0.5; } },
  { id: "scope", name: "Bộ Ngắm Chí Mạng", desc: "+15% tỉ lệ chí mạng (x2 sát thương)", icon: "item_coin", apply: (m) => (m.crit += 0.15) },
];
