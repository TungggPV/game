export type AchievementDef = {
  id: string;
  title: string;
  desc: string;
  icon: string;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_blood", title: "Khởi Đầu Chiến Binh", desc: "Hạ gục kẻ địch đầu tiên", icon: "⚔️" },
  { id: "combo_20", title: "Lưỡi Kiếm Liền Mạch", desc: "Đạt chuỗi combo 20 đòn", icon: "⚡" },
  { id: "combo_50", title: "Vũ Điệu Hào Quang", desc: "Đạt chuỗi combo 50 đòn", icon: "✨" },
  { id: "perfect_dodge_5", title: "Phản Xạ Thần Tốc", desc: "Thực hiện né hoàn hảo 5 lần", icon: "💨" },
  { id: "perfect_dodge_10", title: "Bóng Ma Chiến Trường", desc: "Thực hiện né hoàn hảo 10 lần trong 1 trận", icon: "🌀" },
  { id: "stage1_clear", title: "Đêm Neon Rực Sáng", desc: "Vượt qua Màn 1: Thành Phố Neon", icon: "🏙️" },
  { id: "stage2_clear", title: "Bí Mật Dưới Lòng Đất", desc: "Vượt qua Màn 2: Phòng Thí Nghiệm Ngầm", icon: "🧪" },
  { id: "colossus_slayer", title: "Hạ Gục Colossus", desc: "Tiêu diệt Abyssal Colossus", icon: "👑" },
  { id: "fast_boss", title: "Tốc Chiến Bất Bại", desc: "Hạ gục Boss trong vòng dưới 60 giây", icon: "⏱️" },
  { id: "no_death", title: "Không Gục Ngã", desc: "Chiến thắng trận đấu mà không một lần ngã xuống", icon: "🛡️" },
  { id: "coin_hoarder", title: "Triệu Phú Giáp", desc: "Tích lũy tổng cộng 1000 xu trong ví", icon: "💰" },
  { id: "workshop_master", title: "Xưởng Giáp Tối Đa", desc: "Nâng cấp tối đa ít nhất một nhánh trong Xưởng Giáp", icon: "🔨" },
  { id: "parry_master", title: "Bậc Thầy Giao Kiếm", desc: "Đỡ đòn (Parry) thành công đòn đánh của kẻ địch", icon: "⚡" },
  { id: "break_master", title: "Phá Giáp Thần Tốc", desc: "Đánh vỡ thanh Posture làm kẻ địch rơi vào trạng thái Phá Giáp", icon: "💥" },
  { id: "overdrive_awakening", title: "Thức Tỉnh Overdrive", desc: "Kích hoạt Overdrive khi đạt 30 combo hoặc sau Tuyệt Kỹ", icon: "🔥" },
  { id: "elemental_master", title: "Phù Thủy Nguyên Tố", desc: "Kích hoạt phản ứng nguyên tố (Quá Tải, Tan Chảy, Siêu Dẫn...)", icon: "🌀" },
  { id: "time_rift_crusher", title: "Kẻ Phá Vỡ Thời Gian", desc: "Phá hủy Cổng Thời Gian trong vòng 15 giây", icon: "⏳" },
  { id: "archon_zero_slayer", title: "Diệt Thần Hư Không", desc: "Tiêu diệt Cổ Thần Archon Zero ở Màn 5", icon: "🌌" },
];
