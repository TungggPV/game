import type { HeroElement } from "../systems/Fx";
import type { SkillSlot } from "./constants";

export type ArmorSkinId = "default" | "gold" | "blood_moon" | "nebula";

export type ArmorSkinDef = {
  id: ArmorSkinId;
  name: string;
  accent: number | null;
  light: number | null;
};

export const ARMOR_SKINS: ArmorSkinDef[] = [
  { id: "default", name: "Mặc Định", accent: null, light: null },
  { id: "gold", name: "Hoàng Kim", accent: 0xfbbf24, light: 0xfff8d6 },
  { id: "blood_moon", name: "Huyết Nhật", accent: 0xff2255, light: 0xffc2d1 },
  { id: "nebula", name: "Tinh Vân", accent: 0xc084fc, light: 0xe0f2fe },
];

const SKIN_STORAGE_KEY = "element-armor.skin.v1";

export const getSelectedSkin = (): ArmorSkinId => {
  try {
    const raw = localStorage.getItem(SKIN_STORAGE_KEY) as ArmorSkinId | null;
    if (raw && ARMOR_SKINS.some((s) => s.id === raw)) return raw;
  } catch {}
  return "default";
};

export const getSkinDef = (id: ArmorSkinId = getSelectedSkin()): ArmorSkinDef =>
  ARMOR_SKINS.find((s) => s.id === id) ?? ARMOR_SKINS[0];

export const cycleSelectedSkin = (): ArmorSkinDef => {
  const cur = getSelectedSkin();
  const idx = ARMOR_SKINS.findIndex((s) => s.id === cur);
  const next = ARMOR_SKINS[(idx + 1) % ARMOR_SKINS.length];
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, next.id);
  } catch {}
  return next;
};

export type StatusKind = "burn" | "poison" | "slow" | "stun";

export type StatusEffect = { kind: StatusKind; time: number };

type SkillBase = {
  name: string;
  desc: string;
  cooldown: number;
  cost: number;
  damage: number;
  color: number;
  status?: StatusEffect;
  knock?: number;
  launch?: number;
};

export type ProjectileSkill = SkillBase & {
  kind: "projectile";
  speed: number;
  size: number;
  pierce?: number;
  explodeRadius?: number;
  chain?: number;
};
export type BurstSkill = SkillBase & { kind: "burst"; radius: number; offset: number; screen?: boolean };
export type FieldSkill = SkillBase & { kind: "field"; radius: number; offset: number; duration: number; tick: number };
export type StrikesSkill = SkillBase & { kind: "strikes"; count: number; radius: number; interval: number; meteor?: boolean };
export type SweepSkill = SkillBase & { kind: "sweep"; hits: number };

export type SkillDef = ProjectileSkill | BurstSkill | FieldSkill | StrikesSkill | SweepSkill;

export type BasicDef = {
  name: string;
  desc: string;
  combo: [number, number, number];
  range: number;
  interval: number;
  color: number;
  finisherStatus?: StatusEffect;
};

export type HeroDef = {
  id: string;
  name: string;
  role: string;
  element: HeroElement;
  color: number;
  hp: number;
  speed: number;
  power: number;
  jumps: number;
  stats: { atk: number; def: number; spd: number; skill: number };
  basic: BasicDef;
  skills: Record<Exclude<SkillSlot, "basic">, SkillDef>;
};

export const HEROES: HeroDef[] = [
  {
    id: "nova_blade",
    name: "Nova Blade",
    role: "Cân bằng · Plasma",
    element: "plasma",
    color: 0x18e6ff,
    hp: 260,
    speed: 360,
    power: 1,
    jumps: 2,
    stats: { atk: 3, def: 3, spd: 3, skill: 4 },
    basic: { name: "Chém Plasma", desc: "Combo 3 đòn, đòn cuối hất văng.", combo: [14, 14, 26], range: 130, interval: 0.2, color: 0x18e6ff },
    skills: {
      skill1: {
        kind: "projectile", name: "Plasma Shot", desc: "Đạn plasma xuyên 2 mục tiêu.",
        cooldown: 0.8, cost: 10, damage: 26, speed: 1050, size: 18, pierce: 2, color: 0x35f6ff, knock: 160,
      },
      skill2: {
        kind: "burst", name: "Rising Blade", desc: "Lưỡi kiếm xoáy hất tung kẻ địch phía trước.",
        cooldown: 4, cost: 25, damage: 44, radius: 170, offset: 90, launch: 950, color: 0x18e6ff,
      },
      ultimate: {
        kind: "burst", name: "Nova Overdrive", desc: "Bùng nổ plasma quét toàn màn hình.",
        cooldown: 1, cost: 100, damage: 220, radius: 9999, offset: 0, screen: true, launch: 700, color: 0x9ff8ff,
      },
    },
  },
  {
    id: "crimson_flare",
    name: "Crimson Flare",
    role: "Sát thương · Lửa",
    element: "fire",
    color: 0xff4e3a,
    hp: 290,
    speed: 330,
    power: 1.15,
    jumps: 2,
    stats: { atk: 5, def: 4, spd: 2, skill: 3 },
    basic: {
      name: "Quyền Lửa", desc: "Combo nặng, đòn cuối gây bỏng.", combo: [16, 16, 30], range: 135, interval: 0.24,
      color: 0xff7a24, finisherStatus: { kind: "burn", time: 2.5 },
    },
    skills: {
      skill1: {
        kind: "projectile", name: "Fire Burst", desc: "Cầu lửa nổ lan, gây bỏng.",
        cooldown: 1.2, cost: 14, damage: 30, speed: 820, size: 22, explodeRadius: 120, color: 0xff7a24,
        status: { kind: "burn", time: 3 }, knock: 220,
      },
      skill2: {
        kind: "burst", name: "Inferno Arc", desc: "Vòng cung lửa diện rộng phía trước.",
        cooldown: 5, cost: 30, damage: 56, radius: 210, offset: 110, color: 0xff4e3a, status: { kind: "burn", time: 3.5 }, knock: 420,
      },
      ultimate: {
        kind: "strikes", name: "Crimson Meteor", desc: "Mưa thiên thạch trút xuống kẻ địch.",
        cooldown: 1, cost: 100, damage: 80, count: 7, radius: 130, interval: 0.16, meteor: true, color: 0xff6a2a,
        status: { kind: "burn", time: 4 },
      },
    },
  },
  {
    id: "volt_sentinel",
    name: "Volt Sentinel",
    role: "Tốc độ · Sét",
    element: "volt",
    color: 0xffd93a,
    hp: 235,
    speed: 400,
    power: 0.95,
    jumps: 2,
    stats: { atk: 3, def: 2, spd: 5, skill: 4 },
    basic: { name: "Tia Lửa Điện", desc: "Combo cực nhanh, hồi năng lượng tốt.", combo: [11, 11, 22], range: 125, interval: 0.15, color: 0xffef72 },
    skills: {
      skill1: {
        kind: "projectile", name: "Thunder Bolt", desc: "Tia sét lan sang 2 kẻ địch gần đó.",
        cooldown: 0.7, cost: 10, damage: 22, speed: 1500, size: 14, chain: 2, color: 0xfff27a, knock: 90,
      },
      skill2: {
        kind: "field", name: "Electric Cage", desc: "Lồng điện gây sát thương liên tục và làm chậm.",
        cooldown: 6, cost: 28, damage: 9, radius: 160, offset: 170, duration: 3, tick: 0.25, color: 0xffe14a,
        status: { kind: "slow", time: 1 },
      },
      ultimate: {
        kind: "strikes", name: "Storm Breaker", desc: "Tám tia sét giáng xuống, gây choáng.",
        cooldown: 1, cost: 100, damage: 60, count: 8, radius: 110, interval: 0.12, color: 0xfff6a0,
        status: { kind: "stun", time: 1.4 },
      },
    },
  },
  {
    id: "emerald_phantom",
    name: "Emerald Phantom",
    role: "Cơ động · Độc",
    element: "wind",
    color: 0x3df2a0,
    hp: 225,
    speed: 430,
    power: 1,
    jumps: 3,
    stats: { atk: 3, def: 2, spd: 5, skill: 4 },
    basic: {
      name: "Ảnh Trảm", desc: "Đòn nhanh, đòn cuối gây độc. Nhảy 3 lần.", combo: [12, 12, 22], range: 125, interval: 0.16,
      color: 0x4ef3a5, finisherStatus: { kind: "poison", time: 3 },
    },
    skills: {
      skill1: {
        kind: "projectile", name: "Wind Pulse", desc: "Sóng gió đẩy lùi mạnh và gây độc.",
        cooldown: 1, cost: 12, damage: 20, speed: 900, size: 26, pierce: 4, color: 0x7dffc8, knock: 520,
        status: { kind: "poison", time: 3 },
      },
      skill2: {
        kind: "field", name: "Toxic Spiral", desc: "Xoáy độc quanh thân, rút máu kẻ địch.",
        cooldown: 5, cost: 26, damage: 8, radius: 170, offset: 0, duration: 2.6, tick: 0.2, color: 0x3df2a0,
        status: { kind: "poison", time: 2 },
      },
      ultimate: {
        kind: "sweep", name: "Emerald Mirage", desc: "Lướt ảo ảnh xuyên màn hình, chém liên hoàn.",
        cooldown: 1, cost: 100, damage: 34, hits: 6, color: 0x4ef3a5,
      },
    },
  },
  {
    id: "obsidian_warden",
    name: "Obsidian Warden",
    role: "Hộ Vệ · Đất & Khiên",
    element: "earth",
    color: 0xcca052,
    hp: 310,
    speed: 360,
    power: 1.15,
    jumps: 2,
    stats: { atk: 4, def: 5, spd: 3, skill: 4 },
    basic: {
      name: "Chùy Nham Thạch",
      desc: "Đòn đánh nặng nề với diện tích tác động lớn và đẩy lùi mạnh.",
      combo: [18, 22, 38],
      range: 155,
      interval: 0.22,
      color: 0xffd07a,
    },
    skills: {
      skill1: {
        kind: "burst",
        name: "Earth Barrier",
        desc: "Dậm đất tạo tường chắn nham thạch, hất tung và gây choáng.",
        cooldown: 4.5,
        cost: 20,
        damage: 35,
        radius: 175,
        offset: 80,
        color: 0xcca052,
        knock: 350,
        launch: 400,
        status: { kind: "stun", time: 0.8 },
      },
      skill2: {
        kind: "projectile",
        name: "Obsidian Spike",
        desc: "Bắn khối cự thạch xuyên thấu nghiền nát quân địch.",
        cooldown: 3.5,
        cost: 25,
        damage: 42,
        speed: 1100,
        size: 24,
        pierce: 3,
        color: 0xffcc66,
        knock: 400,
      },
      ultimate: {
        kind: "burst",
        name: "Tectonic Wrath",
        desc: "Nộ kích địa chấn rung chuyển toàn bộ chiến trường.",
        cooldown: 1,
        cost: 100,
        damage: 130,
        radius: 450,
        offset: 0,
        screen: true,
        color: 0xffd07a,
        knock: 600,
        launch: 500,
      },
    },
  },
  {
    id: "cryo_archon",
    name: "Cryo Archon",
    role: "Khống Chế · Băng",
    element: "cryo",
    color: 0x38bdf8,
    hp: 270,
    speed: 375,
    power: 1.05,
    jumps: 2,
    stats: { atk: 3, def: 4, spd: 4, skill: 5 },
    basic: {
      name: "Băng Thương Trảm",
      desc: "Chém thương băng tốc độ cao, đòn cuối làm chậm.",
      combo: [13, 15, 25],
      range: 140,
      interval: 0.18,
      color: 0x38bdf8,
      finisherStatus: { kind: "slow", time: 2.4 },
    },
    skills: {
      skill1: {
        kind: "projectile",
        name: "Glacial Lance",
        desc: "Phóng thương băng xuyên 2 địch và nổ sương giá.",
        cooldown: 1.0,
        cost: 12,
        damage: 28,
        speed: 1200,
        size: 20,
        pierce: 2,
        explodeRadius: 95,
        color: 0x7dd3fc,
        status: { kind: "slow", time: 2.5 },
        knock: 180,
      },
      skill2: {
        kind: "field",
        name: "Zero Blizzard",
        desc: "Vùng bão tuyết hút quái và đóng băng liên tục.",
        cooldown: 5.5,
        cost: 28,
        damage: 10,
        radius: 185,
        offset: 130,
        duration: 3.4,
        tick: 0.25,
        color: 0x38bdf8,
        status: { kind: "slow", time: 2.0 },
      },
      ultimate: {
        kind: "strikes",
        name: "Eternal Permafrost",
        desc: "9 cột băng khổng lồ giáng xuống, đóng băng toàn bộ.",
        cooldown: 1,
        cost: 100,
        damage: 72,
        count: 9,
        radius: 125,
        interval: 0.12,
        color: 0xe0faff,
        status: { kind: "stun", time: 1.8 },
      },
    },
  },
  {
    id: "void_reaper",
    name: "Void Reaper",
    role: "Sát Thủ · Hư Không",
    element: "void",
    color: 0xd946ef,
    hp: 245,
    speed: 440,
    power: 1.2,
    jumps: 3,
    stats: { atk: 5, def: 2, spd: 5, skill: 4 },
    basic: {
      name: "Hư Không Trảm",
      desc: "Chém lưỡi hái tốc độ cao, nhảy 3 lần.",
      combo: [15, 17, 30],
      range: 136,
      interval: 0.16,
      color: 0xd946ef,
    },
    skills: {
      skill1: {
        kind: "projectile",
        name: "Singularity Orb",
        desc: "Cầu hố đen xuyên 3 mục tiêu, nổ xoáy hư không.",
        cooldown: 1.1,
        cost: 14,
        damage: 26,
        speed: 980,
        size: 22,
        pierce: 3,
        color: 0xe879f9,
        knock: 120,
      },
      skill2: {
        kind: "burst",
        name: "Phantom Rift",
        desc: "Xé không gian chém chữ X, hút sinh lực hồi máu.",
        cooldown: 4.2,
        cost: 24,
        damage: 54,
        radius: 195,
        offset: 105,
        color: 0xd946ef,
        knock: 340,
        launch: 320,
      },
      ultimate: {
        kind: "sweep",
        name: "Dimension Eclipse",
        desc: "8 lần trảm cắt không gian liên hoàn khắp chiến trường.",
        cooldown: 1,
        cost: 100,
        damage: 32,
        hits: 8,
        color: 0xf0abfc,
      },
    },
  },
];

export const heroById = (id: string) => HEROES.find((h) => h.id === id) ?? HEROES[0];
