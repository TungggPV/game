import type { Difficulty } from "./constants";

// ---------- difficulty ----------

export type DifficultyDef = { id: Difficulty; name: string; desc: string; enemyHp: number; enemyDmg: number; eliteChance: number; reward: number; color: number };

export const DIFFICULTIES: DifficultyDef[] = [
  { id: "easy", name: "Dễ", desc: "Kẻ địch yếu hơn, ít tinh anh", enemyHp: 0.7, enemyDmg: 0.6, eliteChance: 0.04, reward: 0.7, color: 0x7dffb0 },
  { id: "normal", name: "Thường", desc: "Trải nghiệm cân bằng", enemyHp: 1, enemyDmg: 1, eliteChance: 0.1, reward: 1, color: 0x18e6ff },
  { id: "hard", name: "Ác Mộng", desc: "Kẻ địch mạnh, nhiều tinh anh, thưởng x1.6", enemyHp: 1.45, enemyDmg: 1.5, eliteChance: 0.22, reward: 1.6, color: 0xff4e5f },
];

export const difficultyById = (id: Difficulty) => DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];

// ---------- workshop (permanent upgrades bought with credits) ----------

export type WorkshopId = "hp" | "atk" | "energy" | "cooldown" | "crit" | "magnet" | "revive" | "loot";

export type WorkshopDef = {
  id: WorkshopId;
  name: string;
  desc: string;
  icon: string;
  max: number;
  baseCost: number;
  /** Human readable effect at a given level, e.g. "+30 HP". */
  effect: (level: number) => string;
};

export const WORKSHOP: WorkshopDef[] = [
  { id: "hp", name: "Giáp Titan", desc: "Tăng máu tối đa", icon: "item_health", max: 10, baseCost: 120, effect: (l) => `+${l * 15} HP` },
  { id: "atk", name: "Lõi Plasma", desc: "Tăng sát thương mọi đòn", icon: "item_chip", max: 10, baseCost: 150, effect: (l) => `+${l * 5}% sát thương` },
  { id: "energy", name: "Pin Dự Trữ", desc: "Năng lượng khi bắt đầu trận", icon: "item_energy", max: 5, baseCost: 100, effect: (l) => `+${l * 12} năng lượng đầu trận` },
  { id: "cooldown", name: "Tản Nhiệt", desc: "Giảm thời gian hồi kỹ năng", icon: "item_energy", max: 5, baseCost: 180, effect: (l) => `-${l * 5}% hồi chiêu` },
  { id: "crit", name: "Ống Ngắm", desc: "Tăng tỉ lệ chí mạng", icon: "item_coin", max: 5, baseCost: 160, effect: (l) => `+${l * 3}% chí mạng` },
  { id: "magnet", name: "Nam Châm", desc: "Hút vật phẩm từ xa", icon: "item_coin", max: 3, baseCost: 90, effect: (l) => `Bán kính hút +${l * 80}` },
  { id: "loot", name: "Máy Quét Kho Báu", desc: "Tăng tín dụng nhận được", icon: "item_coin", max: 5, baseCost: 200, effect: (l) => `+${l * 10}% tín dụng` },
  { id: "revive", name: "Lõi Hồi Sinh", desc: "Tự hồi sinh khi gục ngã (mỗi trận)", icon: "item_health", max: 2, baseCost: 600, effect: (l) => `${l} lần hồi sinh / trận` },
];

export const workshopCost = (def: WorkshopDef, level: number) => Math.round(def.baseCost * Math.pow(1.55, level));

// ---------- hero levels ----------

export const HERO_MAX_LEVEL = 20;
export const xpToNext = (level: number) => Math.round(120 * Math.pow(level, 1.35));
/** Multiplier on HP and damage from hero level (level 1 = 1.0, level 20 = 1.57). */
export const levelBonus = (level: number) => 1 + (level - 1) * 0.03;

// ---------- achievements ----------

export type StatKey =
  | "kills"
  | "eliteKills"
  | "bossKills"
  | "runs"
  | "wins"
  | "deaths"
  | "maxCombo"
  | "damageDealt"
  | "creditsEarned"
  | "perfectDodges"
  | "ultimates"
  | "pickups"
  | "cratesBroken"
  | "endlessBestWave"
  | "pkWins"
  | "workshopBought"
  | "playSeconds";

export type AchievementDef = {
  id: string;
  name: string;
  desc: string;
  reward: number;
  /** Unlocks automatically once the stat reaches the goal. */
  stat?: StatKey;
  goal?: number;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_blood", name: "Giọt Máu Đầu", desc: "Hạ gục kẻ địch đầu tiên", reward: 50, stat: "kills", goal: 1 },
  { id: "kills_100", name: "Chiến Binh", desc: "Hạ gục 100 kẻ địch", reward: 200, stat: "kills", goal: 100 },
  { id: "kills_1000", name: "Huyền Thoại Giáp", desc: "Hạ gục 1000 kẻ địch", reward: 1000, stat: "kills", goal: 1000 },
  { id: "elite_10", name: "Thợ Săn Tinh Anh", desc: "Hạ 10 kẻ địch tinh anh", reward: 300, stat: "eliteKills", goal: 10 },
  { id: "boss_1", name: "Diệt Khổng Lồ", desc: "Hạ gục một trùm", reward: 400, stat: "bossKills", goal: 1 },
  { id: "boss_10", name: "Kẻ Hủy Diệt", desc: "Hạ gục 10 trùm", reward: 1200, stat: "bossKills", goal: 10 },
  { id: "combo_30", name: "Liên Hoàn", desc: "Đạt combo 30", reward: 150, stat: "maxCombo", goal: 30 },
  { id: "combo_100", name: "Cơn Lốc", desc: "Đạt combo 100", reward: 500, stat: "maxCombo", goal: 100 },
  { id: "dodge_10", name: "Bóng Ma", desc: "Né hoàn hảo 10 lần", reward: 250, stat: "perfectDodges", goal: 10 },
  { id: "ult_25", name: "Bùng Nổ", desc: "Dùng tuyệt kỹ 25 lần", reward: 300, stat: "ultimates", goal: 25 },
  { id: "crates_20", name: "Kẻ Phá Hoại", desc: "Phá 20 thùng tiếp tế", reward: 200, stat: "cratesBroken", goal: 20 },
  { id: "endless_10", name: "Bền Bỉ", desc: "Đạt đợt 10 ở Sinh Tồn", reward: 400, stat: "endlessBestWave", goal: 10 },
  { id: "endless_25", name: "Bất Tử", desc: "Đạt đợt 25 ở Sinh Tồn", reward: 1500, stat: "endlessBestWave", goal: 25 },
  { id: "pk_5", name: "Võ Sĩ Đài", desc: "Thắng 5 trận Đối Kháng", reward: 200, stat: "pkWins", goal: 5 },
  { id: "shop_5", name: "Kỹ Sư", desc: "Mua 5 nâng cấp ở Xưởng Giáp", reward: 300, stat: "workshopBought", goal: 5 },
  { id: "rich", name: "Triệu Phú", desc: "Kiếm tổng 10.000 tín dụng", reward: 1000, stat: "creditsEarned", goal: 10000 },
  { id: "campaign_clear", name: "Giải Phóng Thành Phố", desc: "Hoàn thành toàn bộ Chiến Dịch", reward: 2000 },
  { id: "three_stars", name: "Hoàn Mỹ", desc: "Đạt 3 sao ở mọi màn", reward: 3000 },
  { id: "no_hit_stage", name: "Bất Khả Xâm Phạm", desc: "Qua một màn mà không mất máu", reward: 800 },
  { id: "rank_s", name: "Phong Cách S", desc: "Đạt hạng S trong trận", reward: 250 },
  { id: "rank_ss", name: "Phong Cách SSS", desc: "Đạt hạng SSS trong trận", reward: 800 },
  { id: "bossrush_clear", name: "Đấu Trường Trùm", desc: "Hoàn thành Boss Rush", reward: 1500 },
  { id: "hard_clear", name: "Ác Mộng Tỉnh Giấc", desc: "Qua màn 6 ở độ khó Ác Mộng", reward: 2500 },
  { id: "level_10", name: "Lão Luyện", desc: "Đưa một anh hùng lên cấp 10", reward: 500 },
  { id: "all_heroes", name: "Đa Nguyên Tố", desc: "Thắng một màn với cả 4 anh hùng", reward: 800 },
];
