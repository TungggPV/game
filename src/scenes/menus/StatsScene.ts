import { hex } from "../../config/constants";
import { STAGES } from "../../config/content";
import { HEROES } from "../../config/heroes";
import { ACHIEVEMENTS } from "../../config/meta";
import { achievementUnlocked, heroProgress, profile, stageStars, type Profile } from "../../systems/save";
import { text } from "../../ui/widgets";
import { MenuScreen } from "./MenuScreen";
import { bar, body, CYAN, fmtNum, GOLD, MUTED, panel } from "./ui";

type StatKey = keyof Profile["stats"];

const fmtPlay = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
};

const fmtMs = (ms: number) => {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const GROUPS: { title: string; color: number; rows: [StatKey, string][] }[] = [
  {
    title: "CHIẾN ĐẤU",
    color: 0xff6a3a,
    rows: [
      ["kills", "Kẻ địch đã hạ"],
      ["eliteKills", "Tinh anh đã hạ"],
      ["bossKills", "Trùm đã hạ"],
      ["maxCombo", "Combo cao nhất"],
      ["damageDealt", "Tổng sát thương"],
      ["perfectDodges", "Né hoàn hảo"],
      ["ultimates", "Tuyệt kỹ đã dùng"],
    ],
  },
  {
    title: "HÀNH TRÌNH",
    color: CYAN,
    rows: [
      ["runs", "Số trận đã chơi"],
      ["wins", "Số trận thắng"],
      ["deaths", "Số lần gục ngã"],
      ["playSeconds", "Thời gian chơi"],
      ["highScore", "Điểm cao nhất"],
      ["endlessBestWave", "Đợt Sinh Tồn cao nhất"],
      ["bossRushBestMs", "Kỷ lục Boss Rush"],
      ["pkWins", "Thắng Đối Kháng"],
    ],
  },
  {
    title: "KINH TẾ",
    color: GOLD,
    rows: [
      ["creditsEarned", "Tín dụng đã kiếm"],
      ["pickups", "Vật phẩm đã nhặt"],
      ["cratesBroken", "Thùng tiếp tế đã phá"],
      ["workshopBought", "Nâng cấp đã mua"],
    ],
  },
];

export class StatsScene extends MenuScreen {
  constructor() {
    super("menu_stats");
  }

  create() {
    this.setupScreen({ title: "THỐNG KÊ", subtitle: "HỒ SƠ CHIẾN ĐẤU CỦA BẠN", hint: "Esc / K hoặc nút Quay lại: trở về sảnh" });
    const stats = profile().stats;
    const fmt = (k: StatKey) => (k === "playSeconds" ? fmtPlay(stats[k]) : k === "bossRushBestMs" ? fmtMs(stats[k]) : fmtNum(stats[k]));
    const colW = 290;
    GROUPS.forEach((g, c) => {
      const x = 36 + c * (colW + 16);
      panel(this, x, 100, colW, 572, { alpha: 0.85, stroke: g.color, strokeAlpha: 0.35, radius: 16 });
      text(this, x + 20, 116, g.title, 18, hex(g.color), "900").setLetterSpacing(2);
      g.rows.forEach(([k, label], i) => {
        const y = 160 + i * 62;
        body(this, x + 20, y, label, 14, MUTED, { weight: "800" });
        text(this, x + 20, y + 20, fmt(k), 22, "#ffffff", "900");
        if (i < g.rows.length - 1) this.add.rectangle(x + 20, y + 54, colW - 40, 1, 0xffffff, 0.07).setOrigin(0);
      });
    });
    const eco = GROUPS[2];
    const ex = 36 + 2 * (colW + 16);
    const ey = 160 + eco.rows.length * 62 + 10;
    body(this, ex + 20, ey, "Tín dụng hiện có", 14, MUTED, { weight: "800" });
    text(this, ex + 20, ey + 20, fmtNum(profile().credits), 22, hex(GOLD), "900");

    const x = 36 + 3 * (colW + 16);
    panel(this, x, 100, colW, 572, { alpha: 0.85, stroke: 0x7dffb0, strokeAlpha: 0.35, radius: 16 });
    text(this, x + 20, 116, "TIẾN TRÌNH", 18, "#7dffb0", "900").setLetterSpacing(2);
    HEROES.forEach((h, i) => {
      const p = heroProgress(h.id);
      const y = 160 + i * 66;
      const icon = this.add.image(x + 42, y + 26, `${h.id}_idle`);
      icon.setScale(52 / icon.height);
      text(this, x + 78, y + 2, h.name, 17, hex(h.color), "900");
      body(this, x + 78, y + 28, `Cấp ${p.level}  ·  ${p.wins} trận thắng`, 14, "#c8dcea", { weight: "700" });
    });
    const stars = STAGES.reduce((s, _x, i) => s + stageStars(i), 0);
    const total = STAGES.length * 3;
    const ach = ACHIEVEMENTS.filter((a) => achievementUnlocked(a.id)).length;
    const y0 = 160 + HEROES.length * 66 + 8;
    body(this, x + 20, y0, "Sao chiến dịch", 14, MUTED, { weight: "800" });
    text(this, x + colW - 20, y0 - 4, `★ ${stars}/${total}`, 20, hex(GOLD), "900").setOrigin(1, 0);
    bar(this, x + 20, y0 + 26, colW - 40, 10, stars / total, GOLD);
    body(this, x + 20, y0 + 52, "Thành tựu", 14, MUTED, { weight: "800" });
    text(this, x + colW - 20, y0 + 48, `${ach}/${ACHIEVEMENTS.length}`, 20, "#ffffff", "900").setOrigin(1, 0);
    bar(this, x + 20, y0 + 78, colW - 40, 10, ach / ACHIEVEMENTS.length, CYAN);
  }
}
