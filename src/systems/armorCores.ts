import type { Hero } from "../entities/Hero";

export type CoreRarity = "common" | "rare" | "epic" | "legendary";
export type SynergyTag = "Dash" | "Aerial" | "Elemental" | "Berserk" | "Fortress";

export type ArmorCore = {
  id: string;
  name: string;
  rarity: CoreRarity;
  tags: SynergyTag[];
  desc: string;
  icon: string;
  apply: (hero: Hero) => void;
};

export const RARITY_COLORS: Record<CoreRarity, { main: number; str: string; bg: number }> = {
  common: { main: 0xd0d8e2, str: "#d0d8e2", bg: 0x141f2e },
  rare: { main: 0x18e6ff, str: "#18e6ff", bg: 0x092b45 },
  epic: { main: 0xb06cff, str: "#b06cff", bg: 0x2b1045 },
  legendary: { main: 0xffe45c, str: "#ffe45c", bg: 0x453509 },
};

export const ARMOR_CORES: ArmorCore[] = [
  {
    id: "core_reflect_lightning",
    name: "Lõi Phản Quang",
    rarity: "rare",
    tags: ["Dash", "Elemental"],
    desc: "Lướt qua kẻ địch để lại tia sét 35 sát thương và gắn ấn Điện.",
    icon: "⚡",
    apply: (h) => {
      h.mods.dashCooldown *= 0.85;
    },
  },
  {
    id: "core_magma_slam",
    name: "Lõi Dung Nham Trụy",
    rarity: "rare",
    tags: ["Aerial", "Elemental"],
    desc: "Đòn Slam từ trên không tạo ra cột lửa nham thạch ngay điểm tiếp đất.",
    icon: "🌋",
    apply: (h) => {
      h.mods.damage *= 1.1;
    },
  },
  {
    id: "core_permafrost",
    name: "Lõi Băng Vĩnh Cửu",
    rarity: "rare",
    tags: ["Elemental"],
    desc: "Kỹ năng để lại vùng sương giá làm chậm 40% tốc độ quái và gắn ấn Băng.",
    icon: "❄️",
    apply: (h) => {
      h.mods.cooldown *= 0.9;
    },
  },
  {
    id: "core_branching_beam",
    name: "Lõi Kiếm Khí Phân Nhánh",
    rarity: "epic",
    tags: ["Berserk"],
    desc: "Đòn đánh cơ bản thứ 3 bắn ra 2 luồng sóng nguyên tố xuyên thấu.",
    icon: "🗡️",
    apply: (h) => {
      h.mods.damage *= 1.15;
    },
  },
  {
    id: "core_time_dilation",
    name: "Lõi Thời Gian Ngưng Đọng",
    rarity: "epic",
    tags: ["Dash"],
    desc: "Kéo dài slow-mo của Né Hoàn Hảo thêm +0.25s và nhân đôi sát thương đòn kế.",
    icon: "⌛",
    apply: (h) => {
      h.mods.dashCooldown *= 0.8;
    },
  },
  {
    id: "core_bloodlust",
    name: "Lõi Hấp Huyết Cuồng Nộ",
    rarity: "rare",
    tags: ["Berserk"],
    desc: "Hồi 4 HP khi hạ gục địch hoặc khi đánh vào Boss đang bị PHÁ GIÁP.",
    icon: "🩸",
    apply: (h) => {
      h.mods.healOnKill += 4;
    },
  },
  {
    id: "core_thorn_fortress",
    name: "Lõi Pháo Đài Gai",
    rarity: "rare",
    tags: ["Fortress", "Elemental"],
    desc: "Khi nhận sát thương hoặc Parry, phóng mảnh đá chấn địa ra xung quanh.",
    icon: "🛡️",
    apply: (h) => {
      h.mods.maxHp += 40;
    },
  },
  {
    id: "core_storm_step",
    name: "Lõi Phong Lôi Bộ",
    rarity: "common",
    tags: ["Dash"],
    desc: "Giảm 30% hồi chiêu Lướt Né, tăng 25% khoảng cách lướt.",
    icon: "💨",
    apply: (h) => {
      h.mods.dashCooldown *= 0.7;
    },
  },
  {
    id: "core_meteor_drop",
    name: "Lõi Thiên Thạch Giáng Trần",
    rarity: "common",
    tags: ["Aerial"],
    desc: "Tăng 60% sát thương cho đòn Air Slam, tăng 80% bán kính sóng chấn động.",
    icon: "☄️",
    apply: (h) => {
      h.mods.damage *= 1.12;
    },
  },
  {
    id: "core_elemental_resonance",
    name: "Lõi Cộng Hưởng Nguyên Tố",
    rarity: "epic",
    tags: ["Elemental"],
    desc: "Tăng 50% sát thương của mọi Phản ứng Nguyên tố.",
    icon: "🔮",
    apply: (h) => {
      h.mods.energyGain *= 1.25;
    },
  },
  {
    id: "core_iron_will",
    name: "Lõi Ý Chí Sắt Đá",
    rarity: "common",
    tags: ["Fortress"],
    desc: "Tăng 120 Máu tối đa và hồi đầy bình máu ngay lập tức.",
    icon: "❤️",
    apply: (h) => {
      h.mods.maxHp += 120;
      h.mods.healFull = true;
    },
  },
  {
    id: "core_rage_catalyst",
    name: "Lõi Xúc Tác Cuồng Nộ",
    rarity: "rare",
    tags: ["Berserk"],
    desc: "Tăng 25% sát thương và 20% tỉ lệ đánh bạo kích.",
    icon: "🔥",
    apply: (h) => {
      h.mods.damage *= 1.2;
      h.mods.crit += 0.2;
    },
  },
  {
    id: "core_aerial_dominance",
    name: "Lõi Thống Trị Bầu Trời",
    rarity: "common",
    tags: ["Aerial"],
    desc: "Nhảy thêm +1 lần trên không và tăng 30% sát thương trên không.",
    icon: "🪽",
    apply: () => {},
  },
  {
    id: "core_hyper_shield",
    name: "Lõi Siêu Khiên Năng Lượng",
    rarity: "rare",
    tags: ["Fortress"],
    desc: "Tăng 60 Máu tối đa và giảm 15% thời gian hồi chiêu kỹ năng.",
    icon: "🔰",
    apply: (h) => {
      h.mods.maxHp += 60;
      h.mods.cooldown *= 0.85;
    },
  },
  {
    id: "core_phantom_strike",
    name: "Lõi Ảo Ảnh Trảm",
    rarity: "epic",
    tags: ["Dash", "Berserk"],
    desc: "Tăng 30% sát thương chí mạng và nạp 20 năng lượng tức thì.",
    icon: "👤",
    apply: (h) => {
      h.mods.crit += 0.25;
      h.gainEnergy(20);
    },
  },
  {
    id: "core_overdrive_overload",
    name: "Lõi Quá Tải Hào Quang",
    rarity: "epic",
    tags: ["Berserk", "Elemental"],
    desc: "Tăng 35% sát thương trong Overdrive và tăng tốc hồi năng lượng.",
    icon: "🌟",
    apply: (h) => {
      h.mods.energyGain *= 1.3;
      h.mods.damage *= 1.15;
    },
  },
  {
    id: "core_titan_breaker",
    name: "Lõi Kẻ Diệt Khổng Lồ",
    rarity: "epic",
    tags: ["Fortress"],
    desc: "Tăng 100% sát thương Posture làm tụt thanh Phá Giáp cực nhanh.",
    icon: "🔨",
    apply: (h) => {
      h.mods.damage *= 1.15;
    },
  },
  {
    id: "core_astral_ascension",
    name: "Lõi Tinh Vân Thăng Hoa",
    rarity: "legendary",
    tags: ["Elemental", "Aerial"],
    desc: "Tăng 35% mọi chỉ số: Máu, Sát thương, Tốc độ và Năng lượng.",
    icon: "👑",
    apply: (h) => {
      h.mods.damage *= 1.35;
      h.mods.maxHp += 100;
      h.mods.speed *= 1.25;
      h.mods.energyGain *= 1.35;
      h.mods.cooldown *= 0.8;
      h.mods.crit += 0.25;
    },
  },
];

export type SynergyCount = Record<SynergyTag, number>;

export interface ActiveSynergy {
  tag: SynergyTag;
  count: number;
  level: number;
  description: string;
}

export const SYNERGY_EFFECTS: Record<SynergyTag, { 2: string; 4: string }> = {
  Dash: {
    2: "Lướt để lại vệt năng lượng giật sét 45 sát thương",
    4: "Giảm 40% hồi chiêu Lướt + tàng hình né đòn sát thương",
  },
  Aerial: {
    2: "Sát thương không chiến +30%",
    4: "Nhảy 3 lần trên không + tiếp đất tạo sóng chấn động 80 sát thương",
  },
  Elemental: {
    2: "Tăng 30% sát thương Phản Ứng Nguyên Tố",
    4: "Kỹ năng nguyên tố tự động phóng thêm luồng nổ nguyên tố phụ",
  },
  Berserk: {
    2: "Mỗi 10 đòn combo tăng 5% sát thương (tối đa 40%)",
    4: "Dưới 40% HP hoặc trong Overdrive: +50% tốc đánh và hút 5% sinh lực",
  },
  Fortress: {
    2: "Giảm 25% sát thương nhận vào, tăng kháng choáng",
    4: "Đỡ đòn chuẩn xác (Parry) hồi 15% HP và gây choáng toàn màn hình",
  },
};

export const calculateSynergies = (cores: ArmorCore[]): SynergyCount => {
  const counts: SynergyCount = {
    Dash: 0,
    Aerial: 0,
    Elemental: 0,
    Berserk: 0,
    Fortress: 0,
  };
  cores.forEach((c) => {
    c.tags.forEach((t) => {
      counts[t] += 1;
    });
  });
  return counts;
};

export const getActiveSynergies = (cores: ArmorCore[]): ActiveSynergy[] => {
  const counts = calculateSynergies(cores);
  const active: ActiveSynergy[] = [];
  (Object.keys(counts) as SynergyTag[]).forEach((tag) => {
    const count = counts[tag];
    if (count >= 4) {
      active.push({ tag, count, level: 4, description: SYNERGY_EFFECTS[tag][4] });
    } else if (count >= 2) {
      active.push({ tag, count, level: 2, description: SYNERGY_EFFECTS[tag][2] });
    }
  });
  return active;
};
