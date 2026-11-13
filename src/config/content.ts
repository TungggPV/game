export type EnemyType = "crawler" | "mutant" | "hunter" | "aegis" | "warlord" | "commander" | "boss";

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
  /** Tint applied to the sprite (used to tell mini-bosses apart from their base enemy). */
  tint?: number;
  /** Shows a boss health bar and resists knockback. */
  bossBar?: boolean;
};

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  crawler: { type: "crawler", name: "Crawler", sprite: "crawler", height: 74, hp: 55, speed: 210, damage: 12, score: 100, body: { w: 120, h: 70 }, artFacing: 1 },
  mutant: { type: "mutant", name: "Horned Mutant", sprite: "mutant", height: 170, hp: 210, speed: 105, damage: 26, score: 300, body: { w: 120, h: 160 }, artFacing: 1 },
  hunter: { type: "hunter", name: "Sky Hunter", sprite: "hunter", height: 78, hp: 70, speed: 180, damage: 14, score: 200, body: { w: 140, h: 70 }, flying: true, artFacing: 1 },
  aegis: { type: "aegis", name: "Aegis Elite", sprite: "aegis", height: 150, hp: 160, speed: 90, damage: 18, score: 350, body: { w: 110, h: 145 }, artFacing: 1 },
  warlord: {
    type: "warlord", name: "Bạo Chúa Sừng Đỏ", sprite: "mutant", height: 250, hp: 1100, speed: 120, damage: 30, score: 2000,
    body: { w: 170, h: 235 }, artFacing: 1, tint: 0xff8a8a, bossBar: true,
  },
  commander: {
    type: "commander", name: "Chỉ Huy Aegis", sprite: "aegis", height: 220, hp: 1300, speed: 95, damage: 24, score: 2500,
    body: { w: 160, h: 210 }, artFacing: 1, tint: 0xb8c8ff, bossBar: true,
  },
  boss: { type: "boss", name: "Abyssal Colossus", sprite: "boss", height: 300, hp: 2300, speed: 70, damage: 34, score: 5000, body: { w: 260, h: 280 }, artFacing: 1, bossBar: true },
};

// ---------- elite affixes ----------

export type AffixId = "armored" | "frenzy" | "vampiric" | "volatile" | "splitter";

export type AffixDef = { id: AffixId; name: string; color: number; desc: string };

export const AFFIXES: AffixDef[] = [
  { id: "armored", name: "Bọc Thép", color: 0x9fb8d8, desc: "Giảm 40% sát thương nhận vào" },
  { id: "frenzy", name: "Cuồng Nộ", color: 0xff6a3a, desc: "Di chuyển và tấn công nhanh hơn" },
  { id: "vampiric", name: "Hút Máu", color: 0xc02a5a, desc: "Hồi máu khi đánh trúng" },
  { id: "volatile", name: "Dễ Nổ", color: 0xffb02a, desc: "Phát nổ khi bị hạ" },
  { id: "splitter", name: "Phân Tách", color: 0x7dff6a, desc: "Sinh Crawler khi bị hạ" },
];

// ---------- stages ----------

export type Hazard = "none" | "laser" | "lava" | "storm";

export type StageDef = {
  name: string;
  subtitle: string;
  story: string;
  background: string;
  /** Multiplied over the background for variety when stages share art. */
  bgTint: number;
  accent: number;
  floor: number;
  hazard: Hazard;
  /** Seconds; finishing under this earns the third star. */
  par: number;
  /** Entries are enemy types; a trailing "!" marks a guaranteed elite. */
  waves: string[][];
};

export const STAGES: StageDef[] = [
  {
    name: "Thành Phố Neon",
    subtitle: "Màn 1",
    story: "Lũ Crawler tràn lên từ cống ngầm. Hãy dọn sạch khu phố trung tâm.",
    background: "bg_city_neon",
    bgTint: 0xffffff,
    accent: 0x18e6ff,
    floor: 0x0b1a2e,
    hazard: "none",
    par: 75,
    waves: [
      ["crawler", "crawler", "crawler"],
      ["crawler", "crawler", "mutant", "crawler"],
      ["hunter", "crawler", "hunter", "crawler", "crawler"],
      ["mutant", "crawler!", "crawler", "hunter"],
    ],
  },
  {
    name: "Cống Ngầm Độc",
    subtitle: "Màn 2",
    story: "Nguồn gốc lũ quái nằm dưới lòng đất. Cẩn thận tia laser an ninh còn hoạt động.",
    background: "bg_lab_sewer",
    bgTint: 0xb8ffd8,
    accent: 0x37ffb0,
    floor: 0x08201c,
    hazard: "laser",
    par: 95,
    waves: [
      ["crawler", "crawler", "aegis", "crawler"],
      ["mutant", "hunter", "crawler", "crawler", "hunter"],
      ["aegis", "aegis", "crawler!", "crawler"],
      ["mutant!", "hunter", "hunter", "crawler", "crawler"],
    ],
  },
  {
    name: "Phòng Thí Nghiệm",
    subtitle: "Màn 3",
    story: "Bạo Chúa Sừng Đỏ canh giữ phòng thí nghiệm. Hạ hắn để lấy dữ liệu.",
    background: "bg_lab_sewer",
    bgTint: 0xffffff,
    accent: 0x7de8ff,
    floor: 0x0a1c26,
    hazard: "laser",
    par: 120,
    waves: [
      ["aegis", "hunter", "crawler", "crawler", "hunter"],
      ["mutant", "mutant", "aegis!", "crawler"],
      ["hunter!", "hunter", "aegis", "crawler", "crawler", "crawler"],
      ["warlord"],
    ],
  },
  {
    name: "Pháo Đài Dung Nham",
    subtitle: "Màn 4",
    story: "Dung nham phun trào khắp pháo đài. Đừng đứng yên quá lâu.",
    background: "bg_lava_fortress",
    bgTint: 0xffffff,
    accent: 0xff6a2a,
    floor: 0x24100a,
    hazard: "lava",
    par: 110,
    waves: [
      ["mutant", "aegis", "hunter", "hunter", "crawler"],
      ["crawler", "crawler", "crawler", "mutant!", "crawler"],
      ["aegis", "aegis", "hunter", "hunter!", "crawler"],
      ["mutant", "mutant", "aegis!", "hunter", "crawler", "crawler"],
    ],
  },
  {
    name: "Thành Phố Bão Điện",
    subtitle: "Màn 5",
    story: "Chỉ Huy Aegis kiểm soát mạng lưới điện. Sét giáng xuống bất cứ lúc nào.",
    background: "bg_city_neon",
    bgTint: 0xb0a0ff,
    accent: 0xffd93a,
    floor: 0x141030,
    hazard: "storm",
    par: 130,
    waves: [
      ["aegis", "aegis", "hunter", "hunter", "crawler!"],
      ["mutant!", "mutant", "hunter", "crawler", "crawler"],
      ["aegis!", "hunter!", "crawler", "crawler", "crawler", "mutant"],
      ["commander", "crawler", "crawler"],
    ],
  },
  {
    name: "Lõi Vực Thẳm",
    subtitle: "Màn 6",
    story: "Abyssal Colossus thức tỉnh trong lõi núi lửa. Trận chiến cuối cùng.",
    background: "bg_lava_fortress",
    bgTint: 0xd8b0ff,
    accent: 0xb06cff,
    floor: 0x1a0a24,
    hazard: "lava",
    par: 170,
    waves: [
      ["mutant!", "aegis", "hunter", "hunter", "crawler", "crawler"],
      ["warlord", "crawler", "crawler"],
      ["crawler!", "crawler!", "mutant", "aegis!", "hunter", "hunter"],
      ["boss"],
    ],
  },
];

export const parseWaveEntry = (entry: string) => ({ type: entry.replace("!", "") as EnemyType, elite: entry.endsWith("!") });

/** Boss Rush: each entry is one arena fight. */
export const BOSS_RUSH: { label: string; enemies: EnemyType[]; stage: number }[] = [
  { label: "Bạo Chúa Sừng Đỏ", enemies: ["warlord"], stage: 2 },
  { label: "Chỉ Huy Aegis", enemies: ["commander"], stage: 4 },
  { label: "Song Hùng", enemies: ["warlord", "commander"], stage: 3 },
  { label: "Abyssal Colossus", enemies: ["boss"], stage: 5 },
];

// ---------- power-ups (temporary, dropped by elites and crates) ----------

export type PowerUpId = "rage" | "shield" | "haste" | "overcharge";

export type PowerUpDef = { id: PowerUpId; name: string; desc: string; color: number; duration: number; icon: string };

export const POWERUPS: Record<PowerUpId, PowerUpDef> = {
  rage: { id: "rage", name: "Cuồng Bạo", desc: "x1.6 sát thương", color: 0xff4e3a, duration: 10, icon: "item_chip" },
  shield: { id: "shield", name: "Khiên Năng Lượng", desc: "Chặn 80 sát thương", color: 0x7de8ff, duration: 15, icon: "item_energy" },
  haste: { id: "haste", name: "Siêu Tốc", desc: "+35% tốc độ, hồi chiêu nhanh", color: 0xffe45c, duration: 10, icon: "item_coin" },
  overcharge: { id: "overcharge", name: "Quá Tải", desc: "Kỹ năng không tốn năng lượng", color: 0xb06cff, duration: 7, icon: "item_energy" },
};

// ---------- in-run upgrades ----------

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
  regen: number;
  ultCost: number;
  dodgeWindow: number;
  thorns: number;
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
  regen: 0,
  ultCost: 100,
  dodgeWindow: 0.14,
  thorns: 0,
});

export type Upgrade = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  apply: (mods: HeroMods) => void;
};

export const UPGRADES: Upgrade[] = [
  { id: "core", name: "Lõi Công Phá", desc: "+20% sát thương mọi đòn", icon: "item_chip", apply: (m) => (m.damage *= 1.2) },
  { id: "armor", name: "Giáp Gia Cố", desc: "+60 HP tối đa và hồi đầy máu", icon: "item_health", apply: (m) => { m.maxHp += 60; m.healFull = true; } },
  { id: "battery", name: "Tụ Năng Lượng", desc: "+50% năng lượng nhận được", icon: "item_energy", apply: (m) => (m.energyGain *= 1.5) },
  { id: "cooler", name: "Mạch Làm Lạnh", desc: "-25% thời gian hồi kỹ năng", icon: "item_energy", apply: (m) => (m.cooldown *= 0.75) },
  { id: "leech", name: "Hút Sinh Lực", desc: "Hạ gục kẻ địch hồi 8 HP", icon: "item_health", apply: (m) => (m.healOnKill += 8) },
  { id: "thruster", name: "Động Cơ Phản Lực", desc: "+12% tốc chạy, lướt hồi nhanh gấp đôi", icon: "item_chip", apply: (m) => { m.speed *= 1.12; m.dashCooldown *= 0.5; } },
  { id: "scope", name: "Bộ Ngắm Chí Mạng", desc: "+15% tỉ lệ chí mạng (x2 sát thương)", icon: "item_coin", apply: (m) => (m.crit += 0.15) },
  { id: "nanites", name: "Nanite Tái Tạo", desc: "Hồi 2 HP mỗi giây", icon: "item_health", apply: (m) => (m.regen += 2) },
  { id: "capacitor", name: "Tụ Điện Tuyệt Kỹ", desc: "Tuyệt kỹ chỉ cần 75 năng lượng", icon: "item_energy", apply: (m) => (m.ultCost = Math.min(m.ultCost, 75)) },
  { id: "reflex", name: "Phản Xạ Thần Kinh", desc: "Cửa sổ né hoàn hảo rộng gấp đôi", icon: "item_chip", apply: (m) => (m.dodgeWindow *= 2) },
  { id: "spikes", name: "Giáp Gai", desc: "Phản 50% sát thương cận chiến", icon: "item_chip", apply: (m) => (m.thorns += 0.5) },
];
