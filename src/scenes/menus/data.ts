import type { Difficulty, GameMode } from "../../config/constants";
import type { Hazard } from "../../config/content";

/** State carried between the pre-game screens. */
export type Flow = { mode: GameMode; heroes?: string[]; stage?: number; difficulty?: Difficulty };

export const MODE_INFO: Record<GameMode, { name: string; desc: string; color: number }> = {
  campaign: { name: "Chiến Dịch", desc: "6 màn cốt truyện · thu thập sao", color: 0x18e6ff },
  endless: { name: "Sinh Tồn", desc: "Đợt địch vô tận · phá kỷ lục", color: 0x37ffb0 },
  bossrush: { name: "Boss Rush", desc: "Đánh liên tiếp các trùm · tính giờ", color: 0xff6a3a },
  pk: { name: "Đối Kháng", desc: "P1 đấu P2 · thắng 2/3 hiệp", color: 0xff6a8a },
  training: { name: "Luyện Tập", desc: "Thử chiêu với hình nhân, không áp lực", color: 0xb06cff },
};

export const HAZARD_LABEL: Record<Hazard, string> = {
  none: "Không có",
  laser: "Tia laser",
  lava: "Dung nham",
  storm: "Bão sét",
};

export const HERO_LORE: Record<string, string> = {
  nova_blade: "Cựu đội trưởng đội phản ứng nhanh, rèn lõi plasma thành lưỡi kiếm không bao giờ cùn.",
  crimson_flare: "Kỹ sư lò phản ứng sống sót sau vụ nổ, giờ mang ngọn lửa ấy trong bộ giáp hạng nặng.",
  volt_sentinel: "Lính trinh sát nhanh như chớp, điều khiển dòng điện của cả thành phố.",
  emerald_phantom: "Sát thủ bóng đêm dùng gió độc, xuất hiện rồi biến mất trước khi kẻ địch kịp phản ứng.",
};

export const SKILL_KEYS = { basic: "J", skill1: "K", skill2: "L", ultimate: "U" } as const;

export const fmtTime = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Remembered for the session only; the profile stores the heroes themselves.
export const session = { players: 1 };
