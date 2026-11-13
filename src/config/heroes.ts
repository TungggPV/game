import type { SkillSlot } from "./constants";

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
];

export const heroById = (id: string) => HEROES.find((h) => h.id === id) ?? HEROES[0];
