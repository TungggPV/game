export type EnemyType = "crawler" | "mutant" | "hunter" | "aegis" | "boss";

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
  /** Sprites are drawn facing this way in the source art. */
  artFacing: 1 | -1;
};

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  crawler: { type: "crawler", name: "Crawler", sprite: "crawler", height: 74, hp: 55, speed: 210, damage: 12, score: 100, body: { w: 120, h: 70 }, artFacing: 1 },
  mutant: { type: "mutant", name: "Horned Mutant", sprite: "mutant", height: 170, hp: 210, speed: 105, damage: 26, score: 300, body: { w: 120, h: 160 }, artFacing: 1 },
  hunter: { type: "hunter", name: "Sky Hunter", sprite: "hunter", height: 78, hp: 70, speed: 180, damage: 14, score: 200, body: { w: 140, h: 70 }, flying: true, artFacing: 1 },
  aegis: { type: "aegis", name: "Aegis Elite", sprite: "aegis", height: 150, hp: 160, speed: 90, damage: 18, score: 350, body: { w: 110, h: 145 }, artFacing: 1 },
  boss: { type: "boss", name: "Abyssal Colossus", sprite: "boss", height: 300, hp: 2300, speed: 70, damage: 34, score: 5000, body: { w: 260, h: 280 }, artFacing: 1 },
};

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
      ["aegis", "hunter", "aegis", "hunter", "crawler", "crawler"],
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
      ["crawler", "crawler", "crawler", "mutant", "crawler", "crawler", "aegis", "hunter"],
      ["boss"],
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

export const baseMods = (): HeroMods => ({
  damage: 1,
  maxHp: 0,
  energyGain: 1,
  cooldown: 1,
  speed: 1,
  dashCooldown: 1,
  healOnKill: 0,
  crit: 0.05,
  healFull: false,
});

export const UPGRADES: Upgrade[] = [
  { id: "core", name: "Lõi Công Phá", desc: "+20% sát thương mọi đòn", icon: "item_chip", apply: (m) => (m.damage *= 1.2) },
  { id: "armor", name: "Giáp Gia Cố", desc: "+60 HP tối đa và hồi đầy máu", icon: "item_health", apply: (m) => { m.maxHp += 60; m.healFull = true; } },
  { id: "battery", name: "Tụ Năng Lượng", desc: "+50% năng lượng nhận được", icon: "item_energy", apply: (m) => (m.energyGain *= 1.5) },
  { id: "cooler", name: "Mạch Làm Lạnh", desc: "-25% thời gian hồi kỹ năng", icon: "item_energy", apply: (m) => (m.cooldown *= 0.75) },
  { id: "leech", name: "Hút Sinh Lực", desc: "Hạ gục kẻ địch hồi 8 HP", icon: "item_health", apply: (m) => (m.healOnKill += 8) },
  { id: "thruster", name: "Động Cơ Phản Lực", desc: "+12% tốc chạy, lướt hồi nhanh gấp đôi", icon: "item_chip", apply: (m) => { m.speed *= 1.12; m.dashCooldown *= 0.5; } },
  { id: "scope", name: "Bộ Ngắm Chí Mạng", desc: "+15% tỉ lệ chí mạng (x2 sát thương)", icon: "item_coin", apply: (m) => (m.crit += 0.15) },
];
